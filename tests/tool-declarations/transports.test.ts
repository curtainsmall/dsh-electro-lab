import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-tools'
import { makeExecutor } from '../../src/tool.ts'
import { DeclarationHttpMethod, DeclarationParamType, DeclarationTransport, type ToolDeclaration } from '../../src/tool.ts'

function fakeExec(): ToolRunContext {
  return {
    callId: 'call-transport' as ToolRunContext['callId'],
    token: Symbol('token') as ToolRunContext['token'],
    signal: new AbortController().signal,
  } as ToolRunContext
}

/** Respond to every in-request by doubling its numeric fields into out.<id>.json.
 *  Keeps the last seen request in memory (the executor deletes both files). */
function startFileServer(dir: string): { stop(): void; lastRequest(): Record<string, unknown> | undefined } {
  let last: Record<string, unknown> | undefined
  const timer = setInterval(() => {
    const name = readdirSync(dir).find((file) => file.startsWith('in.') && file.endsWith('.json'))
    if (name === undefined) return
    const request = JSON.parse(readFileSync(join(dir, name), 'utf8')) as Record<string, unknown>
    last = request
    const requestId = request.requestId
    const doubled: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(request)) {
      if (key !== 'requestId' && typeof value === 'number') doubled[key] = value * 2
    }
    writeFileSync(join(dir, `out.${String(requestId)}.json`), JSON.stringify({ requestId, result: doubled }), 'utf8')
  }, 5)
  return {
    stop(): void {
      clearInterval(timer)
    },
    lastRequest(): Record<string, unknown> | undefined {
      return last
    },
  }
}

let home = ''

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'elab-transport-'))
})

afterEach(() => {
  rmSync(home, { recursive: true, force: true })
})

function fileTool(directory: string, pollMs: number, timeoutMs: number): ToolDeclaration {
  return {
    name: 'file_demo',
    description: 'demo',
    enabled: true,
    parameters: { x: { type: DeclarationParamType.Quantity, kind: 'resistance' }, label: { type: DeclarationParamType.String } },
    transport: DeclarationTransport.File,
    transportOptions: { directory, pollMs },
    timeoutMs,
  }
}

describe('file transport', () => {
  it('writes the envelope, returns the echoed result and cleans both files', async () => {
    const server = startFileServer(home)
    try {
      const execute = makeExecutor(fileTool(home, 10, 2000))
      const result = await execute({ x: 21, label: 'ohm' } as never, fakeExec())
      expect(result).toEqual({ x: 42 })
      // The request carried the envelope requestId and every parameter.
      const seen = server.lastRequest()
      expect(seen?.requestId).toBeDefined()
      expect(seen?.x).toBe(21)
      expect(seen?.label).toBe('ohm')
      expect(readdirSync(home)).toEqual([]) // both files cleaned up
    } finally {
      server.stop()
    }
  })

  it('rejects a mismatched requestId echo', async () => {
    const timer = setInterval(() => {
      const name = readdirSync(home).find((file) => file.startsWith('in.') && file.endsWith('.json'))
      if (name === undefined) return
      const parsed = JSON.parse(readFileSync(join(home, name), 'utf8')) as { requestId: string }
      writeFileSync(join(home, `out.${parsed.requestId}.json`), JSON.stringify({ requestId: 'other', result: 1 }), 'utf8')
    }, 5)
    try {
      const execute = makeExecutor(fileTool(home, 10, 2000))
      await expect(execute({ x: 1 } as never, fakeExec())).rejects.toThrow(/requestId mismatch/)
    } finally {
      clearInterval(timer)
    }
  })

  it('raises an envelope error field as the tool failure, ignoring result', async () => {
    const timer = setInterval(() => {
      const name = readdirSync(home).find((file) => file.startsWith('in.') && file.endsWith('.json'))
      if (name === undefined) return
      const parsed = JSON.parse(readFileSync(join(home, name), 'utf8')) as { requestId: string }
      const out = join(home, `out.${parsed.requestId}.json`)
      writeFileSync(out, JSON.stringify({ requestId: parsed.requestId, error: 'denied by peer', result: { ignored: true } }), 'utf8')
    }, 5)
    try {
      const execute = makeExecutor(fileTool(home, 10, 2000))
      await expect(execute({ x: 1 } as never, fakeExec())).rejects.toMatchObject({
        name: 'ToolError',
        code: 'EXTERNAL_ERROR',
        message: 'denied by peer',
      })
    } finally {
      clearInterval(timer)
    }
  })

  it('times out when no out file appears and still cleans up', async () => {
    const execute = makeExecutor(fileTool(home, 10, 60))
    await expect(execute({ x: 1 } as never, fakeExec())).rejects.toThrow(/file transport timed out after 60 ms/)
    expect(readdirSync(home)).toEqual([])
  })
})

describe('http transport', () => {
  let server: Server
  let base = ''
  /** POST handler doubles numbers; GET reflects them; /text returns non-JSON; /hang never answers. */
  const listen = async (): Promise<void> => {
    server = createServer((req, res) => {
      if (req.url?.startsWith('/hang')) return // never respond
      const reply = (payload: string, status = 200): void => {
        res.statusCode = status
        res.setHeader('content-type', 'application/json')
        res.end(payload)
      }
      const collect = (callback: (raw: string) => void): void => {
        let raw = ''
        req.on('data', (chunk: Buffer) => { raw += String(chunk) })
        req.on('end', () => callback(raw))
      }
      if (req.url?.startsWith('/text')) {
        res.statusCode = 200
        res.setHeader('content-type', 'text/plain')
        res.end('hello')
        return
      }
      if (req.url?.startsWith('/boom')) {
        res.statusCode = 500
        res.end('nope')
        return
      }
      if (req.url?.startsWith('/fail')) {
        collect((raw) => {
          const body = JSON.parse(raw) as { requestId: string }
          reply(JSON.stringify({ requestId: body.requestId, error: 'denied by peer', result: { ignored: true } }))
        })
        return
      }
      if (req.url?.startsWith('/baderror')) {
        collect((raw) => {
          const body = JSON.parse(raw) as { requestId: string }
          reply(JSON.stringify({ requestId: body.requestId, error: 42 }))
        })
        return
      }
      if (req.method === 'POST') {
        collect((raw) => {
          const body = JSON.parse(raw) as { requestId: string; x?: number }
          reply(JSON.stringify({ requestId: body.requestId, result: { x: (body.x ?? 0) * 2 } }))
        })
        return
      }
      const url = new URL(req.url ?? '/', 'http://dsh.local')
      const requestId = url.searchParams.get('requestId') ?? ''
      const x = Number(url.searchParams.get('x') ?? 0)
      reply(JSON.stringify({ requestId, result: { x: x * 2 } }))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    expect(address).not.toBeNull()
    base = `http://127.0.0.1:${(address as { port: number }).port}`
  }

  beforeEach(async () => {
    await listen()
  })

  afterEach(() => {
    server.close()
  })

  function httpTool(path: string, method: DeclarationHttpMethod, timeoutMs = 2000): ToolDeclaration {
    return {
      name: 'http_demo',
      description: 'demo',
      enabled: true,
      parameters: { x: { type: DeclarationParamType.Quantity, kind: 'resistance' } },
      transport: DeclarationTransport.Http,
      transportOptions: { url: `${base}${path}`, method },
      timeoutMs,
    }
  }

  it('POSTs the envelope and returns the echoed result', async () => {
    const execute = makeExecutor(httpTool('/calc', DeclarationHttpMethod.Post))
    const result = await execute({ x: 21 } as never, fakeExec())
    expect(result).toEqual({ x: 42 })
  })

  it('GETs the envelope as query parameters', async () => {
    const execute = makeExecutor(httpTool('/calc', DeclarationHttpMethod.Get))
    const result = await execute({ x: 7 } as never, fakeExec())
    expect(result).toEqual({ x: 14 })
  })

  it('reports non-JSON responses, http errors and timeouts', async () => {
    await expect(makeExecutor(httpTool('/text', DeclarationHttpMethod.Post))({ x: 1 } as never, fakeExec())).rejects.toThrow(/non-JSON/)
    await expect(makeExecutor(httpTool('/boom', DeclarationHttpMethod.Post))({ x: 1 } as never, fakeExec())).rejects.toThrow(/http 500 from/)
    await expect(makeExecutor(httpTool('/hang', DeclarationHttpMethod.Post, 60))({ x: 1 } as never, fakeExec())).rejects.toThrow(/timed out after 60 ms/)
  })

  it('raises an envelope error field as the tool failure, ignoring result', async () => {
    await expect(makeExecutor(httpTool('/fail', DeclarationHttpMethod.Post))({ x: 1 } as never, fakeExec())).rejects.toMatchObject({
      name: 'ToolError',
      code: 'EXTERNAL_ERROR',
      message: 'denied by peer',
    })
  })

  it('rejects a non-string envelope error field as a protocol violation', async () => {
    await expect(makeExecutor(httpTool('/baderror', DeclarationHttpMethod.Post))({ x: 1 } as never, fakeExec())).rejects.toMatchObject({
      code: 'EXTERNAL_RESPONSE',
    })
    await expect(makeExecutor(httpTool('/baderror', DeclarationHttpMethod.Post))({ x: 1 } as never, fakeExec())).rejects.toThrow(/error" field must be a non-empty string/)
  })
})
