// CARWAY TRAFFIC — VaporSystem: soft white compressed-gas vapor for nitro
// purge trails + jump takeoff puffs. Pooled billboard sprites (THREE.Sprite),
// one shared radial texture, per-particle material only for opacity/color.
// World-space particles: emitters follow the car, vapor drifts behind.
import * as THREE from '../../libs/three.module.js';

const POOL = 64; // sized for the High quality budget; lower tiers use less
const NITRO_RATE = 36; // particles per second across both outlets while boosting
const AIR_RATE = 26; // underbody vapor per second at full airborne strength

export class VaporSystem {
  constructor(scene) {
    this.scene = scene;
    this.emitAcc = 0;
    this.airAcc = 0;
    // Quality scaling: budget caps live particles, countScale thins rates.
    this.budget = POOL;
    this.countScale = 1;
    this._live = 0;

    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0.0, 'rgba(255,255,255,0.85)');
    grad.addColorStop(0.45, 'rgba(245,250,255,0.38)');
    grad.addColorStop(1.0, 'rgba(240,248,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    this.tex = new THREE.CanvasTexture(c);

    this.items = [];
    for (let i = 0; i < POOL; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this.tex, transparent: true, opacity: 0, depthWrite: false,
      });
      const sp = new THREE.Sprite(mat);
      sp.visible = false;
      sp.renderOrder = 5;
      scene.add(sp);
      this.items.push({
        sp, life: 0, max: 1, vx: 0, vy: 0, vz: 0,
        size0: 0.4, size1: 1.2, op0: 0.3, drag: 1.5,
      });
    }
  }

  reset() {
    for (const p of this.items) { p.life = 0; p.sp.visible = false; p.sp.material.opacity = 0; }
    this.emitAcc = 0;
    this.airAcc = 0;
    this._live = 0;
  }

  // Quality scaling (Low/Medium/High): fewer particles on weaker phones.
  setBudget(n) {
    this.budget = Math.max(4, Math.min(POOL, n | 0));
  }
  setCountScale(s) {
    this.countScale = Math.max(0.2, Math.min(1.5, s));
  }

  activeCount() {
    return this._live;
  }

  _spawn(x, y, z, vx, vy, vz, life, size0, size1, op0, tint) {
    // Budget gate: over-budget emits are dropped (never recycled live ones),
    // so jump + nitro together can never overload a weak phone.
    if (this._live >= this.budget) return false;
    for (const p of this.items) {
      if (p.life > 0) continue;
      p.life = p.max = life;
      p.sp.position.set(x, y, z);
      p.vx = vx; p.vy = vy; p.vz = vz;
      p.size0 = size0; p.size1 = size1; p.op0 = op0;
      p.sp.material.color.set(tint);
      p.sp.material.opacity = 0;
      p.sp.scale.set(size0, size0, 1);
      p.sp.visible = true;
      this._live++;
      return true;
    }
    return false; // pool exhausted: skip (never steal — stays thin)
  }

  _pickTint() {
    const r = Math.random();
    if (r < 0.62) return 0xffffff;      // soft white vapor
    if (r < 0.85) return 0xe8f2ff;      // cool white
    return 0xbfe0ff;                    // subtle blue highlight
  }

  // Nitro skews bluer than jump vapor so the two trails read differently.
  _pickNitroTint() {
    const r = Math.random();
    if (r < 0.45) return 0xcfe6ff;      // icy blue-white
    if (r < 0.8) return 0x9fd0ff;       // light blue
    return 0xffffff;
  }

  // Continuous nitro purge: thin directional streams trailing backward (+Z).
  emitNitro(dt, origins) {
    this.emitAcc += NITRO_RATE * this.countScale * dt;
    while (this.emitAcc >= 1) {
      this.emitAcc -= 1;
      const o = origins[(Math.random() * origins.length) | 0];
      this._spawn(
        o.x + (Math.random() - 0.5) * 0.25,
        o.y + (Math.random() - 0.5) * 0.25,
        o.z + Math.random() * 0.3,
        (Math.random() - 0.5) * 2.4,          // lateral dispersion
        0.4 + Math.random() * 1.2,            // slight rise
        5.0 + Math.random() * 4.0,            // trail backward with motion
        0.5 + Math.random() * 0.4,            // lifetime
        0.30 + Math.random() * 0.15,          // start size
        1.0 + Math.random() * 0.6,            // grown size
        0.26 + Math.random() * 0.12,          // gentle opacity
        this._pickNitroTint(),
      );
    }
  }

  // Airborne underbody vapor: soft white billows venting down/out while the
  // car flies. `strength` 1→0 tapers launch surge into a thin wisp; the
  // origins follow the car (lane changes + nitro included).
  emitAir(dt, origins, strength = 1) {
    if (strength <= 0) return;
    this.airAcc += AIR_RATE * this.countScale * strength * dt;
    while (this.airAcc >= 1) {
      this.airAcc -= 1;
      const o = origins[(Math.random() * origins.length) | 0];
      this._spawn(
        o.x + (Math.random() - 0.5) * 1.6,    // wide underbody sheet
        Math.max(0.1, o.y - 0.1 + (Math.random() - 0.5) * 0.2),
        o.z + (Math.random() - 0.5) * 1.2,
        (Math.random() - 0.5) * 5.0,          // billow outward
        -0.6 - Math.random() * 1.2,           // vent downward
        2.0 + Math.random() * 3.0,            // drift back
        0.45 + Math.random() * 0.3,           // lifetime
        0.35 + Math.random() * 0.15,          // start size
        1.3 + Math.random() * 0.7,            // grown size (expand then fade)
        0.30 + Math.random() * 0.12,
        this._pickTint(),
      );
    }
  }

  // Brief takeoff/landing puff. `small=true` when nitro is already purging so the
  // combined cloud never gets dense.
  burst(origins, small = false) {
    const n = Math.max(2, Math.round((small ? 4 : 7) * this.countScale));
    for (let i = 0; i < n; i++) {
      const o = origins[i % origins.length];
      this._spawn(
        o.x + (Math.random() - 0.5) * 0.5,
        Math.max(0.15, o.y - 0.2 + (Math.random() - 0.5) * 0.3),
        o.z + Math.random() * 0.4,
        (Math.random() - 0.5) * 4.0,
        0.5 + Math.random() * 1.6,
        2.0 + Math.random() * 3.0,
        0.35 + Math.random() * 0.2,
        0.25 + Math.random() * 0.1,
        0.8 + Math.random() * 0.4,
        small ? 0.28 : 0.38,
        this._pickTint(),
      );
    }
  }

  update(dt) {
    for (const p of this.items) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.sp.visible = false; p.sp.material.opacity = 0; this._live--; continue; }
      const k = 1 - p.life / p.max; // 0 -> 1
      const drag = Math.max(0, 1 - p.drag * dt);
      p.vx *= drag; p.vz *= drag;
      p.sp.position.x += p.vx * dt;
      p.sp.position.y += p.vy * dt;
      p.sp.position.z += p.vz * dt;
      const s = p.size0 + (p.size1 - p.size0) * k;
      p.sp.scale.set(s, s, 1);
      // Fast fade-in, natural fade-out — fine vapor, never solid blocks.
      p.sp.material.opacity = p.op0 * Math.min(1, k * 7) * (1 - k);
    }
  }
}
