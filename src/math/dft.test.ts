import { describe, expect, it } from 'vitest'
import { Complex } from 'complex.js'
import {
  WaveformKind,
  WindowKind,
  discreteFourierTransform,
  fourierSeriesCoefficients,
  inverseDiscreteFourierTransform,
  windowSamples,
} from './dft.ts'

describe('DFT/IDFT (textbook checks)', () => {
  it('maps a delta sequence to a flat spectrum', () => {
    const spectrum = discreteFourierTransform([new Complex(1, 0), new Complex(0, 0), new Complex(0, 0), new Complex(0, 0)])
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
    const spectrum = discreteFourierTransform(samples)
    expect(spectrum[1]!.re).toBeCloseTo(4, 6) // bin 1: half-amplitude · N
    expect(spectrum[7]!.re).toBeCloseTo(4, 6) // bin N−1: negative frequency
    expect(spectrum[0]!.abs()).toBeCloseTo(0, 8)
    expect(spectrum[4]!.abs()).toBeCloseTo(0, 8)
  })

  it('round-trips a sequence through DFT and IDFT', () => {
    const samples = [new Complex(0.5, 1), new Complex(-2, 0.25), new Complex(3, -1.5), new Complex(0, 2), new Complex(1, 1)]
    const recovered = inverseDiscreteFourierTransform(discreteFourierTransform(samples))
    for (let n = 0; n < samples.length; n++) {
      expect(recovered[n]!.re).toBeCloseTo(samples[n]!.re, 10)
      expect(recovered[n]!.im).toBeCloseTo(samples[n]!.im, 10)
    }
  })

  it('handles the empty sequence', () => {
    expect(discreteFourierTransform([])).toEqual([])
    expect(inverseDiscreteFourierTransform([])).toEqual([])
  })
})

describe('fourierSeriesCoefficients (textbook checks)', () => {
  it('square wave: bₙ = 4A/(nπ) for odd n, zeros elsewhere', () => {
    const result = fourierSeriesCoefficients(WaveformKind.Square, 6, 1)
    expect(result.dc).toBeCloseTo(0, 12)
    expect(result.cosine).toEqual([0, 0, 0, 0, 0, 0])
    expect(result.sine[0]).toBeCloseTo(4 / Math.PI, 10)
    expect(result.sine[1]).toBeCloseTo(0, 12)
    expect(result.sine[2]).toBeCloseTo(4 / (3 * Math.PI), 10)
    expect(result.sine[3]).toBeCloseTo(0, 12)
    expect(result.sine[4]).toBeCloseTo(4 / (5 * Math.PI), 10)
  })

  it('triangle wave: b₁ = 8A/π², b₃ = −8A/(9π²)', () => {
    const result = fourierSeriesCoefficients(WaveformKind.Triangle, 3, 1)
    expect(result.sine[0]).toBeCloseTo(8 / (Math.PI * Math.PI), 10)
    expect(result.sine[1]).toBeCloseTo(0, 12) // sin(π) = 0
    expect(result.sine[2]).toBeCloseTo(-8 / (9 * Math.PI * Math.PI), 10) // sin(3π/2) = −1
  })

  it('sawtooth wave: bₙ = 2A(−1)ⁿ⁺¹/(nπ)', () => {
    const result = fourierSeriesCoefficients(WaveformKind.Sawtooth, 3, 1)
    expect(result.sine[0]).toBeCloseTo(2 / Math.PI, 10)
    expect(result.sine[1]).toBeCloseTo(-1 / Math.PI, 10)
    expect(result.sine[2]).toBeCloseTo(2 / (3 * Math.PI), 10)
  })

  it('scales with amplitude', () => {
    const result = fourierSeriesCoefficients(WaveformKind.Square, 1, 5)
    expect(result.sine[0]).toBeCloseTo(20 / Math.PI, 10)
  })
})

describe('windowSamples (textbook checks)', () => {
  it('Hann window: zero endpoints, unit center for odd N', () => {
    const samples = windowSamples(WindowKind.Hann, 5)
    expect(samples[0]).toBeCloseTo(0, 12)
    expect(samples[4]).toBeCloseTo(0, 12)
    expect(samples[2]).toBeCloseTo(1, 10) // center of N = 5
  })

  it('Hamming window: 0.08 endpoints', () => {
    const samples = windowSamples(WindowKind.Hamming, 8)
    expect(samples[0]).toBeCloseTo(0.08, 10)
    expect(samples[7]).toBeCloseTo(0.08, 10)
  })

  it('Blackman window: zero endpoints', () => {
    const samples = windowSamples(WindowKind.Blackman, 8)
    expect(samples[0]).toBeCloseTo(0, 12)
    expect(samples[7]).toBeCloseTo(0, 12)
  })

  it('none window: all ones; length 1 yields [1]', () => {
    expect(windowSamples(WindowKind.None, 5)).toEqual([1, 1, 1, 1, 1])
    expect(windowSamples(WindowKind.Hann, 1)).toEqual([1])
  })

  it('rejects non-positive length', () => {
    expect(() => windowSamples(WindowKind.Hann, 0)).toThrow(/positive/)
  })
})
