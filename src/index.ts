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

export function apply(ctx: Context): void {
  ctx.effect(() => registerTools(ctx), 'dsh-electro-lab: tools')
  ctx.effect(() => registerSkills(ctx), 'dsh-electro-lab: skills')

  // Run records, plugin-owned: the fold observes session events WITHOUT
  // touching the session (no appends, no custom event types), settled runs
  // are appended one-shot to disk under the user's home — `~/.dsh-electro-lab/`,
  // deliberately OUTSIDE $DSH_HOME so the records survive session deletion,
  // restarts and even a full DSH uninstall — and the client panel reads the
  // whole store through one HTTP endpoint: one page, all sessions.
  const recordsHome = process.env.DSH_ELECTRO_LAB_HOME ?? join(homedir(), '.dsh-electro-lab')
  const store: RecordStore = createRecordStore(join(recordsHome, 'records.jsonl'))
  const states = new Map<string, ElectroLabProjectionState>()

  ctx.effect(() => {
    const disposers: Array<() => void> = []

    // Session trace: fold every committed event per session. The first event
    // of a session folds the FULL log first (lazy state rebuild) — that only
    // RESTORES the fold state (an in-progress run keeps tracking); historical
    // runs are never re-appended: they were appended live when they settled,
    // and records are live-only (the archive is authoritative). Only a run
    // settled by the incoming event itself is appended — detected by the
    // settled head changing across this one apply.
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
      const headBefore = state.settled[0]?.id
      const next = applyElectroLabProjection(state, event as ElectroLabSessionEvent)
      states.set(sessionId, next)
      const head = next.settled[0]
      if (head !== undefined && head.id !== headBefore) store.append(head)
    }))

    // The records page: all stored runs plus any live open runs, newest first.
    const webServer = ctx.get('webServer') as WebServerLike | undefined
    if (webServer !== undefined) {
      disposers.push(webServer.register({
        kind: 'exact',
        path: RECORDS_PATH,
        handler: (_req, res) => {
          const open: Array<unknown> = []
          for (const state of states.values()) {
            const run = viewElectroLabProjection(state).open
            if (run !== null) open.push(run)
          }
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ records: [...store.list()].reverse(), open }))
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
