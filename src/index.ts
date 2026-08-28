/**
 * Host half of dsh-electro-lab.
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Context } from 'cordis'
import { registerTools } from './tools/index.ts'
import { registerSkills } from './skill.ts'
import { installPresets } from './preset.ts'
import { RecordManager, type RecordEvent } from './records.ts'
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

  // Run records, plugin-owned: the manager observes session events WITHOUT
  // touching the session (no appends, no custom event types), settled records
  // are appended one-shot to disk under the user's home — `~/.dsh-electro-lab/`,
  // deliberately OUTSIDE $DSH_HOME so the records survive session deletion,
  // restarts and even a full DSH uninstall — and the client panel reads the
  // whole store through one HTTP endpoint: one page, all sessions.
  const recordsHome = process.env.DSH_ELECTRO_LAB_HOME ?? join(homedir(), '.dsh-electro-lab')
  const store: RecordStore = createRecordStore(join(recordsHome, 'records.jsonl'))
  const managers = new Map<string, RecordManager>()

  ctx.effect(() => {
    const disposers: Array<() => void> = []

    // Session trace: feed every committed event into the session's record
    // manager. The first event of a session rebuilds the manager by feeding
    // the FULL log first — that only restores build state (an in-progress
    // record keeps tracking); the settled records it returns are ignored,
    // because records are live-only: they were appended when they settled,
    // and the archive is authoritative. Only the record settled by the
    // incoming event itself is appended.
    disposers.push(ctx.on('session/event', (session, event) => {
      const s = session as SessionLike
      const sessionId = s.id
      if (sessionId === undefined) return
      let manager = managers.get(sessionId)
      if (manager === undefined) {
        manager = new RecordManager()
        for (const stored of s.events ?? []) manager.feed(stored as RecordEvent)
        managers.set(sessionId, manager)
      }
      const settled = manager.feed(event as RecordEvent)
      if (settled !== null) store.append(settled)
    }))

    // The records page: all stored records plus any live open records, newest first.
    const webServer = ctx.get('webServer') as WebServerLike | undefined
    if (webServer !== undefined) {
      disposers.push(webServer.register({
        kind: 'exact',
        path: RECORDS_PATH,
        handler: (_req, res) => {
          const open: Array<unknown> = []
          for (const manager of managers.values()) {
            const record = manager.view().open
            if (record !== null) open.push(record)
          }
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ records: [...store.list()].reverse(), open }))
        },
      }))
    }

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
