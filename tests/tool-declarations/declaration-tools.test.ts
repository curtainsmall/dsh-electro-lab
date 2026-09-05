import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-tools'
import { createDeclarationTools } from '../../src/tools/declaration-tools.ts'
import { readDeclarations, restartRequired } from '../../src/tool.ts'
import { ToolError } from '../../src/tool.ts'
import { DeclarationHttpMethod, DeclarationParamType, DeclarationTransport, type ToolDeclaration } from '../../src/tool.ts'

const TOOL: ToolDeclaration = {
  name: 'sample_echo',
  description: 'Echoes its input over http',
  enabled: true,
  parameters: {
    gain: { type: DeclarationParamType.Quantity, kind: 'log', description: 'the gain' },
  },
  transport: DeclarationTransport.Http,
  transportOptions: { url: 'https://example.test/calc', method: DeclarationHttpMethod.Post },
}

function fakeExec(): ToolRunContext {
  return {
    callId: 'call-manager' as ToolRunContext['callId'],
    token: Symbol('token') as ToolRunContext['token'],
    signal: new AbortController().signal,
  } as ToolRunContext
}

/** Execute one manager tool by name and return its JSON result on success. */
async function run(name: string, args: unknown, home: string): Promise<Record<string, JsonValue>> {
  const tools = createDeclarationTools(home)
  const tool = tools.find((item) => item.name === name)
  expect(tool).toBeDefined()
  const result = await tool!.execute(args as never, fakeExec())
  expect(typeof result).toBe('object')
  expect(result).not.toBeNull()
  return result as Record<string, JsonValue>
}

/** Execute one manager tool and assert the unified failure: a thrown ToolError. */
async function runFailure(name: string, args: unknown, home: string, message: RegExp): Promise<void> {
  const tools = createDeclarationTools(home)
  const tool = tools.find((item) => item.name === name)
  expect(tool).toBeDefined()
  const promise = tool!.execute(args as never, fakeExec())
  await expect(promise).rejects.toBeInstanceOf(ToolError)
  await expect(promise).rejects.toThrow(message)
  await expect(promise).rejects.toMatchObject({ name: 'ToolError', code: 'TOOL_ERROR' })
}

let home = ''

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'elab-manager-'))
})

afterEach(() => {
  rmSync(home, { recursive: true, force: true })
})

describe('external_solver_add', () => {
  it('stores a new declaration and reports the pending restart', async () => {
    const result = await run('external_solver_add', { declaration: TOOL }, home)
    expect(result).toEqual({ name: 'sample_echo', changed: 'added', restartRequired: true })
    expect(readDeclarations(home).map((tool) => tool.name)).toEqual(['sample_echo'])
    expect(restartRequired(home)).toBe(true)
  })

  it('fails when the name already exists', async () => {
    await run('external_solver_add', { declaration: TOOL }, home)
    await runFailure('external_solver_add', { declaration: { ...TOOL, description: 'again' } }, home, /external_solver_update/)
    expect(readDeclarations(home)).toHaveLength(1)
  })

  it('fails on an invalid declaration without touching the archive', async () => {
    await runFailure('external_solver_add', { declaration: { ...TOOL, parameters: { x: { type: 'float' } } } }, home, /parameter "x": unknown type/)
    expect(readDeclarations(home)).toEqual([])
    expect(restartRequired(home)).toBe(false)
  })

  it('accepts a declaration without the enabled flag', async () => {
    const { enabled: _enabled, ...noFlag } = TOOL
    const result = await run('external_solver_add', { declaration: noFlag }, home)
    expect(result).toEqual({ name: 'sample_echo', changed: 'added', restartRequired: true })
  })
})

describe('external_solver_update', () => {
  it('replaces an existing declaration in place', async () => {
    await run('external_solver_add', { declaration: TOOL }, home)
    const result = await run(
      'external_solver_update',
      { declaration: { ...TOOL, description: 'updated', enabled: false } },
      home,
    )
    expect(result).toEqual({ name: 'sample_echo', changed: 'updated', restartRequired: true })
    const tools = readDeclarations(home)
    expect(tools).toHaveLength(1)
    expect(tools[0]!.description).toBe('updated')
    expect(tools[0]!.enabled).toBe(false)
  })

  it('fails when the name is not declared yet', async () => {
    await runFailure('external_solver_update', { declaration: TOOL }, home, /external_solver_add/)
  })

  it('fails on an invalid declaration', async () => {
    await run('external_solver_add', { declaration: TOOL }, home)
    await runFailure('external_solver_update', { declaration: { ...TOOL, enabled: 'yes' } }, home, /enabled must be a boolean/)
  })
})

describe('external_solver_delete', () => {
  it('removes a declared tool and reports the pending restart', async () => {
    await run('external_solver_add', { declaration: TOOL }, home)
    const result = await run('external_solver_delete', { name: 'sample_echo' }, home)
    expect(result).toEqual({ name: 'sample_echo', changed: 'deleted', restartRequired: true })
    expect(readDeclarations(home)).toEqual([])
  })

  it('fails when the name is not declared', async () => {
    await runFailure('external_solver_delete', { name: 'ghost' }, home, /ghost/)
    expect(readDeclarations(home)).toEqual([])
  })
})
