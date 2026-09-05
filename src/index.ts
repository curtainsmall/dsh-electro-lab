/**
 * Host half of dsh-electro-lab（引擎时代）。
 *
 * 一台进程级全局引擎（Engine）：变量表 + fn 注册表 + 记录存储。
 * apply 装配：注册内核 fn 与外部 fn、注册 LLM 工具面（set/get/call +
 * markers）与声明管理工具（external_fns_add/update/delete）、挂两个
 * 端点（记录索引、外部 fn 档案管理）。
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Context } from 'cordis'
import { Engine } from './engine/engine.ts'
import { createEngineTools } from './tools/engine-tools.ts'
import { createDeclarationTools } from './tools/declaration-tools.ts'
import { compileExternalFn } from './engine/external-fns.ts'
import { registerKernelFns } from './engine/fns/index.ts'
import { clearRestartRequired, deleteDeclaration, readDeclarations, restartRequired, upsertDeclaration, validateDeclaration } from './tool.ts'
import { registerSkills } from './skill.ts'
import { installPresets } from './preset.ts'

/** Plugin identity for cordis.yml rows. */
export const name = 'dsh-electro-lab'

/** Services required before mounting: the tool registry and the web server (endpoint host). */
export const inject = ['tools', 'webServer']

declare module 'cordis' {
  interface Context {
    /** The web server the endpoints register on. */
    webServer: WebServerLike
  }
}
/** Minimal structural shape of the web-server route registry. */
interface WebServerLike {
  register(route: {
    kind: 'exact'
    path: string
    handler(req: unknown, res: {
      statusCode?: number
      setHeader(name: string, value: string): void
      end(body: string): void
    }): void | Promise<void>
  }): () => void
}

interface RequestLike {
  method?: string
  url?: string
}

/** The records home: records/ + record-index.jsonl live here. */
const recordsHome = process.env.DSH_ELECTRO_LAB_HOME ?? join(homedir(), '.dsh-electro-lab')

/** 全局单引擎（蓝图 §10）：一个进程一个引擎，任何会话的 marker 都作用于它。 */
export const engine = new Engine(recordsHome)

const RECORDS_INDEX_PATH = '/api/dsh-electro-lab/records-index'
const EXTERNAL_PATH = '/api/dsh-electro-lab/external-fns'

export function apply(ctx: Context): void {
  ctx.effect(() => {
    const disposers: Array<() => void> = []

    // 引擎装配：恢复 open 记录（清孤儿 + 重建表）、注册全部内核 fn 与外部 fn。
    engine.start()
    for (const fn of registerKernelFns()) {
      if (engine.registry.get(fn.id) === undefined) engine.registry.register(fn)
    }
    for (const declaration of readDeclarations(recordsHome)) {
      if (declaration.enabled === false) continue
      try {
        const fn = compileExternalFn(declaration)
        if (fn !== null && engine.registry.get(fn.id) === undefined) engine.registry.register(fn)
      } catch (error) {
        ctx.logger?.warn(`[dsh-electro-lab] failed to register declaration fn "${declaration.name}": ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    // 声明档案刚注册完：重启 dirty 位清掉。
    clearRestartRequired(recordsHome)

    // LLM 工具面：引擎原语 + markers。
    for (const tool of createEngineTools(engine)) {
      disposers.push(ctx.tools.register(tool))
    }
    // 声明管理工具（管理面在引擎外）。
    for (const tool of createDeclarationTools(recordsHome)) {
      disposers.push(ctx.tools.register(tool))
    }

    return () => {
      for (const off of disposers) off()
    }
  }, 'dsh-electro-lab: engine')

  ctx.effect(() => registerSkills(ctx), 'dsh-electro-lab: skills')

  ctx.effect(() => {
    const disposers: Array<() => void> = []

    // 记录列表：读 record-index.jsonl（列表页唯一数据源）。
    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: RECORDS_INDEX_PATH,
      handler: (req, res) => {
        const request = req as RequestLike
        if ((request.method ?? 'GET') !== 'GET') {
          res.statusCode = 405
          res.end('method not allowed')
          return
        }
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ rows: engine.indexRows() }))
      },
    }))

    // 外部 fn 档案管理：GET 列表 + dirty 位；PUT 覆盖/新增（base64 JSON 查询参数）；
    // DELETE ?name= 删除。每次写置 dirty 位（重启后经 compileExternalFn 注册）。
    disposers.push(ctx.webServer.register({
      kind: 'exact',
      path: EXTERNAL_PATH,
      handler: (req, res) => {
        const request = req as RequestLike
        const method = request.method ?? 'GET'
        res.setHeader('content-type', 'application/json')
        if (method === 'PUT') {
          const encoded = request.url === undefined ? null : new URL(request.url, 'http://dsh.local').searchParams.get('config')
          if (encoded === null) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'config parameter is required (base64 JSON)' }))
            return
          }
          let config: unknown
          try {
            config = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
          } catch {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'config is not valid base64 JSON' }))
            return
          }
          const errors = validateDeclaration(config)
          if (errors.length > 0) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: errors.join('; ') }))
            return
          }
          upsertDeclaration(recordsHome, config as never)
          res.end(JSON.stringify({ saved: true, restartRequired: true }))
          return
        }
        if (method === 'DELETE') {
          const name = request.url === undefined ? null : new URL(request.url, 'http://dsh.local').searchParams.get('name')
          const deleted = name !== null && deleteDeclaration(recordsHome, name)
          res.end(JSON.stringify({ deleted, restartRequired: restartRequired(recordsHome) }))
          return
        }
        if (method !== 'GET') {
          res.statusCode = 405
          res.end('method not allowed')
          return
        }
        res.end(JSON.stringify({ fns: readDeclarations(recordsHome), restartRequired: restartRequired(recordsHome) }))
      },
    }))

    return () => {
      for (const off of disposers) off()
    }
  }, 'dsh-electro-lab: web')

  try {
    const synced = installPresets()
    if (synced.length > 0) ctx.logger?.info(`[dsh-electro-lab] synced packaged preset(s): ${synced.join(', ')}`)
  } catch (error) {
    // A preset that fails to sync must never break the plugin.
    ctx.logger?.warn(`[dsh-electro-lab] failed to sync packaged preset: ${error instanceof Error ? error.message : String(error)}`)
  }
}
