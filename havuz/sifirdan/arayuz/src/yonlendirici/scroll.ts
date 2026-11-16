// Kaydırma konumu bağdaştırıcısı: yönlendirici her geçişten önce konumu geçmiş kaydının anahtarıyla saklar;
// geri/ileri gelince geri yükler, yeni sayfada en üste ya da `#bölüm` hedefine kaydırır. Testlerde sahte
// bağdaştırıcı verilir; tarayıcıda `windowScroll()` kullanılır.
// Genişletme: kaydırılan şey pencere değil de bir kapsayıcıysa `read/restore`'u o öğeye göre yazın.

export interface ScrollPosition {
  x: number
  y: number
}

export interface ScrollAdapter {
  read(): ScrollPosition
  restore(position: ScrollPosition): void
  toHash(id: string): void
}

export const noScroll: ScrollAdapter = {
  read: () => ({ x: 0, y: 0 }),
  restore: () => undefined,
  toHash: () => undefined,
}

/** Pencere kaydırması. Tarayıcının kendi geri yüklemesi kapatılır ki ikisi çakışmasın. */
export function windowScroll(): ScrollAdapter {
  if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual'
  return {
    read: () => ({ x: window.scrollX, y: window.scrollY }),
    restore: (position) => window.scrollTo(position.x, position.y),
    toHash: (id) => {
      const target = document.getElementById(id)
      if (target) target.scrollIntoView()
      else window.scrollTo(0, 0)
    },
  }
}
