/**
 * Module-level article-generation state and job runner.
 *
 * The generation job lives here — NOT in a page component — so it survives
 * every kind of navigation: back to the records list, into the session chat,
 * even closing the panel. The progress dialog and the minimized status pill
 * render in their own body-level React root (panel.tsx) and subscribe to this
 * store, so the job is never lost while it runs.
 */
import { useSyncExternalStore } from 'react'
import { GenerationPhase, type ArticleFormat, type ArticleLanguage } from '../generate.ts'

/** One generation job snapshot, mirroring the host's /generate-progress body. */
export interface GenProgress {
  percent: number
  phase: GenerationPhase
  status: 'running' | 'done' | 'error'
  path?: string
  pdfPath?: string
  compileError?: string
  error?: string
}

/** What a generation setup submits to the host. */
export interface GenerateRequest {
  recordId: string
  format: ArticleFormat
  language: ArticleLanguage
  directory: string
  fileName: string
  /** LaTeX only: ask the host to compile the source to PDF after writing it. */
  compile: boolean
}

interface GenState {
  progress: GenProgress | null
  minimized: boolean
  elapsed: number
}

const GENERATE_ENDPOINT = '/api/dsh-electro-lab/generate'
const GENERATE_PROGRESS_ENDPOINT = '/api/dsh-electro-lab/generate-progress'
const GENERATE_CANCEL_ENDPOINT = '/api/dsh-electro-lab/generate-cancel'

const listeners = new Set<() => void>()
let state: GenState = { progress: null, minimized: false, elapsed: 0 }
let jobId: string | null = null
let timer: ReturnType<typeof setInterval> | null = null

function emit(): void {
  for (const listener of listeners) listener()
}

function startTimer(): void {
  if (timer !== null) return
  timer = setInterval(() => {
    state = { ...state, elapsed: state.elapsed + 1 }
    emit()
  }, 1000)
}

function stopTimer(): void {
  if (timer === null) return
  clearInterval(timer)
  timer = null
}

function setProgress(progress: GenProgress | null): void {
  state = { ...state, progress }
  if (progress !== null && progress.status === 'running') startTimer()
  else stopTimer()
  emit()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): GenState {
  return state
}

/** Parse the wire phase string back to the enum; unknown values fall back to Prepare. */
function parsePhase(value: string | undefined): GenerationPhase {
  switch (value) {
    case GenerationPhase.Prepare:
    case GenerationPhase.Generate:
    case GenerationPhase.Write:
    case GenerationPhase.Compile:
      return value
    default:
      return GenerationPhase.Prepare
  }
}

/** Subscribe a component to the generation state (useSyncExternalStore). */
export function useGenState(): GenState {
  return useSyncExternalStore(subscribe, getSnapshot)
}

/** Start a generation job and poll it to completion; safe to call from any page. */
export function startGenerate(request: GenerateRequest): void {
  if (state.progress?.status === 'running') return
  jobId = null
  // A new job always opens the progress dialog: reset the previous run's
  // minimized flag and elapsed counter (they may still be set if the last job
  // was dismissed from the pill without being restored).
  state = { ...state, minimized: false, elapsed: 0 }
  setProgress({ percent: 0, phase: GenerationPhase.Prepare, status: 'running' })
  void (async () => {
    try {
      const res = await fetch(
        `${GENERATE_ENDPOINT}?recordId=${encodeURIComponent(request.recordId)}&format=${encodeURIComponent(request.format)}&language=${encodeURIComponent(request.language)}&directory=${encodeURIComponent(request.directory)}&fileName=${encodeURIComponent(request.fileName)}&compile=${request.compile ? 'true' : 'false'}`,
        { method: 'POST' },
      )
      const body = (await res.json()) as { jobId?: string; error?: string }
      if (!res.ok) throw new Error(body.error ?? `generate returned ${res.status}`)
      if (body.jobId === undefined) throw new Error('no job id returned')
      jobId = body.jobId
      for (;;) {
        await new Promise((resolve) => setTimeout(resolve, 500))
        const pr = await fetch(`${GENERATE_PROGRESS_ENDPOINT}?jobId=${encodeURIComponent(body.jobId)}`)
        if (!pr.ok) throw new Error(`progress returned ${pr.status}`)
        const job = (await pr.json()) as { status?: string; percent?: number; phase?: string; path?: string; pdfPath?: string; compileError?: string; error?: string }
        if (job.status === 'done') {
          setProgress({
            percent: 100,
            phase: parsePhase(job.phase),
            status: 'done',
            path: job.path,
            ...(job.pdfPath === undefined ? {} : { pdfPath: job.pdfPath }),
            ...(job.compileError === undefined ? {} : { compileError: job.compileError }),
          })
          return
        }
        if (job.status === 'error') {
          setProgress({ percent: job.percent ?? 0, phase: parsePhase(job.phase), status: 'error', error: job.error ?? 'unknown error' })
          return
        }
        if (job.percent !== undefined && job.phase !== undefined) {
          setProgress({ percent: job.percent, phase: parsePhase(job.phase), status: 'running' })
        }
      }
    } catch (error) {
      setProgress({ percent: 0, phase: GenerationPhase.Prepare, status: 'error', error: error instanceof Error ? error.message : String(error) })
    }
  })()
}

/** Collapse the progress dialog into the corner pill; the job keeps running. */
export function setMinimized(minimized: boolean): void {
  state = { ...state, minimized }
  emit()
}

/** Abort a running job and close the progress UI. */
export function cancelGenerate(): void {
  const id = jobId
  jobId = null
  if (id !== null) {
    void fetch(`${GENERATE_CANCEL_ENDPOINT}?jobId=${encodeURIComponent(id)}`, { method: 'POST' }).catch(() => {})
  }
  setProgress(null)
  state = { ...state, minimized: false, elapsed: 0 }
  emit()
}

/** Dismiss a settled progress (done or error) and reset the UI. */
export function clearProgress(): void {
  jobId = null
  setProgress(null)
  state = { ...state, minimized: false, elapsed: 0 }
  emit()
}
