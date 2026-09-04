import { describe, expect, it } from 'vitest'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { ToolError, defineJsonTool, failureBoxMessage } from '../../src/tools/helpers.ts'

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

describe('failureBoxMessage', () => {
  it('extracts the message of an {ok:false, error} box', () => {
    expect(failureBoxMessage({ ok: false, error: 'boom' })).toBe('boom')
  })

  it('joins an {ok:false, errors} list', () => {
    expect(failureBoxMessage({ ok: false, errors: ['a', 'b'] })).toBe('a; b')
  })

  it('ignores non-box values', () => {
    expect(failureBoxMessage({ ok: true, error: 'fine' })).toBeUndefined()
    expect(failureBoxMessage({ error: 'not ok flagged' })).toBeUndefined()
    expect(failureBoxMessage(42)).toBeUndefined()
    expect(failureBoxMessage(null)).toBeUndefined()
    expect(failureBoxMessage('text')).toBeUndefined()
    expect(failureBoxMessage([{ ok: false, error: 'x' }])).toBeUndefined()
  })
})

describe('defineJsonTool unified failure path', () => {
  it('raises a returned {ok:false, error} box as a ToolError', async () => {
    await expect(valueTool({ ok: false, error: 'boom' }).execute({}, fakeExec())).rejects.toMatchObject({
      name: 'ToolError',
      code: 'TOOL_ERROR',
      message: 'boom',
    })
  })

  it('raises a returned {ok:false, errors} box with the joined messages', async () => {
    await expect(valueTool({ ok: false, errors: ['a', 'b'] }).execute({}, fakeExec())).rejects.toThrow('a; b')
  })

  it('passes success values and thrown errors through unchanged', async () => {
    await expect(valueTool({ ok: true, value: 1 }).execute({}, fakeExec())).resolves.toEqual({ ok: true, value: 1 })
    await expect(valueTool({ error: 'no ok flag' }).execute({}, fakeExec())).resolves.toEqual({ error: 'no ok flag' })
    const throwing = defineJsonTool({
      name: 'error_test_throwing',
      description: 'test tool',
      parameters: {},
      execute: () => { throw new ToolError('timeout', 'EXTERNAL_TIMEOUT') },
    })
    await expect(throwing.execute({}, fakeExec())).rejects.toMatchObject({ name: 'ToolError', code: 'EXTERNAL_TIMEOUT', message: 'timeout' })
  })
})
