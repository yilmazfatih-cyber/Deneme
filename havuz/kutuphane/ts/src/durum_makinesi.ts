/**
 * durum_makinesi — sonlu durum makinesi: hangi durumdan hangi olayla nereye gidileceği TEK bir tanımda durur;
 * geçersiz geçiş açık hata verir. Koşullu geçiş (guard), son durum, Mermaid diyagramı.
 *
 * Kullanım:
 *   const siparis = createMachine({
 *     initial: 'taslak',
 *     states: {
 *       taslak: { on: { GONDER: 'onayda' } },
 *       onayda: { on: { ONAYLA: 'hazirlaniyor', REDDET: 'taslak' } },
 *       hazirlaniyor: { on: { KARGOLA: { target: 'kargoda', guard: (c: { adresVar: boolean }) => c.adresVar } } },
 *       kargoda: { final: true },
 *     },
 *   })
 *   let durum = siparis.initial
 *   durum = siparis.transition(durum, 'GONDER')                 // 'onayda'
 *   siparis.can(durum, 'KARGOLA')                               // false
 *
 * Sınırlar: İç içe/paralel durum, eylem (action) ve zamanlayıcı yoktur; durumu saklamak çağıranın işidir (makine
 * saf işlevdir, kendi durumunu tutmaz). Guard'lı seçeneklerde ilk tutan kazanır.
 *
 * Genişletme: Yeni bir özellik (ör. giriş/çıkış kancası) `StateNode`'a alan olarak eklenir, kurucu denetimine ve
 * `transition`'a işlenir; Python eşine (kutuphane/durum_makinesi.py) aynı ad ve davranışla eklenir.
 */

export type Guard<C> = (context: C, event: string) => boolean
export type TransitionTarget<S extends string, C> = S | { target: S; guard?: Guard<C> }

export interface StateNode<S extends string, E extends string, C> {
  on?: Partial<Record<E, TransitionTarget<S, C> | readonly TransitionTarget<S, C>[]>>
  final?: boolean
}

export interface MachineDefinition<S extends string, E extends string, C> {
  initial: S
  states: Record<S, StateNode<S, E, C>>
}

/** Tanım hatalı (olmayan duruma geçiş, başlangıç durumu yok…). */
export class MachineError extends Error {
  override name = 'MachineError'
}

/** Bu durumda bu olay geçersiz ya da koşulu tutmadı. */
export class TransitionError extends Error {
  override name = 'TransitionError'
}

export class Machine<S extends string, E extends string, C = undefined> {
  readonly initial: S
  private readonly definition: MachineDefinition<S, E, C>

  constructor(definition: MachineDefinition<S, E, C>) {
    const names = Object.keys(definition.states)
    if (!names.includes(definition.initial)) {
      throw new MachineError(`Başlangıç durumu "${definition.initial}" tanımlı değil. Tanımlı: ${names.join(', ')}.`)
    }
    for (const [state, node] of Object.entries(definition.states) as [S, StateNode<S, E, C>][]) {
      if (node.final === true && Object.keys(node.on ?? {}).length > 0) {
        throw new MachineError(`"${state}" son durum (final); ondan geçiş tanımlanamaz.`)
      }
      for (const [event, value] of Object.entries(node.on ?? {})) {
        for (const option of toOptions<S, C>(value as TransitionTarget<S, C>)) {
          if (!names.includes(option.target)) {
            throw new MachineError(`"${state}" + ${event} → "${option.target}": böyle bir durum yok.`)
          }
        }
      }
    }
    this.initial = definition.initial
    this.definition = definition
  }

  /** Tanımlı bütün durumlar. */
  states(): S[] {
    return Object.keys(this.definition.states) as S[]
  }

  isFinal(state: S): boolean {
    return this.definition.states[state]?.final === true
  }

  /** Bu durumda tanımlı olaylar (guard'a bakmadan). */
  nextEvents(state: S): E[] {
    return Object.keys(this.definition.states[state]?.on ?? {}) as E[]
  }

  private resolve(state: S, event: E, context: C | undefined): S | undefined {
    const node = this.definition.states[state] as StateNode<S, E, C> | undefined
    if (node === undefined) throw new TransitionError(`Bilinmeyen durum: "${state}".`)
    const value = node.on?.[event]
    if (value === undefined) return undefined
    const options = toOptions<S, C>(value)
    return options.find((option) => option.guard === undefined || option.guard(context as C, event))?.target
  }

  /** Olay uygulanabilir mi? */
  can(state: S, event: E, context?: C): boolean {
    return this.resolve(state, event, context) !== undefined
  }

  /** Yeni durumu döndürür; geçiş yoksa ya da koşul tutmadıysa TransitionError fırlatır. */
  transition(state: S, event: E, context?: C): S {
    const target = this.resolve(state, event, context)
    if (target === undefined) {
      const allowed = this.nextEvents(state)
      throw new TransitionError(
        `"${state}" durumunda "${event}" uygulanamaz. Bu durumda geçerli olaylar: ${allowed.length > 0 ? allowed.join(', ') : '(yok)'}.`,
      )
    }
    return target
  }

  /** Mermaid durum diyagramı metni (belgelere yapıştırmak için). */
  toMermaid(): string {
    const lines = ['stateDiagram-v2', `  [*] --> ${this.initial}`]
    for (const [state, node] of Object.entries(this.definition.states) as [S, StateNode<S, E, C>][]) {
      for (const [event, value] of Object.entries(node.on ?? {})) {
        for (const option of toOptions<S, C>(value as TransitionTarget<S, C>)) {
          lines.push(`  ${state} --> ${option.target}: ${event}${option.guard ? ' [koşullu]' : ''}`)
        }
      }
      if (node.final === true) lines.push(`  ${state} --> [*]`)
    }
    return lines.join('\n')
  }
}

function toOptions<S extends string, C>(
  value: TransitionTarget<S, C> | readonly TransitionTarget<S, C>[],
): { target: S; guard?: Guard<C> }[] {
  const list = Array.isArray(value) ? value : [value]
  return (list as TransitionTarget<S, C>[]).map((item) => (typeof item === 'string' ? { target: item } : item))
}

/** Tanımı denetleyip makine kurar (tanım hatalıysa MachineError). */
export function createMachine<S extends string, E extends string, C = undefined>(
  definition: MachineDefinition<S, E, C>,
): Machine<S, E, C> {
  return new Machine(definition)
}
