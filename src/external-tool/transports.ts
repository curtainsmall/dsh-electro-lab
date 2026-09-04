/**
 * Transport executors: the `execute` of a compiled external tool. Both speak
 * one envelope protocol — the request carries {requestId, …params}; the
 * response must be a JSON object {requestId, result} whose requestId echoes
 * the request (guards against stale/mismatched replies). The result is the
 * raw payload; the record layer tags it later via the tool's returns.
 */
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { JsonValue, ToolRunContext } from "@deepseek-ai/dsh-tools";
import { ToolError } from "../tools/helpers.ts";
import {
  ExternalHttpMethod,
  ExternalTransport,
  type ExternalHttpOptions,
  type ExternalFileOptions,
  type ExternalParameters,
  type ExternalToolConfig,
} from "./types.ts";

/** Build the envelope body from the validated args (params are flat keys). */
function envelope(
  args: Record<string, JsonValue | undefined>,
): Record<string, JsonValue | undefined> {
  return { requestId: randomUUID(), ...args };
}

/** Result convention: pick {requestId, result} out of a raw response body.
 *  An `error` field overrides everything: when present, `result` is ignored
 *  and the error content is raised as the tool failure. */
function readResult(body: unknown, requestId: string): JsonValue {
  if (typeof body !== "object" || body === null)
    throw new ToolError("the tool response must be a JSON object", "EXTERNAL_RESPONSE");
  const box = body as { requestId?: unknown; result?: unknown; error?: unknown };
  if (box.requestId !== requestId)
    throw new ToolError(
      `response requestId mismatch (got ${String(box.requestId)})`,
      "EXTERNAL_RESPONSE",
    );
  if ("error" in box) {
    if (typeof box.error !== "string" || box.error.length === 0)
      throw new ToolError(
        'the tool response "error" field must be a non-empty string',
        "EXTERNAL_RESPONSE",
      );
    throw new ToolError(box.error, "EXTERNAL_ERROR");
  }
  if (!("result" in box))
    throw new ToolError(
      'the tool response must contain a "result" field',
      "EXTERNAL_RESPONSE",
    );
  return box.result as JsonValue;
}

/** http executor: POST (or GET with query) the envelope and read the JSON body. */
export async function executeHttp(
  _params: ExternalParameters,
  options: ExternalHttpOptions,
  timeoutMs: number,
  args: Record<string, JsonValue | undefined>,
  _exec: ToolRunContext,
): Promise<JsonValue> {
  const body = envelope(args);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const request: RequestInit = {
      method: options.method,
      headers: {
        "content-type": "application/json",
        ...(options.headers ?? {}),
      },
      signal: controller.signal,
      body:
        options.method === ExternalHttpMethod.Post
          ? JSON.stringify(body)
          : undefined,
    };
    const url =
      options.method === ExternalHttpMethod.Get
        ? `${options.url}${options.url.includes("?") ? "&" : "?"}${new URLSearchParams(body as Record<string, string>).toString()}`
        : options.url;
    const response = await fetch(url, request);
    if (!response.ok)
      throw new ToolError(`http ${response.status} from ${options.url}`, "EXTERNAL_HTTP");
    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ToolError(
        `the tool returned non-JSON: ${text.slice(0, 120)}`,
        "EXTERNAL_RESPONSE",
      );
    }
    return readResult(parsed, String(body.requestId));
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError")
      throw new ToolError(`http request timed out after ${timeoutMs} ms`, "EXTERNAL_TIMEOUT");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** file executor: write <dir>/<inPrefix>.<requestId>.json, poll for
 *  <dir>/<outPrefix>.<requestId>.json, then clean both up. */
export async function executeFile(
  _params: ExternalParameters,
  options: ExternalFileOptions,
  timeoutMs: number,
  args: Record<string, JsonValue | undefined>,
  _exec: ToolRunContext,
): Promise<JsonValue> {
  const requestId = randomUUID();
  const inPrefix = options.inPrefix ?? "in";
  const outPrefix = options.outPrefix ?? "out";
  const inFile = join(options.directory, `${inPrefix}.${requestId}.json`);
  const outFile = join(options.directory, `${outPrefix}.${requestId}.json`);
  const pollMs = Math.max(20, options.pollMs ?? 200);
  mkdirSync(options.directory, { recursive: true });
  writeFileSync(inFile, JSON.stringify({ requestId, ...args }), "utf8");
  const deadline = Date.now() + timeoutMs;
  try {
    for (;;) {
      if (existsSync(outFile)) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(readFileSync(outFile, "utf8"));
        } catch (error) {
          throw new ToolError(
            `the tool wrote an unreadable out file: ${error instanceof Error ? error.message : String(error)}`,
            "EXTERNAL_RESPONSE",
          );
        }
        return readResult(parsed, requestId);
      }
      if (Date.now() > deadline)
        throw new ToolError(
          `file transport timed out after ${timeoutMs} ms (no ${outPrefix}.* file appeared)`,
          "EXTERNAL_TIMEOUT",
        );
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  } finally {
    for (const file of [inFile, outFile]) {
      try {
        rmSync(file, { force: true });
      } catch {
        // best effort cleanup
      }
    }
  }
}

/** Pick the executor for a declaration (the transport discriminant narrows the options). */
export function makeExecutor(
  config: ExternalToolConfig,
): (
  args: Record<string, JsonValue | undefined>,
  exec: ToolRunContext,
) => Promise<JsonValue> {
  const timeoutMs = config.timeoutMs ?? 30000;
  switch (config.transport) {
    case ExternalTransport.Http:
      return (args, exec) =>
        executeHttp(
          config.parameters,
          config.transportOptions,
          timeoutMs,
          args,
          exec,
        );
    case ExternalTransport.File:
      return (args, exec) =>
        executeFile(
          config.parameters,
          config.transportOptions,
          timeoutMs,
          args,
          exec,
        );
  }
}
