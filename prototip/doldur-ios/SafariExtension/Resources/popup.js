/* global browser */
const result = document.getElementById('result')

async function send(message) {
  result.textContent = '…'
  try {
    const response = await browser.runtime.sendMessage(message)
    if (response?.error) {
      result.textContent = response.error
    } else if (message.type === 'fillActiveTab') {
      result.textContent = response?.count
        ? `${response.count} alan dolduruldu: ${response.fields.join(', ')}`
        : 'Bu sayfada tanıdık bir alan bulunamadı.'
    } else {
      result.textContent = `${response?.count ?? 0} alan eski hâline döndü.`
    }
  } catch (error) {
    result.textContent = String(error)
  }
}

document
  .getElementById('fill')
  .addEventListener('click', () =>
    send({ type: 'fillActiveTab', overwrite: document.getElementById('overwrite').checked }),
  )
document.getElementById('undo').addEventListener('click', () => send({ type: 'undoActiveTab' }))
