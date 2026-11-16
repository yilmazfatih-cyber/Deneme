/**
 * Duyuru şeridini kapatma düğmesi. Tercihi tarayıcıda saklar; <head>'deki satır içi betik sonraki
 * sayfalarda şeridi ilk boyamadan önce gizler (sayfa kaymaz).
 * Kim kullanır: src/components/AnnouncementBar.astro.
 */
const bar = document.querySelector<HTMLElement>('[data-announcement]')
const button = bar?.querySelector<HTMLButtonElement>('[data-announcement-dismiss]')

if (bar && button) {
  button.hidden = false
  button.addEventListener('click', () => {
    try {
      localStorage.setItem('duyuru-kapali', bar.dataset.announcement ?? '')
    } catch {
      // Gizli pencerede depolama kapalı olabilir; şerit yalnız bu sayfada kapanır.
    }
    document.documentElement.setAttribute('data-announcement-hidden', '')
    document.getElementById('icerik')?.focus()
  })
}

// Dosyayı modül yapar: üst düzey değişkenler başka betiklerle çakışmaz.
export {}
