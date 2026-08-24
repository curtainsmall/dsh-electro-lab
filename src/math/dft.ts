/**
 * Frequency-domain mathematics: DFT/IDFT, Fourier series of standard
 * periodic waveforms, and window functions. SI base units; plain
 * complex.js values.
 */
import { Complex } from 'complex.js'

// ── Enums ────────────────────────────────────────────────────────────────

/** Standard periodic waveform for Fourier-series expansion. */
export enum WaveformKind {
  Square = 'square',
  Triangle = 'triangle',
  Sawtooth = 'sawtooth',
}

/** Spectral window applied before a DFT. */
export enum WindowKind {
  None = 'none',
  Hann = 'hann',
  Hamming = 'hamming',
  Blackman = 'blackman',
}

// ── Types ────────────────────────────────────────────────────────────────

/** Fourier series of a real periodic waveform: DC plus cosine/sine amplitudes. */
export interface FourierCoefficients {
  dc: number
  cosine: number[]
  sine: number[]
}

// ── Transforms ───────────────────────────────────────────────────────────

/** DFT: X[k] = Σₙ x[n]·e^{−j2πkn/N}. */
export function calcDiscreteFourierTransform(samples: Complex[]): Complex[] {
  const size = samples.length
  if (size === 0) return []
  return samples.map((_, k) => {
    let sum = new Complex(0, 0)
    for (let n = 0; n < size; n++) {
      const angle = (-2 * Math.PI * k * n) / size
      sum = sum.add(samples[n]!.mul(new Complex(Math.cos(angle), Math.sin(angle))))
    }
    return sum
  })
}

/** IDFT: x[n] = (1/N)·Σₖ X[k]·e^{+j2πkn/N}. */
export function calcInvDiscreteFourierTransform(spectrum: Complex[]): Complex[] {
  const size = spectrum.length
  if (size === 0) return []
  return spectrum.map((_, n) => {
    let sum = new Complex(0, 0)
    for (let k = 0; k < size; k++) {
      const angle = (2 * Math.PI * k * n) / size
      sum = sum.add(spectrum[k]!.mul(new Complex(Math.cos(angle), Math.sin(angle))))
    }
    return sum.div(size)
  })
}

// ── Fourier series ───────────────────────────────────────────────────────

/**
 * Fourier coefficients of standard odd-symmetric periodic waveforms with
 * peak amplitude `amplitude` (default 1): DC 0, cosine 0, sine per the
 * textbook series. Harmonics are 1..harmonics.
 */
export function calcFourierSeriesCoeffs(waveform: WaveformKind, harmonics: number, amplitude = 1): FourierCoefficients {
  if (harmonics < 0) throw new Error('harmonics must be non-negative')
  switch (waveform) {
    case WaveformKind.Square: {
      // bₙ = 4A/(nπ) for odd n
      const sine: number[] = []
      for (let n = 1; n <= harmonics; n++) sine.push(n % 2 === 1 ? (4 * amplitude) / (n * Math.PI) : 0)
      return { dc: 0, cosine: new Array(harmonics).fill(0), sine }
    }
    case WaveformKind.Triangle: {
      // bₙ = 8A·sin(nπ/2)/(n²π²)
      const sine: number[] = []
      for (let n = 1; n <= harmonics; n++) sine.push((8 * amplitude * Math.sin((n * Math.PI) / 2)) / (n * n * Math.PI * Math.PI))
      return { dc: 0, cosine: new Array(harmonics).fill(0), sine }
    }
    case WaveformKind.Sawtooth: {
      // bₙ = 2A·(−1)ⁿ⁺¹/(nπ)
      const sine: number[] = []
      for (let n = 1; n <= harmonics; n++) sine.push((2 * amplitude * (n % 2 === 1 ? 1 : -1)) / (n * Math.PI))
      return { dc: 0, cosine: new Array(harmonics).fill(0), sine }
    }
  }
}

// ── Windows ──────────────────────────────────────────────────────────────

/** Window coefficients for a length-N sequence (N = 1 yields [1]). */
export function calcWindowSamples(kind: WindowKind, length: number): number[] {
  if (length <= 0) throw new Error('window length must be positive')
  if (length === 1) return [1]
  const samples: number[] = []
  for (let n = 0; n < length; n++) {
    const angle = (2 * Math.PI * n) / (length - 1)
    switch (kind) {
      case WindowKind.None:
        samples.push(1)
        break
      case WindowKind.Hann:
        samples.push(0.5 * (1 - Math.cos(angle)))
        break
      case WindowKind.Hamming:
        samples.push(0.54 - 0.46 * Math.cos(angle))
        break
      case WindowKind.Blackman:
        samples.push(0.42 - 0.5 * Math.cos(angle) + 0.08 * Math.cos(2 * angle))
        break
    }
  }
  return samples
}

/** Apply window weights to a sample sequence (weight i multiplies sample i). */
export function applyWindow(samples: Complex[], weights: number[]): Complex[] {
  return samples.map((sample, i) => sample.mul(weights[i]!))
}
