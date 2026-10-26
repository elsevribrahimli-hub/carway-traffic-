// CARWAY TRAFFIC — PickupsSystem: pooled shield + 2x-coin + magnet orbs.
// One pickup spawns every pickupGapMin..Max meters in a random lane; all
// three visuals per pooled item share geometries/materials, toggled by
// type. Zero allocation after init; collection reuses the coin radius.
import * as THREE from '../../libs/three.module.js';
import { CONF } from '../config.js';

const POOL_PICKUPS = 5;
const PICKUP_SPAWN_Z = -110;

function glowTexture(inner, outer) {
  if (typeof document === 'undefined') return null; // headless logic tests
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class PickupsSystem {
  constructor(scene) {
    this.scene = scene;
    this.distSinceSpawn = 0;
    this.nextGap = 100; // first pickup arrives mid-run, not instantly

    // Shared visuals (built once for the whole pool).
    this.shieldGeo = new THREE.IcosahedronGeometry(0.55, 0);
    this.shieldMat = new THREE.MeshStandardMaterial({
      color: 0x3fa9ff, metalness: 0.6, roughness: 0.25,
      emissive: 0x1a66cc, emissiveIntensity: 0.9, envMapIntensity: 1.0,
    });
    this.coin2xGeo = new THREE.OctahedronGeometry(0.60, 0);
    this.coin2xMat = new THREE.MeshStandardMaterial({
      color: 0xffd24d, metalness: 0.9, roughness: 0.25,
      emissive: 0x8a5a00, emissiveIntensity: 0.8, envMapIntensity: 1.2,
    });
    // Magnet horseshoe: red half-torus + two silver pole tips (one group,
    // shared geos/mats; reads instantly even mid-spin).
    this.magnetGeo = new THREE.TorusGeometry(0.40, 0.15, 10, 18, Math.PI);
    this.magnetMat = new THREE.MeshStandardMaterial({
      color: 0xe63946, metalness: 0.55, roughness: 0.3,
      emissive: 0x8f1020, emissiveIntensity: 0.7, envMapIntensity: 1.0,
    });
    this.magnetTipGeo = new THREE.BoxGeometry(0.30, 0.22, 0.30);
    this.magnetTipMat = new THREE.MeshStandardMaterial({
      color: 0xf1faff, metalness: 0.9, roughness: 0.2, envMapIntensity: 1.2,
    });
    this.shieldGlowTex = glowTexture('rgba(120,200,255,0.9)', 'rgba(60,140,255,0)');
    this.coin2xGlowTex = glowTexture('rgba(255,215,100,0.9)', 'rgba(255,170,40,0)');
    this.magnetGlowTex = glowTexture('rgba(255,120,150,0.9)', 'rgba(230,57,70,0)');

    this.items = [];
    for (let i = 0; i < POOL_PICKUPS; i++) {
      const root = new THREE.Group();
      const spinner = new THREE.Group();
      const shieldMesh = new THREE.Mesh(this.shieldGeo, this.shieldMat);
      const coinMesh = new THREE.Mesh(this.coin2xGeo, this.coin2xMat);
      const magnetMesh = new THREE.Group();
      const shoe = new THREE.Mesh(this.magnetGeo, this.magnetMat);
      shoe.rotation.z = Math.PI; // opening faces down (classic horseshoe)
      const tipL = new THREE.Mesh(this.magnetTipGeo, this.magnetTipMat);
      tipL.position.set(-0.40, -0.28, 0);
      const tipR = new THREE.Mesh(this.magnetTipGeo, this.magnetTipMat);
      tipR.position.set(0.40, -0.28, 0);
      magnetMesh.add(shoe, tipL, tipR);
      spinner.add(shieldMesh, coinMesh, magnetMesh);
      spinner.position.y = 0.9;
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.shieldGlowTex, transparent: true, opacity: 0.4,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      glow.scale.set(2.6, 2.6, 1);
      glow.position.y = 0.9;
      root.add(spinner, glow);
      root.visible = false;
      scene.add(root);
      this.items.push({ root, spinner, shieldMesh, coinMesh, magnetMesh, glow, active: false, type: null, baseY: 0.9, phase: Math.random() * Math.PI * 2 });
    }
  }

  reset() {
    for (const p of this.items) { p.active = false; p.type = null; p.root.visible = false; }
    this.distSinceSpawn = 0;
    this.nextGap = 100;
  }

  _free() { return this.items.find((p) => !p.active); }

  // Show exactly one visual + matching glow for the pickup's type.
  _showType(p) {
    p.shieldMesh.visible = p.type === 'shield';
    p.coinMesh.visible = p.type === 'coin2x';
    p.magnetMesh.visible = p.type === 'magnet';
    p.glow.material.map = p.type === 'shield' ? this.shieldGlowTex
      : p.type === 'coin2x' ? this.coin2xGlowTex : this.magnetGlowTex;
  }

  _spawn() {
    const p = this._free();
    if (!p) return;
    const r = Math.random();
    p.type = r < 1 / 3 ? 'shield' : r < 2 / 3 ? 'coin2x' : 'magnet';
    const lane = (Math.random() * 3) | 0;
    p.active = true;
    p.baseY = 0.9;
    p.root.position.set([-CONF.laneWidth, 0, CONF.laneWidth][lane], 0, PICKUP_SPAWN_Z);
    p.spinner.position.y = 0.9;
    p.glow.position.y = 0.9;
    this._showType(p);
    p.root.visible = true;
  }

  update(dt, speed, time) {
    this.distSinceSpawn += speed * dt;
    if (this.distSinceSpawn >= this.nextGap) {
      this.distSinceSpawn = 0;
      this.nextGap = CONF.pickupGapMin + Math.random() * (CONF.pickupGapMax - CONF.pickupGapMin);
      this._spawn();
    }
    for (const p of this.items) {
      if (!p.active) continue;
      p.root.position.z += speed * dt;
      p.spinner.rotation.y += dt * 2.6;
      const bob = Math.sin(time * 2.4 + p.phase) * 0.08;
      p.spinner.position.y = p.baseY + bob;
      p.glow.position.y = p.baseY + bob;
      p.glow.material.opacity = 0.34 + Math.sin(time * 3 + p.phase) * 0.08;
      if (p.root.position.z > 12) { p.active = false; p.type = null; p.root.visible = false; }
    }
  }

  // Collect the pickup (hide it; the Game applies the effect).
  collect(p) {
    p.active = false;
    p.root.visible = false;
    const type = p.type;
    p.type = null;
    return type;
  }
}
