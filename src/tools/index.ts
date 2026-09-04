/**
 * Code-authored tool declarations: every module here builds tool definitions
 * through defineJsonTool (see ../tool.ts). Archive-authored tools — the
 * declarations in external-tools.jsonl, compiled by ../tool.ts — produce
 * exactly the same shape; only the author differs. This file aggregates the
 * code-authored set that needs no runtime binding; tools that bind runtime
 * values (ctx for solve_steps, the records home for the declaration manager
 * tools) are factories and stay out of the list. Registration itself happens
 * in the host (../index.ts).
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
import { transmissionTools } from './transmission-tools.ts'
import { electronicsTools } from './electronics-tools.ts'
import { filterTool } from './filter-tool.ts'
import { unitTools } from './unit-tools.ts'
import { signalQualityTools } from './signal-quality-tools.ts'
import { seriesTools } from './series-tools.ts'
import { recordTools } from './record-tools.ts'
import { textValueTools } from './text-value-tools.ts'

declare module 'cordis' {
  interface Context {
    tools: ToolRuntime
  }
}

/** Every tool definition that needs no runtime binding, in registration order. */
export const ALL_TOOLS = [...expressionTools, ...circuitTools, ...smithTools, ...dftTools, ...polynomialTools, ...transferTools, ...noiseTools, ...transmissionTools, ...electronicsTools, filterTool, ...unitTools, ...textValueTools, ...signalQualityTools, ...seriesTools, ...recordTools]
