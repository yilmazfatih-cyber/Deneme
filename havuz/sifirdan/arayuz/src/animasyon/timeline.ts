// Zaman çizelgesi: animasyonları yerleştirip tek bir oynatıcıyla yönetir. Konum:
//   sayı     → mutlak başlangıç (ms)
//   '>'      → bir öncekinin bitişinde (varsayılan; sıralı)
//   '<'      → bir öncekiyle aynı anda başla (paralel)
//   '+=100'  → bir öncekinin bitişinden 100 ms sonra;  '-=100' → 100 ms önce (örtüşme)
// Çizim kuralı: önce henüz başlamamış çocuklar (sondan başa) başlangıç durumlarına, sonra başlamış olanlar
// başlangıç sırasıyla güncel durumlarına çizilir; aynı özelliği süren iki çocukta en son başlayan kazanır ve
// geri sarmada (seek) eski durum doğru geri gelir.
// Genişletme: etiketli konumlar ('giris+=200') için `labels` haritası ve `addLabel` eklenebilir.
import { Player, type Playable } from './player.ts'
import type { Ticker } from './ticker.ts'

export type Position = number | '<' | '>' | `+=${number}` | `-=${number}`

export class Timeline extends Player {
  private readonly items: { child: Playable; start: number }[] = []
  private previousStart = 0
  private previousEnd = 0

  constructor(ticker?: Ticker) {
    super(ticker)
  }

  get duration(): number {
    return this.items.reduce((max, item) => Math.max(max, item.start + item.child.duration), 0)
  }

  /** Çocuk animasyon `autoplay: false` ile kurulmalıdır (zamanını çizelge yönetir). */
  add(child: Playable, position: Position = '>'): this {
    let start: number
    if (typeof position === 'number') start = position
    else if (position === '<') start = this.previousStart
    else if (position === '>') start = this.previousEnd
    else start = this.previousEnd + (position.startsWith('+=') ? 1 : -1) * Number(position.slice(2))
    start = Math.max(0, start)
    this.items.push({ child, start })
    this.previousStart = start
    this.previousEnd = start + child.duration
    return this
  }

  render(time: number): void {
    const pending = this.items.filter((item) => item.start > time)
    const active = this.items.filter((item) => item.start <= time).sort((a, b) => a.start - b.start)
    for (const item of pending.reverse()) item.child.render(0)
    for (const item of active) item.child.render(Math.min(item.child.duration, time - item.start))
  }
}

export function timeline(ticker?: Ticker): Timeline {
  return new Timeline(ticker)
}

/** Kademeli başlangıç: i. öğe `start + i·each` ms'de başlar (liste öğelerinin sırayla belirmesi). */
export function stagger(each: number, start = 0): (index: number) => number {
  return (index) => start + index * each
}
