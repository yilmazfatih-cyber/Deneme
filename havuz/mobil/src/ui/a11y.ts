/**
 * Erişilebilirlik durumu yardımcısı: aynı durumu hem telefonun ekran okuyucusuna (`accessibilityState`) hem web
 * derlemesine (`aria-*`) verir. React Native Web `accessibilityState` nesnesini okumaz; bu yüzden ikisi birlikte.
 *
 *   <Pressable accessibilityRole="checkbox" {...a11yState({ checked: done })} />
 *
 * Genişletme: yeni bir durum (ör. `expanded`) → ikisine birden ekleyin.
 */
export interface A11yState {
  readonly checked?: boolean
  readonly selected?: boolean
  readonly disabled?: boolean
  readonly busy?: boolean
  readonly expanded?: boolean
}

export function a11yState(state: A11yState) {
  return {
    accessibilityState: state,
    'aria-checked': state.checked,
    'aria-selected': state.selected,
    'aria-disabled': state.disabled,
    'aria-busy': state.busy,
    'aria-expanded': state.expanded,
  }
}
