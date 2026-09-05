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
  /** Slot: a referenced slot does not exist. */
  SlotUndeclared = 'ENGINE_SLOT_UNDECLARED',
  /** Kind: the argument kind conflicts with the solver parameter or the pinned kind of a slot. */
  KindMismatch = 'ENGINE_KIND_MISMATCH',
  /** Solver: an unknown solver id was called. */
  UnknownSolver = 'ENGINE_UNKNOWN_SOLVER',
  /** Args: the solver signature rejects the argument shape. */
  InvalidArgs = 'ENGINE_ARGS',
  /** Target: a named target was given for a void solver. */
  VoidTarget = 'ENGINE_VOID_TARGET',
  /** Target: a non-void solver call without a named target. */
  TargetRequired = 'ENGINE_TARGET_REQUIRED',
  /** Variant: not supported for the kind (set-time). */
  UnsupportedVariant = 'ENGINE_UNSUPPORTED_VARIANT',
  /** Prefix: not supported (combination or unknown word). */
  UnsupportedPrefix = 'ENGINE_UNSUPPORTED_PREFIX',
  /** Solver: a run (kernel) threw. */
  SolverFailed = 'ENGINE_SOLVER_FAILED',
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
