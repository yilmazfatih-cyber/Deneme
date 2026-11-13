/**
 * Masaüstü avatar menüsü (Netflix hesap menüsü): 32 px avatar + ok; üzerine gelince ya da tıklayınca açılır.
 * Öğeler: diğer profiller (kilitli profil PIN ekranına gider) · Profilleri Yönet · Cihazlar · Kaputun altı · Çıkış.
 */
import type { ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar, cx, Icon, Menu, MenuItem, MenuSeparator } from '../ui'
import { useSession } from './sessionStore'

/** "Kaputun altı" panelini aç/kapat: panelin kendi Ctrl+. kısayolunu tetikler (devtools/index.tsx). */
export function toggleDevtoolsPanel(): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '.', ctrlKey: true, bubbles: true }))
}

export function AvatarMenu(): ReactElement | null {
  const boot = useSession((s) => s.boot)
  const switchProfile = useSession((s) => s.switchProfile)
  const logout = useSession((s) => s.logout)
  const navigate = useNavigate()
  const active = boot?.activeProfile
  if (!boot || !active) return null
  const others = boot.profiles.filter((p) => p.guid !== active.guid)

  return (
    <Menu
      label="Profil menüsü"
      align="end"
      openOnHover
      className="app-avatarmenu"
      trigger={({ 'data-open': open, ...p }) => (
        <button {...p} className={cx('app-avatarmenu__btn', open && 'is-open')} aria-label={`Profil: ${active.name}`}>
          <Avatar src={active.avatarUrl} name={active.name} size={32} />
          <Icon name="caret" size={18} className="app-avatarmenu__caret" />
        </button>
      )}
      footer={
        <MenuItem footer onSelect={() => void logout()}>
          Çıkış
        </MenuItem>
      }
    >
      {others.map((p) => (
        <MenuItem
          key={p.guid}
          leading={<Avatar src={p.avatarUrl} name={p.name} size={32} />}
          onSelect={() => {
            // Kilitli profil: PIN ekranı profil kapısında açılır.
            if (p.isLocked) navigate(`/profiller?profil=${encodeURIComponent(p.guid)}`)
            else void switchProfile(p.guid)
          }}
        >
          <span className="app-avatarmenu__name">
            {p.name}
            {p.isLocked && <Icon name="lock" size={14} title="Kilitli" />}
          </span>
        </MenuItem>
      ))}
      {others.length > 0 && <MenuSeparator />}
      <MenuItem icon="edit" to="/profiller/yonet">
        Profilleri Yönet
      </MenuItem>
      <MenuItem icon="tv" to="/cihazlar">
        Cihazlar
      </MenuItem>
      <MenuItem icon="settings" onSelect={toggleDevtoolsPanel}>
        Kaputun altı
      </MenuItem>
      <MenuItem icon="user" to="/tvplusim">
        TV+'ım
      </MenuItem>
    </Menu>
  )
}
