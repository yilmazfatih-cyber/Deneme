/**
 * Sekmeler: bir görünümün birkaç hâli arasında geçiş (ör. Açık / Tamamlanan / Tümü). Etkin sekmenin içeriği
 * `children` olarak verilir ve `tabpanel` içinde gösterilir. Klavye: ←/→ sekmeler arasında, Home/End uçlara.
 *
 *   <Tabs label="Görev durumu" value={status} onChange={setStatus}
 *         tabs={[{ value: 'open', label: 'Açık', count: 3 }, { value: 'done', label: 'Tamamlanan' }]}>
 *     …liste…
 *   </Tabs>
 *
 * Genişletme: sekmede simge gerekiyorsa `TabItem`'a `icon` ekleyin.
 */
import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cx } from './cx.ts'

export interface TabItem<T extends string> {
  readonly value: T
  readonly label: string
  readonly count?: number
}

export interface TabsProps<T extends string> {
  readonly label: string
  readonly value: T
  readonly onChange: (value: T) => void
  readonly tabs: readonly TabItem<T>[]
  readonly children: ReactNode
}

export function Tabs<T extends string>({ label, value, onChange, tabs, children }: TabsProps<T>) {
  const id = useId()
  const listRef = useRef<HTMLDivElement>(null)

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((tab) => tab.value === value)
    const target =
      event.key === 'ArrowRight'
        ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft'
          ? (index - 1 + tabs.length) % tabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? tabs.length - 1
              : -1
    const next = tabs[target]
    if (!next) return
    event.preventDefault()
    onChange(next.value)
    listRef.current?.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`)?.focus()
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        ref={listRef}
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="flex w-full gap-1 overflow-x-auto rounded-2xl bg-surface-2 p-1 sm:w-fit"
      >
        {tabs.map((tab) => {
          const selected = tab.value === value
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              id={`${id}-${tab.value}`}
              data-value={tab.value}
              aria-selected={selected}
              aria-controls={`${id}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(tab.value)}
              className={cx(
                'inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl px-4 font-semibold whitespace-nowrap transition-colors sm:flex-none',
                selected ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
              )}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={cx(
                    'rounded-full px-2 text-sm tabular-nums',
                    selected ? 'bg-accent-soft text-accent-text' : 'bg-surface',
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${value}`}>
        {children}
      </div>
    </div>
  )
}
