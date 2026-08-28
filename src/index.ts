/**
 * Host half of dsh-electro-lab.
 */
import type { Context } from 'cordis'
import { registerTools } from './tools/index.ts'
import { registerSkills } from './skill.ts'
import { installPresets } from './preset.ts'
import {
  applyElectroLabProjection,
  ELECTRO_LAB_PROJECTION_KEY,
  ELECTRO_LAB_PROJECTION_STATE_VERSION,
  initElectroLabProjection,
  QUESTION_EVENT_TYPE,
  viewElectroLabProjection,
  type ElectroLabProjectionValue,
} from './records.ts'

/** Plugin identity for cordis.yml rows. */
export const name = 'dsh-electro-lab'

/** Services required before mounting: the tool registry. */
export const inject = ['tools']

/** Minimal structural shape of the session-projection registry (loose-typed
 *  on purpose — the runtime module table provides the real implementation). */
interface SessionProjectionsLike {
  register(definition: {
    key: string
    schema: { parse(value: unknown): unknown }
    init(): unknown
    apply(state: unknown, event: unknown): unknown
    view(state: unknown): unknown
    stateVersion: number
  }): () => void
  onChanged(listener: (session: unknown, key: string, value: unknown, seq: number) => void): () => void
}

/** Minimal structural shape of a session (append + event log reads). */
interface SessionLike {
  events?: readonly unknown[]
  append(type: string, data: unknown, opts?: { ignorable?: boolean }): void
}

/** Minimal structural shape of the llm service (stream + text deltas). */
interface LlmLike {
  stream(options: Record<string, unknown>): AsyncIterable<{ type?: string; text?: string }>
}

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
 * Summarize the raw question inputs of one settled run with the session's own
 * model route and append the result as a log-only `electro-lab/question`
 * event. Runs outside the projection unit on purpose: the fold must stay pure
 * and synchronous, so the LLM output rides the event data for deterministic
 * replay. Failures are logged and contained — records keep the raw inputs.
 */
async function summarizeQuestion(
  ctx: Context,
  session: SessionLike,
  llm: LlmLike,
  runId: string,
  questionInputs: readonly string[],
): Promise<void> {
  const route = lastRequestRoute(session)
  if (route === undefined) {
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
    session.append(QUESTION_EVENT_TYPE, { runId, question }, { ignorable: true })
  } catch (error) {
    ctx.logger?.warn(`[dsh-electro-lab] question summarization failed for run ${runId}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export function apply(ctx: Context): void {
  ctx.effect(() => registerTools(ctx), 'dsh-electro-lab: tools')
  ctx.effect(() => registerSkills(ctx), 'dsh-electro-lab: skills')
  // Run records for the client panel: a pure session-projection unit that
  // folds electro-lab tool calls into settled runs. Optional — headless
  // assemblies without the registry simply have no records.
  const projections = ctx.get('sessionProjections') as SessionProjectionsLike | undefined
  if (projections !== undefined) {
    const disposers: Array<() => void> = []
    disposers.push(projections.register({
      key: ELECTRO_LAB_PROJECTION_KEY,
      schema: { parse: (value: unknown) => value },
      init: initElectroLabProjection,
      apply: applyElectroLabProjection,
      view: viewElectroLabProjection,
      stateVersion: ELECTRO_LAB_PROJECTION_STATE_VERSION,
    }))
    // Question summarization: every settled run without a summarized question
    // gets one via the session's own model route. The LLM call is async and
    // non-deterministic, so it lives outside the unit; its output is appended
    // as a log-only event the fold picks up.
    const llm = ctx.get('llm') as LlmLike | undefined
    if (llm !== undefined) {
      const summarized = new Set<string>()
      disposers.push(projections.onChanged((session, key, value) => {
        if (key !== ELECTRO_LAB_PROJECTION_KEY) return
        const projection = value as ElectroLabProjectionValue
        for (const run of projection.runs) {
          if (run.question !== undefined || run.questionInputs.length === 0 || summarized.has(run.id)) continue
          summarized.add(run.id)
          void summarizeQuestion(ctx, session as SessionLike, llm, run.id, run.questionInputs)
        }
      }))
    }
    ctx.effect(() => () => {
      for (const off of disposers) off()
    }, 'dsh-electro-lab: run records projection')
  }
  try {
    const synced = installPresets()
    if (synced.length > 0) ctx.logger?.info(`[dsh-electro-lab] synced packaged preset(s): ${synced.join(', ')}`)
  } catch (error) {
    // A preset that fails to sync must never break the plugin.
    ctx.logger?.warn(`[dsh-electro-lab] failed to sync packaged preset: ${error instanceof Error ? error.message : String(error)}`)
  }
}
