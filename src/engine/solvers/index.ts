/**
 * Kernel solver collection: all math/* kernels are registered via register.
 * The per-domain files were migrated from the legacy tool modules; once aggregated, the host registers them into the engine registry.
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
