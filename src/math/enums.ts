/**
 * Shared enums: general concepts reused across modules and tools.
 *
 * - CircuitMode: series/parallel — any circuit topology choice (resonance,
 *   filters, matching), not tied to one formula.
 * - SwitchingMode: charge/discharge — any switch-state behaviour (transients,
 *   timers, power switching).
 * - MatchSide: source/load — which side of a boundary an element sits on.
 */
export enum CircuitMode {
  Series = 'series',
  Parallel = 'parallel',
}

export enum SwitchingMode {
  Charge = 'charge',
  Discharge = 'discharge',
}

export enum MatchSide {
  Source = 'source',
  Load = 'load',
}
