// Perde — tarayıcı depolaması (localStorage). Depolama nesnesi enjekte edilebilir; testler sahte depo kullanır.
// Düzen: perde:v1:index = { ids:[{id,title,updatedAt}], current } ve perde:v1:p:<id> = proje (öğeler + sürümler).
const PREFIX = 'perde:v1:'
/** Otomatik anlık görüntüler (geri yükleme/YZ öncesi) bu sayıyı aşınca en eskisi atılır; elle kaydedilenler asla. */
export const MAX_AUTO_VERSIONS = 20

/**
 * @typedef {{ id: string, at: number, label: string, auto: boolean, title: string, elements: Array<{type: string, text: string}> }} Version
 * @typedef {{ id: string, title: string, author: string, elements: Array<{type: string, text: string}>, versions: Version[], updatedAt: number }} Project
 */

/** @param {number} [n] */
function uid(n = 8) {
  return (
    Date.now().toString(36) +
    Math.random()
      .toString(36)
      .slice(2, 2 + n)
  )
}

/**
 * @param {Pick<Storage, 'getItem'|'setItem'|'removeItem'>} storage
 * @param {() => number} [now]
 */
export function createStore(storage, now = Date.now) {
  /** @param {string} k */
  const read = (k) => {
    try {
      const raw = storage.getItem(PREFIX + k)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }
  /**
   * @param {string} k
   * @param {unknown} v
   */
  const write = (k, v) => {
    try {
      storage.setItem(PREFIX + k, JSON.stringify(v))
      return true
    } catch {
      return false
    }
  }
  const readIndex = () => {
    const idx = read('index')
    return idx && Array.isArray(idx.ids) ? idx : { ids: [], current: null }
  }

  return {
    /** @returns {Array<{id: string, title: string, updatedAt: number}>} */
    list() {
      return readIndex().ids
    },
    currentId() {
      const idx = readIndex()
      return idx.ids.some((/** @type {{id: string}} */ p) => p.id === idx.current)
        ? idx.current
        : (idx.ids[0]?.id ?? null)
    },
    /** @param {string} id */
    setCurrent(id) {
      const idx = readIndex()
      idx.current = id
      return write('index', idx)
    },
    /**
     * @param {string} id
     * @returns {Project | null}
     */
    load(id) {
      const p = read('p:' + id)
      if (!p || typeof p !== 'object') return null
      return {
        id,
        title: typeof p.title === 'string' ? p.title : 'Adsız senaryo',
        author: typeof p.author === 'string' ? p.author : '',
        elements: Array.isArray(p.elements) ? p.elements : [],
        versions: Array.isArray(p.versions) ? p.versions : [],
        updatedAt: Number(p.updatedAt) || 0,
      }
    },
    /**
     * Projeyi yazar; kota dolarsa false döner (arayüz kullanıcıyı uyarır).
     * @param {Project} project
     */
    save(project) {
      project.updatedAt = now()
      const idx = readIndex()
      const entry = { id: project.id, title: project.title, updatedAt: project.updatedAt }
      const at = idx.ids.findIndex((/** @type {{id: string}} */ p) => p.id === project.id)
      if (at >= 0) idx.ids[at] = entry
      else idx.ids.push(entry)
      if (!idx.current) idx.current = project.id
      const ok = write('p:' + project.id, project)
      return ok && write('index', idx)
    },
    /**
     * @param {{ title?: string, author?: string, elements?: Array<{type: string, text: string}> }} [init]
     * @returns {Project}
     */
    create(init = {}) {
      /** @type {Project} */
      const project = {
        id: uid(),
        title: init.title?.trim() || 'Adsız senaryo',
        author: init.author ?? '',
        elements: init.elements ?? [{ type: 'scene', text: '' }],
        versions: [],
        updatedAt: now(),
      }
      this.save(project)
      return project
    },
    /** @param {string} id */
    remove(id) {
      const idx = readIndex()
      idx.ids = idx.ids.filter((/** @type {{id: string}} */ p) => p.id !== id)
      if (idx.current === id) idx.current = idx.ids[0]?.id ?? null
      try {
        storage.removeItem(PREFIX + 'p:' + id)
      } catch {}
      return write('index', idx)
    },
    /**
     * Anlık görüntü ekler (en yenisi başta). Otomatik olanlar sınırı aşınca en eski otomatik atılır.
     * @param {Project} project
     * @param {string} label
     * @param {boolean} [auto]
     * @returns {Version}
     */
    addVersion(project, label, auto = false) {
      /** @type {Version} */
      const v = {
        id: uid(4),
        at: now(),
        label: label.trim() || (auto ? 'Otomatik' : 'Sürüm'),
        auto,
        title: project.title,
        elements: project.elements.map((e) => ({ type: e.type, text: e.text })),
      }
      project.versions.unshift(v)
      const autos = project.versions.filter((x) => x.auto)
      for (let i = autos.length - 1; i >= MAX_AUTO_VERSIONS; i--) {
        project.versions.splice(project.versions.indexOf(autos[i]), 1)
      }
      return v
    },
    /**
     * @param {Project} project
     * @param {string} versionId
     */
    removeVersion(project, versionId) {
      project.versions = project.versions.filter((v) => v.id !== versionId)
    },
  }
}
