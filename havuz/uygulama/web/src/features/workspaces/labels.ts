/**
 * Alan rolleri ve türlerinin sözlük anahtarları (açıkça yazılır ki kural testi görsün).
 * Genişletme: shared'a yeni rol eklenirse buraya ve tr.json'a karşılığını ekleyin.
 */
import type { WorkspaceKind, WorkspaceRole } from '@uygulama/shared'
import type { MessageKey } from '../../i18n/index.ts'

export const ROLE_LABELS: Record<WorkspaceRole, MessageKey> = {
  owner: 'workspace.role.owner',
  editor: 'workspace.role.editor',
  viewer: 'workspace.role.viewer',
}

export const ROLE_HINTS: Record<WorkspaceRole, MessageKey> = {
  owner: 'workspace.roleHint.owner',
  editor: 'workspace.roleHint.editor',
  viewer: 'workspace.roleHint.viewer',
}

export const KIND_LABELS: Record<WorkspaceKind, MessageKey> = {
  personal: 'workspace.kind.personal',
  shared: 'workspace.kind.shared',
}
