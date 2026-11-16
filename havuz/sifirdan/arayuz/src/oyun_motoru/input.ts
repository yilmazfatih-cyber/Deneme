// Girdi soyutlaması: oyun "sol/sağ/zıpla" gibi EYLEMLERİ okur, tuşları değil. Klavye, dokunmatik düğmeler ve
// oyun kolu aynı eyleme bağlanabilir; eylem, kaynaklardan herhangi biri basılıysa basılıdır.
// Her fizik adımında bir "girdi karesi" alınır: basılı eylemlerin bit maskesi + bu adımda yeni basılan ve
// bırakılanlar. Oyun mantığı yalnız bu kareyi görür; tekrar oynatma da yalnız maskeleri kaydeder.
// Genişletme: yeni kaynak (ör. fare) = `setSource(kaynakAdı, eylem, basılı)` çağıran bir bağlayıcı yazın.

export interface InputFrame {
  mask: number
  pressed: number
  released: number
}

export class ActionMap<A extends string> {
  readonly actions: readonly A[]
  private readonly bits = new Map<A, number>()

  constructor(actions: readonly A[]) {
    if (actions.length > 31) throw new Error('En fazla 31 eylem tanımlanabilir (bit maskesi).')
    this.actions = actions
    actions.forEach((action, i) => this.bits.set(action, 1 << i))
  }

  bit(action: A): number {
    const bit = this.bits.get(action)
    if (bit === undefined) throw new Error(`Bilinmeyen eylem "${action}". Tanımlı eylemler: ${this.actions.join(', ')}`)
    return bit
  }

  isDown(frame: InputFrame, action: A): boolean {
    return (frame.mask & this.bit(action)) !== 0
  }

  wasPressed(frame: InputFrame, action: A): boolean {
    return (frame.pressed & this.bit(action)) !== 0
  }

  wasReleased(frame: InputFrame, action: A): boolean {
    return (frame.released & this.bit(action)) !== 0
  }
}

/** Önceki ve şimdiki maskeden kareyi kurar (tekrar oynatma da bunu kullanır). */
export function frameFromMasks(previous: number, mask: number): InputFrame {
  return { mask, pressed: mask & ~previous, released: previous & ~mask }
}

/** Cihazlardan gelen basılı/bırakıldı bilgisini toplar ve her adımda bir kare üretir. */
export class InputState<A extends string> {
  readonly map: ActionMap<A>
  private readonly held = new Map<string, number>()
  private previous = 0
  /** Basılıp aynı adım içinde bırakılan (çok kısa dokunuş) eylemler kaybolmasın. */
  private tapped = 0

  constructor(map: ActionMap<A>) {
    this.map = map
  }

  /** `source`: "klavye", "dokunma", "kol" gibi bir ad. Aynı eylemi birden çok kaynak tutabilir. */
  setSource(source: string, action: A, down: boolean): void {
    const bit = this.map.bit(action)
    const current = this.held.get(source) ?? 0
    const next = down ? current | bit : current & ~bit
    this.held.set(source, next)
    if (down) this.tapped |= bit
  }

  releaseAll(): void {
    this.held.clear()
  }

  currentMask(): number {
    let mask = 0
    for (const bits of this.held.values()) mask |= bits
    return mask
  }

  /** Bir fizik adımı için kare: o anda basılı olanlar + adım içinde basılıp bırakılanlar. */
  sample(): InputFrame {
    const mask = this.currentMask() | this.tapped
    this.tapped = 0
    const frame = frameFromMasks(this.previous, mask)
    this.previous = this.currentMask()
    return frame
  }
}

export type KeyBindings<A extends string> = Partial<Record<A, string[]>>

/** Klavye: `event.code` adlarıyla (ör. "ArrowLeft", "KeyA", "Space") eyleme bağlar. */
export function attachKeyboard<A extends string>(
  input: InputState<A>,
  bindings: KeyBindings<A>,
  target: EventTarget = window,
): () => void {
  const byCode = new Map<string, A>()
  for (const action of input.map.actions) for (const code of bindings[action] ?? []) byCode.set(code, action)
  const handle = (down: boolean) => (event: Event) => {
    const action = byCode.get((event as KeyboardEvent).code)
    if (!action) return
    event.preventDefault()
    input.setSource('klavye', action, down)
  }
  const onDown = handle(true)
  const onUp = handle(false)
  const onBlur = () => input.releaseAll()
  target.addEventListener('keydown', onDown)
  target.addEventListener('keyup', onUp)
  window.addEventListener('blur', onBlur)
  return () => {
    target.removeEventListener('keydown', onDown)
    target.removeEventListener('keyup', onUp)
    window.removeEventListener('blur', onBlur)
  }
}

/** Ekrandaki düğmeler: işaretçi (dokunma/fare) basılıyken eylem basılıdır. */
export function attachPointerButtons<A extends string>(
  input: InputState<A>,
  buttons: { element: HTMLElement; action: A }[],
): () => void {
  const cleanups = buttons.map(({ element, action }) => {
    const down = (event: PointerEvent) => {
      event.preventDefault()
      element.setPointerCapture?.(event.pointerId)
      input.setSource(`dokunma:${action}`, action, true)
    }
    const up = () => input.setSource(`dokunma:${action}`, action, false)
    element.addEventListener('pointerdown', down)
    element.addEventListener('pointerup', up)
    element.addEventListener('pointercancel', up)
    return () => {
      element.removeEventListener('pointerdown', down)
      element.removeEventListener('pointerup', up)
      element.removeEventListener('pointercancel', up)
    }
  })
  return () => cleanups.forEach((fn) => fn())
}

export interface GamepadBindings<A extends string> {
  buttons?: Partial<Record<A, number[]>>
  axes?: Partial<Record<A, { axis: number; direction: -1 | 1 }>>
  deadZone?: number
}

/** Oyun kolu: her karede yoklanır (tarayıcı olay göndermez). `pads` sınama için dışarıdan verilebilir. */
export function pollGamepads<A extends string>(
  input: InputState<A>,
  bindings: GamepadBindings<A>,
  pads: readonly (Gamepad | null)[],
): void {
  const dead = bindings.deadZone ?? 0.35
  for (const action of input.map.actions) {
    let down = false
    for (const pad of pads) {
      if (!pad) continue
      if ((bindings.buttons?.[action] ?? []).some((b) => pad.buttons[b]?.pressed)) down = true
      const axis = bindings.axes?.[action]
      if (axis && (pad.axes[axis.axis] ?? 0) * axis.direction > dead) down = true
    }
    input.setSource('kol', action, down)
  }
}
