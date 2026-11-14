import { describe, expect, it } from 'vitest'
import { isLocalHostname, keyLabel, lanOriginOf, phoneRemoteUrl, remoteKeyOf } from './model'

describe('kumanda adresi', () => {
  it('kökten /#/kumanda kurar', () => {
    expect(phoneRemoteUrl('http://192.168.1.20:5200')).toBe('http://192.168.1.20:5200/#/kumanda')
    expect(phoneRemoteUrl('https://tvplus.example/')).toBe('https://tvplus.example/#/kumanda')
  })
  it('yerel adresleri tanır', () => {
    for (const h of ['localhost', '127.0.0.1', '127.1.2.3', 'tv.localhost', '::1'])
      expect(isLocalHostname(h)).toBe(true)
    expect(isLocalHostname('192.168.1.20')).toBe(false)
  })
  it('giriş doğrulama adresinden yerel ağ kökünü alır', () => {
    expect(lanOriginOf('http://10.0.0.7:5200/#/bagla?kod=ABCD1234')).toBe('http://10.0.0.7:5200')
    expect(lanOriginOf('http://localhost:5200/#/bagla?kod=X')).toBeNull()
    expect(lanOriginOf('bozuk')).toBeNull()
  })
})

describe('kumanda tuşu olayı', () => {
  const ev = {
    cat: 'device' as const,
    label: 'komut ← Deniz’in telefonu',
    at: 5,
    detail: { from: { name: 'Deniz’in telefonu', kind: 'MOBILE' }, command: { type: 'KEY', key: 'RIGHT' } },
  }
  it('KEY komutunu ve göndereni okur', () => {
    expect(remoteKeyOf(ev)).toEqual({ key: 'RIGHT', from: 'Deniz’in telefonu', at: 5 })
  })
  it('diğer komutları ve giden komutları atlar', () => {
    expect(remoteKeyOf({ ...ev, detail: { command: { type: 'CAST', viewableId: 'Channel:1' } } })).toBeNull()
    expect(remoteKeyOf({ ...ev, label: 'komut → TV' })).toBeNull()
    expect(remoteKeyOf({ ...ev, cat: 'player' as const })).toBeNull()
  })
  it('tuş adları Türkçe', () => {
    expect(keyLabel('OK')).toBe('Tamam')
    expect(keyLabel('DIGIT_7')).toBe('Rakam 7')
    expect(keyLabel('CHANNEL_DOWN')).toBe('Kanal −')
  })
})
