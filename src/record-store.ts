/**
 * Plugin-owned record store: settled electro-lab runs appended as immutable
 * JSONL lines on disk, independent of the session log and of session
 * lifecycle. Records are built FROM sessions but never feed back into them —
 * they are not used to rebuild sessions, and every downstream read (the
 * records page) works from this file alone.
 *
 * One-shot and append-only: a run line is written once at settle time and
 * never touched again — the template's question step is part of the run's
 * analyse texts, so nothing is added later. The file (`records.jsonl` under
 * `~/.dsh-electro-lab/`) holds one self-contained JSON object per line, so a
 * torn tail line is simply skipped on read — the archive never corrupts as
 * a whole.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { ElectroLabRun } from './records.ts'

/** The disk-backed store face. */
export interface RecordStore {
  /** Whether a run line for `runId` is already known (run ids are globally unique). */
  has(runId: string): boolean
  /** Every stored run, in file order. */
  list(): ElectroLabRun[]
  /** Append one immutable run line (no-op when already known). */
  append(run: ElectroLabRun): void
}

/** Create the store over one JSONL file (created lazily on first write). */
export function createRecordStore(filePath: string): RecordStore {
  const runs: ElectroLabRun[] = []
  const knownRunIds = new Set<string>()

  try {
    if (existsSync(filePath)) {
      for (const raw of readFileSync(filePath, 'utf8').split('\n')) {
        const trimmed = raw.trim()
        if (trimmed.length === 0) continue
        try {
          const run = JSON.parse(trimmed) as Partial<ElectroLabRun>
          if (typeof run.id === 'string') {
            runs.push(run as ElectroLabRun)
            knownRunIds.add(run.id)
          }
        } catch {
          // Torn or partial tail line: self-contained by design, skip it.
        }
      }
    }
  } catch {
    // Unreadable file: start empty; the next append recreates it.
  }

  const appendLine = (run: ElectroLabRun): void => {
    try {
      mkdirSync(dirname(filePath), { recursive: true })
      appendFileSync(filePath, `${JSON.stringify(run)}\n`)
      runs.push(run)
    } catch {
      // Disk trouble must never break the session listener: the in-memory
      // copy stays authoritative and the next mutation retries the write.
    }
  }

  return {
    has(runId) {
      return knownRunIds.has(runId)
    },
    list() {
      return runs
    },
    append(run) {
      if (knownRunIds.has(run.id)) return
      knownRunIds.add(run.id)
      appendLine(run)
    },
  }
}
