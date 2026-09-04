#!/usr/bin/env node
/**
 * ElectroLab external-tool echo peer — a manual test/demo counterpart.
 *
 * The host reaches an external tool over one of two transports and both speak
 * one envelope protocol: the request carries {requestId, ...params} and the
 * response must be a JSON object {requestId, result} whose requestId echoes
 * the request. This script implements the service side of both transports
 * with the Node.js standard library only — zero runtime dependencies, no
 * build step (Node runs TypeScript natively via type stripping):
 *
 *     node src/echo.ts http --port 8787                     # HTTP server
 *     node src/echo.ts file --dir C:/elab-inbox --poll 200  # watched directory
 *
 * This directory is an independent npm project (see package.json) and never
 * joins the plugin's toolset: it is a standalone program that answers
 * whatever the host sends. The result echoes every parameter back verbatim
 * (the requestId is stripped), so a model call can be verified end to end.
 * Type stripping requires Node ≥ 22.18 or ≥ 23.6 and erasable syntax only —
 * types and `as` casts, no enums, no namespaces, no parameter properties
 * (`pnpm typecheck` enforces this through `erasableSyntaxOnly`).
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The result payload: every envelope field except the requestId, verbatim. */
function echoResult(envelope: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(envelope)) {
    if (key !== 'requestId') result[key] = value
  }
  return result
}

/* ── HTTP transport ───────────────────────────────────────────────────────── */

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

/** Respond 200 with the echo, or 400 when the envelope is malformed. */
function answerEnvelope(res: ServerResponse, envelope: unknown): void {
  if (!isRecord(envelope) || typeof envelope.requestId !== 'string') {
    sendJson(res, 400, { error: 'envelope must be a JSON object with a "requestId" field' })
    return
  }
  sendJson(res, 200, { requestId: envelope.requestId, result: echoResult(envelope) })
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    req.on('end', () => { resolve(Buffer.concat(chunks)) })
  })
}

/** Serve the envelope protocol over HTTP: POST body or GET query. */
function serveHttp(host: string, port: number): void {
  const server = createServer((req, res) => {
    void (async () => {
      try {
        if (req.method === 'POST') {
          const body = (await readBody(req)).toString('utf8')
          let envelope: unknown
          try {
            envelope = JSON.parse(body)
          } catch {
            sendJson(res, 400, { error: 'request body is not JSON' })
            return
          }
          answerEnvelope(res, envelope)
          return
        }
        // GET: the host serializes the envelope into the query string.
        const url = new URL(req.url ?? '/', 'http://dsh.local')
        const envelope: Record<string, unknown> = {}
        for (const [key, value] of url.searchParams.entries()) envelope[key] = value
        answerEnvelope(res, envelope)
      } catch (error) {
        sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
      }
    })()
  })
  server.listen(port, host, () => {
    console.log(`[http] echo peer listening on http://${host}:${port}/`)
    console.log('[http] envelope {requestId, ...params} -> response {requestId, result}')
  })
}

/* ── File transport ───────────────────────────────────────────────────────── */

/**
 * Watch a directory: read in.<requestId>.json, write out.<requestId>.json,
 * then delete the in file. The host polls for the out file and cleans both
 * up after the call.
 */
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
      // The response echoes the envelope's requestId, but the out file name
      // derives from the in file name (the host polls out.<id>.json).
      const outPath = join(directory, `out.${requestId}.json`)
      writeFileSync(outPath, JSON.stringify({ requestId: envelope.requestId, result: echoResult(envelope) }), 'utf8')
      console.log(`[file] ${name} -> out.${requestId}.json`)
      rmSync(inPath, { force: true })
    }
  }, pollMs)
}

/* ── CLI ──────────────────────────────────────────────────────────────────── */

function usage(): void {
  console.log('ElectroLab external-tool echo peer (http or file transport)')
  console.log('')
  console.log('  node src/echo.ts http [--host 127.0.0.1] [--port 8787]')
  console.log('  node src/echo.ts file --dir <directory> [--poll 200]')
  process.exitCode = 1
}

/** Value of `--flag` in argv, or the fallback when absent. */
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
