import { describe, expect, it } from 'vitest'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-tools'
import { createSolveStepsTool, resolveReferences } from './solve-steps.ts'

function fakeExec(): ToolRunContext {
  return {
    callId: 'call-orchestrator' as ToolRunContext['callId'],
    token: Symbol('token') as ToolRunContext['token'],
    signal: new AbortController().signal,
  } as ToolRunContext
}

describe('resolveReferences', () => {
  it('leaves plain strings and other primitives untouched', () => {
    expect(resolveReferences('hello', [])).toBe('hello')
    expect(resolveReferences(42, [])).toBe(42)
    expect(resolveReferences(null, [])).toBe(null)
  })

  it('replaces "@stepN" with the stored output snapshot', () => {
    const outputs: JsonValue[] = [{ re: 0.2, im: 0.4, unit: 'none' }]
    expect(resolveReferences('@step0', outputs)).toEqual(outputs[0])
  })

  it('resolves recursively inside objects and arrays', () => {
    const outputs: JsonValue[] = [{ re: 50, im: 50, unit: 'resistance' }]
    const resolved = resolveReferences(
      {
        impedance: '@step0',
        list: ['@step0', 'plain'],
        nested: { ref: '@step0' },
      },
      outputs,
    )
    expect(resolved).toEqual({
      impedance: outputs[0],
      list: [outputs[0], 'plain'],
      nested: { ref: outputs[0] },
    })
  })

  it('raises for out-of-range references', () => {
    expect(() => resolveReferences('@step1', [{ re: 1, im: 0, unit: 'none' }])).toThrow(/beyond the last computed step/)
    expect(() => resolveReferences('@step5', [])).toThrow(/beyond the last computed step/)
  })
})

describe('createSolveStepsTool', () => {
  function fakeCtx(handler: (input: { name: string; arguments: unknown }) => Promise<JsonValue> | JsonValue) {
    const calls: Array<{ name: string; arguments: unknown }> = []
    const ctx = {
      tools: {
        execute: async (input: { name: string; arguments: unknown }) => {
          calls.push({ name: input.name, arguments: input.arguments })
          try {
            const value = await handler(input)
            return { isError: false as const, value, content: [] }
          } catch (error) {
            return { isError: true as const, error: { message: error instanceof Error ? error.message : String(error) }, content: [] }
          }
        },
      },
    }
    return { ctx, calls }
  }

  it('runs steps serially and returns stepResults with inputs and outputs', async () => {
    const { ctx, calls } = fakeCtx((input) => {
      if (input.name === 'impedance_to_reflection') return { re: 0.2, im: 0.4, unit: 'none' }
      if (input.name === 'reflection_to_vswr') return { re: 2.618, im: 0, unit: 'none' }
      return { re: 6.99, im: 0, unit: 'log' }
    })
    const tool = createSolveStepsTool(ctx as never)
    const result = await tool.execute(
      {
        steps: [
          { tool: 'impedance_to_reflection', args: { impedance: { form: 'rect', re: 50, im: 50, unit: 'resistance' } } },
          { tool: 'reflection_to_vswr', args: { reflectionCoefficient: '@step0' } },
          { tool: 'return_loss', args: { reflectionCoefficient: '@step0' } },
        ],
      } as never,
      fakeExec(),
    )

    expect(result).toEqual({
      stepResults: [
        { tool: 'impedance_to_reflection', input: { impedance: { form: 'rect', re: 50, im: 50, unit: 'resistance' } }, output: { re: 0.2, im: 0.4, unit: 'none' } },
        { tool: 'reflection_to_vswr', input: { reflectionCoefficient: '@step0' }, output: { re: 2.618, im: 0, unit: 'none' } },
        { tool: 'return_loss', input: { reflectionCoefficient: '@step0' }, output: { re: 6.99, im: 0, unit: 'log' } },
      ],
    })
    // @step0 was resolved before dispatch: the second call received the first output object
    expect(calls[1]!.arguments).toEqual({ reflectionCoefficient: { re: 0.2, im: 0.4, unit: 'none' } })
    expect(calls[2]!.arguments).toEqual({ reflectionCoefficient: { re: 0.2, im: 0.4, unit: 'none' } })
    expect(calls).toHaveLength(3)
  })

  it('rejects nested solve_steps', async () => {
    const { ctx } = fakeCtx(() => ({}))
    const tool = createSolveStepsTool(ctx as never)
    await expect(
      tool.execute({ steps: [{ tool: 'solve_steps', args: {} }] } as never, fakeExec()),
    ).rejects.toThrow(/nested solve_steps is not allowed/)
  })

  it('propagates step failures with the step index', async () => {
    const { ctx } = fakeCtx((input) => {
      if (input.name === 'bad_tool') throw new Error('boom')
      return {}
    })
    const tool = createSolveStepsTool(ctx as never)
    await expect(
      tool.execute(
        { steps: [{ tool: 'impedance_to_reflection', args: {} }, { tool: 'bad_tool', args: {} }] } as never,
        fakeExec(),
      ),
    ).rejects.toThrow(/step 1 \(bad_tool\) failed: boom/)
  })
})
