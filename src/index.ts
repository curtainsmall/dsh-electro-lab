/**
 * Host half of dsh-electro-lab.
 */
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import type { Context } from 'cordis'
import { registerTools } from './tools/index.ts'
import { registerSkills } from './skill.ts'
import { installPresets } from './preset.ts'
import { RecordManager, readRecordArchive, deleteRecordFromArchive, type Record, type RecordEvent } from './records.ts'
import { ArticleFormat, ArticleLanguage, GenerationPhase, TemplateLanguage, buildArticlePrompt, buildLatexDocument, normalizeFileName, resolveTemplateLanguage, templateLanguageToArticleLanguage } from './generate.ts'
import { clearRestartRequired, deleteExternalTool, readExternalTools, restartRequired, upsertExternalTool, validateExternalTool } from './external-tool/registry.ts'
import { compileExternalTool } from './external-tool/compile.ts'

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

/** Article generation: POST ?recordId=&format=&directory=&fileName=&language= starts a job and returns its id. */
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

/** Remembered generation state — output directory and article language (GET), persistence (PUT ?dir=&language=). */
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

/** Non-config serialized state: the remembered generation output directory, article language, format and PDF-compile toggle. */
interface GenerateState {
  generateDir?: string
  generateLanguage?: string
  generateFormat?: string
  generateCompile?: boolean
}

/** Raw state.json contents (never throws — missing or corrupt file reads as {}). */
function readStoredState(): Partial<GenerateState> {
  try {
    const parsed = JSON.parse(readFileSync(join(recordsHome, STATE_FILE), 'utf8'))
    return typeof parsed === 'object' && parsed !== null ? (parsed as Partial<GenerateState>) : {}
  } catch {
    return {}
  }
}

/** Membership guards for the query-string values (string enums travel as raw strings over HTTP). */
function isArticleFormat(value: unknown): value is ArticleFormat {
  switch (value) {
    case ArticleFormat.Markdown:
    case ArticleFormat.Latex:
      return true
    default:
      return false
  }
}

function isArticleLanguage(value: unknown): value is ArticleLanguage {
  switch (value) {
    case ArticleLanguage.Auto:
    case ArticleLanguage.ZhCN:
    case ArticleLanguage.En:
      return true
    default:
      return false
  }
}

/** The remembered generation state, with a one-time migration from the legacy plain-text file. */
function readGenerateState(): GenerateState {
  const stored = readStoredState()
  const state: GenerateState = {
    generateDir: typeof stored.generateDir === 'string' && stored.generateDir.trim().length > 0 ? stored.generateDir.trim() : undefined,
    generateLanguage: typeof stored.generateLanguage === 'string' && stored.generateLanguage.length > 0 ? stored.generateLanguage : undefined,
    generateFormat: isArticleFormat(stored.generateFormat) ? stored.generateFormat : undefined,
    generateCompile: typeof stored.generateCompile === 'boolean' ? stored.generateCompile : undefined,
  }
  if (state.generateDir === undefined) {
    try {
      const legacy = readFileSync(join(recordsHome, LEGACY_GENERATE_DIR_FILE), 'utf8').trim()
      if (legacy.length > 0) state.generateDir = legacy
    } catch {
      // no legacy file — nothing to migrate
    }
  }
  return state
}

/** Persist the generation state; undefined fields keep their stored values. */
function writeGenerateState(state: GenerateState): void {
  mkdirSync(recordsHome, { recursive: true })
  const merged: Partial<GenerateState> = { ...readStoredState(), ...state }
  if (merged.generateDir === undefined || merged.generateDir.trim().length === 0) delete merged.generateDir
  if (merged.generateLanguage === undefined || merged.generateLanguage.length === 0) delete merged.generateLanguage
  if (merged.generateFormat === undefined || !isArticleFormat(merged.generateFormat)) delete merged.generateFormat
  if (merged.generateCompile === undefined || typeof merged.generateCompile !== 'boolean') delete merged.generateCompile
  writeFileSync(join(recordsHome, STATE_FILE), JSON.stringify(merged), 'utf8')
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
function revealPath(target: string): Promise<string> {
  return launchInOs(target, 'reveal')
}

/** Open a generated file with its default application. */
function openFilePath(target: string): Promise<string> {
  return launchInOs(target, 'open')
}

/** One platform's "open in the OS" recipe: candidate commands plus the argv builder. */
interface OpenRecipe {
  /** Candidate commands tried in order (the first that spawns wins). */
  commands: string[]
  /** Build the argv for open/reveal from the target and whether it is a directory. */
  args: (target: string, mode: 'open' | 'reveal', isDir: boolean) => string[]
}

function openRecipe(): OpenRecipe {
  switch (process.platform) {
    case 'darwin':
      // open <file> uses the default app; open -R <file> reveals it in Finder.
      return {
        commands: ['/usr/bin/open'],
        args: (target, mode, isDir) => mode === 'open' || isDir ? [target] : ['-R', target],
      }
    case 'win32':
      // explorer.exe opens with the shell; /select,<file> reveals the file.
      // explorer exits with code 1 when an Explorer instance already runs (it
      // hands the request over) — that is success, not failure. windowsHide:
      // true (CREATE_NO_WINDOW) and stdio:'ignore' each silently suppress the
      // Explorer window (verified empirically) — detached only, never wait.
      return {
        commands: ['explorer.exe'],
        args: (target, mode, isDir) => mode === 'open' ? [target] : [isDir ? target : `/select,${target}`],
      }
    default:
      // xdg-open has no reveal/select — revealing a file opens its folder.
      return {
        commands: ['xdg-open', '/usr/bin/xdg-open'],
        args: (target, mode, isDir) => [mode === 'open' || isDir ? target : dirname(target)],
      }
  }
}

/** Spawn one launcher detached and report spawn success/failure (ENOENT included). */
function spawnDetached(command: string, args: string[]): Promise<{ ok: boolean; code?: string; message: string }> {
  return new Promise((resolve) => {
    try {
      const child = spawn(command, args, { detached: true })
      const timer = setTimeout(() => resolve({ ok: true, message: 'ok' }), 10_000)
      child.once('spawn', () => {
        clearTimeout(timer)
        resolve({ ok: true, message: 'ok' })
      })
      child.once('error', (error) => {
        clearTimeout(timer)
        resolve({ ok: false, code: (error as NodeJS.ErrnoException).code, message: error.message })
      })
      child.unref()
    } catch (error) {
      resolve({ ok: false, code: 'THROW', message: error instanceof Error ? error.message : String(error) })
    }
  })
}

/** Open/reveal a path through the OS file manager or the default application. */
async function launchInOs(target: string, mode: 'open' | 'reveal'): Promise<string> {
  if (!existsSync(target)) return `failed: no such file or directory: ${target}`
  const isDir = statSync(target).isDirectory()
  const recipe = openRecipe()
  const args = recipe.args(target, mode, isDir)
  for (const command of recipe.commands) {
    const outcome = await spawnDetached(command, args)
    if (outcome.ok) return 'ok'
    // A missing command (e.g. xdg-open not on PATH) falls through to the next
    // candidate; any other spawn failure is reported as-is.
    if (outcome.code !== 'ENOENT') return `failed: ${outcome.message}`
  }
  return 'failed: no suitable opener found'
}

/**
 * Generate the solution article for one record through the host LLM. For
 * Markdown the model's text IS the article; for LaTeX the model writes only
 * the body, which is sanitized and wrapped in the document shell here.
 */
async function generateArticle(ctx: Context, record: Record, signal: AbortSignal, language: ArticleLanguage, format: ArticleFormat, onProgress?: (percent: number) => void): Promise<string> {
  const llm = ctx.get('llm')
  if (llm === undefined) throw new Error('the LLM service is unavailable in this deployment')
  const defaults = ctx.get('agentDefaultModel')
  const route = defaults?.currentSelection()
  if (route === undefined || route.provider === undefined || route.model === undefined) {
    throw new Error('no default model is configured — pick one in Settings first')
  }
  // LaTeX needs the document class fixed BEFORE generation: resolve the
  // template language (auto → probe the question text) and pin the prompt to
  // it. Markdown keeps the raw selection (auto follows the question).
  let templateLanguage: TemplateLanguage | undefined
  switch (format) {
    case ArticleFormat.Latex:
      templateLanguage = resolveTemplateLanguage(language, record.question)
      break
    case ArticleFormat.Markdown:
      break
  }
  const promptLanguage: ArticleLanguage = templateLanguage === undefined
    ? language
    : templateLanguageToArticleLanguage(templateLanguage)
  const { system, user } = buildArticlePrompt(record, promptLanguage, format)
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
  if (templateLanguage === undefined) return trimmed
  const document = buildLatexDocument(trimmed, templateLanguage)
  if (!document.ok) throw new Error(`LaTeX validation failed: ${document.error}`)
  return document.text
}

/** One in-memory generation job (never persisted — no generation log). */
interface GenerateJob {
  status: 'running' | 'done' | 'error'
  percent: number
  phase: GenerationPhase
  path?: string
  /** Present when the LaTeX source compiled successfully. */
  pdfPath?: string
  /** Present when compilation was requested but failed (the .tex is still written). */
  compileError?: string
  error?: string
  abort: () => void
}

const generateJobs = new Map<string, GenerateJob>()

/** Run one command and collect its output tail; kills on timeout. */
function runCommand(command: string, args: string[], cwd: string, timeoutMs: number): Promise<{ ok: boolean; code: number | null; output: string }> {
  return new Promise((resolve) => {
    try {
      const child = spawn(command, args, { cwd })
      let output = ''
      const timer = setTimeout(() => { child.kill() }, timeoutMs)
      child.stdout?.on('data', (chunk: Buffer) => { output += String(chunk) })
      child.stderr?.on('data', (chunk: Buffer) => { output += String(chunk) })
      child.on('error', (error) => {
        clearTimeout(timer)
        resolve({ ok: false, code: null, output: error.message })
      })
      child.on('close', (code) => {
        clearTimeout(timer)
        resolve({ ok: code === 0, code, output: output.slice(-4000) })
      })
    } catch (error) {
      resolve({ ok: false, code: null, output: error instanceof Error ? error.message : String(error) })
    }
  })
}

/** Candidate xelatex commands: PATH first, then known MiKTeX install locations on Windows. */
function xelatexCandidates(): string[] {
  const candidates = ['xelatex']
  if (process.platform === 'win32') {
    for (const root of listDriveRoots()) {
      candidates.push(join(root, 'MiKTeX', 'miktex', 'bin', 'x64', 'xelatex.exe'))
    }
    const local = process.env.LOCALAPPDATA
    if (local !== undefined) candidates.push(join(local, 'Programs', 'MiKTeX', 'miktex', 'bin', 'x64', 'xelatex.exe'))
    candidates.push('C:\\Program Files\\MiKTeX\\miktex\\bin\\x64\\xelatex.exe')
    candidates.push('C:\\Program Files (x86)\\MiKTeX\\miktex\\bin\\x64\\xelatex.exe')
  }
  return candidates
}

/** Candidate pandoc commands: PATH first, then the usual Windows install location. */
function pandocCandidates(): string[] {
  const candidates = ['pandoc']
  if (process.platform === 'win32') {
    candidates.push('C:\\Program Files\\Pandoc\\pandoc.exe')
    const local = process.env.LOCALAPPDATA
    if (local !== undefined) candidates.push(join(local, 'Pandoc', 'pandoc.exe'))
  }
  return candidates
}

/** The CJK fallback font pandoc passes to xelatex for Chinese Markdown articles (per-OS default). */
function cjkMainFont(): string {
  switch (process.platform) {
    case 'darwin': return 'PingFang SC'
    case 'win32': return 'Microsoft YaHei'
    default: return 'Noto Sans CJK SC'
  }
}

/**
 * Compile a generated Markdown article to PDF through pandoc + xelatex (the
 * engine the LaTeX path already probes). pandoc needs to be installed; when it
 * is missing the error tells the user exactly that. The .md stays the primary
 * artifact — a failure never fails the job.
 */
async function compileMarkdownToPdf(directory: string, fileName: string): Promise<{ ok: true; pdfPath: string } | { ok: false; error: string }> {
  const pdfName = fileName.replace(/\.(md)$/i, '.pdf')
  const pdfPath = join(directory, pdfName)
  const args = [fileName, '-o', pdfName, '--pdf-engine=xelatex', '-V', `CJKmainfont=${cjkMainFont()}`]
  if (process.platform === 'win32') args.push('--pdf-engine-opt=--enable-installer')
  let firstFailure: string | undefined
  for (const command of pandocCandidates()) {
    const result = await runCommand(command, args, directory, 150_000)
    if (!result.ok) {
      if (result.code !== null || !result.output.includes('ENOENT')) {
        firstFailure = `pandoc failed: ${result.output.trim()}`
      }
      continue
    }
    if (!existsSync(pdfPath)) return { ok: false, error: 'pandoc finished but produced no PDF' }
    return { ok: true, pdfPath }
  }
  return { ok: false, error: firstFailure ?? 'pandoc was not found — install it (e.g. winget install JohnMacFarlane.Pandoc) to compile Markdown to PDF' }
}

/**
 * Compile a generated LaTeX source to PDF with xelatex (two passes so any
 * \label/\ref resolves). The .tex stays the primary artifact: a failure here
 * never fails the job — it is reported as compileError on the done snapshot.
 * --enable-installer (Windows/MiKTeX only) auto-installs missing packages
 * instead of showing an interactive prompt that would hang the job.
 */
async function compileLatexToPdf(directory: string, fileName: string): Promise<{ ok: true; pdfPath: string } | { ok: false; error: string }> {
  const pdfPath = join(directory, fileName.replace(/\.(tex)$/i, '.pdf'))
  const args = ['-interaction=nonstopmode', '-halt-on-error', '-synctex=1']
  if (process.platform === 'win32') args.push('--enable-installer')
  // Pass the file NAME only, with cwd = the output directory: xelatex (MiKTeX)
  // exits with code 1 when given an absolute Windows path as the file argument.
  args.push(fileName)
  let firstFailure: string | undefined
  for (const command of xelatexCandidates()) {
    const first = await runCommand(command, args, directory, 100_000)
    if (!first.ok) {
      // ENOENT: command missing — try the next candidate; anything else is a real compile failure.
      if (first.code !== null || !first.output.includes('ENOENT')) {
        firstFailure = `xelatex failed: ${first.output.trim()}`
      }
      continue
    }
    // Second pass resolves references; ignore its failure (the PDF already exists).
    await runCommand(command, args, directory, 100_000)
    if (!existsSync(pdfPath)) return { ok: false, error: 'xelatex finished but produced no PDF' }
    return { ok: true, pdfPath }
  }
  return { ok: false, error: firstFailure ?? 'xelatex was not found on this machine' }
}

/** Start a background generation job and return its id; progress is polled via GET /generate-progress. */
function startGenerateJob(ctx: Context, record: Record, directory: string, fileName: string, language: ArticleLanguage, format: ArticleFormat, compile: boolean): string {
  const jobId = randomUUID()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 300_000)
  const job: GenerateJob = { status: 'running', percent: 5, phase: GenerationPhase.Prepare, abort: () => controller.abort() }
  generateJobs.set(jobId, job)
  void (async () => {
    try {
      job.percent = 10
      job.phase = GenerationPhase.Generate
      const article = await generateArticle(ctx, record, controller.signal, language, format, (percent) => { job.percent = percent })
      job.phase = GenerationPhase.Write
      job.percent = 92
      // LaTeX generations own a folder named after the file (the setup dialog's
      // output name = folder name = .tex name): every artifact — source, PDF and
      // the compiler's .aux/.log/.synctex.gz — stays inside it, keeping the
      // chosen output directory clean. Markdown stays a flat single file.
      const isLatex = format === ArticleFormat.Latex
      const targetDir = isLatex ? join(directory, fileName.replace(/\.tex$/i, '')) : directory
      mkdirSync(targetDir, { recursive: true })
      const target = join(targetDir, fileName)
      writeFileSync(target, article, 'utf8')
      if (compile) {
        job.phase = GenerationPhase.Compile
        job.percent = 96
        const compiled = isLatex
          ? await compileLatexToPdf(targetDir, fileName)
          : await compileMarkdownToPdf(directory, fileName)
        if (compiled.ok) job.pdfPath = compiled.pdfPath
        else job.compileError = compiled.error
      }
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
  const formatParam = params.get('format') ?? ArticleFormat.Markdown
  if (!isArticleFormat(formatParam)) throw new Error(`unsupported format "${formatParam}"`)
  const languageParam = params.get('language') ?? ArticleLanguage.Auto
  if (!isArticleLanguage(languageParam)) throw new Error(`unsupported language "${languageParam}"`)
  const directory = (params.get('directory') ?? '').trim()
  if (directory.length === 0) throw new Error('output directory is required')
  const record = readRecordArchive(join(recordsHome, 'records.jsonl')).find((item) => item.id === recordId)
  if (record === undefined) throw new Error(`record "${recordId}" not found`)

  const rawName = (params.get('fileName') ?? '').trim()
  const fileName = rawName.length === 0
    ? normalizeFileName(`electro-lab-${record.id.slice(0, 8)}`, formatParam)
    : normalizeFileName(rawName, formatParam)

  const compile = params.get('compile') === 'true'

  return { jobId: startGenerateJob(ctx, record, directory, fileName, languageParam, formatParam, compile) }
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

    // Reveal a generated file or directory in the OS file manager (or open it
    // with the default application): POST ?path=&action=open|reveal. The
    // launcher is per-platform (explorer / open / xdg-open), so it works on
    // every OS the host runs on.
    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: REVEAL_PATH,
      handler: async (req, res) => {
        const request = req as RequestLike
        if ((request.method ?? 'GET') !== 'POST') {
          res.statusCode = 405
          res.end('method not allowed')
          return
        }
        const url = new URL(request.url ?? '', 'http://dsh.local')
        const target = url.searchParams.get('path') ?? ''
        if (target.length === 0) {
          res.statusCode = 400
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: 'path is required' }))
          return
        }
        const action = url.searchParams.get('action') === 'open' ? 'open' : 'reveal'
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ result: await (action === 'open' ? openFilePath(target) : revealPath(target)) }))
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
          ...(job.pdfPath === undefined ? {} : { pdfPath: job.pdfPath }),
          ...(job.compileError === undefined ? {} : { compileError: job.compileError }),
          ...(job.error === undefined ? {} : { error: job.error }),
        }))
      },
    }))

    // The remembered generation state (output directory + article language):
    // GET reads it back, PUT ?dir=&language= saves either field (query params,
    // so no body parsing is needed on the request).
    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: GENERATE_DIR_PATH,
      handler: (req, res) => {
        const request = req as RequestLike
        const method = request.method ?? 'GET'
        if (method === 'PUT') {
          const url = new URL(request.url ?? '', 'http://dsh.local')
          const dir = url.searchParams.get('dir')
          const language = url.searchParams.get('language')
          const format = url.searchParams.get('format')
          const compileParam = url.searchParams.get('compile')
          const state: GenerateState = {}
          if (dir !== null) state.generateDir = dir
          if (language !== null) state.generateLanguage = language
          if (format !== null) state.generateFormat = format
          if (compileParam === 'true' || compileParam === 'false') state.generateCompile = compileParam === 'true'
          writeGenerateState(state)
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ saved: true }))
          return
        }
        if (method !== 'GET') {
          res.statusCode = 405
          res.end('method not allowed')
          return
        }
        const state = readGenerateState()
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({
          directory: state.generateDir ?? '',
          language: state.generateLanguage ?? 'auto',
          format: state.generateFormat ?? 'markdown',
          compile: state.generateCompile ?? false,
        }))
      },
    }))

    return () => {
      for (const off of disposers) off()
    }
  }, 'dsh-electro-lab: records')

  // External tools: declared over http/file transports, compiled and
  // registered at plugin start (changes need a restart — see the dirty bit).
  ctx.effect(() => {
    const disposers: Array<() => void> = []
    for (const config of readExternalTools(recordsHome)) {
      if (!config.enabled) continue
      try {
        disposers.push(ctx.tools.register(compileExternalTool(config)))
      } catch (error) {
        ctx.logger?.warn(`[dsh-electro-lab] failed to register external tool "${config.name}": ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    // Registration just ran with the current file: the restart dirty bit is
    // stale now and clears until the next change.
    clearRestartRequired(recordsHome)

    // Management endpoints: GET lists declarations + dirty bit; PUT
    // upserts one declaration (base64 JSON in the query, no body parsing);
    // DELETE ?name= removes one. Every write sets the restart dirty bit.
    const EXTERNAL_PATH = '/api/dsh-electro-lab/external-tools'
    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: EXTERNAL_PATH,
      handler: (req, res) => {
        const request = req as RequestLike
        const method = request.method ?? 'GET'
        res.setHeader('content-type', 'application/json')
        if (method === 'PUT') {
          const encoded = request.url === undefined ? null : new URL(request.url, 'http://dsh.local').searchParams.get('config')
          if (encoded === null) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'config parameter is required (base64 JSON)' }))
            return
          }
          let config: unknown
          try {
            config = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
          } catch {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'config is not valid base64 JSON' }))
            return
          }
          const errors = validateExternalTool(config)
          if (errors.length > 0) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: errors.join('; ') }))
            return
          }
          upsertExternalTool(recordsHome, config as never)
          res.end(JSON.stringify({ saved: true, restartRequired: true }))
          return
        }
        if (method === 'DELETE') {
          const name = request.url === undefined ? null : new URL(request.url, 'http://dsh.local').searchParams.get('name')
          const deleted = name !== null && deleteExternalTool(recordsHome, name)
          res.end(JSON.stringify({ deleted, restartRequired: restartRequired(recordsHome) }))
          return
        }
        if (method !== 'GET') {
          res.statusCode = 405
          res.end('method not allowed')
          return
        }
        res.end(JSON.stringify({ tools: readExternalTools(recordsHome), restartRequired: restartRequired(recordsHome) }))
      },
    }))

    return () => {
      for (const off of disposers) off()
    }
  }, 'dsh-electro-lab: external tools')

  try {
    const synced = installPresets()
    if (synced.length > 0) ctx.logger?.info(`[dsh-electro-lab] synced packaged preset(s): ${synced.join(', ')}`)
  } catch (error) {
    // A preset that fails to sync must never break the plugin.
    ctx.logger?.warn(`[dsh-electro-lab] failed to sync packaged preset: ${error instanceof Error ? error.message : String(error)}`)
  }
}
