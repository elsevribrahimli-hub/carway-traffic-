// CARWAY TRAFFIC — Player: premium red Roadster-style electric sports car.
// Smooth extruded body shell + glass canopy (no blocky boxes), torus tires,
// 5-spoke rims, DRLs, full-width brake bar, active spoiler, diffuser.
// Garage-repaintable; clearcoat physical paint on High graphics quality.
// NOTE: three.js is imported via relative path so Node logic tests can
// measure the model's bounding box (hitbox compatibility).
import * as THREE from '../../libs/three.module.js';
import { LANES_X, CONF, moveLane, laneX, stepJump } from '../config.js';
import { buildTrafficCar } from './traffic.js';

function std(color, metalness, roughness, envMapIntensity = 1) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness, envMapIntensity });
}

// Sport wheel with a true torus tire + 5-spoke rim + brake hardware.
// Returns a Group whose .rotation.x spins it (axle along X).
function buildWheel() {
  const g = new THREE.Group();
  const tyreGeo = new THREE.TorusGeometry(0.295, 0.10, 10, 22);
  tyreGeo.rotateY(Math.PI / 2); // ring around the X axle
  const tyre = new THREE.Mesh(tyreGeo, std(0x0c0c0e, 0.15, 0.9));
  tyre.castShadow = true;
  g.add(tyre);
  const discGeo = new THREE.CylinderGeometry(0.20, 0.20, 0.18, 16);
  discGeo.rotateZ(Math.PI / 2);
  g.add(new THREE.Mesh(discGeo, std(0x3a4150, 0.8, 0.45))); // brake disc barrel
  const spokeMat = std(0xe9eff6, 0.95, 0.2, 1.2);
  for (let i = 0; i < 5; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.07, 0.36), spokeMat);
    spoke.rotation.x = (i / 5) * Math.PI * 2;
    g.add(spoke);
  }
  const hubGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.24, 10);
  hubGeo.rotateZ(Math.PI / 2);
  g.add(new THREE.Mesh(hubGeo, std(0x222831, 0.7, 0.4)));
  const caliper = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.15, 0.11),
    new THREE.MeshStandardMaterial({ color: 0xd0202a, roughness: 0.5, metalness: 0.3 }));
  caliper.position.set(0.09, 0.09, 0.14);
  g.add(caliper);
  return g;
}

// Smooth car shell: a side-profile Shape (x = length with nose at -X,
// y = height) extruded across the width, then rotated nose-to--Z.
// Rounded bevel edges kill the blocky look; segment count sets smoothness.
function extrudeShell(profile, width, bevel, curveSegments, material) {
  const s = new THREE.Shape();
  profile(s);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(0.1, width - bevel * 2),
    bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.6,
    bevelSegments: 2, curveSegments,
  });
  geo.translate(0, 0, -(width - bevel * 2) / 2);
  geo.rotateY(-Math.PI / 2); // shape +X -> world +Z (nose ends at -Z)
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  return mesh;
}

// Builds the hero car facing -Z: smooth aerodynamic sports body, tinted glass
// canopy, sculpted aero details. Same footprint as before (~4.4 x 2.0 m) so
// lane movement, camera, jump and collision behavior are unchanged.
// Returns { group, body, wheels, brakeMat, paintMats, boostFlames, ... }.
function buildRoadsterCar() {
  const car = new THREE.Group();
  const body = new THREE.Group();
  car.add(body);
  const wheels = [];

  const paint = std(0xb81f26, 0.85, 0.26, 1.1);     // hero red (repaintable)
  const paintDark = std(0x6e1218, 0.85, 0.32, 1.0); // darker trim paint (repaintable)
  const paintMats = [paint, paintDark];
  const glass = std(0x0d1626, 0.9, 0.08, 1.6);      // tinted gloss glass
  const carbon = std(0x14171e, 0.55, 0.45);
  const trim = std(0x1c2230, 0.7, 0.3);

  const add = (mesh, x = 0, y = 0, z = 0) => {
    mesh.position.set(x, y, z); mesh.castShadow = true; body.add(mesh); return mesh;
  };

  // --- Smooth aerodynamic body shell (rounded nose, hood, beltline, tail) ---
  body.add(extrudeShell((s) => {
    s.moveTo(-2.02, 0.18);
    s.quadraticCurveTo(-2.20, 0.20, -2.18, 0.46); // rounded nose
    s.quadraticCurveTo(-2.12, 0.60, -1.85, 0.64); // nose top
    s.quadraticCurveTo(-1.40, 0.70, -0.95, 0.76); // hood
    s.quadraticCurveTo(-0.55, 0.82, -0.30, 0.84); // cowl
    s.lineTo(1.50, 0.88);                          // beltline
    s.quadraticCurveTo(2.00, 0.88, 2.06, 0.70);   // tail round
    s.lineTo(2.06, 0.46);                          // tail face
    s.quadraticCurveTo(2.00, 0.30, 1.80, 0.28);   // diffuser kick
    s.lineTo(-1.80, 0.16);                         // flat floor
    s.quadraticCurveTo(-1.98, 0.16, -2.02, 0.18); // close
  }, 1.98, 0.10, 10, paint));

  // --- Tinted glass canopy (raked windshield, roof, sloping rear glass) ---
  body.add(extrudeShell((s) => {
    s.moveTo(-1.02, 0.78);
    s.quadraticCurveTo(-0.72, 0.80, -0.44, 1.14); // windshield
    s.quadraticCurveTo(-0.28, 1.29, 0.02, 1.29);  // roof front
    s.lineTo(0.52, 1.27);                          // roof
    s.quadraticCurveTo(0.92, 1.22, 1.28, 0.86);   // rear glass
    s.lineTo(1.42, 0.82);                          // deck tip
    s.lineTo(-1.02, 0.78);
  }, 1.50, 0.07, 8, glass));

  // --- Front: bumper intake, splitter, sculpted headlights, DRL strips ---
  add(new THREE.Mesh(new THREE.BoxGeometry(1.50, 0.22, 0.30), carbon), 0, 0.38, -2.06);
  add(new THREE.Mesh(new THREE.BoxGeometry(1.90, 0.06, 0.40), paintDark), 0, 0.17, -2.12);
  const headGeo = new THREE.SphereGeometry(0.16, 12, 10);
  headGeo.scale(1.35, 0.5, 0.7);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xd6f2ff, emissive: 0xbfe6ff, emissiveIntensity: 2.4 });
  for (const sd of [-1, 1]) {
    const lamp = add(new THREE.Mesh(headGeo, headMat), sd * 0.62, 0.58, -2.10);
    lamp.rotation.y = -sd * 0.18;
    add(new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.045, 0.06), headMat), sd * 0.60, 0.47, -2.14);
  }

  // --- Sides: skirts, arch rings, mirrors ---
  add(new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.14, 2.60), carbon), -1.00, 0.20, 0.10);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.14, 2.60), carbon), 1.00, 0.20, 0.10);
  // Half-torus arch trim crowning each wheel (arc PI = upper half only,
  // so the ring never dips below the road).
  const archGeo = new THREE.TorusGeometry(0.45, 0.035, 8, 20, Math.PI);
  archGeo.rotateY(Math.PI / 2);
  for (const [x, z] of [[-0.97, -1.45], [0.97, -1.45], [-0.97, 1.45], [0.97, 1.45]]) {
    add(new THREE.Mesh(archGeo, paintDark), x, 0.395, z);
  }
  for (const sd of [-1, 1]) {
    add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.06), trim), sd * 0.97, 1.00, -0.55);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.09, 0.16), paint), sd * 1.04, 1.03, -0.55);
  }

  // --- Rear: diffuser fins, brake bar, active spoiler ---
  for (const fx of [-0.6, 0, 0.6]) {
    add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.20, 0.32), trim), fx, 0.30, 2.02);
  }
  add(new THREE.Mesh(new THREE.BoxGeometry(1.80, 0.24, 0.10), carbon), 0, 0.48, 2.10);
  const brakeMat = new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff1e1e, emissiveIntensity: 2.2 });
  add(new THREE.Mesh(new THREE.BoxGeometry(1.70, 0.10, 0.07), brakeMat), 0, 0.70, 2.14);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.12), carbon), -0.60, 0.98, 1.85);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.12), carbon), 0.60, 0.98, 1.85);
  const wing = add(new THREE.Mesh(new THREE.BoxGeometry(1.80, 0.06, 0.40), carbon), 0, 1.12, 1.88);
  wing.rotation.x = 0.08;
  add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.15, 0.40), paintDark), -0.90, 1.09, 1.88);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.15, 0.40), paintDark), 0.90, 1.09, 1.88);

  // --- Wheels ---
  for (const [x, z] of [[-0.98, -1.45], [0.98, -1.45], [-0.98, 1.45], [0.98, 1.45]]) {
    const w = buildWheel();
    w.position.set(x, 0.395, z);
    car.add(w);
    wheels.push(w);
  }

  // --- Underglow + headlight beams ---
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 4.8),
    new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.06;
  car.add(glow);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xcfeaff, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  for (const x of [-0.6, 0.6]) {
    const beam = new THREE.Mesh(new THREE.ConeGeometry(0.9, 7, 12, 1, true), beamMat);
    beam.rotation.x = -Math.PI / 2 - 0.06;
    beam.position.set(x, 0.5, -5.4);
    car.add(beam);
  }

  // --- Nitro boost flames (hidden unless boosting) ---
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0x33ccff, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const flameGeo = new THREE.ConeGeometry(0.26, 1.7, 10, 1, true);
  const boostFlames = [];
  for (const x of [-0.45, 0.45]) {
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.rotation.x = Math.PI / 2; // tip points backward (+Z)
    flame.position.set(x, 0.42, 2.95);
    flame.visible = false;
    car.add(flame);
    boostFlames.push(flame);
  }

  // Vapor emitter anchors at the rear outlets. Parented to the car root so
  // they follow position, lane tilt and crash spin automatically.
  const exhausts = [];
  for (const x of [-0.45, 0.45]) {
    const anchor = new THREE.Object3D();
    anchor.position.set(x, 0.38, 2.28);
    car.add(anchor);
    exhausts.push(anchor);
  }

  // Jump-vapor anchors tucked under the floor pan (mid + rear underbody).
  const underbody = [];
  for (const [x, y, z] of [[0, 0.12, 0.2], [0, 0.15, 1.6]]) {
    const anchor = new THREE.Object3D();
    anchor.position.set(x, y, z);
    car.add(anchor);
    underbody.push(anchor);
  }

  return { group: car, body, wheels, brakeMat, paintMats, boostFlames, glowMat: glow.material, exhausts, underbody };
}

// ---- Garage alternate cars: premium traffic bodies + player kit ----
// Same return shape as the roadster builder so the Player class, camera,
// vapor anchors and garage repaint work unchanged for every car.
function buildPlayerKitCar(body, colorHex) {
  const t = buildTrafficCar(body, colorHex, { ownLights: true });
  const car = new THREE.Group();
  const bodyG = new THREE.Group();
  car.add(bodyG);
  bodyG.add(t.detail); // detail level only (the player is always near)
  const L = t.len / 2;
  const dark = new THREE.MeshStandardMaterial({ color: 0x6e1218, metalness: 0.85, roughness: 0.35, envMapIntensity: 1.0 });
  // Rear diffuser in the dark accent paint (garage dark color applies here).
  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.60, 0.16, 0.24), dark);
  diffuser.position.set(0, 0.30, L + 0.02);
  diffuser.castShadow = true;
  bodyG.add(diffuser);
  // Normalize oversized shells with a UNIFORM shrink so every garage car
  // fits the shared hitbox envelope (never distort, never grow; the ~3%
  // worst case is invisible next to the global shrink forgiveness).
  // Measured AFTER the diffuser so nothing pokes past the cap.
  const _box = new THREE.Box3().setFromObject(bodyG);
  const _s = Math.min(1, 4.6 / (_box.max.z - _box.min.z), 2.15 / (_box.max.x - _box.min.x));
  bodyG.scale.setScalar(_s);
  // Underglow.
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.0, t.len + 0.6),
    new THREE.MeshBasicMaterial({ color: 0x2fa8ff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.02;
  car.add(glow);
  // Nitro flames.
  const flameGeo = new THREE.ConeGeometry(0.26, 1.7, 10, 1, true);
  const flameMat = new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const boostFlames = [];
  for (const x of [-0.45, 0.45]) {
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.rotation.x = Math.PI / 2;
    flame.position.set(x, 0.42, L + 0.85);
    flame.visible = false;
    car.add(flame);
    boostFlames.push(flame);
  }
  const exhausts = [];
  for (const x of [-0.45, 0.45]) {
    const anchor = new THREE.Object3D();
    anchor.position.set(x, 0.38, L + 0.05);
    car.add(anchor);
    exhausts.push(anchor);
  }
  const underbody = [];
  for (const [x, y, z] of [[0, 0.12, 0.2], [0, 0.15, L * 0.7]]) {
    const anchor = new THREE.Object3D();
    anchor.position.set(x, y, z);
    car.add(anchor);
    underbody.push(anchor);
  }
  return { group: car, body: bodyG, wheels: t.wheels, brakeMat: t.lightMats.tail, paintMats: [t.paintMats[0], dark], boostFlames, glowMat: glow.material, exhausts, underbody };
}

export function buildPlayerCar(carId = 'roadster') {
  if (carId === 'coupe' || carId === 'esedan' || carId === 'supercar') return buildPlayerKitCar(carId, 0xb81f26);
  return buildRoadsterCar(); // unknown ids safely fall back to the roadster
}

export class Player {
  constructor(scene) {
    this._exhaustWorld = [new THREE.Vector3(), new THREE.Vector3()];
    this._underWorld = [new THREE.Vector3(), new THREE.Vector3()];
    this._paintKind = 'standard';
    this._wantPhysical = false;
    this._paintDef = null;
    this._carCache = {}; // body key -> built car (built once, never disposed)
    this.carBody = 'roadster';
    this.scene = scene;
    this._applyBuilt(this._getBuilt('roadster'));
    scene.add(this.mesh);
    // Shield bubble: one cheap additive shell, child of the car mesh so it
    // follows lanes/jumps/crashes with zero per-frame position cost.
    const shellGeo = new THREE.SphereGeometry(1, 20, 14);
    this.shieldMesh = new THREE.Mesh(shellGeo, new THREE.MeshBasicMaterial({
      color: 0x4db8ff, transparent: true, opacity: 0.22,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.shieldMesh.scale.set(1.6, 1.05, 2.9);
    this.shieldMesh.position.y = 0.85;
    this.shieldMesh.visible = false;
    this.shieldMesh.renderOrder = 6;
    this.mesh.add(this.shieldMesh);
    // Magnet field ring: one cheap additive torus, flat around the car.
    // Spins + pulses while the magnet is active (see update).
    const ringGeo = new THREE.TorusGeometry(2.6, 0.07, 8, 40);
    this.magnetMesh = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: 0xff5d7a, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.magnetMesh.rotation.x = -Math.PI / 2;
    this.magnetMesh.position.y = 0.55;
    this.magnetMesh.scale.set(1, 1.25, 1);
    this.magnetMesh.visible = false;
    this.magnetMesh.renderOrder = 6;
    // Two orbiting sparks (children, so they ride the ring's spin).
    const sparkGeo = new THREE.SphereGeometry(0.12, 8, 6);
    const sparkMat = new THREE.MeshBasicMaterial({
      color: 0xff8fa5, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    for (const sx of [-2.6, 2.6]) {
      const spark = new THREE.Mesh(sparkGeo, sparkMat);
      spark.position.set(sx, 0, 0);
      this.magnetMesh.add(spark);
    }
    this.mesh.add(this.magnetMesh);

    this.laneIndex = 1;
    this.x = LANES_X[1];
    this.y = 0;
    this.vy = 0;
    this.gravity = CONF.gravity; // weakened by jump skill upgrades (set by Game)
    this.airborne = false;
    this.justLanded = false;
    this.tilt = 0;
    this.squash = 0;
    this.suspPhase = 0;
    this.boostOn = false;
    this.crashed = false;
    this.crashSpin = 0;
    this.steerAngle = 0;
    this.reset();
  }

  _getBuilt(body) {
    if (!this._carCache[body]) this._carCache[body] = buildPlayerCar(body);
    return this._carCache[body];
  }

  _applyBuilt(built) {
    this.mesh = built.group;
    this.body = built.body;
    this.wheels = built.wheels;
    this.brakeMat = built.brakeMat;
    this.paintMats = built.paintMats;
    this.boostFlames = built.boostFlames;
    this.glowMat = built.glowMat;
    this.exhausts = built.exhausts;
    this.underbody = built.underbody;
  }

  // Switch garage car (garage only, never per-frame). Builds are cached, so
  // switching allocates nothing and leaks nothing; paint + quality reapply.
  setCar(body) {
    const key = body || 'roadster';
    if (key === this.carBody) return;
    this.scene.remove(this.mesh);
    this.mesh.remove(this.shieldMesh);
    this.mesh.remove(this.magnetMesh);
    this.carBody = key;
    this._applyBuilt(this._getBuilt(key));
    this.mesh.add(this.shieldMesh);
    this.mesh.add(this.magnetMesh);
    this.scene.add(this.mesh);
    if (this._paintDef) this.setPaint(this._paintDef);
    this._paintKind = 'standard'; // cached builds start standard; re-apply tier
    if (this._wantPhysical) this.setPaintQuality(true);
    this.reset();
  }

  reset() {
    this.laneIndex = 1;
    this.x = laneX(1);
    this.y = 0; this.vy = 0;
    this.airborne = false;
    this.justLanded = false;
    this.tilt = 0;
    this.squash = 0;
    this.steerAngle = 0;
    this.crashed = false;
    this.crashSpin = 0;
    this.setBoostVisual(false);
    this.brakeMat.emissiveIntensity = 2.2;
    this.mesh.rotation.set(0, 0, 0);
    this.body.position.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
    this.body.scale.set(1, 1, 1);
    this.mesh.position.set(this.x, 0, CONF.playerZ);
    this.mesh.visible = true;
  }

  move(dir) {
    if (this.crashed) return false;
    const next = moveLane(this.laneIndex, dir);
    if (next === this.laneIndex) return false;
    this.laneIndex = next;
    return true;
  }

  jump() {
    if (this.crashed || this.airborne) return false;
    this.vy = CONF.jumpVelocity;
    this.airborne = true;
    this.squash = -0.45; // takeoff stretch (springs back, then squashes on landing)
    return true;
  }

  // World-space exhaust positions for vapor emission. Returns a reused pair
  // of Vector3 (valid until the next call) — zero per-frame allocation.
  exhaustWorld() {
    this.exhausts[0].getWorldPosition(this._exhaustWorld[0]);
    this.exhausts[1].getWorldPosition(this._exhaustWorld[1]);
    return this._exhaustWorld;
  }

  // World-space underbody positions for jump-vapor emission. Same reuse
  // contract as exhaustWorld() — zero per-frame allocation.
  underbodyWorld() {
    this.underbody[0].getWorldPosition(this._underWorld[0]);
    this.underbody[1].getWorldPosition(this._underWorld[1]);
    return this._underWorld;
  }

  // Swap paint material quality (High = clearcoat physical, else standard).
  // Preserves the current garage color; disposes the replaced materials.
  setPaintQuality(physical) {
    this._wantPhysical = !!physical; // remembered across garage car switches
    const want = physical ? 'physical' : 'standard';
    if (this._paintKind === want) return;
    this._paintKind = want;
    const olds = this.paintMats.slice();
    this.paintMats = olds.map((old, i) => {
      const c = old.color.clone();
      return physical
        ? new THREE.MeshPhysicalMaterial({ color: c, metalness: 0.85, roughness: i ? 0.32 : 0.26, clearcoat: 1.0, clearcoatRoughness: 0.12, envMapIntensity: 1.1 })
        : new THREE.MeshStandardMaterial({ color: c, metalness: 0.9, roughness: i ? 0.32 : 0.24, envMapIntensity: i ? 1.0 : 1.15 });
    });
    this.body.traverse((o) => {
      if (o.material === olds[0]) o.material = this.paintMats[0];
      else if (o.material === olds[1]) o.material = this.paintMats[1];
    });
    for (const m of olds) m.dispose();
  }

  crash() {
    this.crashed = true;
    this.crashSpin = 0;
    this.setBoostVisual(false);
  }

  // paintDef: { color, dark } — recolors the two paint materials live.
  setPaint(paintDef) {
    if (!paintDef) return;
    this._paintDef = paintDef;
    this.paintMats[0].color.set(paintDef.color);
    this.paintMats[1].color.set(paintDef.dark);
  }

  setBoostVisual(on) {
    this.boostOn = on;
    for (const f of this.boostFlames) f.visible = on;
    this.glowMat.opacity = on ? 0.45 : 0.16;
  }

  update(dt, speed) {
    this.justLanded = false;
    const spin = (speed / 0.37) * dt;
    for (const w of this.wheels) w.rotation.x -= spin;

    if (this.crashed) {
      this.crashSpin += dt * 7;
      this.mesh.rotation.y = this.crashSpin * 0.6;
      this.mesh.rotation.z = Math.sin(this.crashSpin) * 0.15;
      this.mesh.position.z += speed * 0.25 * dt;
      this.brakeMat.emissiveIntensity = 0.4;
      return;
    }

    const targetX = laneX(this.laneIndex);
    const prevX = this.x;
    this.x += (targetX - this.x) * Math.min(1, dt * CONF.laneChangeRate);
    if (Math.abs(targetX - this.x) < 0.01) this.x = targetX;
    const lateralVel = (this.x - prevX) / Math.max(dt, 1e-4);
    const targetTilt = THREE.MathUtils.clamp(-lateralVel * 0.035, -0.35, 0.35);
    this.tilt += (targetTilt - this.tilt) * Math.min(1, dt * 8);
    this.mesh.rotation.z = this.tilt;
    this.mesh.rotation.y = this.tilt * 0.6;
    const targetSteer = THREE.MathUtils.clamp(lateralVel * 0.05, -0.45, 0.45);
    this.steerAngle += (targetSteer - this.steerAngle) * Math.min(1, dt * 10);
    this.wheels[0].rotation.y = this.steerAngle;
    this.wheels[1].rotation.y = this.steerAngle;

    if (this.airborne) {
      const s = stepJump(this.y, this.vy, dt, this.gravity);
      this.y = s.y; this.vy = s.vy;
      if (s.landed) {
        this.airborne = false;
        this.justLanded = true;
        this.squash = 1;
      }
      this.body.rotation.x = THREE.MathUtils.clamp(-this.vy * 0.022, -0.13, 0.17);
    } else {
      this.body.rotation.x *= 0.82;
    }

    const speedNorm = (speed - CONF.startSpeed) / (CONF.maxSpeed - CONF.startSpeed);
    this.suspPhase += dt * (6 + speedNorm * 14);
    this.squash *= Math.pow(0.001, dt);
    const bounce = Math.sin(this.suspPhase) * 0.018 * (0.4 + speedNorm);
    const bounce2 = Math.sin(this.suspPhase * 2.7 + 1.3) * 0.010 * (0.4 + speedNorm);
    this.body.position.y = bounce + bounce2 - this.squash * 0.12;
    this.body.scale.y = 1 - this.squash * 0.10;
    this.body.scale.x = 1 + this.squash * 0.04;
    this.body.scale.z = 1 + this.squash * 0.03;
    this.brakeMat.emissiveIntensity += (((this.airborne) ? 3.4 : 2.2) - this.brakeMat.emissiveIntensity) * Math.min(1, dt * 6);
    // Shield bubble pulse (only when visible — zero cost otherwise).
    if (this.shieldMesh.visible) {
      this.shieldMesh.material.opacity = 0.18 + (Math.sin(this.suspPhase * 2.2) * 0.5 + 0.5) * 0.10;
    }
    // Magnet ring spin + pulse (only when visible — zero cost otherwise).
    if (this.magnetMesh.visible) {
      this.magnetMesh.rotation.z += dt * 3.2;
      this.magnetMesh.material.opacity = 0.40 + (Math.sin(this.suspPhase * 3.0) * 0.5 + 0.5) * 0.25;
    }

    // Nitro flame flicker
    if (this.boostOn) {
      const f = 1 + Math.sin(this.suspPhase * 3.1) * 0.22;
      for (const fl of this.boostFlames) fl.scale.set(f, f, 0.8 + Math.random() * 0.6);
    }

    this.mesh.position.set(this.x, this.y, CONF.playerZ);
  }
}
