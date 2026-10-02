import { create } from 'zustand'
import {
  addPhrase,
  addTemplate,
  addWord,
  undo,
  type Segment,
  type SentenceTemplate,
  type SentenceWord,
} from './sentence'

interface SentenceState {
  segments: Segment[]
  /** "Temizle" geri alınabilsin diye son temizlenen şerit saklanır. */
  cleared: Segment[] | null
  addWord: (item: SentenceWord) => void
  addTemplate: (template: SentenceTemplate) => void
  addPhrase: (text: string, itemId?: string) => void
  undo: () => void
  clear: () => void
  restore: () => void
}

export const useSentence = create<SentenceState>((set) => ({
  segments: [],
  cleared: null,
  addWord: (item) => set((s) => ({ segments: addWord(s.segments, item), cleared: null })),
  addTemplate: (template) => set((s) => ({ segments: addTemplate(s.segments, template), cleared: null })),
  addPhrase: (text, itemId) => set((s) => ({ segments: addPhrase(s.segments, text, itemId), cleared: null })),
  undo: () => set((s) => ({ segments: undo(s.segments) })),
  clear: () => set((s) => (s.segments.length ? { segments: [], cleared: s.segments } : s)),
  restore: () => set((s) => (s.cleared ? { segments: s.cleared, cleared: null } : s)),
}))

interface ToastState {
  message: string | null
  actionLabel?: string
  action?: () => void
  show: (message: string, actionLabel?: string, action?: () => void) => void
  hide: () => void
}

let toastTimer: ReturnType<typeof setTimeout> | undefined

/** Sakin bildirim; geri alınabilir işlemler için "Geri al" düğmesi taşır. */
export const useToast = create<ToastState>((set) => ({
  message: null,
  show: (message, actionLabel, action) => {
    clearTimeout(toastTimer)
    set({ message, actionLabel, action })
    toastTimer = setTimeout(() => set({ message: null, action: undefined, actionLabel: undefined }), 8000)
  },
  hide: () => {
    clearTimeout(toastTimer)
    set({ message: null, action: undefined, actionLabel: undefined })
  },
}))
