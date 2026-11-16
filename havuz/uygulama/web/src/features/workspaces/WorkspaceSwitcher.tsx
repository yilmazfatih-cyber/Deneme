/**
 * Alan değiştirici (üst çubuk / yan menü): geçerli alanın adı; dokununca alanlar listesi ve "Alanları yönet".
 * Hesapsız kipte yalnız "Bu cihaz" yazar.
 */
import type { WorkspaceInfo } from '@uygulama/shared'
import { Check, ChevronDown, Layers, Smartphone } from 'lucide-react'
import { useNavigate } from 'react-router'
import { t } from '../../i18n/index.ts'
import { useSession } from '../../lib/session/context.ts'
import { selectWorkspace } from '../../lib/session/workspace.ts'
import type { CurrentWorkspace } from '../../lib/store/context.tsx'
import { Menu, type MenuItem } from '../../ui/index.ts'

export function WorkspaceSwitcher({
  current,
  workspaces,
}: {
  current: CurrentWorkspace
  workspaces: readonly WorkspaceInfo[]
}) {
  const { state } = useSession()
  const navigate = useNavigate()

  if (current.local || state.status !== 'account')
    return (
      <span className="inline-flex min-h-12 items-center gap-2 px-2 font-semibold text-muted">
        <Smartphone aria-hidden size={18} />
        {current.name}
      </span>
    )

  const items: MenuItem[] = [
    ...workspaces.map((workspace) => ({
      label: workspace.name,
      icon: workspace.id === current.id ? Check : undefined,
      onSelect: () => {
        void selectWorkspace(state.db, workspace.id).then(() => navigate('/gorevler'))
      },
    })),
    { label: t('workspace.manage'), icon: Layers, onSelect: () => void navigate('/alanlar') },
  ]

  return (
    <Menu
      label={t('workspace.switch', { name: current.name })}
      items={items}
      align="start"
      triggerClassName="max-w-full justify-start px-2.5 font-semibold"
      trigger={
        <>
          <span className="sr-only">{t('workspace.switch', { name: current.name })}</span>
          <span aria-hidden className="truncate">
            {current.name}
          </span>
          <ChevronDown aria-hidden size={18} className="shrink-0 text-muted" />
        </>
      }
    />
  )
}
