import { describe, expect, it } from 'vitest'
import type { ProfileSummary } from '../../../shared/types'
import { accessOf, afterLoginTarget, afterProfileTarget, decideAccess } from './guards'

const profile: ProfileSummary = { guid: 'G', name: 'Deniz', avatarUrl: '', isKids: false, maturityLevel: 110 }
const anon = { membershipStatus: 'ANONYMOUS' as const, activeProfile: null }
const member = { membershipStatus: 'CURRENT_MEMBER' as const, activeProfile: null }
const ready = { membershipStatus: 'CURRENT_MEMBER' as const, activeProfile: profile }

describe('yol erişimi', () => {
  it('sınıflar', () => {
    expect(accessOf('/vitrin')).toBe('public')
    expect(accessOf('/_ui')).toBe('public')
    expect(accessOf('/_ui/kabuk')).toBe('profile')
    expect(accessOf('/karsilama')).toBe('anonymous')
    expect(accessOf('/profiller/yonet')).toBe('member')
    expect(accessOf('/bagla')).toBe('member')
    expect(accessOf('/goz-at')).toBe('profile')
    expect(accessOf('/izle/80010001')).toBe('profile')
  })

  it('anonim karşılamaya gider, istenen adres hatırlanır', () => {
    expect(decideAccess(anon, '/goz-at')).toEqual({ kind: 'redirect', to: '/karsilama', remember: null })
    expect(decideAccess(null, '/listem')).toEqual({ kind: 'redirect', to: '/karsilama', remember: '/listem' })
    expect(decideAccess(anon, '/bagla', '?kod=KLMN-4821')).toEqual({
      kind: 'redirect',
      to: '/karsilama',
      remember: '/bagla?kod=KLMN-4821',
    })
    expect(decideAccess(anon, '/vitrin')).toEqual({ kind: 'allow' })
    expect(decideAccess(anon, '/karsilama')).toEqual({ kind: 'allow' })
  })

  it('profilsiz üye profil kapısına gider; /bagla profilsiz açılır', () => {
    expect(decideAccess(member, '/canli')).toEqual({ kind: 'redirect', to: '/profiller', remember: '/canli' })
    expect(decideAccess(member, '/profiller')).toEqual({ kind: 'allow' })
    expect(decideAccess(member, '/bagla', '?kod=X')).toEqual({ kind: 'allow' })
    expect(decideAccess(member, '/karsilama')).toEqual({ kind: 'redirect', to: '/profiller', remember: null })
  })

  it('profili seçili üye her yere girer, karşılamadan içeri yönlenir', () => {
    expect(decideAccess(ready, '/goz-at')).toEqual({ kind: 'allow' })
    expect(decideAccess(ready, '/profiller')).toEqual({ kind: 'allow' })
    expect(decideAccess(ready, '/karsilama')).toEqual({ kind: 'redirect', to: '/goz-at', remember: null })
  })

  it('giriş ve profil seçimi sonrası hedef', () => {
    expect(afterLoginTarget(member, '/bagla?kod=X')).toBe('/bagla?kod=X')
    expect(afterLoginTarget(member, '/listem')).toBe('/profiller')
    expect(afterLoginTarget(member, null)).toBe('/profiller')
    expect(afterLoginTarget(ready, '/listem')).toBe('/listem')
    expect(afterLoginTarget(ready, null)).toBe('/goz-at')
    expect(afterProfileTarget('/listem')).toBe('/listem')
    expect(afterProfileTarget(null)).toBe('/goz-at')
    expect(afterProfileTarget('/profiller/yonet')).toBe('/goz-at')
    expect(afterProfileTarget('/karsilama')).toBe('/goz-at')
  })
})
