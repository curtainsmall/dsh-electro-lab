/**
 * Tool registration: every tool definition, registered through the tools
 * service. Each register() returns a disposer; the caller (src/index.ts)
 * wraps them in ctx.effect so unload cleans everything up.
 */
import type { Context } from 'cordis'
import type { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { expressionTools } from './expression-tools.ts'
import { circuitTools } from './circuit-tools.ts'
import { smithTools } from './smith-tools.ts'
import { dftTools } from './dft-tools.ts'
import { polynomialTools } from './polynomial-tools.ts'
import { transferTools } from './transfer-tools.ts'
import { noiseTools } from './noise-tools.ts'
import { dbTools } from './db-tools.ts'
import { transmissionTools } from './transmission-tools.ts'
import { electronicsTools } from './electronics-tools.ts'
import { filterTool } from './filter-tool.ts'
import { createSolveStepsTool } from './solve-steps.ts'
import { unitTools } from './unit-tools.ts'

declare module 'cordis' {
  interface Context {
    tools: ToolRuntime
  }
}

export const ALL_TOOLS = [...expressionTools, ...circuitTools, ...smithTools, ...dftTools, ...polynomialTools, ...transferTools, ...noiseTools, ...dbTools, ...transmissionTools, ...electronicsTools, ...unitTools]

/** Register all tools (the orchestrator is bound to the live context); returns one disposer that unregisters every tool. */
export function registerTools(ctx: Context): () => void {
  const disposers: Array<() => void> = []
  for (const tool of [...ALL_TOOLS, filterTool, createSolveStepsTool(ctx)]) {
    disposers.push(ctx.tools.register(tool))
  }
  return () => {
    for (const off of disposers) off()
  }
}
