import { useState } from 'react'
import { api, items } from '../../api'
import { useAuth } from '../../auth'
import { CertTable } from '../../components/CertTable'
import { ConfirmDialog } from '../../components/Dialog'
import { ListState, Notice, PageHeader } from '../../components/Feedback'
import { TextField, fe } from '../../components/Fields'
import { useAction, useApi } from '../../hooks'
import type { Certificate } from '../../types'
import { useEntityNames } from './useEntityNames'

export function CertificatesPage() {
  const { has } = useAuth()
  const canWrite = has('admin')
  const res = useApi(() => api.adminCertificates(), 'certs')
  const names = useEntityNames()
  const [revoking, setRevoking] = useState<Certificate | null>(null)
  const [reason, setReason] = useState('')
  const [rotating, setRotating] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const action = useAction()

  const revoke = async () => {
    if (!revoking) return
    const c = await action.run(() => api.revokeCertificate(revoking.id, reason.trim()))
    if (c) {
      setDone(`${c.subject_cn} iptal edildi.`)
      setRevoking(null)
      res.reload()
    }
  }

  const rotate = async () => {
    const c = await action.run(() => api.rotateSP())
    if (c) {
      setDone(`Yeni SP sertifikası düzenlendi (seri ${c.serial}). Eski sertifika emekliye ayrıldı.`)
      setRotating(false)
      res.reload()
    }
  }

  return (
    <>
      <PageHeader
        title="Sertifikalar"
        description="STIR/SHAKEN pilot PKI: kök, ara, operatör SP ve kurum yetki devri sertifikaları"
        actions={
          canWrite ? (
            <button
              type="button"
              className="btn"
              onClick={() => {
                action.reset()
                setRotating(true)
              }}
            >
              SP sertifikasını yenile
            </button>
          ) : null
        }
      />
      {done ? <Notice tone="success">{done}</Notice> : null}
      <ListState loading={res.loading} error={res.error} items={res.data ? items(res.data) : undefined} empty="Sertifika yok." onRetry={res.reload}>
        {(list) => (
          <CertTable
            certs={list}
            entityNames={names}
            onRevoke={
              canWrite
                ? (c) => {
                    action.reset()
                    setReason('')
                    setRevoking(c)
                  }
                : undefined
            }
          />
        )}
      </ListState>
      {revoking ? (
        <ConfirmDialog
          title="Sertifikayı iptal et"
          confirmText="İptal et"
          danger
          pending={action.pending}
          error={Object.keys(action.fields).length ? null : action.error}
          onCancel={() => setRevoking(null)}
          onConfirm={revoke}
          message={
            <p>
              <strong>{revoking.subject_cn}</strong> geri alınamaz şekilde iptal edilecek. Bu sertifikayla imzalanan PASSporT'lar
              doğrulamada başarısız olur.
            </p>
          }
        >
          <TextField label="İptal gerekçesi" required value={reason} onValue={setReason} error={fe(action.fields, 'reason')} />
        </ConfirmDialog>
      ) : null}
      {rotating ? (
        <ConfirmDialog
          title="SP sertifikasını yenile"
          confirmText="Yenile"
          pending={action.pending}
          error={action.error}
          onCancel={() => setRotating(false)}
          onConfirm={rotate}
          message={<p>Yeni bir operatör SP sertifikası düzenlenir ve imzalamada kullanılır; mevcut sertifika emekliye ayrılır.</p>}
        />
      ) : null}
    </>
  )
}
