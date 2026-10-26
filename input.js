// CARWAY TRAFFIC — InputSystem: swipe (touch), on-screen buttons, keyboard.
// Tested hooks: handleSwipe(dx, dy) is a pure decision function.

export function swipeAction(dx, dy, threshold = 24) {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (Math.max(ax, ay) < threshold) return 'tap';
  if (ax > ay) return dx > 0 ? 'right' : 'left';
  return dy < 0 ? 'up' : 'down'; // screen coords: swipe up => dy negative
}

export class InputSystem {
  // callbacks: { onLeft, onRight, onJump, onBoost, onPause, onAny }
  constructor(rootEl, callbacks = {}) {
    this.root = rootEl;
    this.cb = callbacks;
    this.touchStart = null;
    this.touchTime = 0;
    this.enabled = true;

    this._onTouchStart = this._onTouchStart.bind(this);
    this._onTouchEnd = this._onTouchEnd.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);

    rootEl.addEventListener('touchstart', this._onTouchStart, { passive: true });
    rootEl.addEventListener('touchend', this._onTouchEnd, { passive: true });
    window.addEventListener('keydown', this._onKeyDown);
  }

  _onTouchStart(e) {
    if (!this.enabled || !e.changedTouches.length) return;
    const t = e.changedTouches[0];
    this.touchStart = { x: t.clientX, y: t.clientY };
    this.touchTime = performance.now();
    if (this.cb.onAny) this.cb.onAny();
  }

  _onTouchEnd(e) {
    if (!this.enabled || !this.touchStart || !e.changedTouches.length) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - this.touchStart.x;
    const dy = t.clientY - this.touchStart.y;
    this.touchStart = null;
    const action = swipeAction(dx, dy);
    if (action === 'left' && this.cb.onLeft) this.cb.onLeft();
    else if (action === 'right' && this.cb.onRight) this.cb.onRight();
    else if (action === 'up' && this.cb.onJump) this.cb.onJump();
    // 'down' and 'tap' intentionally do nothing during gameplay
  }

  _onKeyDown(e) {
    if (!this.enabled) return;
    if (this.cb.onAny) this.cb.onAny();
    switch (e.code) {
      case 'ArrowLeft': case 'KeyA': if (this.cb.onLeft) this.cb.onLeft(); e.preventDefault(); break;
      case 'ArrowRight': case 'KeyD': if (this.cb.onRight) this.cb.onRight(); e.preventDefault(); break;
      case 'ArrowUp': case 'KeyW': case 'Space': if (this.cb.onJump) this.cb.onJump(); e.preventDefault(); break;
      case 'ShiftLeft': case 'ShiftRight': case 'KeyF': if (this.cb.onBoost) this.cb.onBoost(); e.preventDefault(); break;
      case 'KeyP': case 'Escape': if (this.cb.onPause) this.cb.onPause(); break;
    }
  }

  // Wire on-screen buttons (also unlocks audio on touch).
  bindButtons({ left, right, jump }) {
    const press = (el, fn) => {
      if (!el) return;
      el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); if (this.cb.onAny) this.cb.onAny(); if (this.enabled) fn(); }, { passive: false });
      el.addEventListener('mousedown', (e) => { e.preventDefault(); if (this.cb.onAny) this.cb.onAny(); if (this.enabled) fn(); });
    };
    press(left, () => this.cb.onLeft && this.cb.onLeft());
    press(right, () => this.cb.onRight && this.cb.onRight());
    press(jump, () => this.cb.onJump && this.cb.onJump());
  }

  destroy() {
    this.root.removeEventListener('touchstart', this._onTouchStart);
    this.root.removeEventListener('touchend', this._onTouchEnd);
    window.removeEventListener('keydown', this._onKeyDown);
  }
}
