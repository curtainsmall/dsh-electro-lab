/**
 * Tool registration: every tool definition, registered through the tools
 * service. Each register() returns a disposer; the caller (src/index.ts)
 * wraps them in ctx.effect so unload cleans everything up.
 */
import type { Context } from 'cordis'
import type { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { atomicTools } from './atomic-tools.ts'
import { circuitTools } from './circuit-tools.ts'
import { smithTools } from './smith-tools.ts'
import { createSolveStepsTool } from './solve-steps.ts'

declare module 'cordis' {
  interface Context {
    tools: ToolRuntime
  }
}

export const ALL_TOOLS = [...atomicTools, ...circuitTools, ...smithTools]

/** Register all tools (the orchestrator is bound to the live context); returns one disposer that unregisters every tool. */
export function registerTools(ctx: Context): () => void {
  const disposers: Array<() => void> = []
  for (const tool of [...ALL_TOOLS, createSolveStepsTool(ctx)]) {
    disposers.push(ctx.tools.register(tool))
  }
  return () => {
    for (const off of disposers) off()
  }
}
