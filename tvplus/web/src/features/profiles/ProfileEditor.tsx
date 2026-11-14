/**
 * Profil ekle / düzenle (Netflix "Profili Düzenle"): solda avatar (dokununca avatar seçici), sağda ad, "Çocuk profili",
 * profil kilidi (4 haneli PIN kur / değiştir / kaldır); altta Kaydet · İptal · Profili Sil (onaylı).
 */
import { useState, type FormEvent, type ReactElement } from 'react'
import type { AvatarOption, ManagedProfile } from '../../../../shared/devices'
import { Avatar, Button, cx, Icon, PinInput, Switch, TextField, toast } from '../../ui'
import { profileErrorText, profilesApi } from './api'

const NAME_MAX = 20

export interface ProfileEditorProps {
  /** Düzenlenen profil; yoksa yeni profil eklenir */
  profile?: ManagedProfile
  avatars: readonly AvatarOption[]
  /** Silme düğmesi (son profil silinemez) */
  canDelete: boolean
  /** Kaydedildi / silindi (true) ya da vazgeçildi (false) */
  onDone: (changed: boolean) => void
}

type View = 'form' | 'avatar' | 'delete'

export function ProfileEditor({ profile, avatars, canDelete, onDone }: ProfileEditorProps): ReactElement {
  const adding = !profile
  const [view, setView] = useState<View>('form')
  const [name, setName] = useState(profile?.name ?? '')
  const [avatarKey, setAvatarKey] = useState(profile?.avatarKey ?? avatars[0]?.key ?? '')
  const [isKids, setIsKids] = useState(profile?.isKids ?? false)
  const [lockOn, setLockOn] = useState(profile?.isLocked ?? false)
  const [changingPin, setChangingPin] = useState(false)
  const [pin, setPin] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [pinError, setPinError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const avatarUrl = avatars.find((a) => a.key === avatarKey)?.url ?? profile?.avatarUrl ?? null
  /** Yeni PIN gerekiyor mu: kilit yeni açılıyor ya da değiştiriliyor */
  const needsPin = lockOn && (!profile?.isLocked || changingPin)

  const save = async (e?: FormEvent) => {
    e?.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return setNameError('Bir ad yaz.')
    if (needsPin && pin.length !== 4) return setPinError('4 haneli bir PIN gir.')
    setBusy(true)
    try {
      if (adding) {
        const created = await profilesApi.create({ name: trimmed, avatarKey, isKids })
        if (lockOn && pin.length === 4) await profilesApi.update(created.guid, { pin })
        toast(`${trimmed} profili eklendi`, { kind: 'success' })
      } else {
        const pinChange = !lockOn ? (profile.isLocked ? null : undefined) : needsPin ? pin : undefined
        await profilesApi.update(profile.guid, {
          ...(trimmed !== profile.name ? { name: trimmed } : {}),
          ...(avatarKey !== profile.avatarKey ? { avatarKey } : {}),
          ...(isKids !== profile.isKids ? { isKids } : {}),
          ...(pinChange !== undefined ? { pin: pinChange } : {}),
        })
        toast('Profil kaydedildi', { kind: 'success' })
      }
      onDone(true)
    } catch (err) {
      setBusy(false)
      toast(profileErrorText(err, 'Kaydedilemedi. Tekrar dene.'), { kind: 'error' })
    }
  }

  const remove = async () => {
    if (!profile) return
    setBusy(true)
    try {
      await profilesApi.remove(profile.guid)
      toast(`${profile.name} profili silindi`)
      onDone(true)
    } catch (err) {
      setBusy(false)
      toast(profileErrorText(err, 'Silinemedi. Tekrar dene.'), { kind: 'error' })
    }
  }

  if (view === 'avatar') {
    return (
      <section className="pf-editor pf-editor--avatars" aria-labelledby="pf-avatar-title">
        <div className="pf-editor__bar">
          <button type="button" className="pf-editor__back" onClick={() => setView('form')} aria-label="Geri">
            <Icon name="back" size={28} />
          </button>
          <h1 className="pf-editor__title" id="pf-avatar-title">
            Avatar seç
          </h1>
          <Avatar src={avatarUrl} name={name || 'Profil'} size={48} />
        </div>
        <ul className="pf-avatar-grid">
          {avatars.map((a, i) => (
            <li key={a.key}>
              <button
                type="button"
                className={cx('pf-avatar-option', a.key === avatarKey && 'is-selected')}
                aria-pressed={a.key === avatarKey}
                aria-label={`Avatar ${i + 1}`}
                onClick={() => {
                  setAvatarKey(a.key)
                  setView('form')
                }}
              >
                <img src={a.url} alt="" loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      </section>
    )
  }

  if (view === 'delete' && profile) {
    return (
      <section className="pf-editor pf-editor--delete" aria-labelledby="pf-delete-title">
        <h1 className="pf-editor__title" id="pf-delete-title">
          Profil silinsin mi?
        </h1>
        <div className="pf-editor__divider" />
        <div className="pf-delete">
          <Avatar src={profile.avatarUrl} name={profile.name} size={120} />
          <div>
            <p className="pf-delete__name">{profile.name}</p>
            <p className="ui-body">Bu profilin listesi ve izleme geçmişi silinir. Bu işlem geri alınamaz.</p>
          </div>
        </div>
        <div className="pf-editor__divider" />
        <div className="pf-editor__actions">
          <Button variant="play" onClick={() => setView('form')} disabled={busy}>
            Profili Koru
          </Button>
          <Button variant="outline" onClick={() => void remove()} busy={busy}>
            Profili Sil
          </Button>
        </div>
      </section>
    )
  }

  return (
    <form className="pf-editor" onSubmit={(e) => void save(e)} aria-labelledby="pf-edit-title" noValidate>
      <h1 className="pf-editor__title" id="pf-edit-title">
        {adding ? 'Profil Ekle' : 'Profili Düzenle'}
      </h1>
      {adding && <p className="pf-editor__lead">TV+ izleyen başka biri için profil ekle.</p>}
      <div className="pf-editor__divider" />
      <div className="pf-editor__grid">
        <button
          type="button"
          className="pf-editor__avatar"
          onClick={() => setView('avatar')}
          aria-label="Avatarı değiştir"
          disabled={!avatars.length}
        >
          <Avatar src={avatarUrl} name={name || 'Profil'} size={128} />
          <span className="pf-editor__pencil" aria-hidden="true">
            <Icon name="edit" size={16} />
          </span>
        </button>
        <div className="pf-editor__fields">
          <TextField
            label="Profil adı"
            hideLabel
            placeholder="Ad"
            value={name}
            maxLength={NAME_MAX}
            autoFocus={adding}
            error={nameError}
            onChange={(v) => {
              setName(v)
              setNameError(null)
            }}
          />
          <Switch
            label="Çocuk profili"
            description="Yalnız çocuklara uygun içerik görünür."
            checked={isKids}
            onChange={setIsKids}
          />
          <div className="pf-editor__lock">
            <Switch
              label="Profil kilidi"
              description="Bu profile girmek için 4 haneli PIN istenir."
              checked={lockOn}
              onChange={(v) => {
                setLockOn(v)
                setPin('')
                setPinError(null)
                setChangingPin(false)
              }}
            />
            {needsPin && (
              <div className="pf-editor__pin">
                <span className="ui-meta">{profile?.isLocked ? 'Yeni PIN' : 'PIN belirle'}</span>
                <PinInput
                  value={pin}
                  onChange={(v) => {
                    setPin(v)
                    setPinError(null)
                  }}
                  error={!!pinError}
                  label="Yeni profil kilidi PIN'i"
                />
                {pinError && (
                  <p className="pf-editor__error" role="alert">
                    {pinError}
                  </p>
                )}
              </div>
            )}
            {lockOn && profile?.isLocked && !changingPin && (
              <Button variant="ghost" size="sm" icon="lock" onClick={() => setChangingPin(true)}>
                PIN'i değiştir
              </Button>
            )}
          </div>
        </div>
      </div>
      <div className="pf-editor__divider" />
      <div className="pf-editor__actions">
        <Button type="submit" variant="play" busy={busy}>
          {adding ? 'Devam' : 'Kaydet'}
        </Button>
        <Button variant="outline" onClick={() => onDone(false)} disabled={busy}>
          İptal
        </Button>
        {!adding && canDelete && (
          <Button variant="outline" onClick={() => setView('delete')} disabled={busy}>
            Profili Sil
          </Button>
        )}
      </div>
    </form>
  )
}
