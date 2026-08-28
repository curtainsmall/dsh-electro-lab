/**
 * Plugin-owned record store: settled electro-lab runs persisted on disk,
 * independent of the session log and of session lifecycle — records survive
 * session deletion and process restarts, and every session's records live in
 * one flat file served as a single page.
 *
 * The file (`records.json` under `~/.dsh-electro-lab/`, outside $DSH_HOME)
 * holds one JSON document with a flat `records` array; mutations rewrite it
 * atomically (write-temp + rename). The store is deliberately synchronous and
 * small — writes happen on run settlement only, and the file stays tiny.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { ElectroLabRun } from './records.ts'

/** One persisted record: the settled run plus the context it needs to live on its own. */
export interface StoredElectroLabRecord {
  sessionId: string
  /** Model route captured at settle time — lets a later summary run without the live session. */
  route?: { provider: string; model: string } | null
  run: ElectroLabRun
}

/** The whole file shape (versioned for future migrations). */
export interface RecordStoreFile {
  version: 1
  records: StoredElectroLabRecord[]
}

/** The disk-backed store face. */
export interface RecordStore {
  /** Whether a record for (sessionId, runId) is already known. */
  has(sessionId: string, runId: string): boolean
  /** Every stored record, newest first. */
  list(): StoredElectroLabRecord[]
  /** Persist one settled run (no-op when already known). */
  append(record: StoredElectroLabRecord): void
  /** Attach a summarized question to the stored run; false when unknown or already set. */
  updateQuestion(runId: string, question: string): boolean
}

const key = (sessionId: string, runId: string): string => `${sessionId}:${runId}`

/** Create the store over one JSON file (created lazily on first write). */
export function createRecordStore(filePath: string): RecordStore {
  const records: StoredElectroLabRecord[] = []
  const known = new Set<string>()

  const persist = (): void => {
    try {
      mkdirSync(dirname(filePath), { recursive: true })
      const tmp = `${filePath}.tmp`
      const body: RecordStoreFile = { version: 1, records }
      writeFileSync(tmp, JSON.stringify(body))
      renameSync(tmp, filePath)
    } catch {
      // Disk trouble must never break the session listener: the in-memory
      // copy stays authoritative and the next mutation retries the write.
    }
  }

  try {
    if (existsSync(filePath)) {
      const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as Partial<RecordStoreFile>
      for (const record of parsed.records ?? []) {
        if (record === null || typeof record !== 'object' || typeof record.sessionId !== 'string' || record.run?.id === undefined) continue
        records.push(record)
        known.add(key(record.sessionId, record.run.id))
      }
    }
  } catch {
    // Unreadable or corrupt store: start empty; the next append rewrites it.
  }

  return {
    has(sessionId, runId) {
      return known.has(key(sessionId, runId))
    },
    list() {
      return records
    },
    append(record) {
      if (known.has(key(record.sessionId, record.run.id))) return
      records.unshift(record)
      known.add(key(record.sessionId, record.run.id))
      persist()
    },
    updateQuestion(runId, question) {
      const record = records.find((item) => item.run.id === runId)
      if (record === undefined || record.run.question !== undefined) return false
      record.run = { ...record.run, question }
      persist()
      return true
    },
  }
}
