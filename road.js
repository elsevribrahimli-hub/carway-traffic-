// CARWAY TRAFFIC — RoadSystem: pooled endless highway segments (daylight).
// Segments recycle with order preserved, so special slices (tunnel pair,
// bridges, sign gantries) keep their spacing forever. All textures are
// tiny procedural canvases — no downloads, no licensing issues.
import * as THREE from 'three';
import { CONF, BILLBOARDS } from '../config.js';

const SEG_LEN = 30;
const SEG_COUNT = 9;
const TOTAL_LEN = SEG_LEN * SEG_COUNT;

// Segment roles (cyclic order never changes, so the tunnel pair stays whole).
const ROLE = ['gantry', 'bridge', 'plain', 'gantry', 'tunnel', 'tunnel', 'plain', 'bridge', 'gantry'];

// Shared geometry cache: every same-size box/plane reuses ONE GPU buffer.
// (~250 unique road geometries before; the mesh hierarchy is unchanged,
// so traversal-based tests and recycling are unaffected.)
const _roadGeoCache = new Map();
function roadBoxGeo(w, h, d) {
  const k = `b${w}|${h}|${d}`;
  let g = _roadGeoCache.get(k);
  if (!g) { g = new THREE.BoxGeometry(w, h, d); _roadGeoCache.set(k, g); }
  return g;
}
function roadPlaneGeo(w, h) {
  const k = `p${w}|${h}`;
  let g = _roadGeoCache.get(k);
  if (!g) { g = new THREE.PlaneGeometry(w, h); _roadGeoCache.set(k, g); }
  return g;
}

function canvasTexture(w, h, draw, repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function asphaltTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#3d4149';
    ctx.fillRect(0, 0, w, h);
    // Large soft tonal patches break tiling repetition. Each patch is drawn
    // 4x with wrap offsets so the tile stays seamless at every repeat.
    for (let i = 0; i < 7; i++) {
      const px = Math.random() * w, py = Math.random() * h, pr = 40 + Math.random() * 70;
      for (const [ox, oy] of [[0, 0], [-w, 0], [0, -h], [-w, -h]]) {
        const g2 = ctx.createRadialGradient(px + ox, py + oy, 4, px + ox, py + oy, pr);
        if (i % 2) {
          g2.addColorStop(0, 'rgba(18,20,26,0.16)');
        } else {
          g2.addColorStop(0, 'rgba(150,160,175,0.10)');
        }
        g2.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g2;
        ctx.fillRect(0, 0, w, h);
      }
    }
    // Aggregate speckle
    for (let i = 0; i < 2600; i++) {
      const v = 55 + Math.random() * 40;
      ctx.fillStyle = `rgb(${v},${v},${v + 6})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1.6, 1.6);
    }
    // Faint cracks
    ctx.strokeStyle = 'rgba(20,20,24,0.5)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      let x = Math.random() * w, y = Math.random() * h;
      ctx.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (Math.random() - 0.5) * 40; y += (Math.random() - 0.5) * 40; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  }, 2, 5);
}

function signTexture(line1, line2, arrow) {
  return canvasTexture(512, 160, (ctx, w, h) => {
    ctx.fillStyle = '#0a5c30';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 8;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 56px Arial, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(line1, 36, 52);
    ctx.font = 'bold 40px Arial, sans-serif';
    ctx.fillStyle = '#bfe9ff';
    ctx.fillText(line2, 36, 112);
    // Arrow
    ctx.fillStyle = '#ffffff';
    const ax = w - 110, ay = h / 2;
    ctx.fillRect(ax - 40, ay - 10, 70, 20);
    ctx.beginPath();
    if (arrow === 'up') { ctx.moveTo(ax + 50, ay - 42); ctx.lineTo(ax + 86, ay + 6); ctx.lineTo(ax + 14, ay + 6); }
    else { ctx.moveTo(ax + 86, ay - 10); ctx.lineTo(ax + 86, ay + 10); ctx.lineTo(ax + 30, ay + 10); ctx.lineTo(ax + 30, ay + 34); ctx.lineTo(ax - 10, ay); ctx.lineTo(ax + 30, ay - 34); ctx.lineTo(ax + 30, ay - 10); }
    ctx.fill();
  });
}

export class RoadSystem {
  constructor(scene) {
    this.scene = scene;
    this.segments = [];
    this.offset = 0;

    const asphalt = asphaltTexture();
    this.asphaltMat = new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.94, metalness: 0.05 });
    this.dashMat = new THREE.MeshBasicMaterial({ color: 0xf4f7fa });
    this.edgeMat = new THREE.MeshBasicMaterial({ color: 0xe8eef5 });
    this.groundMat = new THREE.MeshStandardMaterial({ color: 0x6f9a52, roughness: 1, metalness: 0 });
    this.railMat = new THREE.MeshStandardMaterial({ color: 0xb9c1ce, roughness: 0.35, metalness: 0.85 });
    this.postMat = new THREE.MeshStandardMaterial({ color: 0x707a8c, roughness: 0.6, metalness: 0.6 });
    this.lampPoleMat = new THREE.MeshStandardMaterial({ color: 0x4a5266, roughness: 0.5, metalness: 0.7 });
    this.lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xf2f7ff });
    this.concreteMat = new THREE.MeshStandardMaterial({ color: 0x9aa2b0, roughness: 0.85, metalness: 0.05 });
    this.tunnelWallMat = new THREE.MeshStandardMaterial({ color: 0x8b95a3, roughness: 0.9, metalness: 0.05 });
    this.tunnelDarkMat = new THREE.MeshStandardMaterial({ color: 0x5b636e, roughness: 0.95, metalness: 0 });
    this.stripMat = new THREE.MeshBasicMaterial({ color: 0xfff3d6 });
    this.portalMat = new THREE.MeshStandardMaterial({ color: 0xd8b62a, roughness: 0.6, metalness: 0.2 });
    this.trussMat = new THREE.MeshStandardMaterial({ color: 0x5a6478, roughness: 0.5, metalness: 0.7 });
    this.buildingMats = [0xaeb8cc, 0x9fadc6, 0xb9c2d4].map(
      (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0.1 }));
    this.windowMat = new THREE.MeshStandardMaterial({ color: 0x3c4a63, roughness: 0.3, metalness: 0.6 });
    this.hillMat = new THREE.MeshStandardMaterial({ color: 0x5c7a4e, roughness: 1 });
    this.cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });

    this.signTexA = signTexture('CARWAY', 'NORTH  •  1 km', 'up');
    this.signTexB = signTexture('DOWNTOWN', 'EXIT 7  •  RIGHT', 'right');
    this.signMatA = new THREE.MeshBasicMaterial({ map: this.signTexA });
    this.signMatB = new THREE.MeshBasicMaterial({ map: this.signTexB });
    this.signBoardGeo = new THREE.PlaneGeometry(5.2, 1.6);

    this._buildBillboardShared(); // geos + mats ONCE (reused by all boards)
    this._buildSegments();
    this._buildStaticScenery();
    this._bindBillboardArt(); // logo texture from the in-page <img>
  }

  // Shared billboard geometries/materials: built once, reused by every
  // board — only positions differ (cheap on Android).
  _buildBillboardShared() {
    const B = BILLBOARDS;
    this.billboardGroups = []; // test hooks + runtime activation toggle
    this.billboardTex = null;  // set once the logo image binds
    this._bbBackGeo = new THREE.BoxGeometry(B.boardW, B.boardH, 0.18);
    this._bbArtGeo = new THREE.PlaneGeometry(B.artSize, B.artSize);
    this._bbRailHGeo = new THREE.BoxGeometry(B.boardW + 0.44, 0.22, 0.24);
    this._bbRailVGeo = new THREE.BoxGeometry(0.22, B.boardH, 0.24);
    const poleH = B.centerY - B.boardH / 2;
    this._bbPoleH = poleH;
    this._bbPoleGeo = new THREE.BoxGeometry(0.28, poleH, 0.28);
    this._bbBackMat = new THREE.MeshStandardMaterial({ color: 0x0a0f1c, roughness: 0.8, metalness: 0.1 });
    // Art starts dark; the logo binds as soon as the <img> is decoded.
    this._bbArtMat = new THREE.MeshBasicMaterial({ color: 0x0a0f1c, transparent: true });
  }

  // One reusable billboard: dark backing + square logo art + frame rails +
  // twin support poles. Faces +Z (the approaching player) with a slight
  // road-ward yaw. Everything shared except the group's position.
  _buildBillboard(g, side, z) {
    const B = BILLBOARDS;
    const bg = new THREE.Group();
    bg.position.set(side * B.roadGap, 0, z);
    bg.rotation.y = -side * B.faceYaw;
    const add = (geo, mat, x, y, zz, tag, shadow = false) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, zz);
      m.castShadow = shadow;
      m.userData.billboard = tag;
      bg.add(m);
      return m;
    };
    add(this._bbBackGeo, this._bbBackMat, 0, B.centerY, 0, 'board');
    add(this._bbArtGeo, this._bbArtMat, 0, B.centerY, 0.10, 'art');
    const railY = B.boardH / 2 + 0.11, railX = B.boardW / 2 + 0.11;
    add(this._bbRailHGeo, this.trussMat, 0, B.centerY + railY, 0, 'frame');
    add(this._bbRailHGeo, this.trussMat, 0, B.centerY - railY, 0, 'frame');
    add(this._bbRailVGeo, this.trussMat, -railX, B.centerY, 0, 'frame');
    add(this._bbRailVGeo, this.trussMat, railX, B.centerY, 0, 'frame');
    add(this._bbPoleGeo, this.postMat, -B.poleDx, this._bbPoleH / 2, 0, 'pole');
    add(this._bbPoleGeo, this.postMat, B.poleDx, this._bbPoleH / 2, 0, 'pole');
    g.add(bg);
    this.billboardGroups.push(bg);
  }

  // Build boards on matching segments (roles/spots from BILLBOARDS).
  _buildBillboards(g, role) {
    if (!BILLBOARDS.enabled) return;
    for (const spot of BILLBOARDS.spots) {
      if (spot.role === role) this._buildBillboard(g, spot.side, spot.z);
    }
  }

  // Runtime activation toggle (boards stay built; visibility flips).
  setBillboardsEnabled(v) {
    for (const bg of this.billboardGroups) bg.visible = !!v;
  }

  // Bind the logo artwork from the in-page <img> (loaded once by the
  // browser — incl. standalone's inlined data URI — then shared by every
  // board). If it isn't decoded yet at boot, onload swaps it in.
  // Bind the logo artwork from the in-page <img> (loaded once by the
  // browser — incl. standalone's inlined data URI — then shared by every
  // board). Safe to call repeatedly (the update loop lazy-heals with it):
  // binds the instant pixels exist, attaches listeners exactly once, and
  // retries a failed fetch exactly once before degrading gracefully.
  _bindBillboardArt() {
    if (!BILLBOARDS.enabled || this.billboardTex) return;
    const img = document.getElementById(BILLBOARDS.imgId);
    if (!img) return;
    if (img.naturalWidth) { this._bindNow(img); return; } // pixels? bind now
    if (this._bbListening) return; // refetch already in flight; its load binds
    this._bbListening = true;
    img.addEventListener('load', () => this._bindNow(img), { once: true });
    img.addEventListener('error', () => this._retryLogo(img), { once: true });
    // Already failed before we attached (boot pre-decode saw the error, so
    // the event is spent): retry immediately instead of waiting for it.
    if (img.complete) this._retryLogo(img);
  }

  // Flaky-fetch guard: one refetch (skipped for data-URIs, which can't
  // fail). The still-attached load listener binds a successful refetch; if
  // it fails too, boards stay dark but the game plays on — no throw, no
  // retry loop, no console spam (the browser logs failed fetches itself,
  // which no page code can suppress).
  _retryLogo(img) {
    if (this.billboardTex || this._bbRetried || img.src.startsWith('data:')) return;
    this._bbRetried = true;
    img.src = img.src + (img.src.includes('?') ? '&' : '?') + 'retry=1';
  }

  // Create the shared logo texture from decoded pixels (idempotent).
  _bindNow(img) {
    if (!img.naturalWidth || this.billboardTex) return;
    const tex = new THREE.Texture(img);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    this._bbArtMat.map = tex;
    this._bbArtMat.color.set(0xffffff);
    this._bbArtMat.needsUpdate = true;
    this.billboardTex = tex;
  }

  // box() without shadows (small/cheap props) vs boxS() with shadows.
  _box(w, h, d, mat, x, y, z, parent, shadow = false) {
    const m = new THREE.Mesh(roadBoxGeo(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    parent.add(m);
    return m;
  }

  _buildSegments() {
    const dashGeo = new THREE.PlaneGeometry(0.18, 3.2);

    for (let s = 0; s < SEG_COUNT; s++) {
      const g = new THREE.Group();
      const role = ROLE[s];
      const isTunnel = role === 'tunnel';

      // Asphalt
      const road = new THREE.Mesh(roadPlaneGeo(CONF.roadWidth, SEG_LEN), this.asphaltMat);
      road.rotation.x = -Math.PI / 2;
      road.receiveShadow = true;
      g.add(road);

      // Lane dashes
      for (const lx of [-CONF.laneWidth / 2, CONF.laneWidth / 2]) {
        for (let d = 0; d < 4; d++) {
          const dash = new THREE.Mesh(dashGeo, this.dashMat);
          dash.rotation.x = -Math.PI / 2;
          dash.position.set(lx, 0.02, -SEG_LEN / 2 + 4 + d * 7.4);
          g.add(dash);
        }
      }
      // Solid edge lines
      for (const ex of [-CONF.roadWidth / 2 + 0.35, CONF.roadWidth / 2 - 0.35]) {
        const edge = new THREE.Mesh(roadPlaneGeo(0.22, SEG_LEN), this.edgeMat);
        edge.rotation.x = -Math.PI / 2;
        edge.position.set(ex, 0.02, 0);
        g.add(edge);
      }

      if (isTunnel) {
        this._buildTunnelSlice(g, s);
      } else {
        this._buildGuardrails(g);
        // Lamp posts (alternate sides)
        const side = s % 2 === 0 ? -1 : 1;
        this._box(0.18, 6.2, 0.18, this.lampPoleMat, side * (CONF.roadWidth / 2 + 1.2), 3.1, 0, g);
        this._box(1.6, 0.14, 0.14, this.lampPoleMat, side * (CONF.roadWidth / 2 + 0.5), 6.1, 0, g);
        this._box(0.7, 0.18, 0.4, this.lampHeadMat, side * (CONF.roadWidth / 2 - 0.2), 6.0, 0, g);
      }

      if (role === 'gantry') this._buildGantry(g, s);
      if (role === 'bridge') this._buildBridge(g);
      if (role === 'plain') this._buildBillboards(g, role);

      // Daytime city blocks for parallax
      if (s % 3 === 0) {
        const bm = this.buildingMats[(s / 3) | 0 % this.buildingMats.length];
        const h = 8 + (s % 2) * 6;
        this._box(6, h, 6, bm, -17 - (s % 2) * 4, h / 2, -4, g);
        this._box(6, h + 4, 6, bm, 17 + (s % 2) * 3, (h + 4) / 2, 6, g);
        for (let wy = 2; wy < h - 1; wy += 2) {
          this._box(6.1, 0.6, 6.1, this.windowMat, -17 - (s % 2) * 4, wy, -4, g);
        }
      }

      g.position.z = -TOTAL_LEN + SEG_LEN / 2 + s * SEG_LEN + SEG_LEN;
      this.scene.add(g);
      this.segments.push(g);
    }
  }

  _buildGuardrails(g) {
    const rx = CONF.roadWidth / 2 + 0.9;
    for (const s of [-1, 1]) {
      // W-beam rail (long) — no shadow, cheap
      this._box(0.08, 0.32, SEG_LEN, this.railMat, s * rx, 0.62, 0, g);
      this._box(0.06, 0.10, SEG_LEN, this.postMat, s * rx, 0.32, 0, g);
      for (let z = -SEG_LEN / 2 + 2; z < SEG_LEN / 2; z += 6) {
        this._box(0.12, 0.62, 0.12, this.postMat, s * (rx + 0.12), 0.31, z, g);
      }
    }
  }

  // Sign gantry: columns well off the road, boards riding HIGH (bottom
  // edge 6.1 — above the chase camera at 5.6) so they cross the top of the
  // frame instead of sweeping through its center as they pass.
  _buildGantry(g, s) {
    const rx = CONF.roadWidth / 2 + 2.6;
    // Columns + truss across the highway
    for (const sx of [-1, 1]) {
      this._box(0.35, 8.4, 0.35, this.trussMat, sx * rx, 4.2, 0, g, true)
        .userData.gantryColumn = true; // test hook (support placement)
    }
    this._box(rx * 2 + 0.4, 0.5, 0.5, this.trussMat, 0, 8.1, 0, g, true);
    this._box(rx * 2 + 0.4, 0.18, 0.18, this.trussMat, 0, 7.4, 0, g);
    // Two sign boards facing the player (+Z)
    const mk = (mat, x) => {
      const board = new THREE.Mesh(this.signBoardGeo, mat);
      board.position.set(x, 6.9, 0.26);
      board.userData.gantryBoard = true; // test hook (occlusion assert)
      g.add(board);
      this._box(5.3, 1.7, 0.08, this.trussMat, x, 6.9, 0.2, g);
    };
    mk(s % 2 === 0 ? this.signMatA : this.signMatB, -2.9);
    mk(s % 2 === 0 ? this.signMatB : this.signMatA, 2.9);
  }

  _buildBridge(g) {
    // Overpass deck across the highway + parapets + columns (off-road).
    // Deck bottom at ~7.15 gives the chase camera (y 5.6) clear headroom.
    this._box(CONF.roadWidth + 8, 0.9, 4.2, this.concreteMat, 0, 7.6, 0, g, true);
    this._box(CONF.roadWidth + 8, 0.8, 0.3, this.concreteMat, 0, 8.45, -1.95, g);
    this._box(CONF.roadWidth + 8, 0.8, 0.3, this.concreteMat, 0, 8.45, 1.95, g);
    for (const s of [-1, 1]) {
      this._box(0.9, 7.2, 3.4, this.concreteMat, s * (CONF.roadWidth / 2 + 3.2), 3.6, 0, g, true);
    }
  }

  _buildTunnelSlice(g, s) {
    // Tall, well-lit bore: ceiling bottom at ~7.55 so the chase camera
    // (y ~5.6) never scrapes it, plus light coves so walls never go black.
    const wx = CONF.roadWidth / 2 + 1.0;
    for (const sd of [-1, 1]) {
      this._box(0.7, 7.6, SEG_LEN, this.tunnelWallMat, sd * wx, 3.8, 0, g);
      this._box(0.74, 1.2, SEG_LEN, this.tunnelDarkMat, sd * wx, 0.6, 0, g);
      this._box(0.1, 0.14, SEG_LEN, this.stripMat, sd * (wx - 0.4), 3.0, 0, g);  // guide strip
      this._box(0.12, 0.20, SEG_LEN, this.stripMat, sd * (wx - 0.4), 6.4, 0, g); // light cove
    }
    this._box(CONF.roadWidth + 3.4, 0.7, SEG_LEN, this.tunnelWallMat, 0, 7.9, 0, g);
    for (const sd of [-1, 1]) {
      this._box(0.5, 0.12, SEG_LEN, this.stripMat, sd * 2.6, 7.52, 0, g); // continuous light lines
    }
    for (let z = -SEG_LEN / 2 + 3; z < SEG_LEN / 2; z += 6) {
      this._box(2.6, 0.14, 1.6, this.stripMat, 0, 7.5, 0, g); // ceiling lights
    }
    // Portal frame at the outer end of the pair (seg 4 front / seg 5 back)
    const portalZ = s === 4 ? -SEG_LEN / 2 : SEG_LEN / 2;
    for (const sd of [-1, 1]) {
      this._box(0.9, 8.6, 0.9, this.portalMat, sd * (wx + 0.2), 4.3, portalZ, g);
    }
    this._box(CONF.roadWidth + 4.4, 1.0, 0.9, this.portalMat, 0, 8.4, portalZ, g);
  }

  _buildStaticScenery() {
    // Grass ground
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), this.groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.08, -120);
    ground.receiveShadow = true;
    this.scene.add(ground);
    // Distant hills (static; fog does most of the work)
    const hillGeo = new THREE.ConeGeometry(1, 1, 7);
    for (const [x, z, r, h] of [[-90, -190, 55, 30], [80, -200, 65, 36], [-140, -150, 45, 22], [140, -160, 50, 26]]) {
      const hill = new THREE.Mesh(hillGeo, this.hillMat);
      hill.scale.set(r, h, r);
      hill.position.set(x, h / 2 - 1, z);
      this.scene.add(hill);
    }
    // Puffy flat clouds
    const cloudGeo = new THREE.PlaneGeometry(1, 0.42);
    for (const [x, y, z, s] of [[-40, 46, -170, 26], [10, 55, -190, 34], [60, 42, -160, 22], [-90, 50, -150, 20], [100, 58, -185, 30]]) {
      const cloud = new THREE.Mesh(cloudGeo, this.cloudMat);
      cloud.scale.set(s, s, 1);
      cloud.position.set(x, y, z);
      this.scene.add(cloud);
    }
  }

  update(dt, speed) {
    const dz = speed * dt;
    this.offset += dz;
    // Lazy heal: if the one-shot bind missed (image still in flight at
    // construction on a slow load), bind the instant pixels exist. One
    // flag check per frame once bound — free on Android.
    if (!this.billboardTex) this._bindBillboardArt();
    for (const seg of this.segments) {
      seg.position.z += dz;
      if (seg.position.z - SEG_LEN / 2 > SEG_LEN) {
        seg.position.z -= TOTAL_LEN;
      }
    }
  }

  reset() {
    for (let s = 0; s < SEG_COUNT; s++) {
      this.segments[s].position.z = -TOTAL_LEN + SEG_LEN / 2 + s * SEG_LEN + SEG_LEN;
    }
    this.offset = 0;
  }

  // Deterministic parked pose for the lobby: the home layout plus a fixed
  // offset that keeps tall roadside props clear of the garage pad (the
  // home gantry column would otherwise stand on the pad's east edge).
  // Gameplay is unaffected (start() calls reset() fresh every run).
  parkForLobby() {
    this.reset();
    for (const seg of this.segments) seg.position.z += 6;
  }
}
