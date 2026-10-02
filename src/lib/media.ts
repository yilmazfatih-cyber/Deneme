/** Mikrofon kaydı ve fotoğraf küçültme. İzin yalnızca ihtiyaç anında istenir. */

export function recordingSupported(): boolean {
  return typeof window !== 'undefined' && 'MediaRecorder' in window && !!navigator.mediaDevices?.getUserMedia
}

export interface Recording {
  stop: () => Promise<Blob>
  cancel: () => void
}

function pickMime(): string | undefined {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
  return candidates.find((m) => MediaRecorder.isTypeSupported?.(m))
}

/** Kaydı başlatır. İzin reddedilirse hata fırlatır; çağıran sakin bir açıklama gösterir. */
export async function startRecording(maxMs = 15000): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const mimeType = pickMime()
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  const chunks: BlobPart[] = []
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data)
  }
  const stopped = new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop())
      resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' }))
    }
  })
  recorder.start()
  const timer = setTimeout(() => recorder.state === 'recording' && recorder.stop(), maxMs)
  return {
    stop: () => {
      clearTimeout(timer)
      if (recorder.state === 'recording') recorder.stop()
      return stopped
    },
    cancel: () => {
      clearTimeout(timer)
      if (recorder.state === 'recording') recorder.stop()
    },
  }
}

/** Fotoğrafı tarayıcıda küçültür (telefonda yer tasarrufu). */
export async function resizeImage(file: Blob, maxSide = 800, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) return file
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', quality))
}

/** Sade, yetişkin bir onay sesi (yumuşak iki nota). Konfeti ya da alkış yok. */
export function playConfirmTone(): void {
  try {
    const Ctx =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const notes = [523.25, 659.25]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const t = ctx.currentTime + i * 0.12
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.12, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.4)
    })
    setTimeout(() => void ctx.close(), 1000)
  } catch {
    /* ses yoksa sessiz devam */
  }
}
