/**
 * Host half of dsh-electro-lab.
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Context } from 'cordis'
import { registerTools } from './tools/index.ts'
import { registerSkills } from './skill.ts'
import { installPresets } from './preset.ts'
import {
  applyElectroLabProjection,
  initElectroLabProjection,
  viewElectroLabProjection,
  type ElectroLabProjectionState,
  type ElectroLabSessionEvent,
} from './records.ts'
import { createRecordStore, type RecordStore } from './record-store.ts'

/** Plugin identity for cordis.yml rows. */
export const name = 'dsh-electro-lab'

/** Services required before mounting: the tool registry. */
export const inject = ['tools']

declare module 'cordis' {
  interface Events {
    /** Post-commit append feed (dsh-session's own declaration; mirrored loosely here). */
    'session/event'(session: unknown, event: unknown): void
  }
}

/** Minimal structural shape of a session (id + event log reads). */
interface SessionLike {
  id?: string
  events?: readonly unknown[]
}

/** Minimal structural shape of the llm service (stream + text deltas). */
interface LlmLike {
  stream(options: Record<string, unknown>): AsyncIterable<{ type?: string; text?: string }>
}

/** Minimal structural shape of the web-server route registry. */
interface WebServerLike {
  register(route: {
    kind: 'exact'
    path: string
    handler(req: unknown, res: {
      setHeader(name: string, value: string): void
      end(body: string): void
    }): void | Promise<void>
  }): () => void
}

/** The records page endpoint (same origin as the web app; the client polls it). */
const RECORDS_PATH = '/api/dsh-electro-lab/records'
/** How many runs get summarized per settle/backfill batch. */
const SUMMARY_BATCH = 3

/** How the summarizer consolidates the raw question inputs (host-side prompt). */
const QUESTION_SUMMARY_PROMPT =
  'The following are one or more user inputs to an electrical/electronics calculation assistant ' +
  '(later inputs may be follow-ups or refinements). Combine them into ONE complete, self-contained ' +
  'question that needs no further context, in the same language as the inputs. ' +
  'Return only the question text.'

/** The last logged model route (`request/context`), when the session has one. */
function lastRequestRoute(session: SessionLike): { provider: string; model: string } | undefined {
  const events = session.events ?? []
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index] as { type?: string; data?: { provider?: unknown; model?: unknown } } | undefined
    if (event?.type === 'request/context' && typeof event.data?.provider === 'string' && typeof event.data?.model === 'string') {
      return { provider: event.data.provider, model: event.data.model }
    }
  }
  return undefined
}

/**
 * Summarize the raw question inputs of one settled run with its recorded
 * model route and attach the result to the stored record. The summary never
 * enters the session log (the session persistence read path refuses unknown
 * out-of-repo event types) — it lives in the plugin-owned record store only.
 * Failures are logged and contained; the record keeps the raw inputs.
 */
async function summarizeQuestion(
  ctx: Context,
  llm: LlmLike,
  store: RecordStore,
  runId: string,
  questionInputs: readonly string[],
  route: { provider: string; model: string } | null | undefined,
): Promise<void> {
  if (route === undefined || route === null) {
    ctx.logger?.warn(`[dsh-electro-lab] no request route for run ${runId} — question summarization skipped`)
    return
  }
  try {
    const stream = llm.stream({
      provider: route.provider,
      model: route.model,
      messages: [
        { role: 'user', content: [{ type: 'text', text: `${QUESTION_SUMMARY_PROMPT}\n\n${questionInputs.join('\n---\n')}` }] },
      ],
    })
    const parts: string[] = []
    for await (const chunk of stream) {
      if (chunk.type === 'text-delta' && typeof chunk.text === 'string') parts.push(chunk.text)
    }
    const question = parts.join('').trim().slice(0, 500)
    if (question.length === 0) {
      ctx.logger?.warn(`[dsh-electro-lab] summarizer returned no text for run ${runId}`)
      return
    }
    store.updateQuestion(runId, question)
  } catch (error) {
    ctx.logger?.warn(`[dsh-electro-lab] question summarization failed for run ${runId}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export function apply(ctx: Context): void {
  ctx.effect(() => registerTools(ctx), 'dsh-electro-lab: tools')
  ctx.effect(() => registerSkills(ctx), 'dsh-electro-lab: skills')

  // Run records, plugin-owned: the fold observes session events WITHOUT
  // touching the session (no appends, no custom event types), settled runs
  // are persisted to disk under the user's home — `~/.dsh-electro-lab/`,
  // deliberately OUTSIDE $DSH_HOME so the records survive session deletion,
  // restarts and even a full DSH uninstall — and the client panel reads the
  // whole store through one HTTP endpoint: one page, all sessions.
  const recordsHome = process.env.DSH_ELECTRO_LAB_HOME ?? join(homedir(), '.dsh-electro-lab')
  const store = createRecordStore(join(recordsHome, 'records.json'))
  const states = new Map<string, ElectroLabProjectionState>()
  const llm = ctx.get('llm') as LlmLike | undefined

  ctx.effect(() => {
    const disposers: Array<() => void> = []

    // Session trace: fold every committed event per session. The first event
    // of a session folds the FULL log first (lazy cell build), so resumed
    // sessions backfill their history into the store on first touch.
    disposers.push(ctx.on('session/event', (session, event) => {
      const s = session as SessionLike
      const sessionId = s.id
      if (sessionId === undefined) return
      let state = states.get(sessionId)
      if (state === undefined) {
        state = initElectroLabProjection()
        for (const stored of s.events ?? []) state = applyElectroLabProjection(state, stored as ElectroLabSessionEvent)
        states.set(sessionId, state)
      }
      const next = applyElectroLabProjection(state, event as ElectroLabSessionEvent)
      states.set(sessionId, next)

      // Persist every newly settled run (history backfill included) and
      // summarize a bounded batch of them.
      const route = lastRequestRoute(s)
      let budget = SUMMARY_BATCH
      for (const run of next.settled) {
        if (store.has(sessionId, run.id)) continue
        store.append({ sessionId, route, run })
        if (budget === 0 || llm === undefined || run.questionInputs.length === 0) continue
        budget -= 1
        void summarizeQuestion(ctx, llm, store, run.id, run.questionInputs, route)
      }
    }))

    // The records page: all stored records plus any live open runs, newest
    // first. Also lazily refills missing question summaries on each read so a
    // restarted process gradually catches up as the panel polls.
    const webServer = ctx.get('webServer') as WebServerLike | undefined
    if (webServer !== undefined) {
      disposers.push(webServer.register({
        kind: 'exact',
        path: RECORDS_PATH,
        handler: (_req, res) => {
          const open: Array<{ sessionId: string; run: unknown }> = []
          for (const [sessionId, state] of states) {
            const run = viewElectroLabProjection(state).open
            if (run !== null) open.push({ sessionId, run })
          }
          if (llm !== undefined) {
            let budget = SUMMARY_BATCH
            for (const record of store.list()) {
              if (budget === 0) break
              if (record.run.question !== undefined || record.run.questionInputs.length === 0) continue
              budget -= 1
              void summarizeQuestion(ctx, llm, store, record.run.id, record.run.questionInputs, record.route)
            }
          }
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ records: store.list(), open }))
        },
      }))
    }

    return () => {
      for (const off of disposers) off()
    }
  }, 'dsh-electro-lab: run records')

  try {
    const synced = installPresets()
    if (synced.length > 0) ctx.logger?.info(`[dsh-electro-lab] synced packaged preset(s): ${synced.join(', ')}`)
  } catch (error) {
    // A preset that fails to sync must never break the plugin.
    ctx.logger?.warn(`[dsh-electro-lab] failed to sync packaged preset: ${error instanceof Error ? error.message : String(error)}`)
  }
}
