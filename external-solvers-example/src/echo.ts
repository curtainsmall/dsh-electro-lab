#!/usr/bin/env node
/**
 * ElectroLab external-solver echo peer — a manual test/demo counterpart.
 *
 * Context envelope protocol (typed values): the request carries
 * {requestId, args} where every argument is a typed value; the response is
 * {requestId, result} with a typed value (or result: null for void), or
 * {requestId, error: "…"} for a failed computation. This script echoes the
 * typed args back inside an object result, so a model call can be verified
 * end to end. Node.js standard library only; no build step.
 *
 *     node src/echo.ts http --port 8787                     # HTTP server
 *     node src/echo.ts file --dir C:/elab-inbox --poll 200  # watched directory
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A typed value is {type, value, kind?} with type in number/complex/string/boolean/array/object. */
function isTypedValue(value: unknown): boolean {
  return isRecord(value) && typeof value.type === 'string'
}

/** Echo result: every arg as a typed value inside an object value. */
function echoResult(envelope: Record<string, unknown>): Record<string, unknown> {
  const args = envelope.args
  const fields: Record<string, unknown> = {}
  if (isRecord(args)) {
    for (const [key, value] of Object.entries(args)) {
      if (isTypedValue(value)) fields[key] = value
      else fields[key] = { type: 'string', value: JSON.stringify(value) }
    }
  }
  return { type: 'object', value: fields }
}

function respond(res: ServerResponse, payload: Record<string, unknown>): void {
  const body = JSON.stringify(payload)
  res.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) })
  res.end(body)
}

function answerEnvelope(res: ServerResponse, envelope: unknown): void {
  if (!isRecord(envelope) || typeof envelope.requestId !== 'string') {
    respond(res, { error: 'envelope must be a JSON object with a requestId field' })
    return
  }
  respond(res, { requestId: envelope.requestId, result: echoResult(envelope) })
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    req.on('end', () => { resolve(Buffer.concat(chunks)) })
  })
}

function serveHttp(host: string, port: number): void {
  const server = createServer((req, res) => {
    void (async () => {
      try {
        const body = (await readBody(req)).toString('utf8')
        let envelope: unknown
        try {
          envelope = JSON.parse(body)
        } catch {
          respond(res, { error: 'request body is not JSON' })
          return
        }
        answerEnvelope(res, envelope)
      } catch (error) {
        respond(res, { error: error instanceof Error ? error.message : String(error) })
      }
    })()
  })
  server.listen(port, host, () => {
    console.log(`[http] echo peer listening on http://${host}:${port}/`)
    console.log('[http] {requestId, args: {typed values}} -> {requestId, result: {typed value}}')
  })
}

function serveFile(directory: string, pollMs: number): void {
  mkdirSync(directory, { recursive: true })
  console.log(`[file] echo peer watching ${directory}`)
  setInterval(() => {
    for (const name of readdirSync(directory)) {
      if (!name.startsWith('in.') || !name.endsWith('.json')) continue
      const inPath = join(directory, name)
      const requestId = name.slice('in.'.length, -'.json'.length)
      let envelope: unknown
      try {
        envelope = JSON.parse(readFileSync(inPath, 'utf8'))
      } catch (error) {
        console.error(`[file] unreadable ${name}: ${error instanceof Error ? error.message : String(error)} — deleting without reply`)
        rmSync(inPath, { force: true })
        continue
      }
      if (!isRecord(envelope) || typeof envelope.requestId !== 'string') {
        console.error(`[file] ${name} has no requestId — deleting without reply`)
        rmSync(inPath, { force: true })
        continue
      }
      const outPath = join(directory, `out.${requestId}.json`)
      writeFileSync(outPath, JSON.stringify({ requestId: envelope.requestId, result: echoResult(envelope) }), 'utf8')
      console.log(`[file] ${name} -> out.${requestId}.json`)
      rmSync(inPath, { force: true })
    }
  }, pollMs)
}

function usage(): void {
  console.log('ElectroLab external-solver echo peer (http or file transport)')
  console.log('')
  console.log('  node src/echo.ts http [--host 127.0.0.1] [--port 8787]')
  console.log('  node src/echo.ts file --dir <directory> [--poll 200]')
  process.exitCode = 1
}

function argValue(argv: string[], flag: string, fallback: string): string {
  const index = argv.indexOf(flag)
  const value = index !== -1 ? argv[index + 1] : undefined
  return value === undefined ? fallback : value
}

const argv = process.argv.slice(2)
const mode = argv[0]

if (mode === 'http') {
  serveHttp(argValue(argv, '--host', '127.0.0.1'), Number(argValue(argv, '--port', '8787')))
} else if (mode === 'file') {
  const directory = argValue(argv, '--dir', '')
  if (directory.length === 0) {
    console.error('[file] --dir is required')
    usage()
  } else {
    serveFile(directory, Math.max(20, Number(argValue(argv, '--poll', '200'))))
  }
} else {
  usage()
}
