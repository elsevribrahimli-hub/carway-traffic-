// CARWAY TRAFFIC — LobbySystem: roadside garage diorama beside the live
// highway. The player's real selected car parks in front of the garage
// while the REAL parked road + moving traffic sit behind it — no second
// scene, renderer, or loop. The diorama (garage, road, barriers, camera,
// display car, lights) is completely frozen; ONLY traffic cars move, each
// under its own velocity. Hidden in gameplay.
//
// Layout (world): highway centered x=0; garage pad x -20..-6; garage
// building faces south; car spot (-9, 0, 6); camera south of the car
// looking north, so the car (left-center), garage (behind it) and the
// highway with approaching traffic (right) share one portrait frame.
import * as THREE from '../../libs/three.module.js';

export const LOBBY_SPOT = { x: -9, z: 6 };

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export class LobbySystem {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.mode = 'menu'; // 'menu' | 'garage'
    this.camR = 11; this.camH = 3.9; this.camFov = 58; // damped toward mode targets
    this._buildPad();
    this._buildGarage();
    this._buildProps();
  }

  get visible() { return this.group.visible; }

  mat(color, opts = {}) {
    return new THREE.MeshStandardMaterial({
      color, metalness: 0.25, roughness: 0.75, envMapIntensity: 0.7, ...opts,
    });
  }

  box(w, h, d, material, x, y, z, parent = this.group) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  _buildPad() {
    // Concrete pad with a satin sheen (envmap reflection, no real reflector).
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(14, 0.2, 28),
      new THREE.MeshStandardMaterial({ color: 0x4a4f58, metalness: 0.55, roughness: 0.42, envMapIntensity: 0.9 }));
    pad.position.set(-13, 0.1, 6);
    pad.receiveShadow = true;
    this.group.add(pad);
    // Turntable disc under the car spot.
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(3.3, 3.3, 0.22, 36),
      new THREE.MeshStandardMaterial({ color: 0x23262e, metalness: 0.6, roughness: 0.35, envMapIntensity: 1.0 }));
    disc.position.set(LOBBY_SPOT.x, 0.11, LOBBY_SPOT.z);
    disc.receiveShadow = true;
    this.group.add(disc);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3.3, 0.05, 8, 48),
      new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00b8d4, emissiveIntensity: 1.2 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(LOBBY_SPOT.x, 0.22, LOBBY_SPOT.z);
    this.group.add(ring);
    // Painted parking guides.
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xd8b93a });
    for (const dx of [-2.2, 2.2]) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 5.6), lineMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(LOBBY_SPOT.x + dx, 0.21, LOBBY_SPOT.z);
      this.group.add(line);
    }
  }

  _buildGarage() {
    const wall = this.mat(0x64748f, { metalness: 0.45, roughness: 0.55 });
    const dark = this.mat(0x2b303c, { metalness: 0.4, roughness: 0.6 });
    const trim = this.mat(0xb81f26, { metalness: 0.5, roughness: 0.4 }); // house red
    const gx = -11.5, gz = -2; // building center; OPEN front faces +Z (car/camera)
    // Floor slab inside.
    this.box(8, 0.24, 8, dark, gx, 0.12, gz);
    // Back (north) + side walls.
    this.box(8, 3.6, 0.3, wall, gx, 1.9, gz - 3.85);
    this.box(0.3, 3.6, 8, wall, gx - 3.85, 1.9, gz);
    this.box(0.3, 3.6, 8, wall, gx + 3.85, 1.9, gz);
    // Roof + red fascia.
    this.box(8.6, 0.25, 8.6, dark, gx, 3.72, gz);
    this.box(8.6, 0.7, 0.18, trim, gx, 3.35, gz + 4.28);
    // Front corner pillars.
    this.box(0.45, 3.6, 0.45, dark, gx - 3.85, 1.9, gz + 3.85);
    this.box(0.45, 3.6, 0.45, dark, gx + 3.85, 1.9, gz + 3.85);
    // Fascia sign, offset east so it sits in the portrait frame.
    const signTex = canvasTex(512, 96, (ctx, w, h) => {
      ctx.fillStyle = '#141821'; ctx.fillRect(0, 0, w, h);
      ctx.font = '900 56px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff'; ctx.fillText('CARWAY', w / 2 - 96, h / 2 + 2);
      ctx.fillStyle = '#00e5ff'; ctx.fillText('GARAGE', w / 2 + 128, h / 2 + 2);
    });
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(4.6, 0.86),
      new THREE.MeshStandardMaterial({ map: signTex, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 0.55 }));
    sign.position.set(gx + 2.0, 2.55, gz + 4.32);
    this.group.add(sign); // plane default faces +Z = toward the camera
    // Interior: workbench, tool board, tire stack, crates, warm ceiling glow.
    this.box(2.4, 0.12, 0.9, this.mat(0x8a6b48), gx - 1.6, 1.0, gz - 3.1);
    this.box(0.12, 1.0, 0.12, dark, gx - 2.6, 0.5, gz - 3.1);
    this.box(0.12, 1.0, 0.12, dark, gx - 0.6, 0.5, gz - 3.1);
    this.box(2.0, 1.1, 0.08, this.mat(0x1d2230), gx - 1.6, 2.3, gz - 3.66);
    const toolCols = [0xe63946, 0xffd24d, 0x00e5ff, 0x7dffab];
    toolCols.forEach((col, i) => {
      this.box(0.22, 0.5 + (i % 2) * 0.25, 0.1, this.mat(col), gx - 2.3 + i * 0.45, 2.25, gz - 3.6);
    });
    const tireGeo = new THREE.TorusGeometry(0.42, 0.18, 10, 20);
    const tireMat = this.mat(0x15171c, { roughness: 0.9 });
    for (let i = 0; i < 3; i++) {
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.rotation.x = Math.PI / 2;
      tire.position.set(gx + 2.4, 0.42 + i * 0.36, gz - 2.4);
      tire.castShadow = true;
      this.group.add(tire);
    }
    this.box(0.9, 0.9, 0.9, this.mat(0x7a6248), gx + 2.7, 0.65, gz - 0.4);
    this.box(0.7, 0.7, 0.7, this.mat(0x5f6b82), gx + 2.6, 1.45, gz - 0.5);
    // Ceiling light bar (emissive) + warm floor glow (additive fake).
    const bar = new THREE.Mesh(
      new THREE.PlaneGeometry(4.5, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xffe9c4 }));
    bar.rotation.x = Math.PI / 2; // face down
    bar.position.set(gx, 3.55, gz);
    this.group.add(bar);
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(6.5, 6.5),
      new THREE.MeshBasicMaterial({ color: 0xffca7a, transparent: true, opacity: 0.10, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(gx, 0.26, gz);
    this.group.add(glow);
    // Roof beacon: steady amber glow (lobby lighting never animates).
    this.beaconMat = new THREE.MeshStandardMaterial({ color: 0xff9a1f, emissive: 0xff8a00, emissiveIntensity: 2 });
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), this.beaconMat);
    beacon.position.set(gx, 4.0, gz + 4.0);
    this.group.add(beacon);
    // Pillar banners (racing identity, cheap canvas planes facing the camera).
    const bannerTex = (word, bg) => canvasTex(128, 256, (ctx, w, h) => {
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.font = '900 34px Arial'; ctx.textAlign = 'center';
      word.split('').forEach((ch, i) => ctx.fillText(ch, w / 2, 52 + i * 36));
      ctx.fillStyle = '#00e5ff'; ctx.fillRect(0, h - 18, w, 18);
    });
    const bL = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 2.0),
      new THREE.MeshStandardMaterial({ map: bannerTex('NITRO', '#7a1420'), side: THREE.DoubleSide, roughness: 0.8 }));
    bL.position.set(gx - 3.85, 2.1, gz + 4.15);
    const bR = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 2.0),
      new THREE.MeshStandardMaterial({ map: bannerTex('TURBO', '#123a4d'), side: THREE.DoubleSide, roughness: 0.8 }));
    bR.position.set(gx + 3.85, 2.1, gz + 4.15);
    this.group.add(bL, bR);
  }

  _buildProps() {
    // NOTE: no lobby guardrail — the road's OWN west rail (x=-6.6, parked
    // with the frozen road) already guards the pad edge, so a second rail
    // would read as a doubled barrier. The road furniture stays parked.
    // Streetlamp with emissive head + additive halo (no real light).
    const poleMat = this.mat(0x30343c, { metalness: 0.7, roughness: 0.45 });
    this.box(0.18, 6.5, 0.18, poleMat, -7.6, 3.25, -4);
    this.box(1.6, 0.14, 0.14, poleMat, -6.8, 6.4, -4);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xfff3d6 }));
    lamp.position.set(-6.1, 6.3, -4);
    this.group.add(lamp);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6),
      new THREE.MeshBasicMaterial({ color: 0xffedb8, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    halo.position.set(-6.1, 6.3, -4);
    halo.rotation.y = Math.PI / 4;
    this.group.add(halo);
    // Roadside sign pointing at the garage (faces the camera, south).
    this.box(0.14, 2.6, 0.14, poleMat, -7.6, 1.3, -8);
    const signTex = canvasTex(256, 128, (ctx, w, h) => {
      ctx.fillStyle = '#0d5c36'; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 6; ctx.strokeRect(6, 6, w - 12, h - 12);
      ctx.fillStyle = '#ffffff'; ctx.font = '900 40px Arial'; ctx.textAlign = 'center';
      ctx.fillText('CARWAY', w / 2, 52);
      ctx.font = '900 30px Arial'; ctx.fillStyle = '#ffd257';
      ctx.fillText('◀ GARAGE', w / 2, 96);
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.85),
      new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.6 }));
    sign.position.set(-7.6, 2.9, -8);
    this.group.add(sign); // default faces +Z = toward the camera
    // Traffic cones near the car spot.
    const coneGeo = new THREE.ConeGeometry(0.22, 0.55, 12);
    const coneMat = this.mat(0xe86a1f, { roughness: 0.6 });
    const stripeGeo = new THREE.CylinderGeometry(0.155, 0.175, 0.12, 12);
    const stripeMat = this.mat(0xf2f4f6, { roughness: 0.6 });
    for (const [cx, cz] of [[-7.8, 8.8], [-11.2, 8.8], [-7.8, 3.2]]) {
      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.position.set(cx, 0.48, cz);
      cone.castShadow = true;
      const stripe = new THREE.Mesh(stripeGeo, stripeMat);
      stripe.position.set(cx, 0.52, cz);
      this.group.add(cone, stripe);
    }
  }

  show(mode = 'menu') {
    this.mode = mode;
    this.group.visible = true;
  }

  hide() {
    this.group.visible = false;
  }

  // Park the car + hold the fixed camera. Called every frame
  // while a lobby-ish state is active (menu/garage/upgrades/settings).
  // The look target sits slightly east of the car so the highway shares
  // the portrait frame; it sits below the car so the car rides in the
  // visible band above the bottom-sheet panel.
  update(dt, playerMesh, camera, headlight) {
    // Park the player's real car on the turntable (game restores it on start).
    playerMesh.position.set(LOBBY_SPOT.x, 0, LOBBY_SPOT.z);
    if (this.mode !== 'garage') {
      playerMesh.rotation.set(0, Math.PI - 0.45, 0); // nose to camera: 3/4 front
    }
    // Camera: FIXED per mode (no drift, no bob). The damped approach below
    // only glides briefly on menu<->garage switches (the smooth showroom
    // transition), then snaps to exactly still — never perpetual motion.
    const wantR = this.mode === 'garage' ? 9.5 : 11;
    const wantH = this.mode === 'garage' ? 3.5 : 3.9;
    const wantFov = this.mode === 'garage' ? 55 : 58;
    const k = Math.min(1, dt * 2.2);
    this.camR = Math.abs(wantR - this.camR) < 1e-4 ? wantR : this.camR + (wantR - this.camR) * k;
    this.camH = Math.abs(wantH - this.camH) < 1e-4 ? wantH : this.camH + (wantH - this.camH) * k;
    this.camFov = Math.abs(wantFov - this.camFov) < 1e-4 ? wantFov : this.camFov + (wantFov - this.camFov) * k;
    camera.position.set(LOBBY_SPOT.x, this.camH, LOBBY_SPOT.z + this.camR);
    // Look target: mostly the car, pulled slightly east (highway in frame)
    // and below it (car rides above the panel). Centered in garage mode.
    const pull = this.mode === 'garage' ? 0.15 : 1.0;
    camera.lookAt(
      LOBBY_SPOT.x + 0.7 * pull,
      this.mode === 'garage' ? -1.55 : -1.0,
      LOBBY_SPOT.z - 0.5 * pull);
    if (Math.abs(camera.fov - this.camFov) > 0.05) {
      camera.fov = this.camFov;
      camera.updateProjectionMatrix();
    }
    // Park the headlight beam on the display car.
    if (headlight) {
      headlight.position.set(LOBBY_SPOT.x, 2.2, LOBBY_SPOT.z - 2.5);
      headlight.target.position.set(LOBBY_SPOT.x, 0, LOBBY_SPOT.z + 18);
    }
    // (Roof beacon holds a constant glow — lobby lighting never animates.)
  }
}
