// Animasyon gösterimi: eğri çizimi + top, yay sürgüleri + zaman grafiği + retarget, OKLab/sRGB şeritleri,
// zaman çizelgesi (kademeli kutular), FLIP liste karıştırma, hareket azaltma düğmesi.
// Genişletme: yeni bölüm = HTML'de bir <section> + burada kendi kurulum işlevi.
import {
  dampingRatio,
  EASINGS,
  flip,
  getMotionPreference,
  mixColors,
  mixSrgb,
  setMotionPreference,
  settleTime,
  springAnimation,
  springState,
  stagger,
  timeline,
  tween,
  type SpringAnimation,
  type Timeline,
} from '../../src/animasyon/index.ts'
import { metin } from '../metin.ts'

const $ = <T extends Element>(id: string) => document.getElementById(id) as unknown as T
const SVG = 'http://www.w3.org/2000/svg'
function svgPath(svg: SVGSVGElement, d: string, cls: string): void {
  const p = document.createElementNS(SVG, 'path')
  p.setAttribute('d', d)
  p.setAttribute('class', cls)
  svg.append(p)
}
const trackWidth = (ball: HTMLElement) => (ball.parentElement?.clientWidth ?? 300) - 30

// 1) Yumuşatma eğrisi
const select = $<HTMLSelectElement>('egri')
for (const name of Object.keys(EASINGS)) select.append(new Option(name, name))
select.value = 'easeInOut'
function drawCurve(): void {
  const svg = $<SVGSVGElement>('egri-cizim')
  svg.replaceChildren()
  const fn = EASINGS[select.value] ?? ((t: number) => t)
  svgPath(svg, 'M0 200H200M0 200V0', 'eksen')
  const points = Array.from(
    { length: 101 },
    (_, i) => `${i === 0 ? 'M' : 'L'}${i * 2} ${(200 - fn(i / 100) * 200).toFixed(2)}`,
  )
  svgPath(svg, points.join(''), 'egri')
}
select.addEventListener('change', drawCurve)
drawCurve()
$('egri-oynat').addEventListener('click', () => {
  const ball = $<HTMLElement>('egri-top')
  tween({
    from: 0,
    to: trackWidth(ball),
    duration: 900,
    easing: EASINGS[select.value],
    onUpdate: (x) => (ball.style.transform = `translateX(${x}px)`),
  })
})

// 2) Yay
let spring: SpringAnimation | undefined
let springTarget = 1
const springConfig = () => ({
  stiffness: Number($<HTMLInputElement>('sertlik').value),
  damping: Number($<HTMLInputElement>('sonum').value),
})
function drawSpring(): void {
  const config = springConfig()
  $('sertlik-deger').textContent = String(config.stiffness)
  $('sonum-deger').textContent = String(config.damping)
  $('yay-durum').textContent = metin.animasyon.yay(dampingRatio(config).toFixed(2), settleTime(0, 1, config).toFixed(2))
  const svg = $<SVGSVGElement>('yay-cizim')
  svg.replaceChildren()
  svgPath(svg, 'M0 120H300M0 120V-20', 'eksen')
  svgPath(svg, 'M0 20H300', 'eksen hedef')
  const pts = Array.from({ length: 151 }, (_, i) => {
    const y = springState(0, 1, (i / 150) * 1.5, { ...config, restDisplacement: 0, restVelocity: 0 }).position
    return `${i === 0 ? 'M' : 'L'}${i * 2} ${(120 - y * 100).toFixed(2)}`
  })
  svgPath(svg, pts.join(''), 'egri')
}
for (const id of ['sertlik', 'sonum']) $(id).addEventListener('input', drawSpring)
drawSpring()
$('yay-oynat').addEventListener('click', () => {
  const ball = $<HTMLElement>('yay-top')
  spring?.stop()
  springTarget = 1
  spring = springAnimation({
    from: 0,
    to: trackWidth(ball),
    config: springConfig(),
    onUpdate: (x) => (ball.style.transform = `translateX(${x}px)`),
  })
})
$('yay-hedef').addEventListener('click', () => {
  const ball = $<HTMLElement>('yay-top')
  springTarget = springTarget === 1 ? 0.3 : 1
  spring?.retarget(trackWidth(ball) * springTarget)
})

// 3) Renk şeritleri
function drawStrips(): void {
  const a = $<HTMLInputElement>('renk-a').value
  const b = $<HTMLInputElement>('renk-b').value
  for (const [id, mix] of [
    ['serit-oklab', mixColors(a, b)],
    ['serit-srgb', mixSrgb(a, b)],
  ] as const) {
    $(id).replaceChildren(
      ...Array.from({ length: 11 }, (_, i) => {
        const span = document.createElement('span')
        span.style.background = mix(i / 10)
        return span
      }),
    )
  }
}
for (const id of ['renk-a', 'renk-b']) $(id).addEventListener('input', drawStrips)
drawStrips()

// 4) Zaman çizelgesi
const boxes = Array.from({ length: 5 }, () => document.createElement('div'))
$('kutular').append(...boxes)
const at = stagger(90)
let line: Timeline | undefined
function buildTimeline(): Timeline {
  const tl = timeline()
  boxes.forEach((box, i) =>
    tl.add(
      tween({
        from: { y: 0, o: 1 },
        to: { y: -40, o: 0.45 },
        duration: 380,
        autoplay: false,
        onUpdate: (v) => {
          box.style.transform = `translateY(${v.y}px)`
          box.style.opacity = String(v.o)
        },
      }),
      at(i),
    ),
  )
  return tl
}
$('cizelge-oynat').addEventListener('click', () => {
  line ??= buildTimeline()
  line.direction = 1
  line.play()
})
$('cizelge-ters').addEventListener('click', () => {
  line ??= buildTimeline()
  line.direction = -1
  line.play()
})

// 5) FLIP
let shuffles = 0
$('karistir').addEventListener('click', () => {
  const list = $<HTMLUListElement>('sehirler')
  const items = [...list.children] as HTMLElement[]
  flip(items, () => {
    // Belirlenimci karıştırma: her basışta listeyi iki adım döndür; her üçüncü basışta ters çevir.
    shuffles++
    const turn = 2 % items.length
    const rotated = [...items.slice(turn), ...items.slice(0, turn)]
    list.append(...(shuffles % 3 === 0 ? rotated.reverse() : rotated))
  })
})

// 6) Hareket tercihi
const motion = $<HTMLButtonElement>('hareket')
motion.addEventListener('click', () => {
  const reduce = getMotionPreference() !== 'reduce'
  setMotionPreference(reduce ? 'reduce' : 'system')
  motion.setAttribute('aria-pressed', String(reduce))
  motion.textContent = reduce ? metin.animasyon.hareket(true) : 'Hareketi azalt'
})
