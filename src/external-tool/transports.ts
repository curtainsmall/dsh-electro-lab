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

/** Result convention: pick {requestId, result} out of a raw response body. */
function readResult(body: unknown, requestId: string): JsonValue {
  if (typeof body !== "object" || body === null)
    throw new Error("the tool response must be a JSON object");
  const box = body as { requestId?: unknown; result?: unknown };
  if (box.requestId !== requestId)
    throw new Error(
      `response requestId mismatch (got ${String(box.requestId)})`,
    );
  if (!("result" in box))
    throw new Error('the tool response must contain a "result" field');
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
      throw new Error(`http ${response.status} from ${options.url}`);
    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`the tool returned non-JSON: ${text.slice(0, 120)}`);
    }
    return readResult(parsed, String(body.requestId));
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError")
      throw new Error(`http request timed out after ${timeoutMs} ms`);
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
          throw new Error(
            `the tool wrote an unreadable out file: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        return readResult(parsed, requestId);
      }
      if (Date.now() > deadline)
        throw new Error(
          `file transport timed out after ${timeoutMs} ms (no ${outPrefix}.* file appeared)`,
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
