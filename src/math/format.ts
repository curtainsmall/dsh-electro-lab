/**
 * Serialization: turn a complex result plus its fixed base unit into the
 * tool output shape. The unit is a constant of the caller (each tool knows
 * what it computes); this function produces both representations plus
 * display strings.
 */
import { Complex } from "complex.js";
import { BaseUnit, UNIT_BY_BASE, engineeringFormat } from "./units.ts";

function fmtNumber(value: number): string {
  // Rectangular components: plain precision formatting (no prefix noise).
  return Number(value.toPrecision(6)).toString();
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
  const real = fmtNumber(value.re);
  const imaginary = value.im;
  const imaginaryAbs = fmtNumber(Math.abs(imaginary));
  const sign = imaginary < 0 ? "-" : "+";
  const unitStr = unit === BaseUnit.Dimensionless ? "" : ` ${unit}`;
  const magnitude = engineeringFormat(value.abs(), unitCategory, 4);
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
