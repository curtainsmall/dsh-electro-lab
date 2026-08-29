/**
 * Host half of dsh-electro-lab.
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Context } from 'cordis'
import { registerTools } from './tools/index.ts'
import { registerSkills } from './skill.ts'
import { installPresets } from './preset.ts'
import { RecordManager, readRecordArchive, type RecordEvent } from './records.ts'

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
      setHeader(name: string, value: string): void
      end(body: string): void
    }): void | Promise<void>
  }): () => void
}

/** The records page endpoint (same origin as the web app; the client polls it). */
const RECORDS_PATH = '/api/dsh-electro-lab/records'

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

export function apply(ctx: Context): void {
  ctx.effect(() => registerTools(ctx), 'dsh-electro-lab: tools')
  ctx.effect(() => registerSkills(ctx), 'dsh-electro-lab: skills')

  // The plugin can be mounted from TWO places at once — the global bundle
  // (the installed package's cordis.patch.yml) AND a session preset row —
  // which would feed every event into two independent managers and settle
  // every record twice. The session trace and the HTTP endpoint are
  // therefore process singletons: only the first mount registers them.
  let recordManagerMounted = false

  ctx.effect(() => {
    if (recordManagerMounted) {
      // Second mount: the listener and endpoint already exist — nothing to add.
      return () => {}
    }
    recordManagerMounted = true
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

    // The records page: all stored records plus any live open records, newest first.
    const webServer = ctx.get('webServer') as WebServerLike | undefined
    if (webServer !== undefined) {
      disposers.push(webServer.register({
        kind: 'exact',
        path: RECORDS_PATH,
        handler: (_req, res) => {
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
    }

    return () => {
      recordManagerMounted = false
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
