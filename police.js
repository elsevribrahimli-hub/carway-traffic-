// CARWAY TRAFFIC — PoliceSystem: ONE pooled pursuit car for the chase.
// Built once (white sedan shell + red/blue light bar with private emissive
// mats), hidden until a side scrape triggers pursuit. No per-frame
// allocation; lights are emissive swaps only (no dynamic lights).
import * as THREE from '../../libs/three.module.js';
import { CONF } from '../config.js';
import { buildTrafficCar } from './traffic.js';

export class PoliceSystem {
  constructor(scene) {
    this.scene = scene;
    const t = buildTrafficCar('sedan', 0xeef1f5, { ownLights: true });
    t.simple.visible = false; // pursuit is always near: detail only
    this.group = t.group;
    this.detail = t.detail;
    this.wheels = t.wheels;
    this.wheelR = t.wheelR;
    // Light bar: dark base + private red/blue beacons on the roof.
    this.beaconR = new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 2.5 });
    this.beaconB = new THREE.MeshStandardMaterial({ color: 0x2255ff, emissive: 0x0033ff, emissiveIntensity: 0.4 });
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.10, 0.30),
      new THREE.MeshStandardMaterial({ color: 0x14161c, metalness: 0.6, roughness: 0.5 }));
    base.position.set(0, 1.50, 0.25);
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.16, 0.26), this.beaconR);
    r.position.set(-0.28, 1.62, 0.25);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.16, 0.26), this.beaconB);
    b.position.set(0.28, 1.62, 0.25);
    this.detail.add(base, r, b);
    this.group.visible = false;
    scene.add(this.group);
    this.active = false;   // pursuing (visible, following)
    this.leaving = false;  // chase survived: falling back, then hides
    this.flashT = 0;
    this.weaveT = Math.random() * 10;
    this.reset();
  }

  reset() {
    this.active = false;
    this.leaving = false;
    this.flashT = 0;
    this.group.visible = false;
  }

  // Start pursuit behind the player (same direction, player's lane).
  spawn(playerX) {
    this.active = true;
    this.leaving = false;
    this.flashT = 0;
    this.group.position.set(playerX, 0, CONF.playerZ + CONF.policeFollowZ + 6);
    this.group.visible = true;
  }

  startLeave() {
    if (!this.active) return;
    this.leaving = true;
  }

  update(dt, playerX, playerSpeed) {
    if (!this.active) return;
    if (this.leaving) {
      // Fall back smoothly, then vanish.
      this.group.position.z += 26 * dt;
      if (this.group.position.z > CONF.playerZ + 30) this.reset();
      return;
    }
    // Pursue: fixed gap behind the player, damp lane-align + slight weave.
    this.group.position.z += ((CONF.playerZ + CONF.policeFollowZ) - this.group.position.z) * Math.min(1, dt * 4);
    this.group.position.x += (playerX - this.group.position.x) * Math.min(1, dt * CONF.policeFollowRate);
    this.weaveT += dt;
    this.group.position.x += Math.sin(this.weaveT * 2.1) * dt * 0.6;
    for (const w of this.wheels) w.rotation.x += (playerSpeed / this.wheelR) * dt;
    // Alternate the beacons (emissive swap — no lights, no post).
    this.flashT += dt;
    if (this.flashT >= 0.22) {
      this.flashT = 0;
      const rOn = this.beaconR.emissiveIntensity < 1.5;
      this.beaconR.emissiveIntensity = rOn ? 2.5 : 0.4;
      this.beaconB.emissiveIntensity = rOn ? 0.4 : 2.5;
    }
  }
}
