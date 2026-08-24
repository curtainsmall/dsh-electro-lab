/**
 * Frequency-domain tools: DFT/IDFT over complex sequences, Fourier series
 * of standard waveforms, and window functions. IO is JSON-and-complex-only;
 * sequences are arrays of unit-'none' value snapshots.
 */
import { Complex } from 'complex.js'
import {
  WaveformKind,
  WindowKind,
  discreteFourierTransform,
  fourierSeriesCoefficients,
  inverseDiscreteFourierTransform,
  windowSamples,
} from '../math/dft.ts'
import { toComplex, toScalar, serializeComplex, realValue } from '../math/convert.ts'
import { Unit } from '../math/units.ts'
import { defineJsonTool, valueParam } from './helpers.ts'

const sequenceParam = (description: string) => ({
  type: 'array' as const,
  description,
  items: valueParam(Unit.None, 'value (unit none)'),
})

export const dftTools = [
  defineJsonTool({
    name: 'discrete_fourier_transform',
    description: 'DFT of a complex sample sequence: X[k] = Σ x[n]·e^(−j2πkn/N). Bin k corresponds to frequency k·fs/N with sample rate fs. Returns the complex spectrum (magnitude/phase per bin via the value snapshots).',
    parameters: {
      samples: { ...sequenceParam('time-domain samples, unit none'), required: true },
      window: {
        type: 'string',
        enum: [WindowKind.None, WindowKind.Hann, WindowKind.Hamming, WindowKind.Blackman],
        description: 'window applied before the transform (default none)',
      },
    },
    execute: (args) => {
      const window = args.window ?? WindowKind.None
      const samples = args.samples.map((sample) => toComplex(sample, Unit.None))
      const weights = windowSamples(window, samples.length)
      const weighted = samples.map((sample, i) => sample.mul(weights[i]!))
      return {
        window,
        spectrum: discreteFourierTransform(weighted).map((bin) => serializeComplex(bin, Unit.None)),
      }
    },
  }),
  defineJsonTool({
    name: 'inverse_discrete_fourier_transform',
    description: 'IDFT of a spectrum: x[n] = (1/N)·Σ X[k]·e^(+j2πkn/N). Recovers the time-domain sequence (round-trip of discrete_fourier_transform).',
    parameters: {
      spectrum: { ...sequenceParam('spectral bins, unit none'), required: true },
    },
    execute: (args) => {
      const spectrum = args.spectrum.map((bin) => toComplex(bin, Unit.None))
      return {
        samples: inverseDiscreteFourierTransform(spectrum).map((sample) => serializeComplex(sample, Unit.None)),
      }
    },
  }),
  defineJsonTool({
    name: 'fourier_series_coefficients',
    description: 'Fourier series coefficients (a₀, aₙ, bₙ for n = 1..harmonics) of a standard odd-symmetric periodic waveform with a peak amplitude (default 1). Square: bₙ = 4A/(nπ) odd n; triangle: bₙ = 8A·sin(nπ/2)/(n²π²); sawtooth: bₙ = 2A·(−1)ⁿ⁺¹/(nπ). All cosine terms and the DC are 0.',
    parameters: {
      waveform: {
        type: 'string',
        enum: [WaveformKind.Square, WaveformKind.Triangle, WaveformKind.Sawtooth],
        description: 'standard periodic waveform',
        required: true,
      },
      harmonics: { type: 'number', description: 'number of harmonics to compute', required: true },
      amplitude: { ...valueParam(Unit.None, 'peak amplitude (default 1)') },
    },
    execute: (args) => {
      const amplitude = args.amplitude === undefined ? 1 : toScalar(args.amplitude, Unit.None)
      const coefficients = fourierSeriesCoefficients(args.waveform, args.harmonics, amplitude)
      return {
        waveform: args.waveform,
        harmonics: args.harmonics,
        dc: realValue(coefficients.dc, Unit.None),
        cosine: coefficients.cosine.map((value) => realValue(value, Unit.None)),
        sine: coefficients.sine.map((value) => realValue(value, Unit.None)),
      }
    },
  }),
  defineJsonTool({
    name: 'window_function',
    description: 'Window coefficients for a length-N sequence: none (all 1), Hann 0.5(1−cos(2πn/(N−1))), Hamming 0.54−0.46·cos, Blackman 0.42−0.5·cos+0.08·cos(2θ). Apply before discrete_fourier_transform to reduce spectral leakage.',
    parameters: {
      window: {
        type: 'string',
        enum: [WindowKind.None, WindowKind.Hann, WindowKind.Hamming, WindowKind.Blackman],
        description: 'window family',
        required: true,
      },
      length: { type: 'number', description: 'sequence length N', required: true },
    },
    execute: (args) => {
      return {
        window: args.window,
        length: args.length,
        samples: windowSamples(args.window, args.length).map((value) => realValue(value, Unit.None)),
      }
    },
  }),
]
