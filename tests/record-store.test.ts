import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createRecordStore } from '../src/record-store.ts'
import type { StoredElectroLabRecord } from '../src/record-store.ts'

const dirs: string[] = []

function tempStore(): { storePath: string; record: (sessionId: string, runId: string) => StoredElectroLabRecord } {
  const dir = mkdtempSync(join(tmpdir(), 'electro-lab-store-'))
  dirs.push(dir)
  const storePath = join(dir, 'records.json')
  const record = (sessionId: string, runId: string): StoredElectroLabRecord => ({
    sessionId,
    route: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
    run: {
      id: runId,
      startedAt: 1000,
      settledAt: 2000,
      toolCalls: 1,
      errors: 0,
      tools: [{ name: 'calculate', calls: 1 }],
      questionInputs: ['what is the impedance?'],
      answerTexts: ['答案:50 Ω。'],
      results: ['{"re": 50, "im": 0}'],
    },
  })
  return { storePath, record }
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('record store (disk-backed)', () => {
  it('appends records newest first and deduplicates by (sessionId, runId)', () => {
    const { storePath, record } = tempStore()
    const store = createRecordStore(storePath)
    store.append(record('s1', 'run-1'))
    store.append(record('s2', 'run-2'))
    store.append(record('s1', 'run-1')) // duplicate — no-op
    expect(store.list()).toHaveLength(2)
    expect(store.list()[0]!.sessionId).toBe('s2')
    expect(store.has('s1', 'run-1')).toBe(true)
    expect(store.has('s9', 'run-9')).toBe(false)
  })

  it('persists to disk and reloads on a fresh store instance', () => {
    const { storePath, record } = tempStore()
    createRecordStore(storePath).append(record('s1', 'run-1'))
    expect(existsSync(storePath)).toBe(true)
    const reloaded = createRecordStore(storePath)
    expect(reloaded.list()).toHaveLength(1)
    expect(reloaded.list()[0]!.sessionId).toBe('s1')
    expect(reloaded.has('s1', 'run-1')).toBe(true)
  })

  it('attaches a summarized question and never overwrites it', () => {
    const { storePath, record } = tempStore()
    const store = createRecordStore(storePath)
    store.append(record('s1', 'run-1'))
    expect(store.updateQuestion('run-1', 'What is the impedance?')).toBe(true)
    expect(store.updateQuestion('run-1', 'second summary')).toBe(false)
    expect(store.list()[0]!.run.question).toBe('What is the impedance?')
    const reloaded = createRecordStore(storePath)
    expect(reloaded.list()[0]!.run.question).toBe('What is the impedance?')
  })

  it('updateQuestion returns false for unknown run ids', () => {
    const { storePath, record } = tempStore()
    const store = createRecordStore(storePath)
    store.append(record('s1', 'run-1'))
    expect(store.updateQuestion('run-99', 'no such run')).toBe(false)
  })

  it('starts empty for a missing or corrupt file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'electro-lab-store-'))
    dirs.push(dir)
    expect(createRecordStore(join(dir, 'missing.json')).list()).toEqual([])
    const corrupt = join(dir, 'corrupt.json')
    writeFileSync(corrupt, 'not json')
    expect(createRecordStore(corrupt).list()).toEqual([])
  })

  it('writes valid JSON that round-trips through the file', () => {
    const { storePath, record } = tempStore()
    createRecordStore(storePath).append(record('s1', 'run-1'))
    const parsed = JSON.parse(readFileSync(storePath, 'utf8')) as { version: number; records: StoredElectroLabRecord[] }
    expect(parsed.version).toBe(1)
    expect(parsed.records).toHaveLength(1)
    expect(parsed.records[0]!.run.id).toBe('run-1')
  })
})
