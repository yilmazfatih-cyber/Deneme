/**
 * Quiet `touchcancel` (docs/TECH_DESIGN.md §4.6; review Faz 2 tur 1 #15). Phaser 4's TouchManager calls
 * `preventDefault()` on every `touchcancel` while touch capture is on (TouchManager.js `onTouchCancel`), and Chromium
 * logs "Ignored attempt to cancel a touchcancel event with cancelable=false" as a console error for each one (a system
 * cancel — notification shade, incoming call, edge gesture — is never cancelable). The listener on the canvas is
 * swapped for one that forwards the event to the input manager the same way and calls `preventDefault()` only when the
 * event is cancelable. What a cancelled touch means for the game is decided where it lands: `pointer.wasCanceled`
 * (DragController aborts the drag, buttons count no tap).
 */
import Phaser from 'phaser';

interface TouchManagerLike {
  readonly enabled: boolean;
  readonly capture: boolean;
  readonly target: EventTarget | null;
  onTouchCancel: (event: TouchEvent) => void;
}

interface InputManagerLike {
  readonly enabled: boolean;
  readonly touch: TouchManagerLike | null;
  onTouchCancel(event: TouchEvent): void;
}

/** Replaces the TouchManager's canvas `touchcancel` listener once the game is ready (no-op without touch input). */
export function installQuietTouchCancel(game: Phaser.Game): void {
  game.events.once(Phaser.Core.Events.READY, () => {
    const manager = game.input as unknown as InputManagerLike;
    const tm = manager.touch;
    const target = tm?.target;
    if (!tm || !target || !tm.capture) return;
    target.removeEventListener('touchcancel', tm.onTouchCancel as EventListener);
    const onTouchCancel = (event: TouchEvent): void => {
      if (event.defaultPrevented || !tm.enabled || !manager.enabled) return;
      manager.onTouchCancel(event);
      if (event.cancelable) event.preventDefault();
    };
    tm.onTouchCancel = onTouchCancel;
    target.addEventListener('touchcancel', onTouchCancel as EventListener, { passive: false });
  });
}
