/**
 * Stable machine-readable failure kinds carried by a ToolError. The code is
 * what the engine trace, tests and UI match on — the message stays human
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
  /** Engine: a referenced slot does not exist. */
  EngineUndeclared = 'ENGINE_UNDECLARED',
  /** Engine: slot kind conflicts with the pinned kind (or a parameter kind mismatch). */
  EngineKindMismatch = 'ENGINE_KIND_MISMATCH',
  /** Engine: an unknown solver was called. */
  EngineUnknownSolver = 'ENGINE_UNKNOWN_SOLVER',
  /** Engine: solver signature rejects the argument shape. */
  EngineArgs = 'ENGINE_ARGS',
  /** Engine: target given for a void solver. */
  EngineVoidTarget = 'ENGINE_VOID_TARGET',
  /** Engine: a non-void solver call without a named target. */
  EngineTargetRequired = 'ENGINE_TARGET_REQUIRED',
  /** Engine: variant not supported for the kind (set-time). */
  EngineUnsupportedVariant = 'ENGINE_UNSUPPORTED_VARIANT',
  /** Engine: prefix not supported (combination or unknown word). */
  EngineUnsupportedPrefix = 'ENGINE_UNSUPPORTED_PREFIX',
  /** Engine: a run (kernel) threw. */
  EngineSolverFailed = 'ENGINE_SOLVER_FAILED',
  /** Registry: solver registration without an explicit returns. */
  RegisterMissingReturns = 'REGISTER_MISSING_RETURNS',
  /** Registry: duplicate solver id. */
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
