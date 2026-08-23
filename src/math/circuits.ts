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

// ── Types ────────────────────────────────────────────────────────────────

/** A network node: one lumped element, or a nested series/parallel group. */
export type NetworkElement =
  | { kind: ElementKind; value: number }
  | { topology: CircuitMode; elements: NetworkElement[] };

/** One transient sample point. */
export interface TransientPoint {
  time: number
  voltage: number
  current: number
}

// ── Private helpers ──────────────────────────────────────────────────────

function omega(frequency: number): number {
  if (!Number.isFinite(frequency) || frequency <= 0)
    throw new Error("frequency must be a finite positive number (Hz)");
  return 2 * Math.PI * frequency;
}

/** Impedance of one lumped element at a frequency: R, jωL, 1/(jωC).
 *  Module-private: the public entry is networkImpedance with a leaf node. */
function elementImpedance(
  kind: ElementKind,
  value: number,
  frequency: number,
): Complex {
  const w = omega(frequency);
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
export function seriesOf(impedances: readonly Complex[]): Complex {
  if (impedances.length === 0)
    throw new Error("series combination needs at least one impedance");
  return impedances.reduce(
    (sum, impedance) => sum.add(impedance),
    new Complex(0, 0),
  );
}

/** Parallel combination: 1/Z = Σ 1/Zi. */
export function parallelOf(impedances: readonly Complex[]): Complex {
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
export function networkImpedance(
  node: NetworkElement,
  frequency: number,
): Complex {
  if ("kind" in node) return elementImpedance(node.kind, node.value, frequency);
  const parts = node.elements.map((child) => networkImpedance(child, frequency));
  switch (node.topology) {
    case CircuitMode.Series:
      return seriesOf(parts);
    case CircuitMode.Parallel:
      return parallelOf(parts);
  }
}

// ── Scalar concepts ──────────────────────────────────────────────────────

/** Series resonance: resonantFrequency = 1/(2π√(LC)). Q and bandwidth need R (mode-aware). */
export function resonance(
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

/** AC power from RMS values: S = V·I, P = S·cosφ, Q = S·sinφ, pf = cosφ. */
export function acPower(
  rmsVoltage: number,
  rmsCurrent: number,
  phaseAngleDegree = 0,
): { apparent: number; real: number; reactive: number; powerFactor: number } {
  if (rmsVoltage < 0 || rmsCurrent < 0)
    throw new Error("RMS values must be non-negative");
  const phi = (phaseAngleDegree * Math.PI) / 180;
  const apparent = rmsVoltage * rmsCurrent;
  return {
    apparent,
    real: apparent * Math.cos(phi),
    reactive: apparent * Math.sin(phi),
    powerFactor: Math.cos(phi),
  };
}

// ── Transients ───────────────────────────────────────────────────────────

/** RC transient. mode charge: v(t) = Vs(1−e^(−t/τ)); discharge: v(t) = V0·e^(−t/τ). */
export function rcTransient(
  mode: SwitchingMode,
  sourceVoltage: number,
  initialVoltage: number,
  resistance: number,
  capacitance: number,
  time: number,
): { voltage: number; current: number; timeConstant: number } {
  if (resistance <= 0) throw new Error("resistance must be positive (Ω)");
  if (capacitance <= 0) throw new Error("capacitance must be positive (F)");
  if (time < 0) throw new Error("time must be non-negative (s)");
  const timeConstant = resistance * capacitance;
  const exp = Math.exp(-time / timeConstant);
  let voltage: number;
  let current: number;
  switch (mode) {
    case SwitchingMode.Charge:
      voltage = sourceVoltage * (1 - exp);
      current = (sourceVoltage - voltage) / resistance;
      break;
    case SwitchingMode.Discharge:
      voltage = initialVoltage * exp;
      current = voltage / resistance;
      break;
  }
  return { voltage, current, timeConstant };
}

/** RL transient. mode charge: i(t) = (Vs/R)(1−e^(−t/τ)); discharge: i(t) = I0·e^(−t/τ). */
export function rlTransient(
  mode: SwitchingMode,
  sourceVoltage: number,
  initialCurrent: number,
  resistance: number,
  inductance: number,
  time: number,
): { current: number; voltage: number; timeConstant: number } {
  if (resistance <= 0) throw new Error("resistance must be positive (Ω)");
  if (inductance <= 0) throw new Error("inductance must be positive (H)");
  if (time < 0) throw new Error("time must be non-negative (s)");
  const timeConstant = inductance / resistance;
  const exp = Math.exp(-time / timeConstant);
  let current: number;
  let voltage: number;
  switch (mode) {
    case SwitchingMode.Charge:
      current = (sourceVoltage / resistance) * (1 - exp);
      voltage = sourceVoltage * exp;
      break;
    case SwitchingMode.Discharge:
      current = initialCurrent * exp;
      voltage = initialCurrent * resistance * exp;
      break;
  }
  return { current, voltage, timeConstant };
}

/** RC transient evaluated at a list of time points (batch call for curves). */
export function rcTransientSeries(
  mode: SwitchingMode,
  sourceVoltage: number,
  initialVoltage: number,
  resistance: number,
  capacitance: number,
  times: readonly number[],
): TransientPoint[] {
  return times.map((time) => {
    const { voltage, current } = rcTransient(
      mode,
      sourceVoltage,
      initialVoltage,
      resistance,
      capacitance,
      time,
    );
    return { time, voltage, current };
  });
}

/** RL transient evaluated at a list of time points (batch call for curves). */
export function rlTransientSeries(
  mode: SwitchingMode,
  sourceVoltage: number,
  initialCurrent: number,
  resistance: number,
  inductance: number,
  times: readonly number[],
): TransientPoint[] {
  return times.map((time) => {
    const { current, voltage } = rlTransient(
      mode,
      sourceVoltage,
      initialCurrent,
      resistance,
      inductance,
      time,
    );
    return { time, voltage, current };
  });
}
