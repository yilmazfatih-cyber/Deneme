/**
 * Sayfa değişince odağı yeni sayfanın başlığına (`<h1 data-page-title>`) taşır; ekran okuyucu kullanıcısı yeni
 * sayfaya geldiğini duyar. İlk açılışta odağa dokunulmaz. Kullanıcı (ya da `autoFocus`) bu arada bir form
 * alanına odaklandıysa odak çalınmaz.
 * Genişletme: başlıksız bir sayfa yazarsanız odak `<main>`e gider; yine de her sayfada PageHeader kullanın.
 */
import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router'

function typingInField(): boolean {
  const active = document.activeElement
  return active instanceof HTMLElement && active.matches('input, textarea, select, [contenteditable="true"]')
}

export function useRouteFocus(): void {
  const { pathname } = useLocation()
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const frame = requestAnimationFrame(() => {
      if (typingInField()) return
      const target = document.querySelector<HTMLElement>('[data-page-title]') ?? document.getElementById('ana-icerik')
      target?.focus({ preventScroll: false })
      window.scrollTo({ top: 0 })
    })
    return () => cancelAnimationFrame(frame)
  }, [pathname])
}
