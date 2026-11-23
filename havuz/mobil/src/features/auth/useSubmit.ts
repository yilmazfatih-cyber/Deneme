/**
 * Form gönderme yardımcısı: meşgul durumu, alan hataları (AppError.details) ve genel hata iletisi.
 *
 *   const { busy, errors, message, submit } = useSubmit()
 *   <Button busy={busy} onPress={() => submit(async () => { await login(...) })} />
 *
 * Genişletme: bir hata koduna özel ileti gerekiyorsa `messages` eşlemiyle verin (ör. email_taken → …).
 */
import { isAppError, type ErrorCode } from '@uygulama/shared'
import { useState } from 'react'
import { errorMessage, fieldErrors } from '../../lib/errors.ts'

export function useSubmit(messages: Partial<Record<ErrorCode, string>> = {}) {
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)

  const submit = async (task: () => Promise<void>): Promise<boolean> => {
    if (busy) return false
    setBusy(true)
    setMessage(null)
    try {
      await task()
      setErrors({})
      return true
    } catch (error) {
      const fields = fieldErrors(error)
      setErrors(fields)
      const special = isAppError(error) ? messages[error.code] : undefined
      setMessage(special ?? (Object.keys(fields).length > 0 ? null : errorMessage(error)))
      return false
    } finally {
      setBusy(false)
    }
  }

  return { busy, errors, message, submit }
}
