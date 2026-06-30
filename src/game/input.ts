// Touch controls: a dynamic left-thumb joystick (appears where you touch the
// left zone) + a right-thumb KICK button. WASD/arrows + space also work for
// desktop two-tab testing.

import type { Input } from "../net/protocol";

const R = 55; // joystick travel radius (px)

export class Controls {
  private vec = { x: 0, y: 0 };
  private kickHeld = false;
  private joyId: number | null = null;
  private origin = { x: 0, y: 0 };
  private dashHeld = false;
  private base: HTMLElement;
  private knob: HTMLElement;
  private keys = new Set<string>();

  constructor(root: HTMLElement) {
    const wrap = document.createElement("div");
    wrap.className = "controls";
    wrap.innerHTML = `
      <div class="joy-zone" id="joy"></div>
      <div class="joy-base" id="base"><div class="joy-knob"></div></div>
      <button class="btn dash" id="dash" aria-label="correr">DASH</button>
      <button class="btn kick" id="kick" aria-label="patear">KICK</button>`;
    root.appendChild(wrap);

    this.base = wrap.querySelector("#base") as HTMLElement;
    this.knob = wrap.querySelector(".joy-knob") as HTMLElement;
    const joy = wrap.querySelector("#joy") as HTMLElement;
    const kick = wrap.querySelector("#kick") as HTMLElement;
    const dash = wrap.querySelector("#dash") as HTMLElement;

    joy.addEventListener("pointerdown", (e) => this.joyStart(e, joy));
    joy.addEventListener("pointermove", (e) => this.joyMove(e));
    joy.addEventListener("pointerup", (e) => this.joyEnd(e, joy));
    joy.addEventListener("pointercancel", (e) => this.joyEnd(e, joy));

    bindButton(kick, (v) => (this.kickHeld = v));
    bindButton(dash, (v) => (this.dashHeld = v));

    addEventListener("keydown", (e) => this.keys.add(e.key.toLowerCase()));
    addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
  }

  getInput(): Input {
    let mv = { ...this.vec };
    const k = this.keyVec();
    if (k.x || k.y) mv = k; // keyboard overrides joystick when used
    const l = Math.hypot(mv.x, mv.y);
    if (l > 1) {
      mv.x /= l;
      mv.y /= l;
    }
    const kick = this.kickHeld || this.keys.has(" ") || this.keys.has("spacebar");
    const dash = this.dashHeld || this.keys.has("shift") || this.keys.has("k");
    return { move: mv, dash, kick };
  }

  private joyStart(e: PointerEvent, joy: HTMLElement) {
    e.preventDefault();
    this.joyId = e.pointerId;
    joy.setPointerCapture(e.pointerId);
    this.origin = { x: e.clientX, y: e.clientY };
    this.base.style.left = `${e.clientX}px`;
    this.base.style.top = `${e.clientY}px`;
    this.base.style.opacity = "1";
    this.updateKnob(0, 0);
  }

  private joyMove(e: PointerEvent) {
    if (e.pointerId !== this.joyId) return;
    let dx = e.clientX - this.origin.x;
    let dy = e.clientY - this.origin.y;
    const l = Math.hypot(dx, dy);
    if (l > R) {
      dx = (dx / l) * R;
      dy = (dy / l) * R;
    }
    this.updateKnob(dx, dy);
    // screen-down is +dy; sim +y points up the field -> invert dy
    this.vec = { x: dx / R, y: -dy / R };
  }

  private joyEnd(e: PointerEvent, joy: HTMLElement) {
    if (e.pointerId !== this.joyId) return;
    this.joyId = null;
    try {
      joy.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    this.vec = { x: 0, y: 0 };
    this.base.style.opacity = "0";
    this.updateKnob(0, 0);
  }

  private updateKnob(dx: number, dy: number) {
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  private keyVec() {
    let x = 0;
    let y = 0;
    if (this.keys.has("a") || this.keys.has("arrowleft")) x -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) x += 1;
    if (this.keys.has("w") || this.keys.has("arrowup")) y += 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) y -= 1;
    return { x, y };
  }
}

function bindButton(el: HTMLElement, set: (v: boolean) => void) {
  const on = (v: boolean) => (e: Event) => {
    e.preventDefault();
    set(v);
  };
  el.addEventListener("pointerdown", on(true));
  el.addEventListener("pointerup", on(false));
  el.addEventListener("pointercancel", on(false));
  el.addEventListener("pointerleave", on(false));
}
