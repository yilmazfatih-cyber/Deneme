// Odak koruma: tarayıcı, odaktaki bir öğe DOM'da taşındığında (insertBefore = çıkar + ekle) odağı düşürür.
// Anahtarlı listede odaktaki giriş alanı yer değiştirirse kullanıcı yazarken odağı kaybetmesin diye, yamalamadan
// önce odaktaki öğe ve imleç konumu kaydedilir, sonra geri yüklenir (React DOM da aynısını yapar).
// Genişletme: kaydırma konumunu da korumak isterseniz `scrollTop` değerini burada saklayıp geri yükleyin.

type Selectable = HTMLInputElement | HTMLTextAreaElement

/** Kaptaki odaklı öğeyi hatırlar; dönen işlev, öğe hâlâ belgedeyse odağı ve seçimi geri verir. */
export function preserveFocus(container: Element): () => void {
  const doc = container.ownerDocument
  const active = doc.activeElement
  if (!(active instanceof HTMLElement) || !container.contains(active)) return () => {}
  const selection = readSelection(active)
  return () => {
    if (doc.activeElement === active || !active.isConnected) return
    active.focus({ preventScroll: true })
    if (selection) (active as Selectable).setSelectionRange(selection[0], selection[1])
  }
}

function readSelection(element: HTMLElement): [number, number] | undefined {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return undefined
  try {
    const { selectionStart, selectionEnd } = element
    return selectionStart === null || selectionEnd === null ? undefined : [selectionStart, selectionEnd]
  } catch {
    return undefined // seçim desteklemeyen giriş türleri (ör. number) hata atar
  }
}
