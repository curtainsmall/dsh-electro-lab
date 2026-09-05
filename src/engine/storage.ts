/**
 * Record storage: record-index.jsonl (index) + records/<id>.jsonl (per-step trace).
 * Index rows {id, openedAt, sealedAt, question}; orphans (sealedAt null with no body) are cleared at startup.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, appendFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

export interface IndexRow {
  id: string
  openedAt: number
  sealedAt: number | null
  question: string
}

export interface TraceRow {
  seq: number
  tool: string
  ok: boolean
  at: number
  [key: string]: unknown
}

export class RecordStore {
  constructor(private readonly home: string) {}

  private indexFile(): string {
    return join(this.home, 'record-index.jsonl')
  }

  recordsDir(): string {
    return join(this.home, 'records')
  }

  recordFile(id: string): string {
    return join(this.recordsDir(), `${id}.jsonl`)
  }

  /** Read all index rows (file order). */
  readIndex(): IndexRow[] {
    const file = this.indexFile()
    if (!existsSync(file)) return []
    const rows: IndexRow[] = []
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const trimmed = line.trim()
      if (trimmed.length === 0) continue
      try {
        const parsed = JSON.parse(trimmed) as IndexRow
        if (typeof parsed.id === 'string' && typeof parsed.openedAt === 'number') rows.push(parsed)
      } catch {
        // skip corrupt lines
      }
    }
    return rows
  }

  private writeIndex(rows: IndexRow[]): void {
    mkdirSync(this.home, { recursive: true })
    writeFileSync(this.indexFile(), rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length > 0 ? '\n' : ''), 'utf8')
  }

  /** Append an index row (new record). */
  appendIndex(row: IndexRow): void {
    mkdirSync(this.home, { recursive: true })
    appendFileSync(this.indexFile(), JSON.stringify(row) + '\n', 'utf8')
  }

  /** Update one index row (seal). */
  updateIndex(id: string, patch: Partial<IndexRow>): void {
    const rows = this.readIndex()
    const index = rows.findIndex((row) => row.id === id)
    if (index === -1) return
    rows[index] = { ...rows[index]!, ...patch }
    this.writeIndex(rows)
  }

  /** Startup consistency: remove orphan index rows whose sealedAt is null and have no body file. */
  clearOrphans(): void {
    const rows = this.readIndex()
    const kept = rows.filter((row) => row.sealedAt !== null || existsSync(this.recordFile(row.id)))
    if (kept.length !== rows.length) this.writeIndex(kept)
  }

  /** Create a record: create the directory and append the index row; the caller writes the body's first line. Returns id and openedAt. */
  createRecord(question: string): { id: string; openedAt: number } {
    mkdirSync(this.recordsDir(), { recursive: true })
    const id = randomUUID()
    const openedAt = Date.now()
    this.appendIndex({ id, openedAt, sealedAt: null, question })
    return { id, openedAt }
  }

  /** Append one trace row (synchronous write). */
  appendRow(id: string, row: TraceRow): void {
    appendFileSync(this.recordFile(id), JSON.stringify(row) + '\n', 'utf8')
  }

  /** Read every row of a body. */
  readRows(id: string): TraceRow[] {
    const file = this.recordFile(id)
    if (!existsSync(file)) return []
    const rows: TraceRow[] = []
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const trimmed = line.trim()
      if (trimmed.length === 0) continue
      try {
        rows.push(JSON.parse(trimmed) as TraceRow)
      } catch {
        // skip corrupt lines
      }
    }
    return rows
  }

  /** Whether the body file exists. */
  hasRecord(id: string): boolean {
    return existsSync(this.recordFile(id))
  }

  /** Delete a record (body + index row) — not required by the core design; kept for future administration. */
  deleteRecord(id: string): void {
    rmSync(this.recordFile(id), { force: true })
    this.writeIndex(this.readIndex().filter((row) => row.id !== id))
  }

  /** Every id inside the records/ directory. */
  recordIds(): string[] {
    if (!existsSync(this.recordsDir())) return []
    return readdirSync(this.recordsDir()).filter((name) => name.endsWith('.jsonl')).map((name) => name.slice(0, -'.jsonl'.length))
  }
}
