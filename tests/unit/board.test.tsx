import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { BoardRoot, CategoryPage, QuickNeedsPage } from '../../src/app/BoardPages'
import { db } from '../../src/db'
import { useSentence } from '../../src/features/board/store'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/konus" element={<BoardRoot />} />
        <Route path="/konus/hizli" element={<QuickNeedsPage />} />
        <Route path="/konus/k/:categoryId" element={<CategoryPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
  useSentence.setState({ segments: [], cleared: null })
})

describe('pano', () => {
  it('hızlı ihtiyaçlar tek dokunuşta şeride eklenir', async () => {
    renderAt('/konus/hizli')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Su' }))
    expect(screen.getByTestId('strip-text')).toHaveTextContent('Su istiyorum')
    expect(await db.usageEvents.where('wordId').equals('su').count()).toBe(1)
  })

  it('Evet, Hayır ve Geri her ekranda var', () => {
    renderAt('/konus/hizli')
    expect(screen.getByTestId('nav-yes')).toHaveAccessibleName(/Evet/)
    expect(screen.getByTestId('nav-no')).toHaveAccessibleName(/Hayır/)
    expect(screen.getByTestId('nav-back')).toHaveAccessibleName(/Geri/)
  })

  it('kart seçilince hazır cümleler görünür ve seçilince kelimenin yerine geçer', async () => {
    renderAt('/konus/k/icecek')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Çay' }))
    expect(screen.getByTestId('strip-text')).toHaveTextContent('Çay')
    await user.click(screen.getByRole('button', { name: 'Çay istiyorum' }))
    expect(screen.getByTestId('strip-text')).toHaveTextContent(/^Çay istiyorum$/)
  })

  it('temizle geri alınabilir', async () => {
    renderAt('/konus/k/icecek')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Su' }))
    await user.click(screen.getByTestId('strip-clear'))
    expect(screen.getByTestId('strip-text')).not.toHaveTextContent('Su')
    await user.click(screen.getByRole('button', { name: 'Geri getir' }))
    expect(screen.getByTestId('strip-text')).toHaveTextContent('Su')
  })

  it('kişisel kart hazır kartın yerine aynı konumda geçer', async () => {
    await db.personalItems.put({
      id: 'p1',
      word: 'Ahmet',
      category: 'kisiler',
      replacesId: 'es',
      phrases: [],
      createdAt: 1,
    })
    renderAt('/konus/k/kisiler')
    await waitFor(() => expect(screen.getByTestId('item-es')).toHaveAccessibleName('Ahmet'))
    const tiles = screen.getAllByTestId(/^item-/)
    expect(tiles[0]).toHaveAttribute('data-testid', 'item-es')
  })
})
