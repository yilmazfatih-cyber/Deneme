/**
 * Profil kapısı ve profil yönetimi (Netflix "Kim izliyor?" / "Profilleri Yönet"; UX_SPEC §2 "Profil kapısı").
 *   ProfileGatePage     #/profiller                 kare avatarlar (10vw, 84–200 px), üzerine gelince beyaz çerçeve,
 *                                                   kilitli profilde kilit simgesi → PIN ekranı; "Profil Ekle" karosu.
 *                       #/profiller?profil=<guid>   o profilin PIN ekranı açık (avatar menüsünden kilitli profil)
 *   ManageProfilesPage  #/profiller/yonet           düzenleme kipi: avatarlarda kalem; ?duzenle=<guid> · ?ekle=1
 * Dışa aktarım adları SABİT.
 */
import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import type { ProfilesResponse } from '../../../../shared/devices'
import type { ProfileSummary } from '../../../../shared/types'
import { useDocumentTitle, useSession } from '../../app'
import { Avatar, Button, ButtonLink, cx, ErrorState, Icon, Logo, Spinner } from '../../ui'
import { profilesApi } from './api'
import { PinPrompt } from './PinPrompt'
import { ProfileEditor } from './ProfileEditor'
import './profiles.css'

const MAX_PROFILES_FALLBACK = 5

function GateHeader(): ReactElement {
  return (
    <header className="pf-head">
      <Logo height={30} />
    </header>
  )
}

/** Profil karosu: kare avatar + ad; düzenleme kipinde kalem örtüsü. */
function ProfileTile({
  profile,
  editing,
  busy,
  onPick,
}: {
  profile: ProfileSummary
  editing?: boolean
  busy?: boolean
  onPick: () => void
}): ReactElement {
  return (
    <button
      type="button"
      className={cx('pf-tile', editing && 'is-editing')}
      onClick={onPick}
      aria-label={
        editing ? `${profile.name} profilini düzenle` : `${profile.name}${profile.isLocked ? ', kilitli' : ''}`
      }
      aria-busy={busy || undefined}
    >
      <span className="pf-tile__avatar">
        <Avatar src={profile.avatarUrl} name={profile.name} size={200} className="pf-tile__img" />
        {editing && (
          <span className="pf-tile__edit" aria-hidden="true">
            <Icon name="edit" size={28} />
          </span>
        )}
        {busy && (
          <span className="pf-tile__busy">
            <Spinner size={40} label="Profil açılıyor" />
          </span>
        )}
      </span>
      <span className="pf-tile__name">{profile.name}</span>
      {profile.isLocked && !editing && <Icon name="lock" size={18} className="pf-tile__lock" title="Kilitli" />}
    </button>
  )
}

function AddTile({ to }: { to: string }): ReactElement {
  return (
    <Link to={to} className="pf-tile pf-tile--add" aria-label="Profil Ekle">
      <span className="pf-tile__avatar pf-tile__plus">
        <Icon name="plus" size={56} strokeWidth={1.5} />
      </span>
      <span className="pf-tile__name">Profil Ekle</span>
    </Link>
  )
}

/* ───────────── Kim izliyor? ───────────── */

export function ProfileGatePage(): ReactElement {
  useDocumentTitle('Kim izliyor?')
  const boot = useSession((s) => s.boot)
  const switchProfile = useSession((s) => s.switchProfile)
  const [params, setParams] = useSearchParams()
  const [chosen, setChosen] = useState<string | null>(null)
  const profiles = boot?.profiles ?? []
  const pinGuid = params.get('profil')
  const pinProfile = profiles.find((p) => p.guid === pinGuid) ?? null

  const openPin = (guid: string) => setParams({ profil: guid })
  const closePin = () => setParams({}, { replace: true })

  const pick = async (p: ProfileSummary) => {
    if (p.isLocked) return openPin(p.guid)
    setChosen(p.guid)
    const res = await switchProfile(p.guid)
    setChosen(null)
    if (!res.ok && res.code === 'PIN_REQUIRED') openPin(p.guid)
  }

  return (
    <div className="pf-page">
      <GateHeader />
      <main className="pf-center">
        <h1 className="pf-title">Kim izliyor?</h1>
        <ul className="pf-list">
          {profiles.map((p) => (
            <li key={p.guid}>
              <ProfileTile profile={p} busy={chosen === p.guid} onPick={() => void pick(p)} />
            </li>
          ))}
          {profiles.length < MAX_PROFILES_FALLBACK && (
            <li>
              <AddTile to="/profiller/yonet?ekle=1" />
            </li>
          )}
        </ul>
        <ButtonLink variant="outline" size="md" to="/profiller/yonet" className="pf-manage">
          Profilleri Yönet
        </ButtonLink>
      </main>
      {pinProfile && <PinPrompt profile={pinProfile} onCancel={closePin} />}
    </div>
  )
}

/* ───────────── Profilleri Yönet ───────────── */

function useProfiles(): { data: ProfilesResponse | null; error: boolean; reload: () => Promise<void> } {
  const [data, setData] = useState<ProfilesResponse | null>(null)
  const [error, setError] = useState(false)
  const reload = useCallback(async () => {
    setError(false)
    try {
      setData(await profilesApi.list())
    } catch {
      setError(true)
    }
  }, [])
  useEffect(() => {
    void reload()
  }, [reload])
  return { data, error, reload }
}

export function ManageProfilesPage(): ReactElement {
  useDocumentTitle('Profilleri Yönet')
  const reloadBoot = useSession((s) => s.reloadBoot)
  const bootProfiles = useSession((s) => s.boot?.profiles ?? [])
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { data, error, reload } = useProfiles()
  const editGuid = params.get('duzenle')
  const adding = params.has('ekle')

  /** Düzenleyiciden listeye dön: ileri gidişle açıldıysa geri, değilse yerinde. */
  const backToList = () => {
    if (location.key !== 'default' && window.history.length > 1) navigate(-1)
    else navigate('/profiller/yonet', { replace: true })
  }

  const done = async (changed: boolean) => {
    if (changed) await Promise.all([reload(), reloadBoot()])
    if (adding && changed) navigate('/profiller', { replace: true })
    else backToList()
  }

  const max = data?.maxProfiles ?? MAX_PROFILES_FALLBACK
  // Liste: yönetim verisi gelene dek açılış bağlamındaki profiller (kalem örtüsüyle)
  const list: ProfileSummary[] = data?.profiles ?? bootProfiles
  const editing = editGuid ? data?.profiles.find((p) => p.guid === editGuid) : undefined

  let body: ReactElement
  if (error && !data) {
    body = (
      <ErrorState title="Profiller yüklenemedi" message="Biraz sonra yeniden dene." onRetry={() => void reload()} />
    )
  } else if ((adding || editGuid) && !data) {
    body = <Spinner size={48} />
  } else if (adding && data) {
    body = <ProfileEditor avatars={data.avatars} canDelete={false} onDone={(c) => void done(c)} />
  } else if (editing && data) {
    body = (
      <ProfileEditor
        key={editing.guid}
        profile={editing}
        avatars={data.avatars}
        canDelete={data.profiles.length > 1}
        onDone={(c) => void done(c)}
      />
    )
  } else {
    body = (
      <>
        <h1 className="pf-title">Profilleri Yönet</h1>
        <ul className="pf-list">
          {list.map((p) => (
            <li key={p.guid}>
              <ProfileTile
                profile={p}
                editing
                onPick={() => navigate(`/profiller/yonet?duzenle=${encodeURIComponent(p.guid)}`)}
              />
            </li>
          ))}
          {list.length < max && (
            <li>
              <AddTile to="/profiller/yonet?ekle=1" />
            </li>
          )}
        </ul>
        <Button variant="play" className="pf-done" onClick={() => navigate('/profiller')}>
          Tamam
        </Button>
      </>
    )
  }

  return (
    <div className="pf-page">
      <GateHeader />
      <main className={cx('pf-center', (adding || editGuid) && 'pf-center--editor')}>{body}</main>
    </div>
  )
}
