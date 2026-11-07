import { useState } from 'react'
import { api, items } from '../../api'
import { useAuth } from '../../auth'
import { CertTable } from '../../components/CertTable'
import { ConfirmDialog } from '../../components/Dialog'
import { ListState, Notice, PageHeader } from '../../components/Feedback'
import { useAction, useApi } from '../../hooks'

export function MyCertificatesPage() {
  const { has } = useAuth()
  const canWrite = has('enterprise:write')
  const res = useApi(() => api.myCertificates(), 'certs')
  const [confirm, setConfirm] = useState(false)
  const [issued, setIssued] = useState<string | null>(null)
  const action = useAction()

  const issue = async () => {
    const c = await action.run(() => api.issueCertificate())
    if (c) {
      setConfirm(false)
      setIssued(`Sertifika düzenlendi: ${c.subject_cn} (seri ${c.serial}).`)
      res.reload()
    }
  }

  return (
    <>
      <PageHeader
        title="Sertifikalar"
        description="Kendi aramalarınızı imzalamak için yetki devri (RFC 9060 delegate) sertifikaları"
        actions={
          canWrite ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                action.reset()
                setConfirm(true)
              }}
            >
              Sertifika düzenle
            </button>
          ) : null
        }
      />
      <Notice tone="info">
        Sertifika, şirketinizin <strong>etkin</strong> numaralarını kapsar (TNAuthList). Numara ekledikten veya çıkardıktan sonra yeni
        bir sertifika düzenleyin. Şirketiniz doğrulanmış olmalıdır.
      </Notice>
      {issued ? <Notice tone="success">{issued}</Notice> : null}
      <ListState loading={res.loading} error={res.error} items={res.data ? items(res.data) : undefined} empty="Henüz sertifikanız yok." onRetry={res.reload}>
        {(list) => <CertTable certs={list} />}
      </ListState>
      {confirm ? (
        <ConfirmDialog
          title="Yetki devri sertifikası düzenle"
          confirmText="Düzenle"
          pending={action.pending}
          error={action.error}
          onCancel={() => setConfirm(false)}
          onConfirm={issue}
          message={<p>Etkin numaralarınızı kapsayan yeni bir sertifika düzenlenecek. Özel anahtar operatör sisteminde mühürlü saklanır.</p>}
        />
      ) : null}
    </>
  )
}
