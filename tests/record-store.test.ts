import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createRecordStore } from '../src/record-store.ts'
import type { Record } from '../src/records.ts'

const dirs: string[] = []

function tempStore(): { storePath: string; record: (id: string) => Record } {
  const dir = mkdtempSync(join(tmpdir(), 'electro-lab-store-'))
  dirs.push(dir)
  const storePath = join(dir, 'records.jsonl')
  const record = (id: string): Record => ({
    id,
    startedAt: 1000,
    settledAt: 2000,
    question: 'what is the total impedance of the network?',
    analyse: 'Z = √(R² + X²)',
    answer: '答案:50 Ω。',
    calls: [{ callId: 'c1', name: 'calculate', arguments: '{"expression":"sqrt(50^2)"}' }],
    results: [{ callId: 'c1', content: '{"re": 50, "im": 0}' }],
  })
  return { storePath, record }
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('record store (JSONL, one-shot append-only)', () => {
  it('appends one immutable line per record and deduplicates by record id', () => {
    const { storePath, record } = tempStore()
    const store = createRecordStore(storePath)
    store.append(record('record-1'))
    store.append(record('record-2'))
    store.append(record('record-1')) // duplicate — no-op
    expect(store.list()).toHaveLength(2)
    expect(store.has('record-1')).toBe(true)
    expect(store.has('record-9')).toBe(false)
    const lines = readFileSync(storePath, 'utf8').trim().split('\n')
    expect(lines).toHaveLength(2)
    for (const line of lines) expect(() => JSON.parse(line)).not.toThrow()
  })

  it('reloads every line on a fresh store instance', () => {
    const { storePath, record } = tempStore()
    createRecordStore(storePath).append(record('record-1'))
    expect(existsSync(storePath)).toBe(true)
    const reloaded = createRecordStore(storePath)
    expect(reloaded.list()).toHaveLength(1)
    expect(reloaded.list()[0]!.id).toBe('record-1')
    expect(reloaded.has('record-1')).toBe(true)
  })

  it('skips torn or malformed lines on load', () => {
    const { storePath, record } = tempStore()
    const store = createRecordStore(storePath)
    store.append(record('record-1'))
    // Simulate a torn tail line.
    appendFileSync(storePath, '{"id":"record-9"')
    const reloaded = createRecordStore(storePath)
    expect(reloaded.list()).toHaveLength(1)
    expect(reloaded.list()[0]!.id).toBe('record-1')
  })

  it('starts empty for a missing or corrupt file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'electro-lab-store-'))
    dirs.push(dir)
    expect(createRecordStore(join(dir, 'missing.jsonl')).list()).toEqual([])
    const corrupt = join(dir, 'corrupt.jsonl')
    writeFileSync(corrupt, 'not json\n{"id":1}')
    expect(createRecordStore(corrupt).list()).toEqual([])
  })

  it('writes one self-describing line per record', () => {
    const { storePath, record } = tempStore()
    createRecordStore(storePath).append(record('record-1'))
    const line = JSON.parse(readFileSync(storePath, 'utf8').trim()) as Record
    expect(line.id).toBe('record-1')
    expect(line.question).toBe('what is the total impedance of the network?')
    expect(line.calls[0]!.name).toBe('calculate')
  })
})
