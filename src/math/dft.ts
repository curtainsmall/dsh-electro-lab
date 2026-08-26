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

// ── Transforms ───────────────────────────────────────────────────────────

/**
 * DFT: X[k] = Σₙ x[n]·e^{−j2πkn/N}. Power-of-two lengths use the radix-2
 * Cooley-Tukey FFT (O(N log N)); other lengths fall back to the direct
 * definition (O(N²)). Both are numerically identical to the definition.
 */
export function calcDiscreteFourierTransform(samples: Complex[]): Complex[] {
  const size = samples.length
  if (size === 0) return []
  if (isPowerOfTwo(size)) return fftRadix2(samples)
  return dftDirect(samples)
}

/** IDFT: x[n] = (1/N)·Σₖ X[k]·e^{+j2πkn/N}. The inverse reuses the forward
 *  FFT through conjugation: x = conj(FFT(conj(X)))/N. */
export function calcInvDiscreteFourierTransform(spectrum: Complex[]): Complex[] {
  const size = spectrum.length
  if (size === 0) return []
  if (isPowerOfTwo(size)) {
    return fftRadix2(spectrum.map((bin) => bin.conjugate())).map((sample) => sample.conjugate().div(size))
  }
  return idftDirect(spectrum)
}

/** Direct DFT from the definition (fallback for non-power-of-two lengths). */
function dftDirect(samples: Complex[]): Complex[] {
  const size = samples.length
  return samples.map((_, k) => {
    let sum = new Complex(0, 0)
    for (let n = 0; n < size; n++) {
      const angle = (-2 * Math.PI * k * n) / size
      sum = sum.add(samples[n]!.mul(new Complex(Math.cos(angle), Math.sin(angle))))
    }
    return sum
  })
}

/** Direct IDFT from the definition (fallback for non-power-of-two lengths). */
function idftDirect(spectrum: Complex[]): Complex[] {
  const size = spectrum.length
  return spectrum.map((_, n) => {
    let sum = new Complex(0, 0)
    for (let k = 0; k < size; k++) {
      const angle = (2 * Math.PI * k * n) / size
      sum = sum.add(spectrum[k]!.mul(new Complex(Math.cos(angle), Math.sin(angle))))
    }
    return sum.div(size)
  })
}

/** Radix-2 iterative Cooley-Tukey FFT (in-place bit reversal + butterflies). */
function fftRadix2(samples: Complex[]): Complex[] {
  const size = samples.length
  const result = samples.slice()
  for (let i = 1, j = 0; i < size; i++) {
    let bit = size >> 1
    for (; (j & bit) !== 0; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const tmp = result[i]!
      result[i] = result[j]!
      result[j] = tmp
    }
  }
  for (let length = 2; length <= size; length <<= 1) {
    const angle = (-2 * Math.PI) / length
    const twiddleStep = new Complex(Math.cos(angle), Math.sin(angle))
    for (let start = 0; start < size; start += length) {
      let twiddle = new Complex(1, 0)
      const half = length / 2
      for (let k = 0; k < half; k++) {
        const even = result[start + k]!
        const odd = result[start + k + half]!.mul(twiddle)
        result[start + k] = even.add(odd)
        result[start + k + half] = even.sub(odd)
        twiddle = twiddle.mul(twiddleStep)
      }
    }
  }
  return result
}

/** Whether N is a positive power of two. */
function isPowerOfTwo(size: number): boolean {
  return size > 0 && (size & (size - 1)) === 0
}

// ── Fourier series ───────────────────────────────────────────────────────

/**
 * Fourier coefficients of standard odd-symmetric periodic waveforms with
 * peak amplitude `amplitude` (default 1): DC 0, cosine 0, sine per the
 * standard series. Harmonics are 1..harmonics.
 */
export function calcFourierSeriesCoeffs(
  waveform: WaveformKind,
  harmonics: number,
  amplitude = 1,
): { dc: number; cosine: number[]; sine: number[] } {
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

/**
 * Signal statistics: RMS (√mean|x|²), peak |x|, peak-to-peak of the real
 * part, and DC (mean of the real part).
 */
export function calcSignalStatistics(samples: Complex[]): { rms: number; peak: number; peakToPeak: number; dc: number } {
  if (samples.length === 0) throw new Error('samples must not be empty')
  let sumSquares = 0
  let peak = 0
  let dcSum = 0
  let minimum = Number.POSITIVE_INFINITY
  let maximum = Number.NEGATIVE_INFINITY
  for (const sample of samples) {
    const magnitude = sample.abs()
    sumSquares += magnitude * magnitude
    peak = Math.max(peak, magnitude)
    dcSum += sample.re
    minimum = Math.min(minimum, sample.re)
    maximum = Math.max(maximum, sample.re)
  }
  const count = samples.length
  return {
    rms: Math.sqrt(sumSquares / count),
    peak,
    peakToPeak: maximum - minimum,
    dc: dcSum / count,
  }
}

/**
 * Signal analysis: statistics plus the windowed spectrum in one call.
 * Composes calcSignalStatistics, the window and the FFT (all existing
 * primitives).
 */
export function calcSignalAnalysis(
  samples: Complex[],
  window: WindowKind,
): { rms: number; peak: number; peakToPeak: number; dc: number; spectrum: Complex[] } {
  const statistics = calcSignalStatistics(samples)
  const weighted = applyWindow(samples, calcWindowSamples(window, samples.length))
  return { ...statistics, spectrum: calcDiscreteFourierTransform(weighted) }
}
