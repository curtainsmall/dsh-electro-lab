/**
 * Transmission-line mathematics: wavelength, coaxial-line characterization,
 * and rise-time/bandwidth conversion. SI base units.
 */

const SPEED_OF_LIGHT = 299792458 // m/s

/** Wavelength in meters: λ = c·velocityFactor / f. */
export function calcWavelength(frequency: number, velocityFactor = 1): number {
  if (frequency <= 0) throw new Error('frequency must be positive (Hz)')
  if (velocityFactor <= 0 || velocityFactor > 1) throw new Error('velocity factor must be in (0, 1]')
  return (SPEED_OF_LIGHT * velocityFactor) / frequency
}

/**
 * Coaxial-line characterization from geometry:
 *   Z₀ = (138/√εr)·log₁₀(D/d)
 *   velocityFactor = 1/√εr
 *   C′ = 1/(vf·c·Z₀), L′ = Z₀/(vf·c)
 */
export function calcCoaxialParameters(
  innerDiameter: number,
  outerDiameter: number,
  relativePermittivity: number,
): { impedance: number; velocityFactor: number; capacitancePerMeter: number; inductancePerMeter: number } {
  if (innerDiameter <= 0) throw new Error('inner diameter must be positive (m)')
  if (outerDiameter <= innerDiameter) throw new Error('outer diameter must exceed inner diameter (m)')
  if (relativePermittivity < 1) throw new Error('relative permittivity must be ≥ 1')
  const impedance = (138 / Math.sqrt(relativePermittivity)) * Math.log10(outerDiameter / innerDiameter)
  const velocityFactor = 1 / Math.sqrt(relativePermittivity)
  return {
    impedance,
    velocityFactor,
    capacitancePerMeter: 1 / (velocityFactor * SPEED_OF_LIGHT * impedance),
    inductancePerMeter: impedance / (velocityFactor * SPEED_OF_LIGHT),
  }
}

/** Rise time in seconds from bandwidth: tr ≈ 0.35/BW. */
export function calcRiseTimeFromBandwidth(bandwidth: number): number {
  if (bandwidth <= 0) throw new Error('bandwidth must be positive (Hz)')
  return 0.35 / bandwidth
}

/** Bandwidth in Hz from rise time: BW ≈ 0.35/tr. */
export function calcBandwidthFromRiseTime(riseTime: number): number {
  if (riseTime <= 0) throw new Error('rise time must be positive (s)')
  return 0.35 / riseTime
}
