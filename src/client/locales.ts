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
  tabConfig: '配置',
  tabRecords: '记录',
  emptyHint: '暂无 ElectroLab 记录——让智能体做一次计算。',
  unreachable: '暂未检测到记录——记录端点未响应,面板会自动重试;若刚更新插件,宿主可能需要重启。',
  headerNote: '所有会话的五步求解记录——存于磁盘,自动刷新。',
  inProgress: '● 进行中',
  toolCallsCount: '{count} 次工具调用',
  errorsCount: ', {count} 个错误',
  startedAt: '开始',
  settledAt: '结束',
  sectionQuestion: '1 · 问题',
  sectionAnalyse: '2 · 分析',
  sectionCalls: '3 · 工具调用',
  sectionResults: '4 · 结果',
  sectionAnswer: '5 · 答案',
  backToRecords: '返回记录',
  deleteTitle: '删除这条记录?',
  irreversible: '此操作不可恢复。',
  cancel: '取消',
  delete: '删除',
  deleteRecord: '删除这条记录',
  confirmDeleteAgain: '再次点击确认删除',
  errorDuplicateStartMsg: '重复开启记录——原记录已作为错误记录结算。',
  errorDuplicateEndMsg: '在无记录时调用了 record_answer。',
  errorIncompleteMsg: '记录内没有工具调用:事件不足以构成一次计算。',
} as const

const en: Record<keyof typeof zh, string> = {
  backToSession: 'Back to session',
  tabConfig: 'Config',
  tabRecords: 'Records',
  emptyHint: 'No ElectroLab records yet — ask the agent for a calculation.',
  unreachable: 'No records detected yet — the records endpoint is not responding; the panel keeps retrying automatically. If you just updated the plugin, the host process may need a restart.',
  headerNote: 'Settled records of the five-step process across all sessions — stored on disk, refreshed automatically.',
  inProgress: '● in progress',
  toolCallsCount: '{count} tool call(s)',
  errorsCount: ', {count} error(s)',
  startedAt: 'started',
  settledAt: 'settled',
  sectionQuestion: '1 · Question',
  sectionAnalyse: '2 · Analysis',
  sectionCalls: '3 · Tool calls',
  sectionResults: '4 · Results',
  sectionAnswer: '5 · Answer',
  backToRecords: 'Back to records',
  deleteTitle: 'Delete this record?',
  irreversible: 'This cannot be undone.',
  cancel: 'Cancel',
  delete: 'Delete',
  deleteRecord: 'Delete this record',
  confirmDeleteAgain: 'Click again to confirm',
  errorDuplicateStartMsg: 'record_question fired while a record was already open; it was settled as an error record',
  errorDuplicateEndMsg: 'record_answer fired with no open record',
  errorIncompleteMsg: 'the record has no tool call: not enough events for a calculation',
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
