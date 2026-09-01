/**
 * Host half of dsh-electro-lab.
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
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

/** Article generation: POST ?recordId=&format=&directory=&fileName= starts a job and returns its id. */
const GENERATE_PATH = '/api/dsh-electro-lab/generate'

/** Article generation progress: GET ?jobId= returns the job snapshot. */
const GENERATE_PROGRESS_PATH = '/api/dsh-electro-lab/generate-progress'

/** Cancel a running generation: POST ?jobId= aborts the job. */
const GENERATE_CANCEL_PATH = '/api/dsh-electro-lab/generate-cancel'

/** Reveal a generated file or directory in the OS file manager: POST ?path=. */
const REVEAL_PATH = '/api/dsh-electro-lab/reveal'

/**
 * Host-driven directory browsing: GET ?path= lists the directory's
 * subdirectories plus its parent. Pure HTTP — works locally and remotely
 * (no OS dialog), and every path returned is absolute.
 */
const LIST_DIRS_PATH = '/api/dsh-electro-lab/list-dirs'

/** Tree roots for the directory browser: drive roots on Windows, the home otherwise. */
const LIST_ROOTS_PATH = '/api/dsh-electro-lab/list-roots'

/** The vendored directory-tree stylesheet (assets/directory-tree.css), served for the client to inject. */
const DIRECTORY_TREE_CSS_PATH = '/api/dsh-electro-lab/directory-tree.css'

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

/** Existing drive roots on Windows (empty elsewhere) — the way out of one drive. */
function listDriveRoots(): string[] {
  if (process.platform !== 'win32') return []
  const roots: string[] = []
  for (let code = 65; code <= 90; code++) {
    const root = `${String.fromCharCode(code)}:\\`
    try {
      if (existsSync(root)) roots.push(root)
    } catch {
      // skip unreadable drives
    }
  }
  return roots
}

/** List one directory: its absolute path, parent, sorted subdirectory names, file names, and drive roots. */
function listDirectories(inputPath: string): { path: string; parent: string; entries: string[]; files: string[]; roots: string[] } {
  const requested = inputPath.trim()
  const resolved = requested.length > 0 && existsSync(requested) && statSync(requested).isDirectory()
    ? requested
    : homedir()
  const names = readdirSync(resolved, { withFileTypes: true })
  const entries = names.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort((a, b) => a.localeCompare(b))
  const files = names.filter((entry) => entry.isFile()).map((entry) => entry.name).sort((a, b) => a.localeCompare(b))
  const parent = join(resolved, '..')
  return { path: resolved, parent, entries, files, roots: parent === resolved ? listDriveRoots() : [] }
}

/** The vendored directory-tree stylesheet (MIT, from @aiquants/directory-tree's standalone build). */
function readDirectoryTreeCss(): string {
  try {
    return readFileSync(new URL('../assets/directory-tree.css', import.meta.url), 'utf8')
  } catch {
    return ''
  }
}

/** Reveal a generated file (select it) or directory in the OS file manager. */
function revealPath(target: string): string {
  if (process.platform !== 'win32') return 'not supported on this platform'
  const isDir = existsSync(target) && statSync(target).isDirectory()
  // explorer.exe exits with code 1 when an Explorer instance already runs
  // (it hands the request over) — that is success, not failure. detached +
  // unref: never wait on it; spawn failures are logged, not fatal.
  try {
    const child = spawn('explorer.exe', [isDir ? target : `/select,${target}`], { windowsHide: true, detached: true, stdio: 'ignore' })
    child.on('error', () => {})
    child.unref()
    return 'ok'
  } catch (error) {
    return `failed: ${error instanceof Error ? error.message : String(error)}`
  }
}

/** Generate the solution article for one record through the host LLM. */
async function generateArticle(ctx: Context, record: Record, signal: AbortSignal, onProgress?: (percent: number) => void): Promise<string> {
  const llm = ctx.get('llm')
  if (llm === undefined) throw new Error('the LLM service is unavailable in this deployment')
  const defaults = ctx.get('agentDefaultModel')
  const route = defaults?.currentSelection()
  if (route === undefined || route.provider === undefined || route.model === undefined) {
    throw new Error('no default model is configured — pick one in Settings first')
  }
  const { system, user } = buildArticlePrompt(record)
  const startedAt = Date.now()
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
    // Progress within the model phase: ramp from 10% toward 90% by elapsed time.
    if (onProgress !== undefined) {
      onProgress(Math.min(90, 10 + ((Date.now() - startedAt) / 30_000) * 80))
    }
  }
  const trimmed = text.trim()
  if (trimmed.length === 0) throw new Error('the model produced no article text')
  return trimmed
}

/** One in-memory generation job (never persisted — no generation log). */
interface GenerateJob {
  status: 'running' | 'done' | 'error'
  percent: number
  phase: 'prepare' | 'generate' | 'write'
  path?: string
  error?: string
  abort: () => void
}

const generateJobs = new Map<string, GenerateJob>()

/** Start a background generation job and return its id; progress is polled via GET /generate-progress. */
function startGenerateJob(ctx: Context, record: Record, directory: string, fileName: string): string {
  const jobId = randomUUID()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 120_000)
  const job: GenerateJob = { status: 'running', percent: 5, phase: 'prepare', abort: () => controller.abort() }
  generateJobs.set(jobId, job)
  void (async () => {
    try {
      job.percent = 10
      job.phase = 'generate'
      const article = await generateArticle(ctx, record, controller.signal, (percent) => { job.percent = percent })
      job.phase = 'write'
      job.percent = 95
      mkdirSync(directory, { recursive: true })
      const target = join(directory, fileName)
      writeFileSync(target, article, 'utf8')
      job.status = 'done'
      job.percent = 100
      job.path = target
    } catch (error) {
      job.status = 'error'
      job.error = error instanceof Error ? error.message : String(error)
    } finally {
      clearTimeout(timeout)
      // The job is only kept long enough for the client to poll it.
      setTimeout(() => { generateJobs.delete(jobId) }, 60_000)
    }
  })()
  return jobId
}

/** Validate the generation request and start the job; throws on bad input. */
function beginGenerate(ctx: Context, url: string): { jobId: string } {
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

  return { jobId: startGenerateJob(ctx, record, directory, fileName) }
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
    // and file name; a background job produces the article through the host
    // LLM and writes it to disk. The POST answers immediately with the job id;
    // progress is polled through /generate-progress.
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
        try {
          const { jobId } = beginGenerate(ctx, request.url ?? '')
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ jobId }))
        } catch (error) {
          res.statusCode = 400
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
        }
      },
    }))

    // Host-driven directory browsing: the client navigates the filesystem
    // through this endpoint, so the picked directory is a true absolute path
    // and works identically for local and remote deployments.
    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: LIST_DIRS_PATH,
      handler: (req, res) => {
        const request = req as RequestLike
        if ((request.method ?? 'GET') !== 'GET') {
          res.statusCode = 405
          res.end('method not allowed')
          return
        }
        const path = request.url === undefined ? '' : new URL(request.url, 'http://dsh.local').searchParams.get('path') ?? ''
        try {
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(listDirectories(path)))
        } catch (error) {
          res.statusCode = 400
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
        }
      },
    }))

    // Tree roots for the directory browser: the client expands directories
    // lazily through list-dirs.
    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: LIST_ROOTS_PATH,
      handler: (req, res) => {
        const request = req as RequestLike
        if ((request.method ?? 'GET') !== 'GET') {
          res.statusCode = 405
          res.end('method not allowed')
          return
        }
        const drives = listDriveRoots()
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ roots: drives.length > 0 ? drives : [homedir()] }))
      },
    }))

    // The directory-tree stylesheet: the client fetches it once and injects
    // it, so the bundle never has to inline the CSS.
    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: DIRECTORY_TREE_CSS_PATH,
      handler: (req, res) => {
        const request = req as RequestLike
        if ((request.method ?? 'GET') !== 'GET') {
          res.statusCode = 405
          res.end('method not allowed')
          return
        }
        res.setHeader('content-type', 'text/css')
        res.end(readDirectoryTreeCss())
      },
    }))

    // Cancel a running generation job: the client's cancel button calls this.
    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: GENERATE_CANCEL_PATH,
      handler: (req, res) => {
        const request = req as RequestLike
        if ((request.method ?? 'GET') !== 'POST') {
          res.statusCode = 405
          res.end('method not allowed')
          return
        }
        const jobId = request.url === undefined ? null : new URL(request.url, 'http://dsh.local').searchParams.get('jobId')
        const job = jobId === null ? undefined : generateJobs.get(jobId)
        if (job !== undefined && job.status === 'running') job.abort()
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ cancelled: job !== undefined && job.status === 'running' }))
      },
    }))

    // Reveal a generated file or directory in the OS file manager.
    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: REVEAL_PATH,
      handler: (req, res) => {
        const request = req as RequestLike
        if ((request.method ?? 'GET') !== 'POST') {
          res.statusCode = 405
          res.end('method not allowed')
          return
        }
        const target = request.url === undefined ? '' : new URL(request.url, 'http://dsh.local').searchParams.get('path') ?? ''
        if (target.length === 0) {
          res.statusCode = 400
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: 'path is required' }))
          return
        }
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ result: revealPath(target) }))
      },
    }))

    // Generation progress: the client polls this while the job runs.
    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: GENERATE_PROGRESS_PATH,
      handler: (req, res) => {
        const request = req as RequestLike
        if ((request.method ?? 'GET') !== 'GET') {
          res.statusCode = 405
          res.end('method not allowed')
          return
        }
        const jobId = request.url === undefined ? null : new URL(request.url, 'http://dsh.local').searchParams.get('jobId')
        const job = jobId === null ? undefined : generateJobs.get(jobId)
        if (job === undefined) {
          res.statusCode = 404
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: 'generation job not found' }))
          return
        }
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({
          status: job.status,
          percent: job.percent,
          phase: job.phase,
          ...(job.path === undefined ? {} : { path: job.path }),
          ...(job.error === undefined ? {} : { error: job.error }),
        }))
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
