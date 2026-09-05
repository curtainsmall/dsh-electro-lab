/**
 * 记录存储（蓝图 §5）：record-index.jsonl（索引）+ records/<id>.jsonl（按步轨迹）。
 * 索引行 {id, openedAt, sealedAt, question}；孤儿（sealedAt null 且无本体）启动清除。
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

  /** 读取全部索引行（文件顺序）。 */
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
        // 坏行跳过
      }
    }
    return rows
  }

  private writeIndex(rows: IndexRow[]): void {
    mkdirSync(this.home, { recursive: true })
    writeFileSync(this.indexFile(), rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length > 0 ? '\n' : ''), 'utf8')
  }

  /** 追加一行索引（新记录）。 */
  appendIndex(row: IndexRow): void {
    mkdirSync(this.home, { recursive: true })
    appendFileSync(this.indexFile(), JSON.stringify(row) + '\n', 'utf8')
  }

  /** 更新一行索引（封口）。 */
  updateIndex(id: string, patch: Partial<IndexRow>): void {
    const rows = this.readIndex()
    const index = rows.findIndex((row) => row.id === id)
    if (index === -1) return
    rows[index] = { ...rows[index]!, ...patch }
    this.writeIndex(rows)
  }

  /** 启动一致性：清除 sealedAt null 且无本体文件的孤儿索引行。 */
  clearOrphans(): void {
    const rows = this.readIndex()
    const kept = rows.filter((row) => row.sealedAt !== null || existsSync(this.recordFile(row.id)))
    if (kept.length !== rows.length) this.writeIndex(kept)
  }

  /** 新建记录：建目录、追加索引行；本体首行由调用方写入。返回 id 与 openedAt。 */
  createRecord(question: string): { id: string; openedAt: number } {
    mkdirSync(this.recordsDir(), { recursive: true })
    const id = randomUUID()
    const openedAt = Date.now()
    this.appendIndex({ id, openedAt, sealedAt: null, question })
    return { id, openedAt }
  }

  /** 追加一行轨迹（同步落盘）。 */
  appendRow(id: string, row: TraceRow): void {
    appendFileSync(this.recordFile(id), JSON.stringify(row) + '\n', 'utf8')
  }

  /** 读本体全部行。 */
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
        // 坏行跳过
      }
    }
    return rows
  }

  /** 本体文件是否存在。 */
  hasRecord(id: string): boolean {
    return existsSync(this.recordFile(id))
  }

  /** 删除一条记录（本体 + 索引行）——非蓝图必需，供未来管理用。 */
  deleteRecord(id: string): void {
    rmSync(this.recordFile(id), { force: true })
    this.writeIndex(this.readIndex().filter((row) => row.id !== id))
  }

  /** records/ 目录内全部 id。 */
  recordIds(): string[] {
    if (!existsSync(this.recordsDir())) return []
    return readdirSync(this.recordsDir()).filter((name) => name.endsWith('.jsonl')).map((name) => name.slice(0, -'.jsonl'.length))
  }
}
