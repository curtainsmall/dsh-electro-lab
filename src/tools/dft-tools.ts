/**
 * Frequency-domain tools: DFT/IDFT over complex sequences, Fourier series
 * of standard waveforms, and window functions. IO is JSON-and-complex-only;
 * sequences are arrays of kind-'none' value snapshots.
 */
import { Complex } from 'complex.js'
import {
  WaveformKind,
  WindowKind,
  applyWindow,
  calcDiscreteFourierTransform,
  calcFourierSeriesCoeffs,
  calcInvDiscreteFourierTransform,
  calcSignalAnalysis,
  calcWindowSamples,
} from '../math/dft.ts'
import { toComplex, toScalar, serializeComplex, serializeReal } from '../math/convert.ts'
import { QuantityKind } from '../math/quantity-kind.ts'
import { defineJsonTool, createValueParam } from './helpers.ts'

const createSequenceParam = (description: string) => ({
  type: 'array' as const,
  description,
  items: createValueParam(QuantityKind.None, 'value (kind none)'),
})

export const dftTools = [
  defineJsonTool({
    name: 'discrete_fourier_transform',
    description: 'DFT of a complex sample sequence: X[k] = Σ x[n]·e^(−j2πkn/N). Bin k corresponds to frequency k·fs/N with sample rate fs. Returns the complex spectrum (magnitude/phase per bin via the value snapshots).',
    parameters: {
      samples: { ...createSequenceParam('time-domain samples, kind none'), required: true },
      window: {
        type: 'string',
        enum: [WindowKind.None, WindowKind.Hann, WindowKind.Hamming, WindowKind.Blackman],
        description: 'window applied before the transform (default none)',
      },
    },
    execute: (args) => {
      const window = args.window ?? WindowKind.None
      const samples = args.samples.map((sample) => toComplex(sample, QuantityKind.None))
      const weighted = applyWindow(samples, calcWindowSamples(window, samples.length))
      return {
        window,
        spectrum: calcDiscreteFourierTransform(weighted).map((bin) => serializeComplex(bin, QuantityKind.None)),
      }
    },
  }),
  defineJsonTool({
    name: 'inverse_discrete_fourier_transform',
    description: 'IDFT of a spectrum: x[n] = (1/N)·Σ X[k]·e^(+j2πkn/N). Recovers the time-domain sequence (round-trip of discrete_fourier_transform).',
    parameters: {
      spectrum: { ...createSequenceParam('spectral bins, kind none'), required: true },
    },
    execute: (args) => {
      const spectrum = args.spectrum.map((bin) => toComplex(bin, QuantityKind.None))
      return {
        samples: calcInvDiscreteFourierTransform(spectrum).map((sample) => serializeComplex(sample, QuantityKind.None)),
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
      amplitude: { ...createValueParam(QuantityKind.None, 'peak amplitude (default 1)') },
    },
    execute: (args) => {
      const amplitude = args.amplitude === undefined ? 1 : toScalar(args.amplitude, QuantityKind.None)
      const coefficients = calcFourierSeriesCoeffs(args.waveform, args.harmonics, amplitude)
      return {
        waveform: args.waveform,
        harmonics: args.harmonics,
        dc: serializeReal(coefficients.dc, QuantityKind.None),
        cosine: coefficients.cosine.map((value) => serializeReal(value, QuantityKind.None)),
        sine: coefficients.sine.map((value) => serializeReal(value, QuantityKind.None)),
      }
    },
  }),
  defineJsonTool({
    name: 'signal_analysis',
    description: 'Signal statistics plus the windowed spectrum in one call: RMS, peak, peak-to-peak, DC component, and the DFT spectrum of the windowed samples (magnitude/phase per bin via the value snapshots).',
    parameters: {
      samples: { ...createSequenceParam('time-domain samples, kind none'), required: true },
      window: {
        type: 'string',
        enum: [WindowKind.None, WindowKind.Hann, WindowKind.Hamming, WindowKind.Blackman],
        description: 'window applied before the transform (default none)',
      },
    },
    execute: (args) => {
      const window = args.window ?? WindowKind.None
      const samples = args.samples.map((sample) => toComplex(sample, QuantityKind.None))
      const result = calcSignalAnalysis(samples, window)
      return {
        window,
        rms: serializeReal(result.rms, QuantityKind.None),
        peak: serializeReal(result.peak, QuantityKind.None),
        peakToPeak: serializeReal(result.peakToPeak, QuantityKind.None),
        dc: serializeReal(result.dc, QuantityKind.None),
        spectrum: result.spectrum.map((bin) => serializeComplex(bin, QuantityKind.None)),
      }
    },
  }),
]
