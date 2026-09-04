import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  clearRestartRequired,
  deleteDeclaration,
  declarationsPath,
  readDeclarations,
  restartRequired,
  upsertDeclaration,
  validateDeclaration,
} from '../../src/tool.ts'
import {
  DeclarationHttpMethod,
  DeclarationParamType,
  DeclarationTransport,
  type ToolDeclaration,
} from '../../src/tool.ts'

/** A valid http declaration exercising every parameter type. */
const HTTP_TOOL: ToolDeclaration = {
  name: 'sample_echo',
  description: 'Echoes its input over http',
  enabled: true,
  parameters: {
    mode: { type: DeclarationParamType.String, enum: ['a', 'b'], description: 'the mode', required: true },
    gain: { type: DeclarationParamType.Quantity, kind: 'log', description: 'the gain' },
    on: { type: DeclarationParamType.Boolean, description: 'a switch' },
    points: { type: DeclarationParamType.Array, items: { type: DeclarationParamType.Quantity, kind: 'frequency', description: 'one point' }, description: 'the points' },
  },
  transport: DeclarationTransport.Http,
  transportOptions: { url: 'https://example.test/calc', method: DeclarationHttpMethod.Post, headers: { authorization: 'token' } },
  timeoutMs: 5000,
}

/** A valid file-transport declaration. */
const FILE_TOOL: ToolDeclaration = {
  name: 'file_calc',
  description: 'Calculates through a watched directory',
  enabled: true,
  parameters: {},
  transport: DeclarationTransport.File,
  transportOptions: { directory: 'C:\\scratch\\elab', inPrefix: 'req', outPrefix: 'res', pollMs: 50 },
}

let home = ''

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'elab-registry-'))
})

afterEach(() => {
  rmSync(home, { recursive: true, force: true })
})

describe('readDeclarations / upsert / delete', () => {
  it('starts empty and stores declarations in file order', () => {
    expect(readDeclarations(home)).toEqual([])
    upsertDeclaration(home, HTTP_TOOL)
    upsertDeclaration(home, FILE_TOOL)
    const tools = readDeclarations(home)
    expect(tools.map((tool) => tool.name)).toEqual(['sample_echo', 'file_calc'])
  })

  it('upsert replaces by name in place and delete removes by name', () => {
    upsertDeclaration(home, HTTP_TOOL)
    upsertDeclaration(home, { ...HTTP_TOOL, description: 'updated' })
    expect(readDeclarations(home)).toHaveLength(1)
    expect(readDeclarations(home)[0]!.description).toBe('updated')
    expect(deleteDeclaration(home, 'sample_echo')).toBe(true)
    expect(readDeclarations(home)).toEqual([])
    // Deleting an absent name reports false and leaves the archive alone.
    expect(deleteDeclaration(home, 'sample_echo')).toBe(false)
  })

  it('tolerates corrupt lines without blocking the rest', () => {
    writeFileSync(declarationsPath(home), `{not json}\n${JSON.stringify(HTTP_TOOL)}\n`, 'utf8')
    expect(readDeclarations(home).map((tool) => tool.name)).toEqual(['sample_echo'])
  })

  it('sets and clears the restart dirty bit', () => {
    expect(restartRequired(home)).toBe(false)
    upsertDeclaration(home, HTTP_TOOL)
    expect(restartRequired(home)).toBe(true)
    clearRestartRequired(home)
    expect(restartRequired(home)).toBe(false)
    deleteDeclaration(home, 'sample_echo')
    expect(restartRequired(home)).toBe(true)
  })

  it('readDeclarations returns an empty list when the file is missing', () => {
    expect(readDeclarations(home)).toEqual([])
    expect(restartRequired(home)).toBe(false)
  })
})

describe('validateDeclaration', () => {
  it('accepts the full http and file declarations', () => {
    expect(validateDeclaration(HTTP_TOOL)).toEqual([])
    expect(validateDeclaration(FILE_TOOL)).toEqual([])
  })

  it('accepts a declaration without enabled (defaults to enabled at registration)', () => {
    const { enabled: _enabled, ...noFlag } = HTTP_TOOL
    expect(validateDeclaration(noFlag)).toEqual([])
  })

  it('rejects non-object declarations', () => {
    expect(validateDeclaration(null)).toEqual(['declaration must be an object'])
    expect(validateDeclaration('x')).toEqual(['declaration must be an object'])
  })

  it('rejects bad names', () => {
    for (const name of ['Upper', 'has space', 'has-dash', '1starts', 'x'.repeat(65)]) {
      expect(validateDeclaration({ ...HTTP_TOOL, name })).toContain('name must match ^[a-z][a-z0-9_]{0,63}$ (lowercase start)')
    }
  })

  it('rejects a missing description and a non-boolean enabled', () => {
    expect(validateDeclaration({ ...HTTP_TOOL, description: 7 })).toContain('description is required')
    expect(validateDeclaration({ ...HTTP_TOOL, enabled: 'yes' })).toContain('enabled must be a boolean when present')
  })

  it('rejects an unknown transport', () => {
    expect(validateDeclaration({ ...HTTP_TOOL, transport: 'websocket' })).toContain(
      'transport must be one of http, file',
    )
  })

  it('rejects bad timeoutMs', () => {
    expect(validateDeclaration({ ...HTTP_TOOL, timeoutMs: 0 })).toContain('timeoutMs must be a positive number')
    expect(validateDeclaration({ ...HTTP_TOOL, timeoutMs: -1 })).toContain('timeoutMs must be a positive number')
  })

  it('rejects non-object parameters', () => {
    expect(validateDeclaration({ ...HTTP_TOOL, parameters: [] })).toContain('parameters must be an object')
  })

  it('rejects unknown parameter types', () => {
    const errors = validateDeclaration({ ...HTTP_TOOL, parameters: { x: { type: 'float' } } })
    expect(errors.join('; ')).toContain('parameter "x": unknown type "float" (one of quantity, string, boolean, array)')
  })

  it('rejects quantity parameters with an unknown kind', () => {
    const errors = validateDeclaration({ ...HTTP_TOOL, parameters: { x: { type: 'quantity', kind: 'farad' } } })
    expect(errors.join('; ')).toContain('parameter "x": quantity type requires a known kind')
  })

  it('rejects string enums that are not string arrays', () => {
    const errors = validateDeclaration({ ...HTTP_TOOL, parameters: { x: { type: 'string', enum: [1, 2] } } })
    expect(errors.join('; ')).toContain('parameter "x": enum must be a string array')
  })

  it('requires items on array parameters and validates them recursively', () => {
    const missing = validateDeclaration({ ...HTTP_TOOL, parameters: { x: { type: 'array' } } })
    expect(missing.join('; ')).toContain('parameter "x": array type requires an items declaration')
    const nested = validateDeclaration({
      ...HTTP_TOOL,
      parameters: { x: { type: 'array', items: { type: 'array', items: { type: 'quantity', kind: 'bogus' } } } },
    })
    expect(nested.join('; ')).toContain('parameter "x".items.items: quantity type requires a known kind')
  })

  it('accepts deeply nested homogeneous arrays', () => {
    const errors = validateDeclaration({
      ...HTTP_TOOL,
      parameters: { x: { type: 'array', items: { type: 'array', items: { type: 'quantity', kind: 'voltage' } } } },
    })
    expect(errors).toEqual([])
  })

  it('rejects bad http transportOptions', () => {
    expect(validateDeclaration({ ...HTTP_TOOL, transportOptions: {} })).toContain('transportOptions.url must be an http(s) URL')
    expect(validateDeclaration({ ...HTTP_TOOL, transportOptions: { url: 'ftp://x' } })).toContain('transportOptions.url must be an http(s) URL')
    expect(validateDeclaration({ ...HTTP_TOOL, transportOptions: { url: 'https://x', method: 'PUT' } })).toContain(
      'transportOptions.method must be one of GET, POST',
    )
  })

  it('rejects bad file transportOptions', () => {
    expect(validateDeclaration({ ...FILE_TOOL, transportOptions: {} })).toContain('transportOptions.directory is required for file transport')
    expect(validateDeclaration({ ...FILE_TOOL, transportOptions: { directory: 'C:\\x', pollMs: 0 } })).toContain(
      'transportOptions.pollMs must be a positive number',
    )
  })

  it('requires transportOptions', () => {
    const { transportOptions: _options, ...rest } = HTTP_TOOL
    expect(validateDeclaration(rest)).toEqual(['transportOptions is required'])
  })
})
