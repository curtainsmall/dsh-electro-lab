/**
 * Circuit mathematics. All functions operate on SI base units (Hz, Ω, F, H,
 * V, A, s) and return plain numbers / complex.js values; engineering
 * presentation is the tools' job.
 *
 * Declaration order: enums, then types, then module-private helpers, then
 * public functions grouped by concept.
 */
import { Complex } from "complex.js";

// ── Enums ────────────────────────────────────────────────────────────────

/** Circuit topology mode. */
export enum CircuitMode {
  Series = 'series',
  Parallel = 'parallel',
}

/** Switching state mode. */
export enum SwitchingMode {
  Charge = 'charge',
  Discharge = 'discharge',
}

/** Lumped element kind. */
export enum ElementKind {
  Resistance = 'resistance',
  Inductance = 'inductance',
  Capacitance = 'capacitance',
}

/** How an element connects into a path. */
export enum Connection {
  Series = 'series',
  Shunt = 'shunt',
}

/** Second-order damping regime. */
export enum TransientDamping {
  Underdamped = 'underdamped',
  Critical = 'critical',
  Overdamped = 'overdamped',
}

// ── Types ────────────────────────────────────────────────────────────────

/** A network node: one lumped element, or a nested series/parallel group. */
export type NetworkElement =
  | { kind: ElementKind; value: number }
  | { topology: CircuitMode; elements: NetworkElement[] };

// ── Private helpers ──────────────────────────────────────────────────────

function calcAngularFreq(frequency: number): number {
  if (!Number.isFinite(frequency) || frequency <= 0)
    throw new Error("frequency must be a finite positive number (Hz)");
  return 2 * Math.PI * frequency;
}

/** Impedance of one lumped element at a frequency: R, jωL, 1/(jωC).
 *  Module-private: the public entry is calcNetworkImpedance with a leaf node. */
function calcElementImpedance(
  kind: ElementKind,
  value: number,
  frequency: number,
): Complex {
  const w = calcAngularFreq(frequency);
  switch (kind) {
    case ElementKind.Resistance:
      return new Complex(value, 0);
    case ElementKind.Inductance:
      return new Complex(0, w * value);
    case ElementKind.Capacitance:
      return new Complex(0, -1 / (w * value));
  }
}

// ── Impedance primitives ─────────────────────────────────────────────────

/** Series combination: Z = Σ Zi. */
export function combineSeriesImpedances(impedances: readonly Complex[]): Complex {
  if (impedances.length === 0)
    throw new Error("series combination needs at least one impedance");
  return impedances.reduce(
    (sum, impedance) => sum.add(impedance),
    new Complex(0, 0),
  );
}

/** Parallel combination: 1/Z = Σ 1/Zi. */
export function combineParallelImpedances(impedances: readonly Complex[]): Complex {
  if (impedances.length === 0)
    throw new Error("parallel combination needs at least one impedance");
  const admittance = impedances.reduce(
    (sum, impedance) => sum.add(impedance.inverse()),
    new Complex(0, 0),
  );
  if (admittance.abs() === 0)
    throw new Error("parallel combination has zero total admittance (all open)");
  return admittance.inverse();
}

/** Total impedance of a (possibly nested) network at a frequency. */
export function calcNetworkImpedance(
  node: NetworkElement,
  frequency: number,
): Complex {
  if ("kind" in node) return calcElementImpedance(node.kind, node.value, frequency);
  const parts = node.elements.map((child) => calcNetworkImpedance(child, frequency));
  switch (node.topology) {
    case CircuitMode.Series:
      return combineSeriesImpedances(parts);
    case CircuitMode.Parallel:
      return combineParallelImpedances(parts);
  }
}

// ── Scalar concepts ──────────────────────────────────────────────────────

/** Series resonance: resonantFrequency = 1/(2π√(LC)). Q and bandwidth need R (mode-aware). */
export function calcResonance(
  inductance: number,
  capacitance: number,
  resistance?: number,
  mode: CircuitMode = CircuitMode.Series,
): { resonantFrequency: number; qualityFactor?: number; bandwidth?: number } {
  if (!Number.isFinite(inductance) || inductance <= 0)
    throw new Error("inductance must be a finite positive number (H)");
  if (!Number.isFinite(capacitance) || capacitance <= 0)
    throw new Error("capacitance must be a finite positive number (F)");
  const resonantFrequency =
    1 / (2 * Math.PI * Math.sqrt(inductance * capacitance));
  if (resistance === undefined || !Number.isFinite(resistance))
    return { resonantFrequency };
  if (resistance <= 0) throw new Error("resistance must be positive (Ω)");
  let qualityFactor: number;
  switch (mode) {
    case CircuitMode.Series:
      qualityFactor = Math.sqrt(inductance / capacitance) / resistance;
      break;
    case CircuitMode.Parallel:
      qualityFactor = resistance * Math.sqrt(capacitance / inductance);
      break;
  }
  return {
    resonantFrequency,
    qualityFactor,
    bandwidth: resonantFrequency / qualityFactor,
  };
}

/** AC power from RMS values: S = V·I, P = S·cosφ, Q = S·sinφ, pf = cosφ.
 *  The phase angle is in radians (SI). */
export function calcAcPower(
  rmsVoltage: number,
  rmsCurrent: number,
  phaseAngle = 0,
): { apparent: number; real: number; reactive: number; powerFactor: number } {
  if (rmsVoltage < 0 || rmsCurrent < 0)
    throw new Error("RMS values must be non-negative");
  const phi = phaseAngle;
  const apparent = rmsVoltage * rmsCurrent;
  return {
    apparent,
    real: apparent * Math.cos(phi),
    reactive: apparent * Math.sin(phi),
    powerFactor: Math.cos(phi),
  };
}

// ── Transients ───────────────────────────────────────────────────────────

/**
 * RC transient at time points (first order): capacitor voltage (state) and
 * loop current. mode charge: v(t) = Vs(1−e^(−t/τ)); discharge: v(t) = V0·e^(−t/τ).
 * Current: charge = (Vs − v)/R, discharge = v/R. τ = RC.
 */
export function calcRcTransientSeries(
  mode: SwitchingMode,
  sourceVoltage: number,
  initialVoltage: number,
  resistance: number,
  capacitance: number,
  times: readonly number[],
): { points: Array<{ time: number; voltage: number; current: number; timeConstant: number }>; timeConstant: number } {
  if (resistance <= 0) throw new Error('resistance must be positive (Ω)')
  if (capacitance <= 0) throw new Error('capacitance must be positive (F)')
  for (const time of times) {
    if (time < 0) throw new Error('time must be non-negative (s)')
  }
  const timeConstant = resistance * capacitance
  const points = times.map((time) => {
    const exp = Math.exp(-time / timeConstant)
    let voltage: number
    let current: number
    switch (mode) {
      case SwitchingMode.Charge:
        voltage = sourceVoltage * (1 - exp)
        current = (sourceVoltage - voltage) / resistance
        break
      case SwitchingMode.Discharge:
        voltage = initialVoltage * exp
        current = voltage / resistance
        break
    }
    return { time, voltage, current, timeConstant }
  })
  return { points, timeConstant }
}

/**
 * RL transient at time points (first order): inductor current (state) and
 * inductor voltage. mode charge: i(t) = (Vs/R)(1−e^(−t/τ)); discharge:
 * i(t) = I0·e^(−t/τ). Inductor voltage: charge = Vs·e^(−t/τ),
 * discharge = I0·R·e^(−t/τ). τ = L/R.
 */
export function calcRlTransientSeries(
  mode: SwitchingMode,
  sourceVoltage: number,
  initialCurrent: number,
  resistance: number,
  inductance: number,
  times: readonly number[],
): { points: Array<{ time: number; current: number; voltage: number; timeConstant: number }>; timeConstant: number } {
  if (resistance <= 0) throw new Error('resistance must be positive (Ω)')
  if (inductance <= 0) throw new Error('inductance must be positive (H)')
  for (const time of times) {
    if (time < 0) throw new Error('time must be non-negative (s)')
  }
  const timeConstant = inductance / resistance
  const points = times.map((time) => {
    const exp = Math.exp(-time / timeConstant)
    let current: number
    let voltage: number
    switch (mode) {
      case SwitchingMode.Charge:
        current = (sourceVoltage / resistance) * (1 - exp)
        voltage = sourceVoltage * exp
        break
      case SwitchingMode.Discharge:
        current = initialCurrent * exp
        voltage = initialCurrent * resistance * exp
        break
    }
    return { time, current, voltage, timeConstant }
  })
  return { points, timeConstant }
}

/**
 * Series-RLC transient at time points (second order): capacitor voltage and
 * loop current, closed form by damping regime (α = R/2L, ω₀ = 1/√(LC),
 * ζ = α/ω₀). mode charge drives toward sourceVoltage, discharge toward zero;
 * both initial conditions (capacitor voltage, inductor current) apply.
 */
export function calcRlcTransientSeries(
  mode: SwitchingMode,
  sourceVoltage: number,
  initialVoltage: number,
  initialCurrent: number,
  resistance: number,
  capacitance: number,
  inductance: number,
  times: readonly number[],
): {
  points: Array<{ time: number; voltage: number; current: number }>
  alpha: number
  omega0: number
  dampingRatio: number
  damping: TransientDamping
} {
  if (resistance < 0) throw new Error('resistance must be non-negative (Ω)')
  if (capacitance <= 0) throw new Error('capacitance must be positive (F)')
  if (inductance <= 0) throw new Error('inductance must be positive (H)')
  for (const time of times) {
    if (time < 0) throw new Error('time must be non-negative (s)')
  }
  const alpha = resistance / (2 * inductance)
  const omega0 = 1 / Math.sqrt(inductance * capacitance)
  const dampingRatio = alpha / omega0
  const finalVoltage = mode === SwitchingMode.Charge ? sourceVoltage : 0
  const critical = Math.abs(dampingRatio - 1) < 1e-9
  const points = times.map((time) => {
    let voltage: number
    let current: number
    if (dampingRatio < 1 && !critical) {
      // underdamped: Vf + e^(−αt)(A·cos ω_d t + B·sin ω_d t)
      const omegaD = Math.sqrt(omega0 * omega0 - alpha * alpha)
      const a = initialVoltage - finalVoltage
      const b = (initialCurrent / capacitance + alpha * a) / omegaD
      const decay = Math.exp(-alpha * time)
      const cos = Math.cos(omegaD * time)
      const sin = Math.sin(omegaD * time)
      voltage = finalVoltage + decay * (a * cos + b * sin)
      current = capacitance * decay * ((-alpha * a + omegaD * b) * cos - (alpha * b + omegaD * a) * sin)
    } else if (dampingRatio > 1 && !critical) {
      // overdamped: Vf + A1·e^(s1 t) + A2·e^(s2 t)
      const root = Math.sqrt(alpha * alpha - omega0 * omega0)
      const s1 = -alpha + root
      const s2 = -alpha - root
      const a2 = (initialCurrent / capacitance - s1 * (initialVoltage - finalVoltage)) / (s2 - s1)
      const a1 = initialVoltage - finalVoltage - a2
      voltage = finalVoltage + a1 * Math.exp(s1 * time) + a2 * Math.exp(s2 * time)
      current = capacitance * (a1 * s1 * Math.exp(s1 * time) + a2 * s2 * Math.exp(s2 * time))
    } else {
      // critical: Vf + (A + B·t)·e^(−αt)
      const a = initialVoltage - finalVoltage
      const b = initialCurrent / capacitance + alpha * a
      const decay = Math.exp(-alpha * time)
      voltage = finalVoltage + (a + b * time) * decay
      current = capacitance * (b - alpha * a - alpha * b * time) * decay
    }
    return { time, voltage, current }
  })
  return {
    points,
    alpha,
    omega0,
    dampingRatio,
    damping: critical ? TransientDamping.Critical : dampingRatio < 1 ? TransientDamping.Underdamped : TransientDamping.Overdamped,
  }
}
