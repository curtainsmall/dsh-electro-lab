/**
 * 外部 solver 传输（蓝图 §3.5 信封协议）：请求 {requestId, args}，成功
 * {requestId, result}（void = result: null），失败 {requestId, error: "字符串"}。
 * 参数与结果都是类型化值（SI、rect、无 variant/prefix）。
 */
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ToolError, ToolErrorCode } from '../errors.ts'
import { validateValue, type TypedValue } from './values.ts'
import type { ExternalBlock } from './registry.ts'
import { DeclarationHttpMethod, DeclarationTransport } from '../tool.ts'

/** 把一个类型化值转成过线 JSON（规范形态，无 variant/prefix）。 */
function wireValue(value: TypedValue): unknown {
  return value
}

function readResult(body: unknown, requestId: string): TypedValue | null {
  if (typeof body !== 'object' || body === null) throw new ToolError('the tool response must be a JSON object', ToolErrorCode.ExternalResponse)
  const box = body as { requestId?: unknown; result?: unknown; error?: unknown }
  if (box.requestId !== requestId) {
    throw new ToolError(`response requestId mismatch (got ${String(box.requestId)})`, ToolErrorCode.ExternalResponse)
  }
  if (box.error !== undefined) {
    if (typeof box.error !== 'string') throw new ToolError('the tool response error must be a string', ToolErrorCode.ExternalResponse)
    throw new ToolError(box.error, ToolErrorCode.ExternalError)
  }
  if (!('result' in box)) throw new ToolError('the tool response must contain a result field', ToolErrorCode.ExternalResponse)
  const raw = box.result
  if (raw === null) return null
  const error = validateValue(raw)
  if (error !== undefined) throw new ToolError(`the tool result is not a valid typed value: ${error}`, ToolErrorCode.ExternalResponse)
  return raw as TypedValue
}

/** 执行一次外部调用；返回响应里的 result（可能为 null，引擎按 solver 签名校验）。 */
export async function callExternal(block: ExternalBlock, args: Record<string, TypedValue>): Promise<TypedValue | null> {
  const timeoutMs = block.timeoutMs ?? 30000
  const requestId = randomUUID()
  const payload = { requestId, args: Object.fromEntries(Object.entries(args).map(([key, value]) => [key, wireValue(value)])) }
  switch (block.transport) {
    case DeclarationTransport.Http: {
      const options = block.transportOptions as { url: string; headers?: Record<string, string> }
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        // Typed args travel as a JSON body: POST is the only http verb.
        const request: RequestInit = {
          method: DeclarationHttpMethod.Post,
          headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
          signal: controller.signal,
          body: JSON.stringify(payload),
        }
        const response = await fetch(options.url, request)
        if (!response.ok) throw new ToolError(`http ${response.status} from ${options.url}`, ToolErrorCode.ExternalHttp)
        const text = await response.text()
        let parsed: unknown
        try {
          parsed = JSON.parse(text)
        } catch {
          throw new ToolError(`the tool returned non-JSON: ${text.slice(0, 120)}`, ToolErrorCode.ExternalResponse)
        }
        return readResult(parsed, requestId)
      } catch (error) {
        if (error instanceof ToolError) throw error
        if (error instanceof Error && error.name === 'AbortError') {
          throw new ToolError(`http request timed out after ${timeoutMs} ms`, ToolErrorCode.ExternalTimeout)
        }
        throw error
      } finally {
        clearTimeout(timer)
      }
    }
    case DeclarationTransport.File: {
      const options = block.transportOptions as { directory: string; inPrefix?: string; outPrefix?: string; pollMs?: number }
      const inPrefix = options.inPrefix ?? 'in'
      const outPrefix = options.outPrefix ?? 'out'
      const inFile = join(options.directory, `${inPrefix}.${requestId}.json`)
      const outFile = join(options.directory, `${outPrefix}.${requestId}.json`)
      const pollMs = Math.max(20, options.pollMs ?? 200)
      mkdirSync(options.directory, { recursive: true })
      writeFileSync(inFile, JSON.stringify(payload), 'utf8')
      const deadline = Date.now() + timeoutMs
      try {
        for (;;) {
          if (existsSync(outFile)) {
            let parsed: unknown
            try {
              parsed = JSON.parse(readFileSync(outFile, 'utf8'))
            } catch (error) {
              throw new ToolError(`the tool wrote an unreadable out file: ${error instanceof Error ? error.message : String(error)}`, ToolErrorCode.ExternalResponse)
            }
            return readResult(parsed, requestId)
          }
          if (Date.now() > deadline) {
            throw new ToolError(`file transport timed out after ${timeoutMs} ms (no ${outPrefix}.* file appeared)`, ToolErrorCode.ExternalTimeout)
          }
          await new Promise((resolve) => setTimeout(resolve, pollMs))
        }
      } finally {
        for (const file of [inFile, outFile]) {
          try {
            rmSync(file, { force: true })
          } catch {
            // 尽力清理
          }
        }
      }
    }
  }
}
