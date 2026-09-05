/**
 * 内核 solver 全集（蓝图 §8「solver 全集」）：math/* 全部内核以 register 注册。
 * 各领域文件由旧工具模块迁移而来；聚合后由宿主注册进引擎注册表。
 */
import type { SolverDef } from '../registry.ts'
import { expressionSolvers } from './expression-solvers.ts'
import { circuitSolvers } from './circuit-solvers.ts'
import { smithSolvers } from './smith-solvers.ts'
import { dftSolvers } from './dft-solvers.ts'
import { polynomialSolvers } from './polynomial-solvers.ts'
import { transferSolvers } from './transfer-solvers.ts'
import { noiseSolvers } from './noise-solvers.ts'
import { transmissionSolvers } from './transmission-solvers.ts'
import { electronicsSolvers } from './electronics-solvers.ts'
import { filterSolvers } from './filter-solvers.ts'
import { seriesSolvers } from './series-solvers.ts'
import { signalQualitySolvers } from './signal-quality-solvers.ts'

export function registerKernelSolvers(): SolverDef[] {
  return [
    ...expressionSolvers,
    ...circuitSolvers,
    ...smithSolvers,
    ...dftSolvers,
    ...polynomialSolvers,
    ...transferSolvers,
    ...noiseSolvers,
    ...transmissionSolvers,
    ...electronicsSolvers,
    ...filterSolvers,
    ...seriesSolvers,
    ...signalQualitySolvers,
  ]
}
