/**
 * Code-authored declaration manager tools — they live with the other tool
 * modules: `external_solver_add`, `external_solver_update` and
 * `external_solver_delete` edit the declaration archive (external-solvers.jsonl)
 * through src/tool.ts. Every write persists immediately but
 * only registers after a host restart, so each result carries
 * `restartRequired: true`. Reading/using declared tools needs no manager
 * call — registered tools are visible like any other tool.
 *
 * The tools are created per home directory (the plugin's records home),
 * because the archive lives there.
 */
import { defineJsonTool, ToolError } from '../tool.ts'
import { deleteDeclaration, readDeclarations, upsertDeclaration, validateDeclaration } from '../tool.ts'
import type { ToolDeclaration } from '../tool.ts'
import type { JsonValue } from '@deepseek-ai/dsh-tools'

/** The declaration grammar, taught once and shared by add and update. */
const DECLARATION_GUIDE =
  'the full external solver declaration as ONE JSON object: ' +
  '{ "name": starts with a lowercase letter, then lowercase letters/digits/underscores, max 64, ' +
  'unique among external and built-in solvers; ' +
  '"description": what the solver computes; ' +
  '"enabled": true (the default when omitted) or false; ' +
  '"parameters": object mapping each parameter name to its spec; ' +
  '"transport": "http" or "file"; ' +
  '"transportOptions": for "http" { "url": an http(s) URL, "method": "GET" or "POST", "headers"?: object }, ' +
  'for "file" { "directory": an absolute path the host polls for the response, "inPrefix"?: string, "outPrefix"?: string, "pollMs"?: number }; ' +
  '"timeoutMs"?: positive number (default 30000); ' +
  '"returns": the result shape — spec leaves, or null for void; explicit and required: a declaration without it is archived but never registers }. ' +
  'Parameter specs: ' +
  '{ "type": "quantity", "kind": <lowercase kind name, e.g. resistance, voltage, current, frequency, time, angle, log, none, ...> } ' +
  '— the value is a bare number or {re, im} (rectangular) or {mag, ang} (polar, angles in radians); ' +
  '{ "type": "string", "enum"?: string array }; { "type": "boolean" }; ' +
  '{ "type": "array", "items": <any parameter spec> } — a homogeneous array, items may nest. ' +
  'returns leaves: { "type": "string" }, { "type": "boolean" }, ' +
  '{ "type": "number", "kind" }, { "type": "complex", "kind" }, { "type": "object", "fields": {...} }, ' +
  '{ "type": "array", "items": <a returns leaf> } (never "any")'

const DECLARATION_PARAM = {
  declaration: {
    type: 'json',
    description: DECLARATION_GUIDE,
    required: true,
  },
} as const

const NAME_PARAM = {
  name: {
    type: 'string',
    description: 'the name of the external solver to delete',
    required: true,
  },
} as const

/** Create-only: a name already declared (or pending in the archive) is an error. */
function addExternalSolver(home: string, declaration: unknown): Record<string, JsonValue> {
  const errors = validateDeclaration(declaration)
  if (errors.length > 0) throw new ToolError(errors.join('; '))
  const config = declaration as ToolDeclaration
  if (readDeclarations(home).some((tool) => tool.name === config.name)) {
    throw new ToolError(`an external solver named "${config.name}" already exists — use external_solver_update to replace it`)
  }
  upsertDeclaration(home, config)
  return { name: config.name, changed: 'added', restartRequired: true }
}

/** Replace-only: a missing name (or a name not in the archive yet) is an error. */
function updateExternalSolver(home: string, declaration: unknown): Record<string, JsonValue> {
  const errors = validateDeclaration(declaration)
  if (errors.length > 0) throw new ToolError(errors.join('; '))
  const config = declaration as ToolDeclaration
  if (!readDeclarations(home).some((tool) => tool.name === config.name)) {
    throw new ToolError(`no external solver named "${config.name}" exists — use external_solver_add to create it`)
  }
  upsertDeclaration(home, config)
  return { name: config.name, changed: 'updated', restartRequired: true }
}

function deleteDeclarationByName(home: string, name: string): Record<string, JsonValue> {
  if (!readDeclarations(home).some((tool) => tool.name === name)) {
    throw new ToolError(`no external solver named "${name}" exists`)
  }
  deleteDeclaration(home, name)
  return { name, changed: 'deleted', restartRequired: true }
}

/** The three manager tools, bound to one records home. */
export function createDeclarationTools(home: string): Array<ReturnType<typeof defineJsonTool>> {
  return [
    defineJsonTool({
      name: 'external_solver_add',
      description: `Register a NEW external calculation solver. Pass ${DECLARATION_GUIDE} The change applies after a host restart (the result reports restartRequired).`,
      parameters: DECLARATION_PARAM,
      execute: (args) => addExternalSolver(home, args.declaration),
    }),
    defineJsonTool({
      name: 'external_solver_update',
      description: `Replace the declaration of an EXISTING external solver. Pass ${DECLARATION_GUIDE} The solver must already be declared (external_solver_add creates it); the change applies after a host restart.`,
      parameters: DECLARATION_PARAM,
      execute: (args) => updateExternalSolver(home, args.declaration),
    }),
    defineJsonTool({
      name: 'external_solver_delete',
      description: 'Delete an external solver declaration by its name. The change applies after a host restart (the result reports restartRequired).',
      parameters: NAME_PARAM,
      execute: (args) => deleteDeclarationByName(home, args.name),
    }),
  ]
}
