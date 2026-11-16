/**
 * Kod bloklarındaki "Kopyala" düğmesi. Pano izni yoksa düğme sessizce eski metnine döner.
 * Düğme metinleri sözlükten gelir (data-copy-label / data-copied-label).
 * Kim kullanır: src/components/Prose.astro ve CodeBlock.astro.
 */
document.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.code-copy')
  const code = button?.closest('.code-block')?.querySelector('pre code')
  if (!button || !code) return
  const reset = () => {
    button.textContent = button.dataset.copyLabel ?? button.textContent
  }
  navigator.clipboard
    .writeText(code.textContent ?? '')
    .then(() => {
      button.textContent = button.dataset.copiedLabel ?? button.textContent
      window.setTimeout(reset, 2000)
    })
    .catch(reset)
})

// Dosyayı modül yapar: üst düzey değişkenler başka betiklerle çakışmaz.
export {}
