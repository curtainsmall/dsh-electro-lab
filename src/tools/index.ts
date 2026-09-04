/**
 * Code-authored tool declarations: every module here builds tool definitions
 * through defineJsonTool (see ../tool.ts). Archive-authored tools — the
 * declarations in external-tools.jsonl, compiled by ../tool.ts — produce
 * exactly the same shape; only the author differs. This file only
 * aggregates the code-authored set; registration itself happens in the host
 * (../index.ts), which mounts this set plus the declarations and the
 * declaration manager tools in one pipeline.
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

declare module 'cordis' {
  interface Context {
    tools: ToolRuntime
  }
}

export const ALL_TOOLS = [...expressionTools, ...circuitTools, ...smithTools, ...dftTools, ...polynomialTools, ...transferTools, ...noiseTools, ...transmissionTools, ...electronicsTools, ...unitTools, ...signalQualityTools, ...seriesTools, ...recordTools]

/** Static tools registered alongside ALL_TOOLS (solve_steps is context-bound, so it stays apart). */
export const STATIC_TOOLS = [filterTool]
