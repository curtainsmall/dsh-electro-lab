/**
 * 引擎工具面（蓝图 §2）：set / get / call 三原语 + markers。
 * 薄封装：参数经 schema 校验后交给引擎壳；返回统一收据（ok）。
 */
import type { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { defineJsonTool } from '../tool.ts'
import type { Engine } from '../engine/engine.ts'

declare module 'cordis' {
  interface Context {
    tools: ToolRuntime
  }
}

/** 类型化值语法，教给模型的通用段落（值宇宙 §1.1）。 */
const VALUE_GUIDE =
  'A typed value is a JSON object: ' +
  '{ "type": "number", "value": <number>, "kind": <quantity kind>, "variant"?: <word>, "prefix"?: <word> } or ' +
  '{ "type": "complex", "value": { "re": …, "im": … } or { "mag": …, "ang": … (radians) }, "kind": <kind> } or ' +
  '{ "type": "string", "value": "…" } / { "type": "boolean", "value": true } / ' +
  '{ "type": "array", "value": [<typed values>] } / { "type": "object", "value": { <field>: <typed value> } }. ' +
  'kind is part of a quantity (resistance, voltage, time, frequency, none, …). ' +
  'variant words (degC/degF for temperature, deg for angle, bar/psi/atm for pressure, cal/Wh, hp, inch/foot/yard/mile, lb/oz) ' +
  'select a non-SI representation; omit the field for the SI base. ' +
  'prefix words: pico/nano/micro/milli/kilo/mega/giga/tera — omit for 1. ' +
  'The engine stores values as given; SI conversion happens only at calculation boundaries.'

const NAME_DESC = 'slot name: letters, digits, underscore; start with a letter or underscore'

/** 工厂：绑定全局单引擎实例，产出 LLM 可见的工具定义。 */
export function createEngineTools(engine: Engine): Array<ReturnType<typeof defineJsonTool>> {
  const fnEnum = engine.registry.ids()
  const fnList = fnEnum.length > 0 ? ` Available fn ids: ${fnEnum.join(', ')}.` : ''
  return [
    defineJsonTool({
      name: 'set',
      description: `Write one slot in the engine. ${VALUE_GUIDE} Pass value: null to delete the slot (idempotent; re-creating later restarts at rev 1). Writing a slot with a different kind than its pinned kind fails.`,
      parameters: {
        name: { type: 'string', description: NAME_DESC, required: true },
        value: { type: 'json', description: 'a typed value object, or null to delete the slot', required: true },
      },
      execute: (args) => engine.opSet(args.name as string, args.value) as never,
    }),
    defineJsonTool({
      name: 'get',
      description: 'Read one slot from the engine. Returns the stored typed value exactly as written (no normalization).',
      parameters: {
        name: { type: 'string', description: NAME_DESC, required: true },
      },
      execute: (args) => engine.opGet(args.name as string) as never,
    }),
    defineJsonTool({
      name: 'call',
      description: `Call one registered fn and store its result into a named slot. Arguments are typed values or "@name" / "@name.field" slot references; the engine expands references and kind-checks them against the fn signature. A void fn (declared returns: null) takes target: null; a value fn requires a named target. Overwriting an existing slot replaces its value (rev +1).${fnList}`,
      parameters: {
        fn: { type: 'string', enum: fnEnum, description: 'the registered fn to call', required: true },
        args: { type: 'json', description: `fn arguments: object mapping each parameter name to a typed value or "@name" reference`, required: true },
        target: { type: 'json', description: 'result slot name (string), or null for void fns', required: true },
      },
      execute: async (args) => engine.opCall(args.fn as string, args.args as Record<string, unknown> | undefined, args.target as string | null) as never,
    }),
    defineJsonTool({
      name: 'record_question',
      description: 'Open a new record: clears the variable table and starts a fresh trace. Pass the consolidated question text (verbatim). If a record is already open it is sealed first (duplicate-start).',
      parameters: { text: { type: 'string', description: 'the question text', required: true } },
      execute: (args) => engine.markerQuestion(args.text as string) as never,
    }),
    defineJsonTool({
      name: 'record_analyse',
      description: 'Submit the analysis text into the open record (approach with formulas; the knowns are already stored in slots).',
      parameters: { text: { type: 'string', description: 'the analysis text', required: true } },
      execute: (args) => engine.markerAnalyse(args.text as string) as never,
    }),
    defineJsonTool({
      name: 'record_answer',
      description: 'Submit the final answer text and seal the record. With no open record it keeps a duplicate-end error record.',
      parameters: { text: { type: 'string', description: 'the answer text', required: true } },
      execute: (args) => engine.markerAnswer(args.text as string) as never,
    }),
  ]
}
