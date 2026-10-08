// Keyboard + gamepad + touch, merged into one control state.

const KEYS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  drift: ['Space'],
  nitro: ['ShiftLeft', 'ShiftRight', 'KeyN'],
  camera: ['KeyC'],
  pause: ['Escape', 'KeyP'],
  respawn: ['KeyR'],
};
const BLOCK = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

export class Input {
  constructor() {
    this.down = new Set();
    this.edges = new Set();
    this.touch = { left: false, right: false, brake: false, drift: false, nitro: false, gas: false };
    this.autoGas = false;
    this.steerSmooth = 0;
    this.enabled = true;
    window.addEventListener('keydown', (e) => {
      if (BLOCK.has(e.code)) e.preventDefault();
      if (!this.down.has(e.code)) this.edges.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => { this.down.delete(e.code); });
    window.addEventListener('blur', () => { this.down.clear(); });
    this.padPrev = [];
  }

  bindTouch(root) {
    root.querySelectorAll('[data-touch]').forEach((el) => {
      const key = el.dataset.touch;
      const on = (e) => { e.preventDefault(); this.touch[key] = true; el.classList.add('on'); try { el.setPointerCapture(e.pointerId); } catch { /* */ } };
      const off = (e) => { e.preventDefault(); this.touch[key] = false; el.classList.remove('on'); };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      el.addEventListener('lostpointercapture', off);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    });
  }

  _key(name) { return KEYS[name].some((k) => this.down.has(k)); }
  _edge(name) { return KEYS[name].some((k) => this.edges.has(k)); }

  _pad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  // Continuous controls for the car.
  read(dt) {
    const pad = this._pad();
    let steer = (this._key('right') || this.touch.right ? 1 : 0) - (this._key('left') || this.touch.left ? 1 : 0);
    let throttle = this._key('up') || this.touch.gas || this.autoGas ? 1 : 0;
    let brake = this._key('down') || this.touch.brake ? 1 : 0;
    let drift = this._key('drift') || this.touch.drift;
    let nitro = this._key('nitro') || this.touch.nitro;
    if (pad) {
      const ax = pad.axes[0] || 0;
      if (Math.abs(ax) > 0.15) steer = Math.max(-1, Math.min(1, ax * 1.15));
      throttle = Math.max(throttle, pad.buttons[7]?.value || 0);
      brake = Math.max(brake, pad.buttons[6]?.value || 0);
      drift = drift || !!pad.buttons[0]?.pressed || !!pad.buttons[5]?.pressed;
      nitro = nitro || !!pad.buttons[1]?.pressed || !!pad.buttons[2]?.pressed;
    }
    if (brake && this.autoGas && !this._key('up')) throttle = 0;
    // keyboard steering ramps in so taps are gentle
    const rate = steer === 0 ? 10 : 6.5;
    this.steerSmooth += (steer - this.steerSmooth) * Math.min(1, rate * dt);
    if (pad && Math.abs(pad.axes[0] || 0) > 0.15) this.steerSmooth = steer;
    return { throttle, brake, steer: this.steerSmooth, drift: !!drift, nitro: !!nitro };
  }

  // One-shot actions (camera, pause, respawn). Clears after reading.
  actions() {
    const pad = this._pad();
    const padEdge = (i) => {
      const now = !!pad?.buttons[i]?.pressed;
      const was = this.padPrev[i];
      this.padPrev[i] = now;
      return now && !was;
    };
    const a = {
      camera: this._edge('camera') || padEdge(3),
      pause: this._edge('pause') || padEdge(9),
      respawn: this._edge('respawn') || padEdge(8),
      throttleTap: this._edge('up') || padEdge(7),
    };
    this.edges.clear();
    return a;
  }
  anyThrottle() {
    return this._key('up') || this.touch.gas || this.autoGas || (this._pad()?.buttons[7]?.value || 0) > 0.3;
  }
}
