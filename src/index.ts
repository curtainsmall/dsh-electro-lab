/**
 * Host half of dsh-electro-lab.
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import type { Context } from 'cordis'
import { registerTools } from './tools/index.ts'
import { registerSkills } from './skill.ts'
import { installPresets } from './preset.ts'
import { RecordManager, readRecordArchive, deleteRecordFromArchive, type Record, type RecordEvent } from './records.ts'
import { buildArticlePrompt } from './generate.ts'

/** Plugin identity for cordis.yml rows. */
export const name = 'dsh-electro-lab'

/** Services required before mounting: the tool registry and the web server (endpoint host). */
export const inject = ['tools', 'webServer']

declare module 'cordis' {
  interface Events {
    /** Post-commit append feed (dsh-session's own declaration; mirrored loosely here). */
    'session/event'(session: unknown, event: unknown): void
  }
  interface Context {
    /** The web server the records endpoint registers on (same pattern as dsh-remote-web-ui). */
    webServer: WebServerLike
    /** The host LLM runtime (dsh-llm), optional — generation needs it. */
    llm?: {
      stream(options: {
        provider: string
        model: string
        messages: Array<{ role: string; content: Array<{ type: string; text: string }> }>
        system?: string
        maxTokens?: number
        signal?: AbortSignal
      }): AsyncIterable<unknown>
    }
    /** The deployment's default model selection (dsh-agent-default-model), optional. */
    agentDefaultModel?: {
      currentSelection(): { provider: string; model: string; reasoningEffort?: string }
    }
  }
}

/** Minimal structural shape of a session (id only — the log is never read). */
interface SessionLike {
  id?: string
}

/** Minimal structural shape of the web-server route registry. */
interface WebServerLike {
  register(route: {
    kind: 'exact'
    path: string
    handler(req: unknown, res: {
      statusCode?: number
      setHeader(name: string, value: string): void
      end(body: string): void
    }): void | Promise<void>
  }): () => void
}

/** Minimal request shape the endpoint reads (method + url for query parsing). */
interface RequestLike {
  method?: string
  url?: string
}

/** The records page endpoint (same origin as the web app; the client polls it). */
const RECORDS_PATH = '/api/dsh-electro-lab/records'

/** Article generation: POST ?recordId=&format=&directory=&fileName= writes the article to disk. */
const GENERATE_PATH = '/api/dsh-electro-lab/generate'

/** Remembered generation output directory (GET) and its persistence (PUT ?dir=). */
const GENERATE_DIR_PATH = '/api/dsh-electro-lab/generate-dir'

/**
 * Non-config serialized state lives in one JSON file under the records home;
 * config.json is reserved for future configuration and is never touched here.
 */
const STATE_FILE = 'state.json'
/** Legacy plain-text location of the remembered directory (migrated on read). */
const LEGACY_GENERATE_DIR_FILE = 'generate-dir.txt'

// Module-level record state, shared by EVERY mount of the plugin (the global
// bundle row AND a session preset row can both apply it): one manager per
// session, one disk archive, one snapshot file. Records live under the
// user's home — `~/.dsh-electro-lab/`, deliberately OUTSIDE $DSH_HOME so
// they survive session deletion, restarts and even a full DSH uninstall.
const recordsHome = process.env.DSH_ELECTRO_LAB_HOME ?? join(homedir(), '.dsh-electro-lab')
const managers = new Map<string, RecordManager>()

/** Get (or lazily create) the session's record manager. */
function getOrCreateManager(sessionId: string): RecordManager {
  let manager = managers.get(sessionId)
  if (manager === undefined) {
    manager = new RecordManager(
      sessionId,
      join(recordsHome, 'records.jsonl'),
      join(recordsHome, 'open-record.json'),
    )
    managers.set(sessionId, manager)
  }
  return manager
}

/** The remembered generation output directory, or '' when none was saved. */
function readGenerateDir(): string {
  try {
    const parsed = JSON.parse(readFileSync(join(recordsHome, STATE_FILE), 'utf8')) as { generateDir?: unknown }
    if (typeof parsed.generateDir === 'string') return parsed.generateDir.trim()
  } catch {
    // fall through to the legacy file
  }
  try {
    const legacy = readFileSync(join(recordsHome, LEGACY_GENERATE_DIR_FILE), 'utf8').trim()
    if (legacy.length > 0) writeGenerateDir(legacy) // one-time migration
    return legacy
  } catch {
    return ''
  }
}

/** Persist the generation output directory so the next dialog auto-fills it. */
function writeGenerateDir(directory: string): void {
  mkdirSync(recordsHome, { recursive: true })
  writeFileSync(join(recordsHome, STATE_FILE), JSON.stringify({ generateDir: directory }), 'utf8')
  try {
    rmSync(join(recordsHome, LEGACY_GENERATE_DIR_FILE), { force: true })
  } catch {
    // best effort: the legacy file may not exist
  }
}

/** Generate the solution article for one record through the host LLM. */
async function generateArticle(ctx: Context, record: Record, signal: AbortSignal): Promise<string> {
  const llm = ctx.get('llm')
  if (llm === undefined) throw new Error('the LLM service is unavailable in this deployment')
  const defaults = ctx.get('agentDefaultModel')
  const route = defaults?.currentSelection()
  if (route === undefined || route.provider === undefined || route.model === undefined) {
    throw new Error('no default model is configured — pick one in Settings first')
  }
  const { system, user } = buildArticlePrompt(record)
  let text = ''
  for await (const raw of llm.stream({
    provider: route.provider,
    model: route.model,
    messages: [{ role: 'user', content: [{ type: 'text', text: user }] }],
    system,
    maxTokens: 4096,
    signal,
  })) {
    const chunk = raw as { type?: string; text?: string; reason?: string }
    if (chunk.type === 'text-delta') {
      text += chunk.text ?? ''
    } else if (chunk.type === 'tool-call-delta') {
      throw new Error('the generation model unexpectedly requested a tool')
    } else if (chunk.type === 'finish' && chunk.reason === 'aborted') {
      throw new Error('article generation was aborted')
    }
  }
  const trimmed = text.trim()
  if (trimmed.length === 0) throw new Error('the model produced no article text')
  return trimmed
}

/** Article generation endpoint: read the record, ask the model, write the file. */
async function handleGenerate(ctx: Context, url: string): Promise<{ path: string }> {
  const params = new URL(url, 'http://dsh.local').searchParams
  const recordId = params.get('recordId') ?? ''
  const format = params.get('format') ?? 'markdown'
  if (format !== 'markdown') throw new Error(`unsupported format "${format}"`)
  const directory = (params.get('directory') ?? '').trim()
  if (directory.length === 0) throw new Error('output directory is required')
  const record = readRecordArchive(join(recordsHome, 'records.jsonl')).find((item) => item.id === recordId)
  if (record === undefined) throw new Error(`record "${recordId}" not found`)

  let fileName = (params.get('fileName') ?? '').trim()
  if (fileName.length === 0) fileName = `electro-lab-${record.id.slice(0, 8)}.md`
  if (!fileName.endsWith('.md')) fileName += '.md'

  const article = await generateArticle(ctx, record, AbortSignal.timeout(120_000))
  mkdirSync(directory, { recursive: true })
  const target = join(directory, fileName)
  writeFileSync(target, article, 'utf8')
  return { path: target }
}

export function apply(ctx: Context): void {
  ctx.effect(() => registerTools(ctx), 'dsh-electro-lab: tools')
  ctx.effect(() => registerSkills(ctx), 'dsh-electro-lab: skills')

  ctx.effect(() => {
    const disposers: Array<() => void> = []

    // Session trace: feed every committed event into the session's record
    // manager, which owns ALL record state — the JSONL archive
    // (records.jsonl: a settled record is appended the moment it settles)
    // and the interrupted-open snapshot (open-record.json: persisted after
    // every event, restored by the constructor on the first event after a
    // restart). Nothing is ever rebuilt from the session log — no fold, the
    // log is never re-read.
    disposers.push(ctx.on('session/event', (session, event) => {
      const s = session as SessionLike
      const sessionId = s.id
      if (sessionId === undefined) return
      getOrCreateManager(sessionId).feed(event as RecordEvent)
    }))

    // The records page: all stored records plus any live open records, newest
    // first. The same path serves DELETE ?id= to remove one settled record.
    // webServer is an inject edge, so it is guaranteed ready here.
    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: RECORDS_PATH,
      handler: (req, res) => {
        const request = req as RequestLike
        const method = request.method ?? 'GET'
        if (method === 'DELETE') {
          const id = request.url === undefined ? null : new URL(request.url, 'http://dsh.local').searchParams.get('id')
          const deleted = id !== null && deleteRecordFromArchive(join(recordsHome, 'records.jsonl'), id)
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ deleted }))
          return
        }
        if (method !== 'GET') {
          res.statusCode = 405
          res.end('method not allowed')
          return
        }
        const open: Array<unknown> = []
        for (const manager of managers.values()) {
          const record = manager.view()
          if (record !== null) open.push(record)
        }
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({
          records: [...readRecordArchive(join(recordsHome, 'records.jsonl'))].reverse(),
          open,
        }))
      },
    }))

    // Article generation: the client submits the record id, format, directory
    // and file name; the article is produced by the host LLM and written to
    // disk. Errors surface as a 400 with the message text.
    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: GENERATE_PATH,
      handler: (req, res) => {
        const request = req as RequestLike
        if ((request.method ?? 'GET') !== 'POST') {
          res.statusCode = 405
          res.end('method not allowed')
          return
        }
        const url = request.url ?? ''
        void handleGenerate(ctx, url).then(
          ({ path }) => {
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ path }))
          },
          (error: unknown) => {
            res.statusCode = 400
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
          },
        )
      },
    }))

    // The remembered generation directory: GET reads it back, PUT ?dir= saves
    // it (query param, so no body parsing is needed on the request).
    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: GENERATE_DIR_PATH,
      handler: (req, res) => {
        const request = req as RequestLike
        const method = request.method ?? 'GET'
        if (method === 'PUT') {
          const dir = request.url === undefined ? '' : new URL(request.url, 'http://dsh.local').searchParams.get('dir') ?? ''
          writeGenerateDir(dir)
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ saved: true }))
          return
        }
        if (method !== 'GET') {
          res.statusCode = 405
          res.end('method not allowed')
          return
        }
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ directory: readGenerateDir() }))
      },
    }))

    return () => {
      for (const off of disposers) off()
    }
  }, 'dsh-electro-lab: records')

  try {
    const synced = installPresets()
    if (synced.length > 0) ctx.logger?.info(`[dsh-electro-lab] synced packaged preset(s): ${synced.join(', ')}`)
  } catch (error) {
    // A preset that fails to sync must never break the plugin.
    ctx.logger?.warn(`[dsh-electro-lab] failed to sync packaged preset: ${error instanceof Error ? error.message : String(error)}`)
  }
}
