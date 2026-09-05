/**
 * Frequency-domain solvers (migrated from tools/dft-tools.ts): DFT/IDFT over
 * complex sequences, Fourier series of standard waveforms, and the combined
 * signal-analysis stats + spectrum call. Sequences are arrays of kind-none
 * quantities; stats values are kind none too.
 */
import type { Complex } from 'complex.js'
import {
  WaveformKind,
  WindowKind,
  applyWindow,
  calcDiscreteFourierTransform,
  calcFourierSeriesCoeffs,
  calcInvDiscreteFourierTransform,
  calcSignalAnalysis,
  calcWindowSamples,
} from '../../math/dft.ts'
import { serializeComplex, toComplex, toScalar, type ValuePayload } from '../../math/convert.ts'
import { QuantityKind } from '../../math/quantity-kind.ts'
import type { SolverDef } from '../registry.ts'

/** Kernel complex value → engine-native rect (finite-checked, -0 folded). */
function rectOf(value: Complex): { re: number; im: number } {
  const snapshot = serializeComplex(value, QuantityKind.None)
  return { re: snapshot.re, im: snapshot.im }
}

const sequenceArray = { type: 'array' as const, items: { type: 'quantity' as const, kind: QuantityKind.None } }

const windowParam = {
  type: 'string' as const,
  enum: [WindowKind.None, WindowKind.Hann, WindowKind.Hamming, WindowKind.Blackman],
  optional: true as const,
}

export const dftSolvers: SolverDef[] = [
  {
    id: 'discrete_fourier_transform',
    summary: 'DFT of a complex sample sequence (optionally windowed)',
    parameters: {
      samples: sequenceArray,
      window: windowParam,
    },
    returns: {
      type: 'object',
      fields: {
        window: { type: 'string' },
        spectrum: { type: 'array', items: { type: 'quantity', kind: QuantityKind.None } },
      },
    },
    run: (args) => {
      const window = (args.window as WindowKind | undefined) ?? WindowKind.None
      const samples = (args.samples as ValuePayload[]).map((sample) => toComplex(sample))
      const weighted = applyWindow(samples, calcWindowSamples(window, samples.length))
      return {
        window,
        spectrum: calcDiscreteFourierTransform(weighted).map((bin) => rectOf(bin)),
      }
    },
  },
  {
    id: 'inverse_discrete_fourier_transform',
    summary: 'IDFT of a spectrum: recovers the time-domain sequence (round-trip of the DFT)',
    parameters: {
      spectrum: sequenceArray,
    },
    returns: {
      type: 'object',
      fields: {
        samples: { type: 'array', items: { type: 'quantity', kind: QuantityKind.None } },
      },
    },
    run: (args) => {
      const spectrum = (args.spectrum as ValuePayload[]).map((bin) => toComplex(bin))
      return {
        samples: calcInvDiscreteFourierTransform(spectrum).map((sample) => rectOf(sample)),
      }
    },
  },
  {
    id: 'fourier_series_coefficients',
    summary: 'Fourier series coefficients (a₀, aₙ, bₙ) of a standard odd-symmetric waveform',
    parameters: {
      waveform: { type: 'string', enum: [WaveformKind.Square, WaveformKind.Triangle, WaveformKind.Sawtooth] },
      harmonics: { type: 'quantity', kind: QuantityKind.None },
      amplitude: { type: 'quantity', kind: QuantityKind.None, optional: true },
    },
    returns: {
      type: 'object',
      fields: {
        waveform: { type: 'string' },
        harmonics: { type: 'quantity', kind: QuantityKind.None },
        dc: { type: 'quantity', kind: QuantityKind.None },
        cosine: { type: 'array', items: { type: 'quantity', kind: QuantityKind.None } },
        sine: { type: 'array', items: { type: 'quantity', kind: QuantityKind.None } },
      },
    },
    run: (args) => {
      const waveform = args.waveform as WaveformKind
      const harmonics = args.harmonics as number
      const amplitude = args.amplitude === undefined ? 1 : toScalar(args.amplitude as ValuePayload)
      const coefficients = calcFourierSeriesCoeffs(waveform, harmonics, amplitude)
      return {
        waveform,
        harmonics,
        dc: coefficients.dc,
        cosine: coefficients.cosine,
        sine: coefficients.sine,
      }
    },
  },
  {
    id: 'signal_analysis',
    summary: 'Signal statistics plus the windowed spectrum in one call (RMS, peak, peak-to-peak, DC)',
    parameters: {
      samples: sequenceArray,
      window: windowParam,
    },
    returns: {
      type: 'object',
      fields: {
        window: { type: 'string' },
        rms: { type: 'quantity', kind: QuantityKind.None },
        peak: { type: 'quantity', kind: QuantityKind.None },
        peakToPeak: { type: 'quantity', kind: QuantityKind.None },
        dc: { type: 'quantity', kind: QuantityKind.None },
        spectrum: { type: 'array', items: { type: 'quantity', kind: QuantityKind.None } },
      },
    },
    run: (args) => {
      const window = (args.window as WindowKind | undefined) ?? WindowKind.None
      const samples = (args.samples as ValuePayload[]).map((sample) => toComplex(sample))
      const result = calcSignalAnalysis(samples, window)
      return {
        window,
        rms: result.rms,
        peak: result.peak,
        peakToPeak: result.peakToPeak,
        dc: result.dc,
        spectrum: result.spectrum.map((bin) => rectOf(bin)),
      }
    },
  },
]
