/**
 * The unified tool-failure error.
 *
 * Every failure inside TypeScript is a throw: math kernels and lower layers
 * throw whatever they want — the tool boundary (defineJsonTool) re-wraps
 * any non-ToolError into a ToolError, so every tool call fails through one
 * structured channel. Wire formats translate to throws at the edge (an
 * external envelope `error` field becomes a ToolError in the transport).
 * Codes: `TOOL_ERROR` (default), `EXTERNAL_ERROR` (endpoint reported),
 * `EXTERNAL_HTTP`, `EXTERNAL_TIMEOUT`, `EXTERNAL_RESPONSE`.
 */
export class ToolError extends Error {
  readonly code: string
  constructor(message: string, code = 'TOOL_ERROR') {
    super(message)
    this.name = 'ToolError'
    this.code = code
  }
}
