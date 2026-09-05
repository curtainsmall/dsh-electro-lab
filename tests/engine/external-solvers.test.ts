import { describe, expect, it } from 'vitest'
import { compileExternalSolver } from '../../src/engine/external-solvers.ts'
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

describe('compileExternalSolver', () => {
  it('maps a declaration with an object returns into an external SolverDef', () => {
    const solver = compileExternalSolver({
      ...BASE,
      returns: { type: 'object', fields: { message: { type: 'string' }, count: { type: 'number', kind: QuantityKind.None } } },
    })
    expect(solver).not.toBeNull()
    expect(solver!.id).toBe('sample_echo')
    expect(solver!.external).toMatchObject({ transport: 'http' })
    expect(solver!.returns).toEqual({
      type: 'object',
      fields: { message: { type: 'string' }, count: { type: 'quantity', kind: 'none' } },
    })
  })

  it('registers returns: null as a void solver (explicit)', () => {
    const solver = compileExternalSolver({ ...BASE, returns: null })
    expect(solver).not.toBeNull()
    expect(solver!.returns).toBeNull()
  })

  it('rejects a missing returns (a declaration without one never registers)', () => {
    expect(() => compileExternalSolver(BASE)).toThrow(/needs an explicit returns/)
  })

  it('rejects the unmappable any leaf', () => {
    expect(() => compileExternalSolver({ ...BASE, returns: { type: 'any' } })).toThrow(/cannot be mapped/)
  })

  it('maps a complex leaf with kind and the either form', () => {
    const solver = compileExternalSolver({ ...BASE, returns: { type: 'complex', kind: QuantityKind.Voltage } })
    expect(solver!.returns).toEqual({ type: 'quantity', kind: 'voltage', form: 'either' })
  })
})
