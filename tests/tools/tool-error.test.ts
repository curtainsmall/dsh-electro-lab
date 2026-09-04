import { describe, expect, it } from 'vitest'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { ToolError, defineJsonTool } from '../../src/tools/helpers.ts'

function fakeExec(): ToolRunContext {
  return {
    callId: 'call-error' as ToolRunContext['callId'],
    token: Symbol('token') as ToolRunContext['token'],
    signal: new AbortController().signal,
  } as ToolRunContext
}

/** One minimal json tool whose execute returns the given value. */
function valueTool(value: unknown): ReturnType<typeof defineJsonTool> {
  return defineJsonTool({
    name: 'error_test_tool',
    description: 'test tool',
    parameters: {},
    execute: () => value as never,
  })
}

describe('ToolError', () => {
  it('carries a stable name and code', () => {
    const error = new ToolError('boom')
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('ToolError')
    expect(error.code).toBe('TOOL_ERROR')
    expect(new ToolError('x', 'EXTERNAL_TIMEOUT').code).toBe('EXTERNAL_TIMEOUT')
  })
})

describe('defineJsonTool unified failure path', () => {
  it('passes plain success values through unchanged', async () => {
    await expect(valueTool({ ok: true, value: 1 }).execute({}, fakeExec())).resolves.toEqual({ ok: true, value: 1 })
    await expect(valueTool({ error: 'a plain field' }).execute({}, fakeExec())).resolves.toEqual({ error: 'a plain field' })
  })

  it('re-wraps a plain error from a lower layer (math kernel) at the tool boundary', async () => {
    const kernel = (): never => { throw new Error('inductance must be a finite positive number (H)') }
    const tool = defineJsonTool({
      name: 'error_test_kernel',
      description: 'test tool',
      parameters: {},
      execute: () => kernel(),
    })
    await expect(tool.execute({}, fakeExec())).rejects.toMatchObject({
      name: 'ToolError',
      code: 'TOOL_ERROR',
      message: 'inductance must be a finite positive number (H)',
    })
  })

  it('keeps an already-wrapped ToolError untouched (code preserved)', async () => {
    const tool = defineJsonTool({
      name: 'error_test_passthrough',
      description: 'test tool',
      parameters: {},
      execute: () => { throw new ToolError('denied', 'EXTERNAL_ERROR') },
    })
    await expect(tool.execute({}, fakeExec())).rejects.toMatchObject({ name: 'ToolError', code: 'EXTERNAL_ERROR', message: 'denied' })
  })
})
