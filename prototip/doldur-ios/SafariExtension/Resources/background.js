/* global browser */
// Açılır pencereden gelen isteği etkin sekmeye iletir. Profil yalnızca yerel mesajlaşmayla (uygulama grubundan) alınır.

browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'fillActiveTab' && message?.type !== 'undoActiveTab') return false

  ;(async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) return { error: 'Etkin sekme bulunamadı.' }

    if (message.type === 'undoActiveTab') {
      return browser.tabs.sendMessage(tab.id, { type: 'undo' })
    }
    const profile = await browser.runtime.sendNativeMessage('application.id', { type: 'getProfile' })
    if (!profile?.fields?.length) return { error: 'Profil boş. Doldur uygulamasında bilgilerinizi girin.' }
    return browser.tabs.sendMessage(tab.id, { type: 'fill', profile, overwrite: Boolean(message.overwrite) })
  })()
    .then(sendResponse)
    .catch((error) => sendResponse({ error: String(error) }))

  return true
})
