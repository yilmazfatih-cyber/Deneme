// Arka plan işleri: webhook'a hemen 200 dönüp işi sonra yapmak için. Testler drain() ile bekler.
const pending = new Set<Promise<unknown>>()

export function background(task: () => Promise<unknown>, label = 'iş') {
  const p = task()
    .catch((e) => console.error(`[arka plan] ${label} başarısız:`, e))
    .finally(() => pending.delete(p))
  pending.add(p)
}

export async function drain() {
  while (pending.size) await Promise.all([...pending])
}
