/**
 * TV uygulaması (10-foot). İSKELET — TV ajanları dolduracak; dışa aktarım adı SABİT.
 * Kabuk, ekran biçimi 'tv' iken tüm yolları buna devreder (yol kökü /tv).
 */
import { createElement, type ReactElement } from 'react'

export function TvApp(): ReactElement {
  return createElement('main', { style: { padding: '6rem', fontSize: '2rem' } }, 'TV arayüzü hazırlanıyor…')
}
