/**
 * Noise mathematics: thermal noise, quantization SNR, and cascaded
 * noise-figure (Friis). SI base units; dB values are plain numbers.
 */

const BOLTZMANN_CONSTANT = 1.380649e-23 // J/K

/** Thermal noise power in watts: P = k·T·B. */
export function calcThermalNoisePower(temperatureKelvin: number, bandwidth: number): number {
  if (temperatureKelvin < 0) throw new Error('temperature must be non-negative (K)')
  if (bandwidth < 0) throw new Error('bandwidth must be non-negative (Hz)')
  return BOLTZMANN_CONSTANT * temperatureKelvin * bandwidth
}

/** Ideal quantization SNR in dB: SNR = 6.02·N + 1.76. */
export function calcQuantizationSnr(bits: number): number {
  if (!Number.isInteger(bits) || bits < 1) throw new Error('bits must be a positive integer')
  return 6.02 * bits + 1.76
}

/**
 * Cascaded noise figure (Friis) in dB:
 *   F = F₁ + (F₂−1)/G₁ + (F₃−1)/(G₁G₂) + …
 * Inputs are dB; gains are linear-power stage gains.
 */
export function calcCascadeNoiseFigure(noiseFigureDb: number[], gainDb: number[]): number {
  if (noiseFigureDb.length === 0) throw new Error('at least one stage is required')
  if (noiseFigureDb.length !== gainDb.length) {
    throw new Error('noiseFigureDb and gainDb must have the same length')
  }
  let totalFactor = 10 ** (noiseFigureDb[0]! / 10)
  let cumulativeGain = 10 ** (gainDb[0]! / 10)
  for (let i = 1; i < noiseFigureDb.length; i++) {
    totalFactor += (10 ** (noiseFigureDb[i]! / 10) - 1) / cumulativeGain
    cumulativeGain *= 10 ** (gainDb[i]! / 10)
  }
  return 10 * Math.log10(totalFactor)
}
