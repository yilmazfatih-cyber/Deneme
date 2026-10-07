/**
 * In-page gesture player (docs/TECH_DESIGN.md §10.7 item 8, R-23 device round: the same harness over `chrome://inspect`
 * where no CDP touch driver runs). Dispatches DOM touch events on the game canvas — mouse events when the device has
 * no touch support (Phaser then listens to the mouse) — so the gesture still goes through Phaser's input manager and
 * the scene's DragController. The Playwright tools use CDP `Input.dispatchTouchEvent` instead (trusted events).
 */
import type { ClientPoint, TouchPlan } from './api.ts';

const nextFrame = (): Promise<number> => new Promise((resolve) => requestAnimationFrame(resolve));

async function until(t: number): Promise<void> {
  while (performance.now() < t) await nextFrame();
}

function touchAt(canvas: HTMLCanvasElement, p: ClientPoint): Touch {
  return new Touch({
    identifier: 1,
    target: canvas,
    clientX: p.x,
    clientY: p.y,
    pageX: p.x + window.scrollX,
    pageY: p.y + window.scrollY,
    screenX: p.x,
    screenY: p.y,
    radiusX: 4,
    radiusY: 4,
    force: 1,
  });
}

function touchEvent(canvas: HTMLCanvasElement, type: string, p: ClientPoint): void {
  const t = touchAt(canvas, p);
  const active = type === 'touchend' ? [] : [t];
  canvas.dispatchEvent(
    new TouchEvent(type, {
      touches: active,
      targetTouches: active,
      changedTouches: [t],
      bubbles: true,
      cancelable: true,
      composed: true,
    }),
  );
}

function mouseEvent(canvas: HTMLCanvasElement, type: string, p: ClientPoint): void {
  canvas.dispatchEvent(
    new MouseEvent(type, {
      clientX: p.x,
      clientY: p.y,
      screenX: p.x,
      screenY: p.y,
      button: 0,
      buttons: type === 'mouseup' ? 0 : 1,
      bubbles: true,
      cancelable: true,
    }),
  );
}

/** Plays one gesture with its own timing (press, timed moves, release). */
export async function dispatchGesture(
  canvas: HTMLCanvasElement,
  plan: TouchPlan,
  touch: boolean,
  waitGameMs: (ms: number) => Promise<void>,
): Promise<void> {
  const send = (kind: 'start' | 'move' | 'end', p: ClientPoint): void => {
    if (touch)
      touchEvent(canvas, kind === 'start' ? 'touchstart' : kind === 'move' ? 'touchmove' : 'touchend', p);
    else mouseEvent(canvas, kind === 'start' ? 'mousedown' : kind === 'move' ? 'mousemove' : 'mouseup', p);
  };
  const first = plan.moves[0]?.atMs ?? 0;
  send('start', plan.down);
  // rest for the lift hold in game time (lift by time + offset glide before the first move)
  await waitGameMs(first);
  const t0 = performance.now() - first;
  let last: ClientPoint = plan.down;
  for (const m of plan.moves) {
    await until(t0 + m.atMs);
    send('move', m);
    last = m;
  }
  await until(t0 + plan.upAtMs);
  send('end', last);
}
