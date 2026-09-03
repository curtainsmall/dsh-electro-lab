import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  clearRestartRequired,
  deleteExternalTool,
  externalToolsPath,
  readExternalTools,
  restartRequired,
  upsertExternalTool,
  validateExternalTool,
} from '../../src/external-tool/registry.ts'
import {
  ExternalHttpMethod,
  ExternalParamType,
  ExternalTransport,
  type ExternalToolConfig,
} from '../../src/external-tool/types.ts'

/** A valid http declaration exercising every parameter type. */
const HTTP_TOOL: ExternalToolConfig = {
  name: 'sample_echo',
  description: 'Echoes its input over http',
  enabled: true,
  parameters: {
    mode: { type: ExternalParamType.String, enum: ['a', 'b'], description: 'the mode', required: true },
    gain: { type: ExternalParamType.Quantity, kind: 'log', description: 'the gain' },
    on: { type: ExternalParamType.Boolean, description: 'a switch' },
    points: { type: ExternalParamType.Array, items: { type: ExternalParamType.Quantity, kind: 'frequency', description: 'one point' }, description: 'the points' },
  },
  transport: ExternalTransport.Http,
  transportOptions: { url: 'https://example.test/calc', method: ExternalHttpMethod.Post, headers: { authorization: 'token' } },
  timeoutMs: 5000,
}

/** A valid file-transport declaration. */
const FILE_TOOL: ExternalToolConfig = {
  name: 'file_calc',
  description: 'Calculates through a watched directory',
  enabled: true,
  parameters: {},
  transport: ExternalTransport.File,
  transportOptions: { directory: 'C:\\scratch\\elab', inPrefix: 'req', outPrefix: 'res', pollMs: 50 },
}

let home = ''

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'elab-registry-'))
})

afterEach(() => {
  rmSync(home, { recursive: true, force: true })
})

describe('readExternalTools / upsert / delete', () => {
  it('starts empty and stores declarations in file order', () => {
    expect(readExternalTools(home)).toEqual([])
    upsertExternalTool(home, HTTP_TOOL)
    upsertExternalTool(home, FILE_TOOL)
    const tools = readExternalTools(home)
    expect(tools.map((tool) => tool.name)).toEqual(['sample_echo', 'file_calc'])
  })

  it('upsert replaces by name in place and delete removes by name', () => {
    upsertExternalTool(home, HTTP_TOOL)
    upsertExternalTool(home, { ...HTTP_TOOL, description: 'updated' })
    expect(readExternalTools(home)).toHaveLength(1)
    expect(readExternalTools(home)[0]!.description).toBe('updated')
    expect(deleteExternalTool(home, 'sample_echo')).toBe(true)
    expect(readExternalTools(home)).toEqual([])
    // Deleting an absent name reports false and leaves the archive alone.
    expect(deleteExternalTool(home, 'sample_echo')).toBe(false)
  })

  it('tolerates corrupt lines without blocking the rest', () => {
    writeFileSync(externalToolsPath(home), `{not json}\n${JSON.stringify(HTTP_TOOL)}\n`, 'utf8')
    expect(readExternalTools(home).map((tool) => tool.name)).toEqual(['sample_echo'])
  })

  it('sets and clears the restart dirty bit', () => {
    expect(restartRequired(home)).toBe(false)
    upsertExternalTool(home, HTTP_TOOL)
    expect(restartRequired(home)).toBe(true)
    clearRestartRequired(home)
    expect(restartRequired(home)).toBe(false)
    deleteExternalTool(home, 'sample_echo')
    expect(restartRequired(home)).toBe(true)
  })

  it('readExternalTools returns an empty list when the file is missing', () => {
    expect(readExternalTools(home)).toEqual([])
    expect(restartRequired(home)).toBe(false)
  })
})

describe('validateExternalTool', () => {
  it('accepts the full http and file declarations', () => {
    expect(validateExternalTool(HTTP_TOOL)).toEqual([])
    expect(validateExternalTool(FILE_TOOL)).toEqual([])
  })

  it('accepts a declaration without enabled (defaults to enabled at registration)', () => {
    const { enabled: _enabled, ...noFlag } = HTTP_TOOL
    expect(validateExternalTool(noFlag)).toEqual([])
  })

  it('rejects non-object declarations', () => {
    expect(validateExternalTool(null)).toEqual(['declaration must be an object'])
    expect(validateExternalTool('x')).toEqual(['declaration must be an object'])
  })

  it('rejects bad names', () => {
    for (const name of ['Upper', 'has space', 'has-dash', '1starts', 'x'.repeat(65)]) {
      expect(validateExternalTool({ ...HTTP_TOOL, name })).toContain('name must match ^[a-z][a-z0-9_]{0,63}$ (lowercase start)')
    }
  })

  it('rejects a missing description and a non-boolean enabled', () => {
    expect(validateExternalTool({ ...HTTP_TOOL, description: 7 })).toContain('description is required')
    expect(validateExternalTool({ ...HTTP_TOOL, enabled: 'yes' })).toContain('enabled must be a boolean when present')
  })

  it('rejects an unknown transport', () => {
    expect(validateExternalTool({ ...HTTP_TOOL, transport: 'websocket' })).toContain(
      'transport must be one of http, file',
    )
  })

  it('rejects bad timeoutMs', () => {
    expect(validateExternalTool({ ...HTTP_TOOL, timeoutMs: 0 })).toContain('timeoutMs must be a positive number')
    expect(validateExternalTool({ ...HTTP_TOOL, timeoutMs: -1 })).toContain('timeoutMs must be a positive number')
  })

  it('rejects non-object parameters', () => {
    expect(validateExternalTool({ ...HTTP_TOOL, parameters: [] })).toContain('parameters must be an object')
  })

  it('rejects unknown parameter types', () => {
    const errors = validateExternalTool({ ...HTTP_TOOL, parameters: { x: { type: 'float' } } })
    expect(errors.join('; ')).toContain('parameter "x": unknown type "float" (one of quantity, string, boolean, array)')
  })

  it('rejects quantity parameters with an unknown kind', () => {
    const errors = validateExternalTool({ ...HTTP_TOOL, parameters: { x: { type: 'quantity', kind: 'farad' } } })
    expect(errors.join('; ')).toContain('parameter "x": quantity type requires a known kind')
  })

  it('rejects string enums that are not string arrays', () => {
    const errors = validateExternalTool({ ...HTTP_TOOL, parameters: { x: { type: 'string', enum: [1, 2] } } })
    expect(errors.join('; ')).toContain('parameter "x": enum must be a string array')
  })

  it('requires items on array parameters and validates them recursively', () => {
    const missing = validateExternalTool({ ...HTTP_TOOL, parameters: { x: { type: 'array' } } })
    expect(missing.join('; ')).toContain('parameter "x": array type requires an items declaration')
    const nested = validateExternalTool({
      ...HTTP_TOOL,
      parameters: { x: { type: 'array', items: { type: 'array', items: { type: 'quantity', kind: 'bogus' } } } },
    })
    expect(nested.join('; ')).toContain('parameter "x".items.items: quantity type requires a known kind')
  })

  it('accepts deeply nested homogeneous arrays', () => {
    const errors = validateExternalTool({
      ...HTTP_TOOL,
      parameters: { x: { type: 'array', items: { type: 'array', items: { type: 'quantity', kind: 'voltage' } } } },
    })
    expect(errors).toEqual([])
  })

  it('rejects bad http transportOptions', () => {
    expect(validateExternalTool({ ...HTTP_TOOL, transportOptions: {} })).toContain('transportOptions.url must be an http(s) URL')
    expect(validateExternalTool({ ...HTTP_TOOL, transportOptions: { url: 'ftp://x' } })).toContain('transportOptions.url must be an http(s) URL')
    expect(validateExternalTool({ ...HTTP_TOOL, transportOptions: { url: 'https://x', method: 'PUT' } })).toContain(
      'transportOptions.method must be one of GET, POST',
    )
  })

  it('rejects bad file transportOptions', () => {
    expect(validateExternalTool({ ...FILE_TOOL, transportOptions: {} })).toContain('transportOptions.directory is required for file transport')
    expect(validateExternalTool({ ...FILE_TOOL, transportOptions: { directory: 'C:\\x', pollMs: 0 } })).toContain(
      'transportOptions.pollMs must be a positive number',
    )
  })

  it('requires transportOptions', () => {
    const { transportOptions: _options, ...rest } = HTTP_TOOL
    expect(validateExternalTool(rest)).toEqual(['transportOptions is required'])
  })
})
