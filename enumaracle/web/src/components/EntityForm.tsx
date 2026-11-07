import type { EntityInput } from '../types'
import { CheckField, TextField, fe } from './Fields'

export const EMPTY_ENTITY: EntityInput = {
  legal_name: '',
  trade_name: '',
  vkn: '',
  mersis: '',
  sector: '',
  website: '',
  city: '',
  contact_name: '',
  contact_email: '',
  contact_phone: '',
  iys_registered: false,
}

const SECTORS = [
  'Bankacılık ve finans',
  'Sigortacılık',
  'E-ticaret ve perakende',
  'Kargo ve lojistik',
  'Sağlık',
  'Enerji',
  'Telekomünikasyon',
  'Kamu',
  'Eğitim',
  'Turizm',
  'Diğer',
]

const CITIES = ['İstanbul', 'Ankara', 'İzmir', 'Bursa', 'Antalya', 'Kocaeli', 'Konya', 'Adana', 'Gaziantep', 'Kayseri']

/** Removes empty optional fields so the strict API decoder sees only meaningful values. */
export function cleanEntityInput(v: EntityInput): EntityInput {
  const out: EntityInput = {
    legal_name: v.legal_name.trim(),
    trade_name: v.trade_name.trim(),
    vkn: v.vkn.replace(/\s/g, ''),
    sector: v.sector.trim(),
    city: v.city.trim(),
    contact_name: v.contact_name.trim(),
    contact_email: v.contact_email.trim(),
    contact_phone: v.contact_phone.trim(),
    iys_registered: !!v.iys_registered,
  }
  const mersis = (v.mersis ?? '').replace(/\s/g, '')
  const website = (v.website ?? '').trim()
  if (mersis) out.mersis = mersis
  if (website) out.website = website
  return out
}

export function EntityFields({
  value,
  onChange,
  fields,
  disabled,
}: {
  value: EntityInput
  onChange: (v: EntityInput) => void
  fields: Record<string, string>
  disabled?: boolean
}) {
  const set = (k: keyof EntityInput) => (x: string) => onChange({ ...value, [k]: x })
  return (
    <>
      <fieldset className="form-section" disabled={disabled}>
        <legend>Şirket bilgileri</legend>
        <div className="grid-2">
          <TextField label="Ticari unvan" required value={value.legal_name} onValue={set('legal_name')} error={fe(fields, 'legal_name')} hint="Ticaret sicilindeki tam unvan" />
          <TextField label="Marka / kısa ad" required value={value.trade_name} onValue={set('trade_name')} error={fe(fields, 'trade_name')} />
          <TextField
            label="Vergi kimlik numarası (VKN)"
            required
            inputMode="numeric"
            maxLength={10}
            value={value.vkn}
            onValue={set('vkn')}
            error={fe(fields, 'vkn')}
            hint="10 hane"
          />
          <TextField
            label="MERSİS numarası"
            inputMode="numeric"
            maxLength={16}
            value={value.mersis ?? ''}
            onValue={set('mersis')}
            error={fe(fields, 'mersis')}
            hint="16 hane (isteğe bağlı)"
          />
          <TextField label="Sektör" required list="sector-list" value={value.sector} onValue={set('sector')} error={fe(fields, 'sector')} />
          <TextField label="Şehir" required list="city-list" value={value.city} onValue={set('city')} error={fe(fields, 'city')} />
          <TextField
            label="Web sitesi"
            type="url"
            placeholder="https://"
            value={value.website ?? ''}
            onValue={set('website')}
            error={fe(fields, 'website')}
          />
        </div>
        <CheckField
          label="İYS (İleti Yönetim Sistemi) kaydımız var"
          checked={!!value.iys_registered}
          onChecked={(c) => onChange({ ...value, iys_registered: c })}
          hint="Pazarlama aramaları için 6563 sayılı Kanun kapsamında İYS kaydı beyanı"
          disabled={disabled}
        />
        <datalist id="sector-list">
          {SECTORS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <datalist id="city-list">
          {CITIES.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </fieldset>
      <fieldset className="form-section" disabled={disabled}>
        <legend>Yetkili kişi</legend>
        <div className="grid-2">
          <TextField label="Ad soyad" required autoComplete="name" value={value.contact_name} onValue={set('contact_name')} error={fe(fields, 'contact_name')} />
          <TextField
            label="E-posta"
            type="email"
            required
            autoComplete="email"
            value={value.contact_email}
            onValue={set('contact_email')}
            error={fe(fields, 'contact_email', 'email')}
          />
          <TextField
            label="Telefon"
            type="tel"
            required
            autoComplete="tel"
            placeholder="+90 5xx xxx xx xx"
            value={value.contact_phone}
            onValue={set('contact_phone')}
            error={fe(fields, 'contact_phone')}
          />
        </div>
      </fieldset>
    </>
  )
}
