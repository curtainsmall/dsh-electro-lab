/**
 * Host half of dsh-electro-lab (engine era).
 *
 * One process-wide global engine (Engine): variable table + solver registry + record storage.
 * apply assembly: registers the kernel and external solvers, registers the LLM tool surface (set/get/call +
 * markers) and the declaration management tools (external_solver_add/update/delete), and mounts two
 * endpoints (record index, external solver archive management).
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Context } from 'cordis'
import { Engine } from './engine/engine.ts'
import { createEngineTools } from './tools/engine-tools.ts'
import { createDeclarationTools } from './tools/declaration-tools.ts'
import { compileExternalSolver } from './engine/external-solvers.ts'
import { registerKernelSolvers } from './engine/solvers/index.ts'
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

/** Global single engine: one engine per process; any session's markers act on it. */
export const engine = new Engine(recordsHome)

const RECORDS_INDEX_PATH = '/api/dsh-electro-lab/records-index'
const EXTERNAL_PATH = '/api/dsh-electro-lab/external-solvers'

export function apply(ctx: Context): void {
  ctx.effect(() => {
    const disposers: Array<() => void> = []

    // Engine wiring: recover the open record (clear orphans + rebuild the table), register all kernel and external solvers.
    engine.start()
    for (const solver of registerKernelSolvers()) {
      if (engine.registry.get(solver.id) === undefined) engine.registry.register(solver)
    }
    for (const declaration of readDeclarations(recordsHome)) {
      if (declaration.enabled === false) continue
      try {
        const solver = compileExternalSolver(declaration)
        if (solver !== null && engine.registry.get(solver.id) === undefined) engine.registry.register(solver)
      } catch (error) {
        ctx.logger?.warn(`[dsh-electro-lab] failed to register declaration solver "${declaration.name}": ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    // Declarations have just been registered: clear the restart dirty bit.
    clearRestartRequired(recordsHome)

    // LLM tool surface: engine primitives + markers.
    for (const tool of createEngineTools(engine)) {
      disposers.push(ctx.tools.register(tool))
    }
    // Declaration management tools (the management surface lives outside the engine).
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

    // Record list: read record-index.jsonl (the list page's only data source).
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

    // External solver archive management: GET lists + dirty bit; PUT overwrites/adds (base64 JSON query parameter);
    // DELETE ?name= removes. Every write sets the dirty bit (registered via compileExternalSolver after a restart).
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
        res.end(JSON.stringify({ solvers: readDeclarations(recordsHome), restartRequired: restartRequired(recordsHome) }))
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
