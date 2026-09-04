import { afterEach, describe, expect, it } from 'vitest'
import { compileDeclaration, kindByName } from '../../src/tool.ts'
import { TOOL_RETURNS } from '../../src/tool.ts'
import { QuantityKind } from '../../src/math/quantity-kind.ts'
import {
  DeclarationHttpMethod,
  DeclarationParamType,
  DeclarationTransport,
  type ToolDeclaration,
} from '../../src/tool.ts'

/** One http declaration exercising every parameter type plus returns. */
const CONFIG: ToolDeclaration = {
  name: 'sample_echo',
  description: 'Echoes its input over http',
  enabled: true,
  parameters: {
    mode: { type: DeclarationParamType.String, enum: ['a', 'b'], description: 'the mode', required: true },
    gain: { type: DeclarationParamType.Quantity, kind: 'log', description: 'the gain' },
    on: { type: DeclarationParamType.Boolean, description: 'a switch' },
    points: { type: DeclarationParamType.Array, items: { type: DeclarationParamType.Quantity, kind: 'frequency', description: 'one point' }, description: 'the points' },
    tags: { type: DeclarationParamType.Array, items: { type: DeclarationParamType.String }, description: 'the tags' },
  },
  transport: DeclarationTransport.Http,
  transportOptions: { url: 'https://example.test/calc', method: DeclarationHttpMethod.Post },
  returns: { type: 'object', fields: { total: { type: 'number', kind: QuantityKind.Power } } },
}

afterEach(() => {
  TOOL_RETURNS.delete('sample_echo')
})

describe('kindByName', () => {
  it('maps lowercase names to QuantityKind members', () => {
    expect(kindByName('resistance')).toBe(QuantityKind.Resistance)
    expect(kindByName('amount-of-substance')).toBe(QuantityKind.AmountOfSubstance)
    expect(kindByName('none')).toBe(QuantityKind.None)
  })

  it('throws for unknown kinds', () => {
    expect(() => kindByName('farad')).toThrow(/unknown kind "farad"/)
  })
})

describe('compileDeclaration', () => {
  it('emits a tool definition with name, description and object-rooted parameters', () => {
    const tool = compileDeclaration(CONFIG)
    expect(tool.name).toBe('sample_echo')
    expect(tool.description).toContain('Echoes')
    expect(tool.parameters).toMatchObject({ type: 'object' })
    expect((tool.parameters as { properties: Record<string, unknown> }).properties).toBeDefined()
    expect(typeof tool.execute).toBe('function')
  })

  it('encodes quantity parameters as the three-branch oneOf value shape', () => {
    const properties = (compileDeclaration(CONFIG).parameters as { properties: Record<string, unknown> }).properties
    const gain = properties.gain as { oneOf: Array<Record<string, unknown>> }
    expect(gain.oneOf).toHaveLength(3)
    expect(gain.oneOf[0]).toMatchObject({ type: 'number' })
    expect((gain.oneOf[1] as { properties: Record<string, unknown> }).properties.re).toBeDefined()
    expect((gain.oneOf[2] as { properties: Record<string, unknown> }).properties.ang).toBeDefined()
  })

  it('passes string enums and boolean schemas through', () => {
    const properties = (compileDeclaration(CONFIG).parameters as { properties: Record<string, unknown> }).properties
    expect(properties.mode).toMatchObject({ type: 'string', enum: ['a', 'b'] })
    expect(properties.on).toMatchObject({ type: 'boolean' })
  })

  it('recurses array parameters into array items with the same oneOf shape', () => {
    const properties = (compileDeclaration(CONFIG).parameters as { properties: Record<string, unknown> }).properties
    const points = properties.points as { type: string; items: { oneOf: Array<Record<string, unknown>> } }
    expect(points.type).toBe('array')
    expect(points.items.oneOf).toHaveLength(3)
    expect(points.items.oneOf[0]).toMatchObject({ type: 'number' })
    const tags = properties.tags as { type: string; items: { type: string } }
    expect(tags.type).toBe('array')
    expect(tags.items).toMatchObject({ type: 'string' })
  })

  it('marks required parameters in the root required list', () => {
    const parameters = compileDeclaration(CONFIG).parameters as { required?: string[] }
    expect(parameters.required).toContain('mode')
  })

  it('stores the returns declaration in TOOL_RETURNS', () => {
    const tool = compileDeclaration(CONFIG)
    expect(TOOL_RETURNS.get('sample_echo')).toEqual(CONFIG.returns)
    TOOL_RETURNS.delete(tool.name)
  })
})
