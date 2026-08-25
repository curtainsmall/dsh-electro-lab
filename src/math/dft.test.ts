import { describe, expect, it } from 'vitest'
import { Complex } from 'complex.js'
import {
  WaveformKind,
  WindowKind,
  applyWindow,
  calcDiscreteFourierTransform,
  calcFourierSeriesCoeffs,
  calcInvDiscreteFourierTransform,
  calcSignalAnalysis,
  calcSignalStatistics,
  calcWindowSamples,
} from './dft.ts'

describe('DFT/IDFT (textbook checks)', () => {
  it('maps a delta sequence to a flat spectrum', () => {
    const spectrum = calcDiscreteFourierTransform([new Complex(1, 0), new Complex(0, 0), new Complex(0, 0), new Complex(0, 0)])
    for (const bin of spectrum) {
      expect(bin.re).toBeCloseTo(1, 10)
      expect(bin.im).toBeCloseTo(0, 10)
    }
  })

  it('places a cosine at its two spectral lines', () => {
    const size = 8
    const samples: Complex[] = []
    for (let n = 0; n < size; n++) {
      samples.push(new Complex(Math.cos((2 * Math.PI * n) / size), 0))
    }
    const spectrum = calcDiscreteFourierTransform(samples)
    expect(spectrum[1]!.re).toBeCloseTo(4, 6) // bin 1: half-amplitude · N
    expect(spectrum[7]!.re).toBeCloseTo(4, 6) // bin N−1: negative frequency
    expect(spectrum[0]!.abs()).toBeCloseTo(0, 8)
    expect(spectrum[4]!.abs()).toBeCloseTo(0, 8)
  })

  it('round-trips a sequence through DFT and IDFT', () => {
    const samples = [new Complex(0.5, 1), new Complex(-2, 0.25), new Complex(3, -1.5), new Complex(0, 2), new Complex(1, 1)]
    const recovered = calcInvDiscreteFourierTransform(calcDiscreteFourierTransform(samples))
    for (let n = 0; n < samples.length; n++) {
      expect(recovered[n]!.re).toBeCloseTo(samples[n]!.re, 10)
      expect(recovered[n]!.im).toBeCloseTo(samples[n]!.im, 10)
    }
  })

  it('handles the empty sequence', () => {
    expect(calcDiscreteFourierTransform([])).toEqual([])
    expect(calcInvDiscreteFourierTransform([])).toEqual([])
  })

  it('FFT path matches the direct definition for a power-of-two length', () => {
    // 16 pseudo-random samples: the radix-2 FFT must equal the O(N²) sum
    const size = 16
    const samples: Complex[] = []
    for (let n = 0; n < size; n++) {
      samples.push(new Complex(Math.sin(0.7 * n) * 1.3, Math.cos(0.3 * n) * 0.9))
    }
    const fast = calcDiscreteFourierTransform(samples)
    for (let k = 0; k < size; k++) {
      let direct = new Complex(0, 0)
      for (let n = 0; n < size; n++) {
        const angle = (-2 * Math.PI * k * n) / size
        direct = direct.add(samples[n]!.mul(new Complex(Math.cos(angle), Math.sin(angle))))
      }
      expect(fast[k]!.re).toBeCloseTo(direct.re, 9)
      expect(fast[k]!.im).toBeCloseTo(direct.im, 9)
    }
  })

  it('inverse FFT round-trips a power-of-two spectrum', () => {
    const size = 16
    const samples: Complex[] = []
    for (let n = 0; n < size; n++) {
      samples.push(new Complex(Math.sin(0.5 * n), Math.cos(0.4 * n)))
    }
    const recovered = calcInvDiscreteFourierTransform(calcDiscreteFourierTransform(samples))
    for (let n = 0; n < size; n++) {
      expect(recovered[n]!.re).toBeCloseTo(samples[n]!.re, 9)
      expect(recovered[n]!.im).toBeCloseTo(samples[n]!.im, 9)
    }
  })
})

describe('calcFourierSeriesCoeffs (textbook checks)', () => {
  it('square wave: bₙ = 4A/(nπ) for odd n, zeros elsewhere', () => {
    const result = calcFourierSeriesCoeffs(WaveformKind.Square, 6, 1)
    expect(result.dc).toBeCloseTo(0, 12)
    expect(result.cosine).toEqual([0, 0, 0, 0, 0, 0])
    expect(result.sine[0]).toBeCloseTo(4 / Math.PI, 10)
    expect(result.sine[1]).toBeCloseTo(0, 12)
    expect(result.sine[2]).toBeCloseTo(4 / (3 * Math.PI), 10)
    expect(result.sine[3]).toBeCloseTo(0, 12)
    expect(result.sine[4]).toBeCloseTo(4 / (5 * Math.PI), 10)
  })

  it('triangle wave: b₁ = 8A/π², b₃ = −8A/(9π²)', () => {
    const result = calcFourierSeriesCoeffs(WaveformKind.Triangle, 3, 1)
    expect(result.sine[0]).toBeCloseTo(8 / (Math.PI * Math.PI), 10)
    expect(result.sine[1]).toBeCloseTo(0, 12) // sin(π) = 0
    expect(result.sine[2]).toBeCloseTo(-8 / (9 * Math.PI * Math.PI), 10) // sin(3π/2) = −1
  })

  it('sawtooth wave: bₙ = 2A(−1)ⁿ⁺¹/(nπ)', () => {
    const result = calcFourierSeriesCoeffs(WaveformKind.Sawtooth, 3, 1)
    expect(result.sine[0]).toBeCloseTo(2 / Math.PI, 10)
    expect(result.sine[1]).toBeCloseTo(-1 / Math.PI, 10)
    expect(result.sine[2]).toBeCloseTo(2 / (3 * Math.PI), 10)
  })

  it('scales with amplitude', () => {
    const result = calcFourierSeriesCoeffs(WaveformKind.Square, 1, 5)
    expect(result.sine[0]).toBeCloseTo(20 / Math.PI, 10)
  })
})

describe('calcWindowSamples (textbook checks)', () => {
  it('Hann window: zero endpoints, unit center for odd N', () => {
    const samples = calcWindowSamples(WindowKind.Hann, 5)
    expect(samples[0]).toBeCloseTo(0, 12)
    expect(samples[4]).toBeCloseTo(0, 12)
    expect(samples[2]).toBeCloseTo(1, 10) // center of N = 5
  })

  it('Hamming window: 0.08 endpoints', () => {
    const samples = calcWindowSamples(WindowKind.Hamming, 8)
    expect(samples[0]).toBeCloseTo(0.08, 10)
    expect(samples[7]).toBeCloseTo(0.08, 10)
  })

  it('Blackman window: zero endpoints', () => {
    const samples = calcWindowSamples(WindowKind.Blackman, 8)
    expect(samples[0]).toBeCloseTo(0, 12)
    expect(samples[7]).toBeCloseTo(0, 12)
  })

  it('none window: all ones; length 1 yields [1]', () => {
    expect(calcWindowSamples(WindowKind.None, 5)).toEqual([1, 1, 1, 1, 1])
    expect(calcWindowSamples(WindowKind.Hann, 1)).toEqual([1])
  })

  it('rejects non-positive length', () => {
    expect(() => calcWindowSamples(WindowKind.Hann, 0)).toThrow(/positive/)
  })
})

describe('applyWindow', () => {
  it('multiplies each sample by its weight', () => {
    const samples = [new Complex(1, 0), new Complex(2, 0), new Complex(3, 0)]
    const weighted = applyWindow(samples, [0, 0.5, 1])
    expect(weighted[0]!.abs()).toBeCloseTo(0, 12)
    expect(weighted[1]!.re).toBeCloseTo(1, 12)
    expect(weighted[2]!.re).toBeCloseTo(3, 12)
  })

  it('supports complex samples', () => {
    const weighted = applyWindow([new Complex(1, 1)], [2])
    expect(weighted[0]!.re).toBeCloseTo(2, 12)
    expect(weighted[0]!.im).toBeCloseTo(2, 12)
  })
})

describe('calcSignalStatistics (textbook checks)', () => {
  it('a unit sine: rms = 1/√2, peak 1, peak-to-peak 2, dc 0', () => {
    const samples: Complex[] = []
    for (let n = 0; n < 64; n++) samples.push(new Complex(Math.sin((2 * Math.PI * n) / 64), 0))
    const statistics = calcSignalStatistics(samples)
    expect(statistics.rms).toBeCloseTo(1 / Math.SQRT2, 3)
    expect(statistics.peak).toBeCloseTo(1, 6)
    expect(statistics.peakToPeak).toBeCloseTo(2, 6)
    expect(statistics.dc).toBeCloseTo(0, 8)
  })

  it('a DC offset shows up in dc and rms', () => {
    const statistics = calcSignalStatistics([new Complex(3, 0), new Complex(3, 0), new Complex(3, 0)])
    expect(statistics.dc).toBeCloseTo(3, 12)
    expect(statistics.rms).toBeCloseTo(3, 12)
    expect(statistics.peakToPeak).toBeCloseTo(0, 12)
  })

  it('rejects empty samples', () => {
    expect(() => calcSignalStatistics([])).toThrow(/empty/)
  })
})

describe('calcSignalAnalysis', () => {
  it('combines statistics with the windowed spectrum', () => {
    const size = 16
    const samples: Complex[] = []
    for (let n = 0; n < size; n++) samples.push(new Complex(Math.sin((2 * Math.PI * n) / size), 0))
    const result = calcSignalAnalysis(samples, WindowKind.None)
    expect(result.spectrum).toHaveLength(size)
    expect(result.spectrum[1]!.abs()).toBeCloseTo(size / 2, 6) // one spectral line at bin 1
    expect(result.rms).toBeCloseTo(1 / Math.SQRT2, 3)
  })
})
