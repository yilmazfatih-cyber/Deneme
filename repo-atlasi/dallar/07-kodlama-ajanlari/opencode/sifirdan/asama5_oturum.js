// Aşama 5 — Oturum kalıcılığı (JSON dosyaları)
//
// opencode v2 oturumları SQLite'ta olay kaynaklı (event-sourced) saklar: session_v2, session_message,
// session_part, session_inbox tabloları ve bir olay tablosu (packages/core/src/session/sql.ts,
// event/sql.ts). Veritabanı çalışma alanında değil, küresel veri klasöründedir
// (packages/core/src/database/database.ts). Buradaki küçük sürüm her oturumu tek bir JSON dosyasına
// yazar. Önemli fikir aynı: döngü her adımda geçmişi diskten yeniden okur, böylece süreç ölse bile
// oturum kaldığı yerden sürer. Süreç bir araç çalışırken öldüyse döngü açılışta o çağrıya "kesildi"
// sonucu yazar (asama4_dongu.js, settleDanglingToolCalls).
// Depo klasörünü çalışma alanının DIŞINDA seç: içeride olursa ajanın grep/glob araçları kendi
// konuşma kaydını bulur, write/edit onu bozabilir.

import { randomBytes } from 'node:crypto'
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** Zamana göre sıralanabilir kimlik: önce zaman damgası, sonra rastgele ek. */
export function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${randomBytes(4).toString('hex')}`
}

/**
 * @typedef {{ id: string, title: string, agent: string, createdAt: number, updatedAt: number,
 *   messages: Array<object>, compactions: number, usage: { input: number, output: number } }} Session
 */

/** Dosya tabanlı oturum deposu. Her yazma atomiktir: geçici dosya + yeniden adlandırma. */
export function createSessionStore(directory) {
  const file = (id) => {
    if (!/^ses_[a-z0-9]+$/.test(id)) throw new Error(`Geçersiz oturum kimliği: ${id}`)
    return path.join(directory, `${id}.json`)
  }

  async function save(session) {
    await mkdir(directory, { recursive: true })
    session.updatedAt = Date.now()
    const target = file(session.id)
    const temporary = `${target}.${process.pid}.${randomBytes(3).toString('hex')}.tmp`
    await writeFile(temporary, JSON.stringify(session, null, 2))
    await rename(temporary, target)
    return session
  }

  return {
    directory,
    async create({ agent = 'build', title = 'Yeni oturum' } = {}) {
      const now = Date.now()
      return save({
        id: createId('ses'),
        title,
        agent,
        createdAt: now,
        updatedAt: now,
        messages: [],
        compactions: 0,
        usage: { input: 0, output: 0 },
      })
    },
    async get(id) {
      try {
        return JSON.parse(await readFile(file(id), 'utf8'))
      } catch (error) {
        if (error.code === 'ENOENT') return undefined
        throw error
      }
    },
    save,
    async list() {
      let names = []
      try {
        names = await readdir(directory)
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
      const sessions = await Promise.all(
        names
          .filter((name) => name.endsWith('.json'))
          .map(async (name) => JSON.parse(await readFile(path.join(directory, name), 'utf8'))),
      )
      return sessions.sort((a, b) => b.updatedAt - a.updatedAt)
    },
  }
}
