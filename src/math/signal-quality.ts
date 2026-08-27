/**
 * Signal-quality mathematics: total harmonic distortion (THD), clock-jitter
 * SNR, and the ADC noise budget that combines quantization, jitter and
 * thermal noise into a total SNR / ENOB. SI base units.
 */
import { Complex } from 'complex.js'
import { calcDiscreteFourierTransform } from './dft.ts'
import { calcQuantizationSnr } from './noise.ts'

/**
 * Total harmonic distortion of a sampled signal: the ratio of the summed
 * harmonic energy (bins 2f₀..harmonics·f₀ of the dominant non-DC bin) to the
 * fundamental. The DFT bin magnitudes are used directly — the 2/N factor of
 * the single-sided convention cancels in the ratio. Harmonics alias back
 * (spectral folding): bin index = (order·f₀) mod N, which also makes the
 * result invariant to which of the two mirror peaks is picked as the
 * fundamental. thdDb is 20·log10(thd) (−Infinity when there are no harmonics).
 */
export function calcThd(
  samples: readonly number[],
  harmonics: number,
): { thd: number; thdDb: number; fundamental: number; harmonicAmplitudes: number[] } {
  if (samples.length === 0) throw new Error('at least one sample is required')
  if (harmonics < 1) throw new Error('harmonics must be ≥ 1')
  const spectrum = calcDiscreteFourierTransform(samples.map((value) => new Complex(value, 0)))
  let fundamentalIndex = -1
  let fundamental = 0
  for (let k = 1; k < spectrum.length; k++) {
    const magnitude = spectrum[k]!.abs()
    if (magnitude > fundamental) {
      fundamental = magnitude
      fundamentalIndex = k
    }
  }
  if (fundamental === 0) throw new Error('no non-DC fundamental found (silent or DC-only signal)')
  const harmonicAmplitudes: number[] = []
  for (let order = 2; order <= harmonics; order++) {
    harmonicAmplitudes.push(spectrum[(order * fundamentalIndex) % spectrum.length]!.abs())
  }
  const harmonicEnergy = harmonicAmplitudes.reduce((sum, amplitude) => sum + amplitude * amplitude, 0)
  const thd = Math.sqrt(harmonicEnergy) / fundamental
  return { thd, thdDb: 20 * Math.log10(thd), fundamental, harmonicAmplitudes }
}

/**
 * SNR ceiling set by sampling-clock jitter:
 *   SNR = −20·log10(2π·f·tⱼ) dB
 * with signal frequency f and RMS jitter tⱼ. Higher frequency or jitter
 * lowers the ceiling; independent of the quantizer.
 */
export function calcJitterSnr(signalFrequency: number, jitter: number): number {
  if (signalFrequency <= 0) throw new Error('signal frequency must be positive (Hz)')
  if (jitter <= 0) throw new Error('jitter must be positive (s)')
  return -20 * Math.log10(2 * Math.PI * signalFrequency * jitter)
}

/**
 * ADC noise budget: quantization SNR (6.02·N + 1.76 dB), jitter SNR
 * (−20·log10(2π·f·tⱼ)), and an optional thermal SNR (signal-dependent; the
 * caller supplies it, e.g. from thermal_noise against the signal level).
 * Noise powers add linearly, then the total is converted back to dB and to
 * ENOB: (SNR_total − 1.76)/6.02.
 */
export function calcAdcBudget(
  bits: number,
  signalFrequency: number,
  jitter: number,
  thermalSnrDb?: number,
): {
  snrQuantizationDb: number
  snrJitterDb: number
  snrThermalDb?: number
  snrTotalDb: number
  enob: number
} {
  if (!Number.isInteger(bits) || bits < 1) throw new Error('bits must be a positive integer')
  const snrQuantizationDb = calcQuantizationSnr(bits)
  const snrJitterDb = calcJitterSnr(signalFrequency, jitter)
  const components = [snrQuantizationDb, snrJitterDb]
  if (thermalSnrDb !== undefined) {
    if (!Number.isFinite(thermalSnrDb)) throw new Error('thermal SNR must be a finite dB value')
    components.push(thermalSnrDb)
  }
  const totalFactor = components.reduce((sum, snr) => sum + 10 ** (-snr / 10), 0)
  const snrTotalDb = -10 * Math.log10(totalFactor)
  return {
    snrQuantizationDb,
    snrJitterDb,
    ...(thermalSnrDb === undefined ? {} : { snrThermalDb: thermalSnrDb }),
    snrTotalDb,
    enob: (snrTotalDb - 1.76) / 6.02,
  }
}
