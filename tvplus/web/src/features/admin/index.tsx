/**
 * Yönetici (#/yonetici). Dışa aktarım adı SABİT: AdminPage.
 *   Yönetici kipi kapalı → kod girişi (Unlock.tsx). Bu sayfanın bağlantısı hiçbir menüde yoktur.
 *   Yönetici kipi açık   → Yönetici Paneli (Panel.tsx): segment, kararların gerekçesi, satırlar, alt türler, modeller.
 * Kip açılınca menülerde Yönetici Paneli, Stüdyo ve Kaputun altı girişleri görünür (app/admin.ts).
 */
import type { ReactElement } from 'react'
import { useDocumentTitle, useIsAdmin, useShellOptions } from '../../app'
import { AdminPanel } from './Panel'
import { AdminUnlock } from './Unlock'
import './admin.css'

export function AdminPage(): ReactElement {
  const admin = useIsAdmin()
  useDocumentTitle(admin ? 'Yönetici Paneli' : 'Yönetici girişi')
  useShellOptions({ mobileTitle: admin ? 'Yönetici Paneli' : 'Yönetici' })
  return admin ? <AdminPanel /> : <AdminUnlock />
}
