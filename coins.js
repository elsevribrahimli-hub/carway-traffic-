// CARWAY TRAFFIC — CoinsSystem: pooled spinning collectible coins +
// gold sparkle bursts. Patterns: ground lines and jump-reward arcs.
import * as THREE from 'three';
import { CONF } from '../config.js';

const POOL_COINS = 26;
const POOL_SPARK = 12;
const COIN_SPAWN_Z = -110;

export class CoinsSystem {
  constructor(scene) {
    this.scene = scene;
    this.distSinceSpawn = 0;
    this.nextGap = 20;

    // Shared geometry/materials (one draw state per coin mesh + glow sprite)
    const coinGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.12, 20);
    coinGeo.rotateX(Math.PI / 2); // faces readable from behind (player view)
    this.coinGeo = coinGeo;
    const coreGeo = new THREE.CylinderGeometry(0.30, 0.30, 0.15, 14);
    coreGeo.rotateX(Math.PI / 2);
    this.coreGeo = coreGeo;
    this.goldMat = new THREE.MeshStandardMaterial({
      color: 0xffc93c, metalness: 0.9, roughness: 0.25,
      emissive: 0x7a4d00, emissiveIntensity: 0.35, envMapIntensity: 1.2,
    });
    this.coreMat = new THREE.MeshStandardMaterial({
      color: 0xffe27a, metalness: 0.85, roughness: 0.3,
      emissive: 0x8a5a00, emissiveIntensity: 0.45, envMapIntensity: 1.2,
    });

    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = glowCanvas.height = 64;
    const gctx = glowCanvas.getContext('2d');
    const grad = gctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,210,90,0.9)');
    grad.addColorStop(1, 'rgba(255,180,40,0)');
    gctx.fillStyle = grad;
    gctx.fillRect(0, 0, 64, 64);
    this.glowTex = new THREE.CanvasTexture(glowCanvas);

    this.items = [];
    for (let i = 0; i < POOL_COINS; i++) {
      const root = new THREE.Group();
      const spinner = new THREE.Group();
      const coin = new THREE.Mesh(this.coinGeo, this.goldMat);
      const core = new THREE.Mesh(this.coreGeo, this.coreMat);
      spinner.add(coin, core);
      spinner.position.y = 0.9;
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.glowTex, transparent: true, opacity: 0.35,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      glow.scale.set(2.4, 2.4, 1);
      glow.position.y = 0.9;
      root.add(spinner, glow);
      root.visible = false;
      scene.add(root);
      this.items.push({ root, spinner, active: false, baseY: 0.9, phase: Math.random() * Math.PI * 2 });
    }

    // Sparkle burst pool (coin collect effect)
    this.sparks = [];
    for (let i = 0; i < POOL_SPARK; i++) {
      const mat = new THREE.SpriteMaterial({
        map: this.glowTex, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const sp = new THREE.Sprite(mat);
      sp.visible = false;
      scene.add(sp);
      this.sparks.push({ sp, life: 0, max: 1, vx: 0, vy: 0, vz: 0 });
    }
  }

  reset() {
    for (const c of this.items) { c.active = false; c.root.visible = false; }
    for (const s of this.sparks) { s.life = 0; s.sp.visible = false; }
    this.distSinceSpawn = 0;
    this.nextGap = 14; // first coins arrive quickly
  }

  _free() { return this.items.find((c) => !c.active); }

  _place(lane, x, y, z) {
    const c = this._free();
    if (!c) return;
    c.active = true;
    c.baseY = y;
    c.root.position.set(x, 0, z);
    c.spinner.position.y = y;
    c.root.children[1].position.y = y; // glow follows
    c.root.visible = true;
  }

  _spawnPattern() {
    const lanes = [-CONF.laneWidth, 0, CONF.laneWidth];
    const lane = (Math.random() * 3) | 0;
    const x = lanes[lane];
    if (Math.random() < 0.28) {
      // Jump arc: 5 coins peaking ~2.1 m — rewards a well-timed jump
      for (let i = 0; i < 5; i++) {
        const k = i / 4; // 0..1
        const y = 0.9 + Math.sin(k * Math.PI) * 1.4;
        this._place(lane, x, y, COIN_SPAWN_Z - i * 3.2);
      }
    } else {
      // Ground line of 4
      const n = 4;
      for (let i = 0; i < n; i++) this._place(lane, x, 0.9, COIN_SPAWN_Z - i * 4);
    }
  }

  update(dt, speed, time) {
    this.distSinceSpawn += speed * dt;
    if (this.distSinceSpawn >= this.nextGap) {
      this.distSinceSpawn = 0;
      this.nextGap = 20 + Math.random() * 12;
      this._spawnPattern();
    }
    for (const c of this.items) {
      if (!c.active) continue;
      c.root.position.z += speed * dt;
      c.spinner.rotation.y += dt * 3.2;
      // Gentle bob + glow pulse
      const bob = Math.sin(time * 2.4 + c.phase) * 0.08;
      c.spinner.position.y = c.baseY + bob;
      c.root.children[1].position.y = c.baseY + bob;
      c.root.children[1].material.opacity = 0.30 + Math.sin(time * 3 + c.phase) * 0.08;
      if (c.root.position.z > 12) { c.active = false; c.root.visible = false; }
    }
    for (const s of this.sparks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { s.sp.visible = false; s.sp.material.opacity = 0; continue; }
      const k = 1 - s.life / s.max;
      s.sp.position.x += s.vx * dt;
      s.sp.position.y += s.vy * dt;
      s.sp.position.z += s.vz * dt;
      s.vy -= 6 * dt;
      const sc = 0.5 + k * 0.9;
      s.sp.scale.set(sc, sc, 1);
      s.sp.material.opacity = 0.9 * (1 - k);
    }
  }

  // Collect the coin (hide + sparkle). Returns world pos for sound/hook use.
  collect(c) {
    c.active = false;
    c.root.visible = false;
    const p = c.root.position;
    this.burst(p.x, c.spinner.position.y, p.z);
  }

  burst(x, y, z, n = 4) {
    let spawned = 0;
    for (const s of this.sparks) {
      if (s.life > 0) continue;
      s.life = s.max = 0.45 + Math.random() * 0.2;
      s.sp.position.set(x, y, z);
      s.vx = (Math.random() - 0.5) * 6;
      s.vy = 2 + Math.random() * 3;
      s.vz = (Math.random() - 0.5) * 4;
      s.sp.visible = true;
      if (++spawned >= n) break;
    }
  }
}
