// İşlev bileşenini çizer: kanca bağlamını kurar, işlevi çağırır, sonucu tek VNode'a çevirir.
// Çizim sırasında hata olursa en yakın üst hata sınırına (onError tanımlı örnek) iletilir ve bileşenin yerine
// boş bir düğüm bırakılır; sınır bir sonraki turda yedek görünümü çizer. Sınır yoksa hata yukarı atılır.
// Genişletme: `memo` benzeri "özellikler aynıysa çizme" iyileştirmesi `renderInstance` başında yapılabilir.
import { abortRender, beginRender, endRender, type Instance } from './instance.ts'
import { normalizeRendered, textNode, type Component, type VNode } from './vnode.ts'

export function renderInstance(instance: Instance): VNode {
  beginRender(instance)
  let result
  try {
    result = (instance.vnode.type as Component)(instance.vnode.props)
    endRender(instance)
  } catch (error) {
    abortRender()
    reportError(instance, error)
    return textNode('')
  }
  return normalizeRendered(result)
}

/** Bu çizimde bağımlılığı değişen etkileri kökün kuyruğuna ekler (çocuklar zaten eklenmiş olur). */
export function queueEffects(instance: Instance): void {
  for (const hook of instance.pendingEffects) instance.root.effects.push({ instance, hook })
  instance.pendingEffects = []
}

/** Hatayı, hatanın çıktığı bileşenin üstündeki ilk hata sınırına iletir; yoksa yeniden atar. */
export function reportError(instance: Instance, error: unknown): void {
  let boundary = instance.parent
  while (boundary && (!boundary.onError || boundary.unmounted)) boundary = boundary.parent
  if (!boundary?.onError) throw error
  boundary.onError(error)
}
