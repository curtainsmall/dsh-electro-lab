/**
 * Serialization: turn a complex result plus its fixed base unit into the
 * tool output shape. The unit is a constant of the caller (each tool knows
 * what it computes); this function produces both representations plus
 * display strings.
 */
import { Complex } from "complex.js";
import { BaseUnit, Prefix, PREFIX_SYMBOL, UNIT_BY_BASE, UNIT_DEFS, type Unit } from "./units.ts";

function formatNumber(value: number): string {
  // Rectangular components: plain precision formatting (no prefix noise).
  return Number(value.toPrecision(6)).toString();
}

/**
 * Engineering formatting: choose the largest prefix so the mantissa sits in
 * [1, 1000), round to `digits` significant figures, strip trailing zeros.
 * Returns e.g. "2.4 k" (unit appended by the caller), "1.5 n", "150 m".
 */
export function formatEngineering(value: number, unit: Unit, digits = 4): string {
  const def = UNIT_DEFS[unit];
  const abs = Math.abs(value);
  if (abs === 0) return "0";
  let symbol = "";
  let factor = 0;
  for (const prefix of def.prefixes) {
    if (abs / prefix >= 1 && prefix > factor) {
      symbol = PREFIX_SYMBOL[prefix] ?? "";
      factor = prefix;
    }
  }
  const mantissa = value / (factor === 0 ? 1 : factor);
  const rounded = Number(mantissa.toPrecision(digits)).toString();
  return symbol === "" ? rounded : `${rounded} ${symbol}`;
}

/**
 * Serialize a complex value with a fixed base unit: machine values (real,
 * imaginary, magnitude, phase) plus human displays (rectangular and polar,
 * engineering notation for magnitudes). The anonymous object type stays
 * assignable to JsonValue in tool outputs (object types carry an implicit
 * index signature).
 */
export function serializeComplex(
  value: Complex,
  unit: BaseUnit,
): {
  real: number;
  imaginary: number;
  magnitude: number;
  phaseAngleDegrees: number;
  phaseAngleRadians: number;
  display: string;
  displayPolar: string;
  unit: string;
} {
  const unitCategory = UNIT_BY_BASE[unit];
  const real = formatNumber(value.re);
  const imaginary = value.im;
  const imaginaryAbs = formatNumber(Math.abs(imaginary));
  const sign = imaginary < 0 ? "-" : "+";
  const unitStr = unit === BaseUnit.Dimensionless ? "" : ` ${unit}`;
  const magnitude = formatEngineering(value.abs(), unitCategory, 4);
  const phaseDegrees = ((value.arg() * 180) / Math.PI).toFixed(2);
  return {
    real: value.re,
    imaginary: value.im,
    magnitude: value.abs(),
    phaseAngleDegrees: (value.arg() * 180) / Math.PI,
    phaseAngleRadians: value.arg(),
    display: `${real} ${sign} ${imaginaryAbs}j${unitStr}`,
    displayPolar: `${magnitude} ∠ ${phaseDegrees}°${unitStr}`,
    unit,
  };
}
