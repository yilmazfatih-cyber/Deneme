// Damla gösterimi: sabit adımlı döngü + girdi (klavye, dokunma, oyun kolu) + çizim + ses + tekrar oynatma.
// Her fizik adımında girdi maskesi kaydedilir; "Son oyunu izle" aynı tohum ve maskelerle oyunu yeniden kurar
// ve sonunda durum özetini canlı oyunla karşılaştırır (belirlenimcilik gözle görülür).
// Ekranlar (menü, oyun, duraklatma, bitiş, tekrar) motorun SceneManager'ı ile yönetilir.
// Genişletme: yeni ses/duyuru = `SOUNDS` tablosuna olay → (ton, ileti) satırı; yeni ekran = yeni bir `Scene`.
import {
  actions,
  attachKeyboard,
  attachPointerButtons,
  DropletGame,
  DropletRenderer,
  FixedLoop,
  frameFromMasks,
  InputState,
  pollGamepads,
  Recorder,
  SceneManager,
  Sound,
  type Action,
  type GameEvent,
  type Recording,
  type Scene,
} from '../../src/oyun_motoru/index.ts'
import { metin } from '../metin.ts'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const canvas = $<HTMLCanvasElement>('tuval')
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
const renderer = new DropletRenderer()
const input = new InputState<Action>(actions)
const sound = new Sound()
const VIEW = { w: 320, h: 180 }
const seconds = (n: number) => n.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

let game = new DropletGame(Date.now() % 100000, undefined, VIEW)
let recorder = new Recorder(0)
let lastRecording: { recording: Recording; hash: string } | undefined
let lastHud = 0

attachKeyboard(input, {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  jump: ['Space', 'ArrowUp', 'KeyW'],
})
attachPointerButtons(input, [
  { element: $('sol'), action: 'left' },
  { element: $('sag'), action: 'right' },
  { element: $('zipla'), action: 'jump' },
])

function scale(): number {
  return (canvas.clientWidth || VIEW.w) / VIEW.w
}

function resize(): void {
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(VIEW.w * scale() * dpr)
  canvas.height = Math.round(VIEW.h * scale() * dpr)
}
new ResizeObserver(resize).observe(canvas)
resize()

const SOUNDS: Partial<Record<GameEvent, [number, number, string?]>> = {
  seed: [880, 0.08, metin.oyun.tohum],
  rain: [660, 0.12],
  hurt: [180, 0.2, metin.oyun.hasar],
  jump: [420, 0.06],
  'exit-open': [990, 0.3, metin.oyun.kaynakAcildi],
}

function onEvents(events: GameEvent[]): void {
  for (const event of events) {
    const entry = SOUNDS[event]
    if (entry) sound.tone({ frequency: entry[0], duration: entry[1], type: 'triangle' })
    if (entry?.[2]) $('duyuru').textContent = entry[2]
    if (event === 'win' || event === 'lose') finish(event === 'win')
  }
}

function overlay(text: string | undefined, button?: string): void {
  $('kaplama').hidden = text === undefined
  if (text !== undefined) $('kaplama-metni').textContent = text
  if (button) $('basla').textContent = button
}

function updateHud(): void {
  $('hud').textContent = metin.oyun.durum(
    game.seedsTotal - game.seedsLeft,
    game.seedsTotal,
    game.health,
    seconds(game.time),
  )
}

const draw = (alpha: number) => renderer.draw(ctx, game, alpha, scale() * (window.devicePixelRatio || 1), 1 / 60)

// Sahneler: yalnız en üstteki güncellenir, hepsi alttan üste çizilir (duraklatma oyunun üstünde durur).
const scenes = new SceneManager()
const idleUpdate = () => void input.sample()
const menuScene: Scene = {
  name: 'menü',
  enter: () => overlay('Hazır mısın?', 'Başla'),
  update: idleUpdate,
  render: () => draw(1),
}
const playScene: Scene = {
  name: 'oyun',
  enter: () => overlay(undefined),
  update: (dt) => {
    const frame = input.sample()
    recorder.record(frame.mask)
    game.tick(frame, dt)
    onEvents(game.events)
  },
  render: draw,
}
const pauseScene: Scene = {
  name: 'duraklat',
  enter: () => overlay(metin.oyun.duraklatildi, 'Devam et'),
  exit: () => overlay(undefined),
  update: idleUpdate,
  render: () => undefined,
}
const overScene = (text: string, button: string): Scene => ({
  name: 'bitti',
  enter: () => overlay(text, button),
  update: idleUpdate,
  render: () => draw(1),
})
const replayScene = (recording: Recording, expected: string): Scene => {
  let index = 0
  let previous = 0
  return {
    name: 'tekrar',
    enter: () => overlay(undefined),
    update: (dt) => {
      input.sample()
      const mask = recording.frames[index++]
      if (mask === undefined) {
        const message = metin.oyun.tekrarBitti(game.hash() === expected)
        $('duyuru').textContent = message
        scenes.replace(overScene(message, 'Yeni oyun'))
        return
      }
      game.tick(frameFromMasks(previous, mask), dt)
      previous = mask
    },
    render: draw,
  }
}

function finish(won: boolean): void {
  lastRecording = { recording: recorder.toJSON(), hash: game.hash() }
  $<HTMLButtonElement>('tekrar').disabled = false
  const text = won ? metin.oyun.kazandi(seconds(game.time)) : metin.oyun.kaybetti
  $('duyuru').textContent = text
  scenes.replace(overScene(text, 'Yeniden oyna'))
}

function start(): void {
  sound.unlock()
  const seed = Number(new URLSearchParams(location.search).get('tohum')) || Date.now() % 100000
  game = new DropletGame(seed, undefined, VIEW)
  recorder = new Recorder(seed)
  scenes.replace(playScene)
}

function togglePause(): void {
  if (scenes.top === playScene) scenes.push(pauseScene)
  else if (scenes.top === pauseScene) scenes.pop()
}

const loop = new FixedLoop({
  update: (dt) => {
    pollGamepads(
      input,
      { buttons: { jump: [0] }, axes: { left: { axis: 0, direction: -1 }, right: { axis: 0, direction: 1 } } },
      navigator.getGamepads?.() ?? [],
    )
    scenes.update(dt)
  },
  render: (alpha) => {
    scenes.render(alpha)
    const now = performance.now()
    if (now - lastHud > 250) {
      lastHud = now
      updateHud()
    }
  },
})

$('basla').addEventListener('click', () => (scenes.top === pauseScene ? scenes.pop() : start()))
$('yeniden').addEventListener('click', start)
$('duraklat').addEventListener('click', togglePause)
document.addEventListener('keydown', (e) => {
  if (e.code === 'KeyP' || (e.code === 'Escape' && scenes.top === playScene)) togglePause()
})
$('tekrar').addEventListener('click', () => {
  if (!lastRecording) return
  game = new DropletGame(lastRecording.recording.seed, undefined, VIEW)
  scenes.replace(replayScene(lastRecording.recording, lastRecording.hash))
  $('duyuru').textContent = metin.oyun.tekrar(lastRecording.hash)
})
$('ses').addEventListener('click', () => {
  sound.muted = !sound.muted
  $('ses').setAttribute('aria-pressed', String(!sound.muted))
  $('ses').textContent = sound.muted ? 'Ses kapalı' : 'Ses açık'
})
scenes.push(menuScene)
updateHud()
loop.start()
