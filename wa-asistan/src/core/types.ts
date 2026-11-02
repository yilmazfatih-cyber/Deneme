/**
 * Shared types for wa-asistan. Every module talks through these; the handler only sees
 * interfaces, so tests can run with fakes (no network, no WhatsApp).
 */
import type { Logger } from 'pino'
import type { Config } from '../config.js'

export type ChatRole = 'system' | 'user' | 'assistant'
export type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }
export interface ChatMessage {
  role: ChatRole
  content: string | ContentPart[]
}

export interface InboundMedia {
  kind: 'image' | 'audio' | 'document' | 'video' | 'sticker'
  mime: string
  fileName?: string
  /** audio/video duration in seconds when the platform reports it */
  seconds?: number
  sizeBytes?: number
  download: () => Promise<Buffer>
}

export interface InboundMessage {
  /** platform message id; dedup key together with chatJid */
  id: string
  /** normalized chat jid */
  chatJid: string
  /** normalized sender jid (DM: same as chatJid; self-chat: own jid) */
  senderJid: string
  fromMe: boolean
  /** the "message yourself" chat of the linked account */
  isSelfChat: boolean
  isGroup: boolean
  pushName?: string
  /** body or caption, trimmed; '' when none */
  text: string
  /** text of the quoted message, if any */
  quotedText?: string
  media?: InboundMedia
  /** ms since epoch */
  timestamp: number
}

export interface Sender {
  /** sends text; returns the platform id of the sent message */
  sendText(chatJid: string, text: string, opts?: { quoteId?: string }): Promise<string>
  typing(chatJid: string, on: boolean): Promise<void>
}

export interface ModelPricing {
  promptUsdPerToken: number
  completionUsdPerToken: number
  imageUsd?: number
  requestUsd?: number
}

export interface ModelInfo {
  id: string
  name: string
  contextLength?: number
  /** e.g. ['text', 'image']; ['text'] when unknown */
  inputModalities: string[]
  /** undefined when the provider publishes no price */
  pricing?: ModelPricing
  free?: boolean
}

export interface ChatRequest {
  model: string
  messages: ChatMessage[]
  maxTokens?: number
  temperature?: number
  signal?: AbortSignal
}

export interface ChatUsage {
  promptTokens: number
  completionTokens: number
  /** only when the provider reports the exact cost (OpenRouter `usage.cost`) */
  costUsd?: number
}

export interface ChatResult {
  text: string
  model: string
  usage?: ChatUsage
  finishReason?: string
}

export interface LlmClient {
  chat(req: ChatRequest): Promise<ChatResult>
  listModels(): Promise<ModelInfo[]>
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail = '',
  ) {
    super(message)
    this.name = 'LlmError'
  }
}

export interface LedgerEntry {
  ts: number
  chatJid: string
  model: string
  promptTokens: number
  completionTokens: number
  usd: number
  usdSource: 'provider' | 'estimate' | 'unknown'
  /** undefined when no USD→TRY rate was available at the time */
  rate?: number
  tl?: number
}

export interface CostSummary {
  count: number
  usd: number
  tl: number
  /** entries whose cost could not be determined */
  unknownCount: number
  byModel: Array<{ model: string; count: number; usd: number; tl: number }>
}

export interface ChatState {
  chatJid: string
  /** undefined → config.defaultModel */
  model?: string
  /** undefined → config.systemPrompt */
  systemPrompt?: string
  /** user/assistant turns only; images are replaced by '[resim]' after the turn */
  history: ChatMessage[]
  /** user notes injected into the system prompt */
  notes: string[]
  updatedAt: number
}

export interface FxRate {
  rate: number
  source: 'manual' | 'tcmb' | 'frankfurter' | 'erapi' | 'cache'
  asOf: number
}

export interface FxService {
  rate(): Promise<FxRate | undefined>
  refresh(): Promise<FxRate | undefined>
  setManual(rate: number): Promise<FxRate>
}

export interface Settings {
  monthlyBudgetTl?: number
  costFooter?: boolean
}

export interface SettingsStore {
  get(): Settings
  set(patch: Partial<Settings>): Promise<Settings>
}

export interface Catalog {
  all(): ModelInfo[]
  get(id: string): ModelInfo | undefined
  /** case-insensitive substring over id and name */
  search(query: string, limit?: number): ModelInfo[]
  resolve(query: string): { kind: 'ok'; model: ModelInfo } | { kind: 'ambiguous'; candidates: ModelInfo[] } | { kind: 'none' }
  /** built-in + user aliases resolved against the live list */
  featured(): Array<{ alias: string; model?: ModelInfo }>
  /** fetch + persist; errors propagate */
  refresh(): Promise<void>
  /** ms since the last successful fetch */
  age(): number | undefined
}

export interface Ledger {
  append(e: LedgerEntry): Promise<void>
  summary(range: { from: number; to: number }): Promise<CostSummary>
  today(now: number): Promise<CostSummary>
  month(now: number): Promise<CostSummary>
  allTime(): Promise<CostSummary>
}

export interface ChatStore {
  load(chatJid: string): Promise<ChatState>
  save(state: ChatState): Promise<void>
}

export interface AccessControl {
  isOwner(jid: string): boolean
  isAllowed(jid: string): boolean
  list(): string[]
  /** returns the normalized phone that was added */
  add(phone: string): Promise<string>
  remove(phone: string): Promise<boolean>
}

export interface Transcriber {
  transcribe(audio: Buffer, mime: string): Promise<string>
}

export interface AppContext {
  config: Config
  llm: LlmClient
  catalog: Catalog
  stt?: Transcriber
  fx: FxService
  ledger: Ledger
  store: ChatStore
  access: AccessControl
  settings: SettingsStore
  sender: Sender
  log: Logger
  /** injectable clock (ms since epoch) */
  now: () => number
  startedAt: number
}
