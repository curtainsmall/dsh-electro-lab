/**
 * External tool declarations — user-owned calculation tools reachable over
 * http or file transport. A declaration mirrors the internal tool options
 * (parameters/returns share the exact schema dialect), plus a transport block
 * and an enable flag. Declarations live in external-tools.jsonl (one per
 * line); they are compiled and registered at plugin start, so any change only
 * takes effect after a restart — the state.json `restartRequired` dirty bit
 * tells the UI that a restart is pending.
 */
import type { ToolReturns } from '../tools/helpers.ts'
import { QuantityKind } from '../math/quantity-kind.ts'

/** Transports an external tool can be reached over. */
export enum ExternalTransport {
  Http = 'http',
  File = 'file',
}

/** HTTP verbs supported by the http transport. */
export enum ExternalHttpMethod {
  Get = 'GET',
  Post = 'POST',
}

/** A parameter's settled semantic type — quantity mirrors the returns leaves. */
export enum ExternalParamType {
  Quantity = 'quantity',
  String = 'string',
  Boolean = 'boolean',
  Array = 'array',
}

/** One parameter of an external tool: a single settled semantic type; kind is
 *  the semantic payload of the quantity type (mirrors returns). */
export type ExternalParamSpec =
  /** A quantity (accepts bare-number, {re,im} or {mag,ang} payloads); kind is a lowercase QuantityKind name. */
  | { type: ExternalParamType.Quantity; kind: string; description?: string; required?: boolean }
  /** A plain string (optionally enum-constrained). */
  | { type: ExternalParamType.String; enum?: string[]; description?: string; required?: boolean }
  /** A plain boolean. */
  | { type: ExternalParamType.Boolean; description?: string; required?: boolean }
  /** A homogeneous array of arbitrary length; every element matches the same recursive item spec. */
  | { type: ExternalParamType.Array; items: ExternalParamSpec; description?: string; required?: boolean }

export type ExternalParameters = Record<string, ExternalParamSpec>

/** Shared transport-agnostic fields. */
interface ExternalToolBase {
  name: string
  description: string
  enabled: boolean
  parameters: ExternalParameters
  returns?: ToolReturns
  timeoutMs?: number
}

/** http transport options. */
export interface ExternalHttpOptions {
  url: string
  method: ExternalHttpMethod
  headers?: Record<string, string>
}

/** file transport options: a whitelisted directory where the host writes
 *  requests and polls for responses. */
export interface ExternalFileOptions {
  directory: string
  inPrefix?: string
  outPrefix?: string
  pollMs?: number
}

/** One line of external-tools.jsonl — a discriminated union so `transport`
 *  narrows `transportOptions` precisely. */
export type ExternalToolConfig = ExternalToolBase & (
  | { transport: ExternalTransport.Http; transportOptions: ExternalHttpOptions }
  | { transport: ExternalTransport.File; transportOptions: ExternalFileOptions }
)

/** The lowercase QuantityKind names a `kind` may take (derived from the enum, no drift). */
export const QUANTITY_KIND_NAMES: readonly string[] = Object.values(QuantityKind)
