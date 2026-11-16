/**
 * Görev ve liste değerlerinin sözlük anahtarları (öncelik adı, renk adı, sıralama adı…).
 * Anahtarlar burada AÇIKÇA yazılır ki kural testi kullanılan anahtarları görebilsin (dinamik anahtar kurmayın).
 *
 * Genişletme: şemaya yeni bir seçenek eklerseniz (ör. yeni renk) buraya ve tr.json'a karşılığını ekleyin;
 * TypeScript eksik olanı gösterir.
 */
import type { ListColor, TaskPriority } from '@uygulama/shared'
import type { MessageKey } from '../../i18n/index.ts'
import type { TaskSort, TaskStatus } from './logic.ts'

export const PRIORITY_LABELS: Record<TaskPriority, MessageKey> = {
  high: 'tasks.priority.high',
  normal: 'tasks.priority.normal',
  low: 'tasks.priority.low',
}

export const STATUS_LABELS: Record<TaskStatus, MessageKey> = {
  open: 'tasks.status.open',
  done: 'tasks.status.done',
  all: 'tasks.status.all',
}

export const SORT_LABELS: Record<TaskSort, MessageKey> = {
  manual: 'tasks.sort.manual',
  due: 'tasks.sort.due',
  priority: 'tasks.sort.priority',
  title: 'tasks.sort.title',
  created: 'tasks.sort.created',
}

export const COLOR_LABELS: Record<ListColor, MessageKey> = {
  blue: 'lists.color.blue',
  green: 'lists.color.green',
  amber: 'lists.color.amber',
  red: 'lists.color.red',
  violet: 'lists.color.violet',
  gray: 'lists.color.gray',
}

/** Liste renginin CSS değişkeni (styles/index.css → --list-…). */
export const COLOR_VARS: Record<ListColor, string> = {
  blue: 'var(--list-blue)',
  green: 'var(--list-green)',
  amber: 'var(--list-amber)',
  red: 'var(--list-red)',
  violet: 'var(--list-violet)',
  gray: 'var(--list-gray)',
}
