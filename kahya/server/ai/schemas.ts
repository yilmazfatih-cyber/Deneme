// Yapay zekâ görevlerinin çıktı şemaları. Claude yapılandırılmış çıktı (JSON şeması) ile bu şemalara uyar;
// kural tabanlı motor da aynı tipleri üretir. Böylece arayüz ve iş akışı motordan bağımsızdır.
import { z } from 'zod'
import {
  INTENTS,
  PRIORITIES,
  TICKET_CATEGORIES,
  type Intent,
  type Priority,
  type TicketCategory,
} from '../../shared/labels.ts'

const keys = <T extends Record<string, unknown>>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]]

export const TriageSchema = z.object({
  intent: z.enum(keys(INTENTS)).describe('Mesajın amacı'),
  category: z.enum(keys(TICKET_CATEGORIES)).describe('Konu kategorisi'),
  priority: z.enum(keys(PRIORITIES)).describe('Aciliyet'),
  summary: z.string().describe('Personel için tek cümlelik Türkçe özet'),
  needs_ticket: z.boolean().describe('Yerinde iş veya yönetim takibi gerekiyor mu'),
  ticket_title: z.string().describe('Talep başlığı, en fazla 8 kelime'),
  location: z.enum(['daire_ici', 'ortak_alan', 'bilinmiyor']),
  block_hint: z.string().nullable().describe('Mesajda geçen blok adı, yoksa null'),
  unit_hint: z.string().nullable().describe('Mesajda geçen daire/kapı numarası, yoksa null'),
  safety_advice: z.string().nullable().describe('Yalnız acil durumda sakinin hemen yapması gereken'),
  reply: z.string().describe('Sakine gönderilecek Türkçe yanıt taslağı, en fazla 4 cümle'),
})
export type Triage = z.infer<typeof TriageSchema>

export const AnswerSchema = z.object({
  answer: z.string().describe('Sakine Türkçe yanıt, en fazla 5 cümle'),
  used_sources: z.array(z.number().int()).describe('Dayanılan kaynak numaraları'),
  needs_staff: z.boolean().describe('Belgelerde yanıt yoksa veya personel işlemi gerekiyorsa true'),
})
export type Answer = z.infer<typeof AnswerSchema>

export const AnnouncementSchema = z.object({
  title: z.string().describe('Duyuru başlığı, en fazla 8 kelime'),
  body: z.string().describe('Duyuru metni, en fazla 120 kelime'),
})
export type Announcement = z.infer<typeof AnnouncementSchema>

export type { Intent, Priority, TicketCategory }
