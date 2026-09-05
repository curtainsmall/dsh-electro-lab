/**
 * 内核 fn 全集（蓝图 §8「fn 全集」）：math/* 全部内核以 registerFn 注册。
 * 各领域文件由旧工具模块迁移而来；聚合后由宿主注册进引擎注册表。
 */
import type { FnDef } from '../registry.ts'
import { expressionFns } from './expression-fns.ts'
import { circuitFns } from './circuit-fns.ts'
import { smithFns } from './smith-fns.ts'
import { dftFns } from './dft-fns.ts'
import { polynomialFns } from './polynomial-fns.ts'
import { transferFns } from './transfer-fns.ts'
import { noiseFns } from './noise-fns.ts'
import { transmissionFns } from './transmission-fns.ts'
import { electronicsFns } from './electronics-fns.ts'
import { filterFns } from './filter-fns.ts'
import { seriesFns } from './series-fns.ts'
import { signalQualityFns } from './signal-quality-fns.ts'

export function registerKernelFns(): FnDef[] {
  return [
    ...expressionFns,
    ...circuitFns,
    ...smithFns,
    ...dftFns,
    ...polynomialFns,
    ...transferFns,
    ...noiseFns,
    ...transmissionFns,
    ...electronicsFns,
    ...filterFns,
    ...seriesFns,
    ...signalQualityFns,
  ]
}
