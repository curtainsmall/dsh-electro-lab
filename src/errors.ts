/**
 * Stable machine-readable failure kinds carried by a ToolError. The code is
 * what the context trace, tests and UI match on — the message stays human
 * text. Codes travel as JSON strings across the record boundary, hence the
 * string enum.
 */
export enum ToolErrorCode {
  /** A generic tool failure (also the default when no code is given). */
  Tool = 'TOOL_ERROR',
  /** Reported by the external endpoint itself (envelope error field). */
  ExternalError = 'EXTERNAL_ERROR',
  /** http transport failure (non-2xx status). */
  ExternalHttp = 'EXTERNAL_HTTP',
  /** The external call timed out. */
  ExternalTimeout = 'EXTERNAL_TIMEOUT',
  /** Protocol violation in the external response envelope. */
  ExternalResponse = 'EXTERNAL_RESPONSE',
  /** Context: a referenced slot does not exist. */
  ContextUndeclared = 'CONTEXT_UNDECLARED',
  /** Context: slot kind conflicts with the pinned kind (or a parameter kind mismatch). */
  ContextKindMismatch = 'CONTEXT_KIND_MISMATCH',
  /** Context: an unknown fn was called. */
  ContextUnknownFn = 'CONTEXT_UNKNOWN_FN',
  /** Context: fn signature rejects the argument shape. */
  ContextArgs = 'CONTEXT_ARGS',
  /** Context: target given for a void fn. */
  ContextVoidTarget = 'CONTEXT_VOID_TARGET',
  /** Context: a non-void fn call without a named target. */
  ContextTargetRequired = 'CONTEXT_TARGET_REQUIRED',
  /** Context: variant not supported for the kind (set-time). */
  ContextUnsupportedVariant = 'CONTEXT_UNSUPPORTED_VARIANT',
  /** Context: prefix not supported (combination or unknown word). */
  ContextUnsupportedPrefix = 'CONTEXT_UNSUPPORTED_PREFIX',
  /** Context: a run (kernel) threw. */
  ContextFnFailed = 'CONTEXT_FN_FAILED',
  /** Registry: fn registration without an explicit returns. */
  RegisterMissingReturns = 'REGISTER_MISSING_RETURNS',
  /** Registry: duplicate fn id. */
  RegisterDuplicate = 'REGISTER_DUPLICATE',
}

/**
 * The unified tool-failure error.
 *
 * Every failure inside TypeScript is a throw: math kernels and lower layers
 * throw whatever they want — the tool boundary (defineJsonTool) re-wraps
 * any non-ToolError into a ToolError, so every tool call fails through one
 * structured channel. Wire formats translate to throws at the edge (an
 * external envelope `error` field becomes a ToolError in the transport).
 */
export class ToolError extends Error {
  readonly code: ToolErrorCode
  constructor(message: string, code: ToolErrorCode = ToolErrorCode.Tool) {
    super(message)
    this.name = 'ToolError'
    this.code = code
  }
}
