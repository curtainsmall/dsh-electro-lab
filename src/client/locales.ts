/**
 * ElectroLab UI dictionaries: zh/en copies for every user-facing string in
 * the panel and the records page, registered into the DSH locale service
 * (dsh-client-locale) so the active language is the one the user chose.
 * Components subscribe through useAppLocale (LocaleFace) and translate with
 * t().
 */
import { useSyncExternalStore } from 'react'

export const LOCALE_NS = 'dsh-electro-lab'

const zh = {
  backToSession: '返回会话',
  tabRecords: '记录',
  tabExternal: '外部工具',
  addExternalTool: '添加外部工具',
  editExternalTool: '编辑外部工具',
  editTool: '编辑',
  deleteTool: '删除',
  deleteToolTitle: '删除外部工具 “{name}”?',
  enabled: '已启用',
  disabled: '已停用',
  restartRequired: '有更改待生效——重启宿主后，外部工具将按最新声明注册。',
  externalEmptyHint: '暂无外部工具。可通过 LLM 的 external_tool_add，或点击“添加外部工具”注册。',
  externalUnreachable: '外部工具端点未响应，面板会自动重试；若刚更新插件，宿主可能需要重启。',
  saveFailed: '保存失败：{message}',
  warnHttp: '注意：启用后，该工具可向 {url} 发起网络请求。',
  warnFile: '注意：启用后，该工具可读写 {directory} 下的请求与响应文件。',
  nameLabel: '名称',
  descriptionLabel: '描述',
  enabledLabel: '启用',
  transportLabel: '传输',
  transportHttp: 'http（经 URL 调用）',
  transportFile: 'file（经目录文件调用）',
  methodLabel: '方法',
  urlLabel: 'URL',
  directoryLabel: '目录',
  pollMsLabel: '轮询间隔（毫秒，可选）',
  inPrefixLabel: '请求文件前缀（可选）',
  outPrefixLabel: '响应文件前缀（可选）',
  timeoutLabel: '超时（毫秒，可选）',
  parametersLabel: '参数',
  addParameter: '添加参数',
  removeParameter: '移除参数',
  paramTypeLabel: '类型',
  paramKindLabel: '数量类别',
  paramItemsLabel: '数组元素',
  paramEnumLabel: '可选值（逗号分隔）',
  paramDescriptionLabel: '说明',
  paramRequiredLabel: '必填',
  unmodeledParams: '{count} 个参数无法用表单表示（如嵌套数组），保存时原样保留：',
  returnsLabel: '返回值（returns，必填）',
  returnsTypeLabel: '返回类型',
  returnsPreserved: '该声明的 returns 无法用表单表示（嵌套结构），保存时原样保留。',
  returnsVoidHint: 'void：返回 null——端点必须应答 result: null。',
  returnsEmptyObjectHint: '空字段对象：端点应答的 result 必须是不带任何字段的对象。',
  addReturnField: '添加字段',
  fieldNameLabel: '字段名',
  emptyFieldName: '字段名不能为空。',
  duplicateFieldName: '字段名重复：“{name}”。',
  invalidName: '名称须以小写字母开头，仅含小写字母、数字与下划线。',
  invalidParamName: '参数名 “{name}” 不合法——须以小写字母开头，仅含小写字母、数字与下划线。',
  duplicateParamName: '参数名重复：“{name}”。',
  urlRequired: '请输入 http(s) URL。',
  fileDirectoryRequired: '请输入目录路径。',
  positiveNumberRequired: '“{label}”须为正数。',

  emptyHint: '暂无 ElectroLab 记录——让智能体做一次计算。',
  unreachable: '暂未检测到记录——记录端点未响应,面板会自动重试;若刚更新插件,宿主可能需要重启。',






































  directory: '目录',




  confirm: '确定',





  irreversible: '此操作不可恢复。',
  cancel: '取消',

  delete: '删除',






  incomplete: '未完成',
} as const

const en: Record<keyof typeof zh, string> = {
  backToSession: 'Back to session',
  tabRecords: 'Records',
  tabExternal: 'External tools',
  addExternalTool: 'Add external tool',
  editExternalTool: 'Edit external tool',
  editTool: 'Edit',
  deleteTool: 'Delete',
  deleteToolTitle: 'Delete external tool “{name}”?',
  enabled: 'Enabled',
  disabled: 'Disabled',
  restartRequired: 'Changes are pending — after a host restart, external tools register from the latest declarations.',
  externalEmptyHint: 'No external tools yet. Register one through the LLM’s external_tool_add, or click “Add external tool”.',
  externalUnreachable: 'The external-tools endpoint is not responding; the panel keeps retrying automatically. If you just updated the plugin, the host process may need a restart.',
  saveFailed: 'Save failed: {message}',
  warnHttp: 'Caution: once enabled, this tool may send requests to {url}.',
  warnFile: 'Caution: once enabled, this tool may read and write request/response files under {directory}.',
  nameLabel: 'Name',
  descriptionLabel: 'Description',
  enabledLabel: 'Enabled',
  transportLabel: 'Transport',
  transportHttp: 'http (call a URL)',
  transportFile: 'file (call through directory files)',
  methodLabel: 'Method',
  urlLabel: 'URL',
  directoryLabel: 'Directory',
  pollMsLabel: 'Poll interval (ms, optional)',
  inPrefixLabel: 'Request file prefix (optional)',
  outPrefixLabel: 'Response file prefix (optional)',
  timeoutLabel: 'Timeout (ms, optional)',
  parametersLabel: 'Parameters',
  addParameter: 'Add parameter',
  removeParameter: 'Remove parameter',
  paramTypeLabel: 'Type',
  paramKindLabel: 'Quantity kind',
  paramItemsLabel: 'Array items',
  paramEnumLabel: 'Allowed values (comma-separated)',
  paramDescriptionLabel: 'Description',
  paramRequiredLabel: 'Required',
  unmodeledParams: '{count} parameter(s) cannot be represented in the form (e.g. nested arrays) and are preserved verbatim on save:',
  returnsLabel: 'Returns (required)',
  returnsTypeLabel: 'Return type',
  returnsPreserved: 'The declaration’s returns cannot be represented in the form (nested structures) and is preserved verbatim on save.',
  returnsVoidHint: 'void: returns null — the endpoint must answer result: null.',
  returnsEmptyObjectHint: 'An object with no fields: the endpoint’s result must be an object without any field.',
  addReturnField: 'Add field',
  fieldNameLabel: 'Field name',
  emptyFieldName: 'Field name must not be empty.',
  duplicateFieldName: 'Duplicate field name: “{name}”.',
  invalidName: 'Name must start with a lowercase letter; only lowercase letters, digits and underscores are allowed.',
  invalidParamName: 'Parameter name “{name}” is invalid — it must start with a lowercase letter; only lowercase letters, digits and underscores are allowed.',
  duplicateParamName: 'Duplicate parameter name: “{name}”.',
  urlRequired: 'Enter an http(s) URL.',
  fileDirectoryRequired: 'Enter a directory path.',
  positiveNumberRequired: '“{label}” must be a positive number.',

  emptyHint: 'No ElectroLab records yet — ask the agent for a calculation.',
  unreachable: 'No records detected yet — the records endpoint is not responding; the panel keeps retrying automatically. If you just updated the plugin, the host process may need a restart.',






































  directory: 'Directory',




  confirm: 'OK',





  irreversible: 'This cannot be undone.',
  cancel: 'Cancel',

  delete: 'Delete',






  incomplete: 'incomplete',
}

export type LocaleKey = keyof typeof zh

/** Registered into the DSH locale service under LOCALE_NS. */
export const dictionaries = { zh, en }

/** Immutable locale snapshot mirrored from the DSH locale service. */
interface LocaleSnapshot {
  active: string
  revision: number
}

let current: LocaleSnapshot = { active: 'zh', revision: 0 }
const listeners = new Set<() => void>()

/** Wire the DSH locale service (LocaleFace getSnapshot/subscribe) into this module. */
export function installLocale(locale: { getSnapshot(): LocaleSnapshot; subscribe(fn: () => void): () => void }): void {
  current = locale.getSnapshot()
  locale.subscribe(() => {
    current = locale.getSnapshot()
    for (const listener of listeners) listener()
  })
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

function getSnapshot(): LocaleSnapshot {
  return current
}

/** Subscribe the calling component to the active language. */
export function useAppLocale(): string {
  return useSyncExternalStore(subscribe, getSnapshot).active
}

function isZh(active: string): boolean {
  return active.toLowerCase().startsWith('zh')
}

/** Translate one key in the active language; `{name}` placeholders are replaced from args. Unknown keys return themselves. */
export function t(key: LocaleKey | string, args?: Record<string, string | number>): string {
  const dict = isZh(current.active) ? zh : en
  let text = dict[key as LocaleKey]
  if (text === undefined) return key
  if (args !== undefined) {
    for (const [name, value] of Object.entries(args)) text = text.replace(`{${name}}`, String(value))
  }
  return text
}
