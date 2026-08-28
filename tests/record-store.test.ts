import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createRecordStore } from '../src/record-store.ts'
import type { ElectroLabRun } from '../src/records.ts'

const dirs: string[] = []

function tempStore(): { storePath: string; run: (runId: string) => ElectroLabRun } {
  const dir = mkdtempSync(join(tmpdir(), 'electro-lab-store-'))
  dirs.push(dir)
  const storePath = join(dir, 'records.jsonl')
  const run = (runId: string): ElectroLabRun => ({
    id: runId,
    startedAt: 1000,
    settledAt: 2000,
    question: 'what is the total impedance of the network?',
    analyse: 'Z = √(R² + X²)',
    answer: '答案:50 Ω。',
    calls: [{ callId: 'c1', name: 'calculate', arguments: '{"expression":"sqrt(50^2)"}' }],
    results: [{ callId: 'c1', content: '{"re": 50, "im": 0}' }],
  })
  return { storePath, run }
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('record store (JSONL, one-shot append-only)', () => {
  it('appends one immutable line per run and deduplicates by run id', () => {
    const { storePath, run } = tempStore()
    const store = createRecordStore(storePath)
    store.append(run('run-1'))
    store.append(run('run-2'))
    store.append(run('run-1')) // duplicate — no-op
    expect(store.list()).toHaveLength(2)
    expect(store.has('run-1')).toBe(true)
    expect(store.has('run-9')).toBe(false)
    const lines = readFileSync(storePath, 'utf8').trim().split('\n')
    expect(lines).toHaveLength(2)
    for (const line of lines) expect(() => JSON.parse(line)).not.toThrow()
  })

  it('reloads every line on a fresh store instance', () => {
    const { storePath, run } = tempStore()
    createRecordStore(storePath).append(run('run-1'))
    expect(existsSync(storePath)).toBe(true)
    const reloaded = createRecordStore(storePath)
    expect(reloaded.list()).toHaveLength(1)
    expect(reloaded.list()[0]!.id).toBe('run-1')
    expect(reloaded.has('run-1')).toBe(true)
  })

  it('skips torn or malformed lines on load', () => {
    const { storePath, run } = tempStore()
    const store = createRecordStore(storePath)
    store.append(run('run-1'))
    // Simulate a torn tail line.
    appendFileSync(storePath, '{"id":"run-9"')
    const reloaded = createRecordStore(storePath)
    expect(reloaded.list()).toHaveLength(1)
    expect(reloaded.list()[0]!.id).toBe('run-1')
  })

  it('starts empty for a missing or corrupt file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'electro-lab-store-'))
    dirs.push(dir)
    expect(createRecordStore(join(dir, 'missing.jsonl')).list()).toEqual([])
    const corrupt = join(dir, 'corrupt.jsonl')
    writeFileSync(corrupt, 'not json\n{"id":1}')
    expect(createRecordStore(corrupt).list()).toEqual([])
  })

  it('writes one self-describing line per run', () => {
    const { storePath, run } = tempStore()
    createRecordStore(storePath).append(run('run-1'))
    const line = JSON.parse(readFileSync(storePath, 'utf8').trim()) as ElectroLabRun
    expect(line.id).toBe('run-1')
    expect(line.question).toBe('what is the total impedance of the network?')
    expect(line.calls[0]!.name).toBe('calculate')
  })
})
