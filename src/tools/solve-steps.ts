/**
 * solve_steps — the deterministic step orchestrator.
 *
 * Executes a multi-step calculation: each step calls an already-registered
 * tool by name. A step argument may be the string "@stepN" to reference the
 * full output object of step N (resolved recursively before dispatch).
 * Steps run serially through the registry's own pipeline (guards, policy,
 * cancellation), so nested calls are first-class executions, and every
 * intermediate result is returned in stepResults (array order = step order).
 */
import type { Context } from 'cordis'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-tools'
import type { CallId } from '@deepseek-ai/dsh-llm'
import { defineJsonTool } from './helpers.ts'

interface StepSpec {
  tool: string
  args: JsonValue
}

const STEP_REF = /^@step(\d+)$/

/** Replace "@stepN" strings with the stored output snapshot of step N, recursively. */
export function resolveReferences(value: JsonValue, outputs: JsonValue[]): JsonValue {
  if (typeof value === 'string') {
    const match = STEP_REF.exec(value)
    if (match !== null) {
      const index = Number(match[1])
      if (index >= outputs.length) {
        throw new Error(`reference "@step${index}" points beyond the last computed step (${outputs.length - 1})`)
      }
      return outputs[index] as JsonValue
    }
    return value
  }
  if (Array.isArray(value)) return value.map((item) => resolveReferences(item, outputs))
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, JsonValue> = {}
    for (const [key, item] of Object.entries(value)) out[key] = resolveReferences(item, outputs)
    return out
  }
  return value
}

/** Build the orchestrator tool bound to a context (registry access). */
export function createSolveStepsTool(ctx: Context): ToolDefinition {
  return defineJsonTool({
    name: 'solve_steps',
    description: 'Execute a deterministic multi-step calculation: each step calls an already-registered tool by name with its arguments; a step argument may be "@stepN" to reference the full output object of step N. Steps run serially and every intermediate result is returned in stepResults (array order = step order). Use when the user asks for a worked calculation with exact numbers; conceptual questions do not need it.',
    parameters: {
      steps: {
        type: 'array',
        description: 'ordered steps; each step calls one registered tool',
        required: true,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            tool: { type: 'string', description: 'the registered tool to call, e.g. "impedance_to_reflection"', required: true },
            args: { type: 'json', description: 'arguments for that tool; "@stepN" references the full output object of step N', required: true },
          },
        },
      },
    },
    execute: async (args, exec) => {
      const outputs: JsonValue[] = []
      const stepResults: JsonValue[] = []
      const steps = args.steps as readonly StepSpec[]
      for (const [index, step] of steps.entries()) {
        if (step.tool === 'solve_steps') throw new Error(`step ${index}: nested solve_steps is not allowed`)
        const resolved = resolveReferences(step.args, outputs)
        const result = await ctx.tools.execute({
          callId: `${exec.callId}:solve:${index}` as unknown as CallId,
          name: step.tool,
          arguments: resolved,
          parent: exec.token,
          signal: exec.signal,
        })
        if (result.isError) {
          throw new Error(`step ${index} (${step.tool}) failed: ${result.error.message}`)
        }
        const output = result.value
        outputs.push(output)
        stepResults.push({ tool: step.tool, input: step.args, output })
      }
      return { stepResults }
    },
  })
}

export type { ToolRunContext }
