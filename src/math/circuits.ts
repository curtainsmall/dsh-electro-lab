/**
 * Circuit mathematics. All functions operate on SI base units (Hz, Ω, F, H,
 * V, A, s) and return plain numbers / complex.js values; engineering
 * presentation is the tools' job.
 */
import { Complex } from "complex.js";
import { CircuitMode, SwitchingMode } from "./enums.ts";

function omega(frequency: number): number {
  if (!Number.isFinite(frequency) || frequency <= 0)
    throw new Error("frequency must be a finite positive number (Hz)");
  return 2 * Math.PI * frequency;
}

/** Series RLC impedance: Z = R + jωL + 1/(jωC). Omit L=0 / C=0 terms. */
export function seriesImpedance(
  frequency: number,
  resistance: number,
  inductance: number,
  capacitance: number,
): Complex {
  const w = omega(frequency);
  let z = new Complex(resistance, 0);
  if (inductance > 0) z = z.add(new Complex(0, w * inductance));
  if (capacitance > 0) z = z.add(new Complex(0, -1 / (w * capacitance)));
  return z;
}

/** Parallel RLC impedance: 1/Z = 1/R + 1/(jωL) + jωC. `resistance` may be omitted (open). */
export function parallelImpedance(
  frequency: number,
  resistance: number | undefined,
  inductance: number,
  capacitance: number,
): Complex {
  const w = omega(frequency);
  let y = new Complex(
    resistance !== undefined && Number.isFinite(resistance)
      ? 1 / resistance
      : 0,
    0,
  );
  if (inductance > 0) y = y.add(new Complex(0, -1 / (w * inductance)));
  if (capacitance > 0) y = y.add(new Complex(0, w * capacitance));
  if (y.abs() === 0) throw new Error("parallel RLC has no element (all open)");
  return y.inverse();
}

/** Parallel combination of two impedances: Z = Z1·Z2 / (Z1+Z2). */
export function parallelTwo(
  firstImpedance: Complex,
  secondImpedance: Complex,
): Complex {
  const sum = firstImpedance.add(secondImpedance);
  if (sum.abs() === 0)
    throw new Error(
      "parallel combination has zero total impedance (short circuit)",
    );
  return firstImpedance.mul(secondImpedance).div(sum);
}

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
  const qualityFactor =
    mode === CircuitMode.Series
      ? Math.sqrt(inductance / capacitance) / resistance
      : resistance * Math.sqrt(capacitance / inductance);
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
  const voltage =
    mode === SwitchingMode.Charge ? sourceVoltage * (1 - exp) : initialVoltage * exp;
  const current =
    mode === SwitchingMode.Charge
      ? (sourceVoltage - voltage) / resistance
      : voltage / resistance;
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
  const current =
    mode === SwitchingMode.Charge
      ? (sourceVoltage / resistance) * (1 - exp)
      : initialCurrent * exp;
  const voltage =
    mode === SwitchingMode.Charge
      ? sourceVoltage * exp
      : initialCurrent * resistance * exp;
  return { current, voltage, timeConstant };
}
