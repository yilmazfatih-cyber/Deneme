import { useNavigate } from 'react-router-dom'
import { content, templateById, type QuickItem, type Template } from '../../content'
import { speak } from '../../lib/speech'
import { recordUsage, type BoardItem } from './items'
import { fillTemplate } from './sentence'
import { useSentence } from './store'

/** Bir karta dokunulunca: şeride ekle, sesli söyle, kullanım say. */
export function useSelectItem() {
  const addWord = useSentence((s) => s.addWord)
  return (item: BoardItem) => {
    const last = useSentence.getState().segments.at(-1)
    addWord(item)
    void recordUsage(item.id)
    if (last?.kind === 'template') {
      const template = templateById.get(last.templateId)
      void speak(template ? fillTemplate(template, item) : item.word)
    } else {
      void speak(item.word, { blob: item.audio, audioPath: item.audioPath })
    }
  }
}

/** Hızlı ihtiyaç: tek dokunuşta söyler ve şeride ekler. */
export function useSelectQuick() {
  const addPhrase = useSentence((s) => s.addPhrase)
  return (q: QuickItem) => {
    addPhrase(q.speak, q.wordId)
    if (q.wordId) void recordUsage(q.wordId)
    const word = q.wordId ? content.words.find((w) => w.id === q.wordId) : undefined
    void speak(q.speak, { audioPath: word?.audio && word.word === q.speak ? word.audio : undefined })
  }
}

export function useSelectTemplate() {
  const addTemplate = useSentence((s) => s.addTemplate)
  const navigate = useNavigate()
  return (tpl: Template) => {
    addTemplate(tpl)
    void speak(tpl.label.replace('___', '').trim())
    navigate('/konus')
  }
}
