import { describe, expect, it } from 'vitest'
import { compileExternalFn } from '../../src/machine/external-fns.ts'
import { QuantityKind } from '../../src/math/quantity-kind.ts'
import { DeclarationHttpMethod, DeclarationParamType, DeclarationTransport, type ToolDeclaration } from '../../src/tool.ts'

const BASE: ToolDeclaration = {
  name: 'sample_echo',
  description: 'sample',
  enabled: true,
  parameters: {
    message: { type: DeclarationParamType.String, required: true },
    count: { type: DeclarationParamType.Quantity, kind: QuantityKind.None },
  },
  transport: DeclarationTransport.Http,
  transportOptions: { url: 'http://127.0.0.1:1/x', method: DeclarationHttpMethod.Post },
}

describe('compileExternalFn', () => {
  it('maps a declaration with an object returns into an external FnDef', () => {
    const fn = compileExternalFn({
      ...BASE,
      returns: { type: 'object', fields: { message: { type: 'string' }, count: { type: 'number', kind: QuantityKind.None } } },
    })
    expect(fn).not.toBeNull()
    expect(fn!.id).toBe('sample_echo')
    expect(fn!.external).toMatchObject({ transport: 'http' })
    expect(fn!.returns).toEqual({
      type: 'object',
      fields: { message: { type: 'string' }, count: { type: 'quantity', kind: 'none' } },
    })
  })

  it('registers returns: null as a void fn (explicit)', () => {
    const fn = compileExternalFn({ ...BASE, returns: null })
    expect(fn).not.toBeNull()
    expect(fn!.returns).toBeNull()
  })

  it('rejects a missing returns (a declaration without one never registers)', () => {
    expect(() => compileExternalFn(BASE)).toThrow(/needs an explicit returns/)
  })

  it('rejects the unmappable any leaf', () => {
    expect(() => compileExternalFn({ ...BASE, returns: { type: 'any' } })).toThrow(/cannot be mapped/)
  })

  it('maps a complex leaf with kind and the either form', () => {
    const fn = compileExternalFn({ ...BASE, returns: { type: 'complex', kind: QuantityKind.Voltage } })
    expect(fn!.returns).toEqual({ type: 'quantity', kind: 'voltage', form: 'either' })
  })
})
