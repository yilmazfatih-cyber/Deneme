/**
 * JSON files under DATA_DIR: atomic writes, forgiving reads, per-chat state and settings.
 * A corrupt file never stops the bot: it is moved aside (`<file>.bozuk-<timestamp>`) and a
 * fresh start is used, so the user keeps the evidence and the bot keeps answering.
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import type { ChatState, ChatStore, Settings, SettingsStore } from '../core/types.js'

export interface ReadJsonOptions {
  /** injectable clock for the `.bozuk-<timestamp>` suffix */
  now?: () => number
}

function isMissing(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'ENOENT'
}

/** `2026-03-01T12:34:56.789Z` → `20260301T123456Z` (file-name safe, sorts chronologically). */
function stamp(ms: number): string {
  return new Date(ms)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z')
}

export function corruptName(file: string, now: number): string {
  return `${file}.bozuk-${stamp(now)}`
}

function parseOrThrow(text: string): unknown {
  return JSON.parse(text) as unknown
}

/**
 * Reads and parses a JSON file. Missing → fallback. Corrupt → file renamed to
 * `<file>.bozuk-<timestamp>` and fallback returned.
 */
export async function readJson<T>(file: string, fallback: T, opts: ReadJsonOptions = {}): Promise<T> {
  let text: string
  try {
    text = await fsp.readFile(file, 'utf8')
  } catch (err) {
    if (isMissing(err)) return fallback
    throw err
  }
  try {
    return parseOrThrow(text) as T
  } catch {
    const target = corruptName(file, (opts.now ?? Date.now)())
    await fsp.rename(file, target).catch(() => undefined)
    return fallback
  }
}

/** Synchronous twin of {@link readJson}; used where a store must be ready at construction. */
export function readJsonSync<T>(file: string, fallback: T, opts: ReadJsonOptions = {}): T {
  let text: string
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch (err) {
    if (isMissing(err)) return fallback
    throw err
  }
  try {
    return parseOrThrow(text) as T
  } catch {
    const target = corruptName(file, (opts.now ?? Date.now)())
    try {
      fs.renameSync(file, target)
    } catch {
      // nothing to do: the fallback is used either way
    }
    return fallback
  }
}

/** Writes to the same file are chained so two concurrent saves cannot race on `<file>.tmp`. */
const writeChains = new Map<string, Promise<void>>()

async function writeNow(file: string, data: unknown): Promise<void> {
  await fsp.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  const text = JSON.stringify(data, null, 2) ?? 'null'
  await fsp.writeFile(tmp, `${text}\n`, 'utf8')
  await fsp.rename(tmp, file)
}

/** mkdir -p, write `<file>.tmp`, rename over `<file>`: readers never see a half-written file. */
export function atomicWriteJson(file: string, data: unknown): Promise<void> {
  const key = path.resolve(file)
  const prev = writeChains.get(key) ?? Promise.resolve()
  const next = prev.catch(() => undefined).then(() => writeNow(key, data))
  writeChains.set(key, next)
  const cleanup = () => {
    if (writeChains.get(key) === next) writeChains.delete(key)
  }
  void next.then(cleanup, cleanup)
  return next
}

/** Keeps `[A-Za-z0-9._-]`, replaces everything else with `_`; never empty, never overlong. */
export function safeFileName(jid: string): string {
  const cleaned = (jid ?? '').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 200)
  return cleaned === '' ? '_' : cleaned
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function freshState(chatJid: string, now: number): ChatState {
  return { chatJid, history: [], notes: [], updatedAt: now }
}

/** Accepts only a plausible ChatState from disk; anything else starts fresh. */
function toChatState(raw: unknown, chatJid: string, now: number): ChatState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return freshState(chatJid, now)
  const r = raw as Partial<ChatState>
  const state: ChatState = {
    chatJid,
    history: Array.isArray(r.history) ? r.history : [],
    notes: Array.isArray(r.notes) ? r.notes.filter((n): n is string => typeof n === 'string') : [],
    updatedAt: typeof r.updatedAt === 'number' && Number.isFinite(r.updatedAt) ? r.updatedAt : now,
  }
  if (typeof r.model === 'string' && r.model) state.model = r.model
  if (typeof r.systemPrompt === 'string' && r.systemPrompt) state.systemPrompt = r.systemPrompt
  return state
}

export interface FileChatStoreOptions {
  /** false → memory only (HISTORY_PERSIST=false) */
  persist: boolean
  now?: () => number
}

/** One JSON file per chat under `<dir>/chats/`, with an in-memory cache in front. */
export class FileChatStore implements ChatStore {
  private readonly cache = new Map<string, ChatState>()
  private readonly persist: boolean
  private readonly now: () => number

  constructor(
    private readonly dir: string,
    opts: FileChatStoreOptions,
  ) {
    this.persist = opts.persist
    this.now = opts.now ?? Date.now
  }

  fileFor(chatJid: string): string {
    return path.join(this.dir, 'chats', `${safeFileName(chatJid)}.json`)
  }

  async load(chatJid: string): Promise<ChatState> {
    const cached = this.cache.get(chatJid)
    if (cached) return clone(cached)
    const now = this.now()
    const raw = this.persist ? await readJson<unknown>(this.fileFor(chatJid), undefined, { now: this.now }) : undefined
    const state = raw === undefined ? freshState(chatJid, now) : toChatState(raw, chatJid, now)
    this.cache.set(chatJid, state)
    return clone(state)
  }

  async save(state: ChatState): Promise<void> {
    const copy = clone(state)
    this.cache.set(copy.chatJid, copy)
    if (this.persist) await atomicWriteJson(this.fileFor(copy.chatJid), copy)
  }
}

function stripUndefined<T extends object>(obj: T): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v
  return out as T
}

/** Runtime-editable settings (`/butce`, `/altbilgi`), persisted in one JSON file. File values win over `initial`. */
export class FileSettingsStore implements SettingsStore {
  private current: Settings

  constructor(
    private readonly file: string,
    initial: Settings,
  ) {
    const stored = readJsonSync<unknown>(file, undefined)
    const fromFile = stored && typeof stored === 'object' && !Array.isArray(stored) ? (stored as Partial<Settings>) : {}
    this.current = stripUndefined({ ...initial, ...fromFile })
  }

  get(): Settings {
    return { ...this.current }
  }

  async set(patch: Partial<Settings>): Promise<Settings> {
    const merged = stripUndefined({ ...this.current, ...patch })
    this.current = merged
    await atomicWriteJson(this.file, merged)
    return { ...merged }
  }
}
