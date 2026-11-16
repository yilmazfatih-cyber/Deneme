// @vitest-environment jsdom
// JSX uyumluluğu: tsconfig'te `jsxFactory: "h"`, `jsxFragmentFactory: "Fragment"`; Vite/Vitest'te oxc aynı ayarla.
import { describe, expect, it } from 'vitest'
import { Fragment, h, render, type Child } from '../../src/sanal_dom/index.ts'

function Greeting(props: { name: string; children?: Child }): Child {
  return (
    <>
      <h1 class="title">Merhaba, {props.name}</h1>
      {props.children}
    </>
  )
}

describe('JSX', () => {
  it('JSX sözdizimi h() ve Fragment ile çalışır', () => {
    const container = document.createElement('div')
    render(
      <Greeting name="İlkay">
        <p>alt metin</p>
      </Greeting>,
      container,
    )
    expect(container.innerHTML).toBe('<h1 class="title">Merhaba, İlkay</h1><p>alt metin</p>')
    void Fragment
  })
})
