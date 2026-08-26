import { describe, expect, it } from 'vitest'
import { Complex } from 'complex.js'
import {
  OpampConfiguration,
  calcLedResistor,
  calcOpamp,
  calcTimeConstant,
  calcVoltageDivider,
} from '../../src/math/electronics.ts'

describe('op-amp configurations (known-value checks)', () => {
  it('inverting: gain = −Rf/Rin', () => {
    const result = calcOpamp(OpampConfiguration.Inverting, { feedbackResistance: 10e3, inputResistance: 1e3, inputVoltage: 0.5 })
    expect(result.gain!.re).toBeCloseTo(-10, 10)
    expect(result.outputVoltage!.re).toBeCloseTo(-5, 10)
  })

  it('non-inverting: gain = 1 + Rf/Rin', () => {
    const result = calcOpamp(OpampConfiguration.NonInverting, { feedbackResistance: 9e3, inputResistance: 1e3, inputVoltage: 0.5 })
    expect(result.gain!.re).toBeCloseTo(10, 10)
    expect(result.outputVoltage!.re).toBeCloseTo(5, 10)
  })

  it('voltage follower: gain 1', () => {
    const result = calcOpamp(OpampConfiguration.VoltageFollower, { inputVoltage: 3.3 })
    expect(result.gain!.re).toBeCloseTo(1, 10)
    expect(result.outputVoltage!.re).toBeCloseTo(3.3, 10)
  })

  it('summing: Vout = −Rf(V₁/R₁ + V₂/R₂)', () => {
    const result = calcOpamp(OpampConfiguration.Summing, {
      feedbackResistance: 10e3,
      inputResistance: 10e3,
      secondInputResistance: 5e3,
      inputVoltage: 1,
      secondInputVoltage: 2,
    })
    expect(result.outputVoltage!.re).toBeCloseTo(-10e3 * (1 / 10e3 + 2 / 5e3), 8) // −5 V
  })

  it('difference: Vout = (Rf/R1)(V₂−V₁)', () => {
    const result = calcOpamp(OpampConfiguration.Difference, {
      feedbackResistance: 10e3,
      inputResistance: 10e3,
      inputVoltage: 1,
      secondInputVoltage: 3,
    })
    expect(result.gain!.re).toBeCloseTo(1, 10)
    expect(result.outputVoltage!.re).toBeCloseTo(2, 10)
  })

  it('integrator: H(jω) = −1/(jωRC) → magnitude 1/(ωRC), phase −90°', () => {
    // R = 10 kΩ, C = 1 nF, f = 15.9 kHz → ωRC = 1
    const result = calcOpamp(OpampConfiguration.Integrator, {
      inputResistance: 10e3,
      capacitance: 1e-9,
      frequency: 15915.5,
      inputVoltage: 1,
    })
    expect(result.gain!.abs()).toBeCloseTo(1, 1)
    expect(result.gain!.arg()).toBeCloseTo(Math.PI / 2, 4) // 1/(−j) = +j → +90°
  })

  it('differentiator: H(jω) = −jωRC → phase −90°', () => {
    const result = calcOpamp(OpampConfiguration.Differentiator, {
      feedbackResistance: 10e3,
      capacitance: 1e-9,
      frequency: 15915.5,
      inputVoltage: 1,
    })
    expect(result.gain!.abs()).toBeCloseTo(1, 1)
    expect(result.gain!.arg()).toBeCloseTo(-Math.PI / 2, 4)
  })

  it('rejects missing parameters per configuration', () => {
    expect(() => calcOpamp(OpampConfiguration.Inverting, { inputVoltage: 1 })).toThrow(/inverting configuration/)
    expect(() => calcOpamp(OpampConfiguration.Summing, { inputVoltage: 1 })).toThrow(/summing/)
  })
})

describe('time constant (known-value checks)', () => {
  it('RC: τ = R·C, fc = 1/(2πτ)', () => {
    const result = calcTimeConstant(1e3, 1e-6)
    expect(result.timeConstant).toBeCloseTo(1e-3, 12)
    expect(result.cutoffFrequency).toBeCloseTo(1 / (2 * Math.PI * 1e-3), 8) // 159.15 Hz
  })

  it('RL: τ = L/R', () => {
    const result = calcTimeConstant(100, undefined, 1e-3)
    expect(result.timeConstant).toBeCloseTo(1e-5, 12)
  })

  it('rejects both or neither reactive element', () => {
    expect(() => calcTimeConstant(1e3, 1e-6, 1e-3)).toThrow(/exactly one/)
    expect(() => calcTimeConstant(1e3)).toThrow(/exactly one/)
  })
})

describe('voltage divider (known-value checks)', () => {
  it('unloaded: Vout = Vs·R2/(R1+R2)', () => {
    const result = calcVoltageDivider(10, 10e3, 10e3)
    expect(result.outputVoltage).toBeCloseTo(5, 10)
    expect(result.outputResistance).toBeCloseTo(5e3, 10)
  })

  it('loaded divider sags toward the load', () => {
    // R2 = 10k with RL = 10k → R2∥RL = 5k → Vout = 10·5/(10+5) = 3.333 V
    const result = calcVoltageDivider(10, 10e3, 10e3, 10e3)
    expect(result.outputVoltage).toBeCloseTo(3.3333, 3)
    expect(result.unloadedOutputVoltage).toBeCloseTo(5, 10)
    expect(result.loadCurrent).toBeCloseTo(3.3333 / 10e3, 8) // 333 µA
  })

  it('rejects non-positive resistances', () => {
    expect(() => calcVoltageDivider(10, 0, 10e3)).toThrow(/resistances/)
  })
})

describe('LED resistor (known-value checks)', () => {
  it('5 V supply, 2 V forward, 20 mA → 150 Ω, 60 mW', () => {
    const result = calcLedResistor(5, 2, 20e-3)
    expect(result.resistance).toBeCloseTo(150, 10)
    expect(result.power).toBeCloseTo(0.06, 12)
  })

  it('rejects insufficient supply voltage', () => {
    expect(() => calcLedResistor(2, 2, 20e-3)).toThrow(/forward voltage/)
  })
})
