/**
 * Plugin-owned record store: settled electro-lab records appended as
 * immutable JSONL lines on disk, independent of the session log and of
 * session lifecycle. Records are built FROM sessions but never feed back
 * into them — they are not used to rebuild sessions, and every downstream
 * read (the records page) works from this file alone.
 *
 * One-shot and append-only: a record line is written once at settle time and
 * never touched again — the template's question step is part of the record's
 * analyse texts, so nothing is added later. The file (`records.jsonl` under
 * `~/.dsh-electro-lab/`) holds one self-contained JSON object per line, so a
 * torn tail line is simply skipped on read — the archive never corrupts as
 * a whole.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Record } from './records.ts'

/** The disk-backed store face. */
export interface RecordStore {
  /** Whether a record line for `recordId` is already known (record ids are globally unique). */
  has(recordId: string): boolean
  /** Every stored record, in file order. */
  list(): Record[]
  /** Append one immutable record line (no-op when already known). */
  append(record: Record): void
}

/** Create the store over one JSONL file (created lazily on first write). */
export function createRecordStore(filePath: string): RecordStore {
  const records: Record[] = []
  const knownRecordIds = new Set<string>()

  try {
    if (existsSync(filePath)) {
      for (const raw of readFileSync(filePath, 'utf8').split('\n')) {
        const trimmed = raw.trim()
        if (trimmed.length === 0) continue
        try {
          const record = JSON.parse(trimmed) as Partial<Record>
          if (typeof record.id === 'string') {
            records.push(record as Record)
            knownRecordIds.add(record.id)
          }
        } catch {
          // Torn or partial tail line: self-contained by design, skip it.
        }
      }
    }
  } catch {
    // Unreadable file: start empty; the next append recreates it.
  }

  const appendLine = (record: Record): void => {
    try {
      mkdirSync(dirname(filePath), { recursive: true })
      appendFileSync(filePath, `${JSON.stringify(record)}\n`)
      records.push(record)
    } catch {
      // Disk trouble must never break the session listener: the in-memory
      // copy stays authoritative and the next mutation retries the write.
    }
  }

  return {
    has(recordId) {
      return knownRecordIds.has(recordId)
    },
    list() {
      return records
    },
    append(record) {
      if (knownRecordIds.has(record.id)) return
      knownRecordIds.add(record.id)
      appendLine(record)
    },
  }
}
