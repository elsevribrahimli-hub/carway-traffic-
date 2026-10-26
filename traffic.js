// CARWAY TRAFFIC — TrafficSystem: pooled premium traffic in 9 body styles
// (luxury sedan, sports coupe, supercar, hatchback, electric sedan, SUV,
// pickup, box truck, tow truck) + roadworks excavation hazards at the
// ROAD EDGES only.
// Traffic rows always leave a connected free lane (fair-gap contract).
// Perf: shared geometries/materials across all cars, two-level LOD
// (full detail near, 3-mesh simple far), spawn recolor + anti-repeat variety.
// NOTE: three.js is imported via relative path so Node logic tests can
// measure model envelopes (collision compatibility).
import * as THREE from '../../libs/three.module.js';
import {
  CONF, LANES_X, LANE_COUNT, TRAFFIC_COLORS, freeLanes,
  spawnGapFor, doubleRowChanceFor, pickBlockedLanes, rowsConnect, playerSpeedFor,
  clusterObstacles, fieldViolations,
} from '../config.js';

const POOL_CARS = 18;
const POOL_WORKS = 6;

// Body styles in pool order (cars[0] stays a sedan for test rigs).
// kind = collision/clearance class (sedan 1.55 / suv 2.05 / truck 2.95 m);
// every visual top must stay under its class clear height (pinned by tests).
export const BODY_ORDER = ['sedan', 'coupe', 'supercar', 'hatch', 'esedan', 'suv', 'pickup', 'truck', 'tow'];
export const BODY_SPECS = {
  sedan:    { kind: 'sedan', len: 4.4, wid: 1.95, beltY: 0.92, hoodY: 0.78, hoodLen: 1.3, cabin: { x0: -0.75, x1: 1.25, h: 0.44 }, wheelR: 0.34, extras: [] },
  coupe:    { kind: 'sedan', len: 4.3, wid: 1.92, beltY: 0.80, hoodY: 0.70, hoodLen: 1.5, cabin: { x0: -0.45, x1: 1.05, h: 0.40 }, wheelR: 0.34, extras: ['lip', 'bar'] },
  supercar: { kind: 'sedan', len: 4.4, wid: 2.00, beltY: 0.70, hoodY: 0.62, hoodLen: 1.6, cabin: { x0: -0.40, x1: 1.00, h: 0.38 }, wheelR: 0.33, extras: ['wing', 'bar', 'intakes', 'quad'] },
  hatch:    { kind: 'sedan', len: 3.9, wid: 1.90, beltY: 0.95, hoodY: 0.82, hoodLen: 0.9, cabin: { x0: -0.75, x1: 1.55, h: 0.40 }, wheelR: 0.32, extras: [] },
  esedan:   { kind: 'sedan', len: 4.5, wid: 1.95, beltY: 0.88, hoodY: 0.76, hoodLen: 1.4, cabin: { x0: -0.85, x1: 1.35, h: 0.44 }, wheelR: 0.34, extras: ['glassroof', 'nogrille'] },
  suv:      { kind: 'suv',   len: 4.5, wid: 2.00, beltY: 1.12, hoodY: 0.95, hoodLen: 1.2, cabin: { x0: -0.85, x1: 1.45, h: 0.52 }, wheelR: 0.38, extras: ['rails', 'cladding'] },
  pickup:   { kind: 'suv',   len: 4.9, wid: 2.00, beltY: 1.02, hoodY: 0.90, hoodLen: 1.3, cabin: { x0: -1.85, x1: -0.25, h: 0.52 }, wheelR: 0.38, extras: ['bed'] },
  truck:    { kind: 'truck', len: 6.4, wid: 2.10 },
  tow:      { kind: 'truck', len: 6.0, wid: 2.10, extras: [] },
};

function std(color, metalness = 0.6, roughness = 0.4, envMapIntensity = 1) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness, envMapIntensity });
}

// Shared materials: one instance per finish for the whole traffic fleet
// (paint stays per-car so spawns can recolor). Created lazily, no GL until render.
let _shared = null;
function sharedMats() {
  if (!_shared) {
    _shared = {
      glass: std(0x101a2c, 0.9, 0.12, 1.3),
      trim: std(0x1a1e26, 0.5, 0.5),
      tyre: std(0x0c0c0e, 0.15, 0.9),
      hub: std(0xaeb6c2, 0.85, 0.35),
      white: std(0xe3e8ef, 0.25, 0.6, 0.7),
      dark: std(0x222831, 0.6, 0.5),
      head: new THREE.MeshStandardMaterial({ color: 0xe8f4ff, emissive: 0xcfe8ff, emissiveIntensity: 1.2 }),
      tail: new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff1a1a, emissiveIntensity: 1.8 }),
      amber: new THREE.MeshStandardMaterial({ color: 0xffa500, emissive: 0xff8800, emissiveIntensity: 1.6 }),
    };
  }
  return _shared;
}

// Shared geometries: identical boxes/cylinders are created once and reused
// by every car (pooled for the app's lifetime — never disposed, never leaked).
const _geoCache = new Map();
function boxGeo(w, h, d) {
  const k = `b${w}|${h}|${d}`;
  let g = _geoCache.get(k);
  if (!g) { g = new THREE.BoxGeometry(w, h, d); _geoCache.set(k, g); }
  return g;
}
function cylGeo(r, w, seg = 14) {
  const k = `c${r}|${w}|${seg}`;
  let g = _geoCache.get(k);
  if (!g) { g = new THREE.CylinderGeometry(r, r, w, seg); g.rotateZ(Math.PI / 2); _geoCache.set(k, g); }
  return g;
}

function trafficWheel(r = 0.34, w = 0.28) {
  const M = sharedMats();
  const g = new THREE.Group();
  const tyre = new THREE.Mesh(cylGeo(r, w), M.tyre);
  tyre.castShadow = true;
  g.add(tyre);
  g.add(new THREE.Mesh(cylGeo(r * 0.55, w + 0.02, 10), M.hub));
  return g;
}

// Smooth car shell: side-profile Shape extruded across the width (nose -Z).
function extrudeShell(profile, width, bevel, curveSegments, material) {
  const s = new THREE.Shape();
  profile(s);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(0.1, width - bevel * 2),
    bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.6,
    bevelSegments: 1, curveSegments,
  });
  geo.translate(0, 0, -(width - bevel * 2) / 2);
  geo.rotateY(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  return mesh;
}

// ---- Generic premium traffic-car builder (all 9 body styles) ----
// One code path, spec-driven proportions, shared geometries/materials.
// Returns { group, detail, simple, wheels, paintMats, len, wid }.
function carBodyProfile(spec) {
  const L = spec.len / 2, belt = spec.beltY, hood = spec.hoodY, floor = 0.16;
  const hoodX = -L + spec.hoodLen;
  return (s) => {
    s.moveTo(-L + 0.12, floor + 0.02);
    s.quadraticCurveTo(-L - 0.02, floor + 0.04, -L, hood - 0.16); // nose
    s.quadraticCurveTo(-L + 0.04, hood - 0.02, -L + 0.32, hood);  // nose top
    s.lineTo(hoodX, hood);                                         // hood
    s.quadraticCurveTo(hoodX + 0.35, hood + 0.03, hoodX + 0.65, belt); // cowl
    s.lineTo(L - 0.45, belt);                                      // beltline
    s.quadraticCurveTo(L - 0.04, belt, L, belt - 0.16);           // tail round
    s.lineTo(L, Math.max(floor + 0.2, belt - 0.42));              // tail face
    s.quadraticCurveTo(L - 0.08, floor + 0.08, L - 0.3, floor + 0.06);
    s.lineTo(-L + 0.18, floor);
    s.quadraticCurveTo(-L + 0.08, floor, -L + 0.12, floor + 0.02);
  };
}

function cabinProfile(spec) {
  const { x0, x1, h } = spec.cabin;
  const base = spec.beltY - 0.05, roof = spec.beltY + h;
  const w0 = x0 + (x1 - x0) * 0.32, w1 = x0 + (x1 - x0) * 0.55, r0 = x0 + (x1 - x0) * 0.78;
  return (s) => {
    s.moveTo(x0, base);
    s.quadraticCurveTo(w0, base + 0.02, w1, roof); // windshield
    s.lineTo(r0, roof);                             // roof
    s.quadraticCurveTo(x1 - 0.05, roof - 0.03, x1, base + 0.05); // rear slope
    s.lineTo(x1, base);
    s.lineTo(x0, base);
  };
}

function buildCarDetail(detail, spec, paint, wheels, body, lights = null) {
  const M = sharedMats();
  // Player/police builds pass cloned lights so brake flashes stay private.
  const headMat = (lights && lights.head) || M.head;
  const tailMat = (lights && lights.tail) || M.tail;
  const L = spec.len / 2, W = spec.wid;
  const add = (mesh, x, y, z) => { mesh.position.set(x, y, z); mesh.castShadow = true; detail.add(mesh); return mesh; };
  // Smooth body shell + glasshouse.
  detail.add(extrudeShell(carBodyProfile(spec), W, 0.09, 6, paint));
  const cabW = W * (body === 'supercar' ? 0.72 : 0.78);
  detail.add(extrudeShell(cabinProfile(spec), cabW, 0.06, 5, M.glass));
  // Paint roof panel (skipped for the glass-roof electric sedan).
  if (!spec.extras.includes('glassroof')) {
    const cx = spec.cabin.x0 + (spec.cabin.x1 - spec.cabin.x0) * 0.66;
    const clen = (spec.cabin.x1 - spec.cabin.x0) * 0.32;
    add(new THREE.Mesh(boxGeo(cabW * 0.9, 0.06, clen), paint), 0, spec.beltY + spec.cabin.h + 0.04, cx);
  }
  // Wheels.
  const wr = spec.wheelR, wx = W / 2 - 0.05, wz = spec.len / 2 - 0.95;
  for (const [x, z] of [[-wx, -wz], [wx, -wz], [-wx, wz], [wx, wz]]) {
    const w = trafficWheel(wr, 0.28); w.position.set(x, wr, z); detail.add(w); wheels.push(w);
  }
  // Bumpers, grille (EVs have none), mirrors.
  add(new THREE.Mesh(boxGeo(W * 0.96, 0.18, 0.22), M.trim), 0, 0.42, -L + 0.02);
  add(new THREE.Mesh(boxGeo(W * 0.96, 0.18, 0.20), M.trim), 0, 0.42, L - 0.02);
  if (!spec.extras.includes('nogrille')) {
    add(new THREE.Mesh(boxGeo(W * 0.5, 0.14, 0.08), M.dark), 0, 0.62, -L - 0.02);
  }
  add(new THREE.Mesh(boxGeo(0.08, 0.10, 0.28), paint), -W / 2 - 0.02, spec.beltY - 0.02, spec.cabin.x0 + 0.35);
  add(new THREE.Mesh(boxGeo(0.08, 0.10, 0.28), paint), W / 2 + 0.02, spec.beltY - 0.02, spec.cabin.x0 + 0.35);
  // Headlights + taillights (sporty types get a full-width rear bar).
  add(new THREE.Mesh(boxGeo(0.42, 0.13, 0.08), headMat), -0.60, spec.hoodY - 0.06, -L - 0.01);
  add(new THREE.Mesh(boxGeo(0.42, 0.13, 0.08), headMat), 0.60, spec.hoodY - 0.06, -L - 0.01);
  if (spec.extras.includes('bar')) {
    add(new THREE.Mesh(boxGeo(W * 0.78, 0.12, 0.08), tailMat), 0, spec.beltY - 0.08, L + 0.01);
  } else {
    add(new THREE.Mesh(boxGeo(0.44, 0.15, 0.08), tailMat), -0.60, spec.beltY - 0.10, L + 0.01);
    add(new THREE.Mesh(boxGeo(0.44, 0.15, 0.08), tailMat), 0.60, spec.beltY - 0.10, L + 0.01);
  }
  // Per-type extras.
  if (spec.extras.includes('lip')) {
    add(new THREE.Mesh(boxGeo(W * 0.8, 0.06, 0.22), paint), 0, spec.beltY + 0.05, L - 0.25);
  }
  if (spec.extras.includes('wing')) {
    add(new THREE.Mesh(boxGeo(0.08, 0.20, 0.10), M.trim), -0.55, spec.beltY + 0.10, L - 0.45);
    add(new THREE.Mesh(boxGeo(0.08, 0.20, 0.10), M.trim), 0.55, spec.beltY + 0.10, L - 0.45);
    add(new THREE.Mesh(boxGeo(W * 0.85, 0.05, 0.35), M.trim), 0, spec.beltY + 0.22, L - 0.42);
  }
  if (spec.extras.includes('intakes')) {
    add(new THREE.Mesh(boxGeo(0.10, 0.24, 0.60), M.dark), -W / 2 + 0.02, 0.62, 0.55);
    add(new THREE.Mesh(boxGeo(0.10, 0.24, 0.60), M.dark), W / 2 - 0.02, 0.62, 0.55);
  }
  if (spec.extras.includes('quad')) {
    for (const ex of [-0.45, -0.25, 0.25, 0.45]) {
      const tip = new THREE.Mesh(cylGeo(0.05, 0.12, 8), M.dark);
      tip.rotation.y = Math.PI / 2;
      add(tip, ex, 0.32, L + 0.02);
    }
  }
  if (spec.extras.includes('rails')) {
    const ry = spec.beltY + spec.cabin.h + 0.06;
    add(new THREE.Mesh(boxGeo(0.07, 0.07, 2.0), M.trim), -0.55, ry, 0.3);
    add(new THREE.Mesh(boxGeo(0.07, 0.07, 2.0), M.trim), 0.55, ry, 0.3);
  }
  if (spec.extras.includes('cladding')) {
    add(new THREE.Mesh(boxGeo(W, 0.16, spec.len * 0.88), M.trim), 0, 0.30, 0);
  }
  if (spec.extras.includes('bed')) {
    // Open pickup bed behind the cab: dark liner + walls + tailgate.
    const bedZ0 = spec.cabin.x1, bedZ1 = L - 0.05;
    const bedLen = bedZ1 - bedZ0, bedZ = (bedZ0 + bedZ1) / 2;
    add(new THREE.Mesh(boxGeo(W * 0.88, 0.06, bedLen), M.dark), 0, spec.beltY + 0.03, bedZ);
    add(new THREE.Mesh(boxGeo(0.08, 0.30, bedLen), paint), -W / 2 + 0.06, spec.beltY + 0.18, bedZ);
    add(new THREE.Mesh(boxGeo(0.08, 0.30, bedLen), paint), W / 2 + 0.06, spec.beltY + 0.18, bedZ);
    add(new THREE.Mesh(boxGeo(W * 0.88, 0.30, 0.08), paint), 0, spec.beltY + 0.18, bedZ1 - 0.04);
  }
}

// Box truck: tall cab + cargo box (keeps the 'truck' clearance class).
function buildTruckDetail(detail, paint, wheels) {
  const M = sharedMats();
  const L = 3.2, W = 2.1;
  const add = (mesh, x, y, z) => { mesh.position.set(x, y, z); mesh.castShadow = true; detail.add(mesh); return mesh; };
  add(new THREE.Mesh(boxGeo(W, 1.55, 1.7), paint), 0, 1.15, -L + 0.9);       // cab
  add(new THREE.Mesh(boxGeo(W * 0.88, 0.62, 0.10), M.glass), 0, 1.50, -L + 0.10); // windshield
  add(new THREE.Mesh(boxGeo(W * 0.9, 0.42, 0.14), M.trim), 0, 0.60, -L + 0.72);   // bumper/grille
  add(new THREE.Mesh(boxGeo(W, 2.15, 4.2), M.white), 0, 1.60, 1.05);          // cargo box
  add(new THREE.Mesh(boxGeo(W + 0.04, 0.32, 4.2), paint), 0, 0.78, 1.05);    // stripe
  add(new THREE.Mesh(boxGeo(0.10, 0.35, 0.30), M.trim), -W / 2 - 0.03, 1.35, -L + 1.4);
  add(new THREE.Mesh(boxGeo(0.10, 0.35, 0.30), M.trim), W / 2 + 0.03, 1.35, -L + 1.4);
  add(new THREE.Mesh(boxGeo(0.40, 0.16, 0.08), M.head), -0.65, 0.72, -L - 0.01);
  add(new THREE.Mesh(boxGeo(0.40, 0.16, 0.08), M.head), 0.65, 0.72, -L - 0.01);
  add(new THREE.Mesh(boxGeo(0.30, 0.30, 0.08), M.tail), -0.80, 0.70, L + 0.01);
  add(new THREE.Mesh(boxGeo(0.30, 0.30, 0.08), M.tail), 0.80, 0.70, L + 0.01);
  for (const [x, z] of [[-1.0, -2.2], [1.0, -2.2], [-1.0, 1.6], [1.0, 1.6], [-1.0, 2.5], [1.0, 2.5]]) {
    const w = trafficWheel(0.40, 0.32); w.position.set(x, 0.40, z); detail.add(w); wheels.push(w);
  }
}

// Tow truck: high cab + winch frame + open, lowered flatbed (keeps the
// 'truck' clearance class: cab roof + beacon stay well under 2.95 m). The
// bed is visual only — the player has no ramp/landing physics, so touching
// the truck obeys the normal traffic rules (side scrape = police chase,
// rear-ender = game over). Nose -Z, road plane y = 0, like every vehicle.
function buildTowDetail(detail, paint, wheels) {
  const M = sharedMats();
  const L = 3.0, W = 2.1;
  const add = (mesh, x, y, z) => { mesh.position.set(x, y, z); mesh.castShadow = true; detail.add(mesh); return mesh; };
  add(new THREE.Mesh(boxGeo(1.6, 0.28, 5.6), M.dark), 0, 0.55, 0.1);              // chassis rails
  add(new THREE.Mesh(boxGeo(W, 1.5, 1.7), paint), 0, 1.30, -L + 0.95);             // cab
  add(new THREE.Mesh(boxGeo(W * 0.88, 0.60, 0.10), M.glass), 0, 1.62, -L + 0.12); // windshield
  add(new THREE.Mesh(boxGeo(W * 0.9, 0.40, 0.14), M.trim), 0, 0.62, -L + 0.10);   // bumper/grille
  add(new THREE.Mesh(boxGeo(0.90, 0.12, 0.24), M.amber), 0, 2.11, -L + 0.95);     // roof beacon bar
  add(new THREE.Mesh(boxGeo(0.10, 0.32, 0.26), M.trim), -W / 2 - 0.03, 1.60, -L + 0.8);
  add(new THREE.Mesh(boxGeo(0.10, 0.32, 0.26), M.trim), W / 2 + 0.03, 1.60, -L + 0.8);
  add(new THREE.Mesh(boxGeo(0.40, 0.16, 0.08), M.head), -0.65, 0.78, -L - 0.01);  // headlights
  add(new THREE.Mesh(boxGeo(0.40, 0.16, 0.08), M.head), 0.65, 0.78, -L - 0.01);
  // Winch frame behind the cab: posts + crossbeam + drum housing.
  add(new THREE.Mesh(boxGeo(0.12, 0.70, 0.12), M.dark), -0.70, 1.40, -1.00);
  add(new THREE.Mesh(boxGeo(0.12, 0.70, 0.12), M.dark), 0.70, 1.40, -1.00);
  add(new THREE.Mesh(boxGeo(1.52, 0.12, 0.12), M.dark), 0, 1.78, -1.00);
  add(new THREE.Mesh(boxGeo(0.50, 0.30, 0.30), M.trim), 0, 1.19, -0.72);
  // Open lowered flatbed: subframe + steel deck + low side rims (no walls,
  // no tailgate), reflective strips, rear bumper + taillights.
  add(new THREE.Mesh(boxGeo(1.8, 0.24, 3.4), M.dark), 0, 0.80, 1.10);             // subframe
  add(new THREE.Mesh(boxGeo(2.0, 0.12, 3.6), M.dark), 0, 0.98, 1.10);             // deck
  add(new THREE.Mesh(boxGeo(0.08, 0.14, 3.6), paint), -0.96, 1.08, 1.10);         // bed rims
  add(new THREE.Mesh(boxGeo(0.08, 0.14, 3.6), paint), 0.96, 1.08, 1.10);
  add(new THREE.Mesh(boxGeo(0.04, 0.10, 3.0), M.white), -1.01, 0.80, 1.10);       // reflective strips
  add(new THREE.Mesh(boxGeo(0.04, 0.10, 3.0), M.white), 1.01, 0.80, 1.10);
  add(new THREE.Mesh(boxGeo(2.0, 0.30, 0.15), M.trim), 0, 0.55, L - 0.05);        // rear bumper
  add(new THREE.Mesh(boxGeo(0.30, 0.28, 0.08), M.tail), -0.80, 0.75, L + 0.01);   // taillights
  add(new THREE.Mesh(boxGeo(0.30, 0.28, 0.08), M.tail), 0.80, 0.75, L + 0.01);
  for (const [x, z] of [[-1.0, -2.2], [1.0, -2.2], [-1.0, 1.6], [1.0, 1.6], [-1.0, 2.5], [1.0, 2.5]]) {
    const w = trafficWheel(0.40, 0.32); w.position.set(x, 0.40, z); detail.add(w); wheels.push(w);
  }
}

// LOD simple level: body lifted off the ground over a dark wheel band +
// glasshouse + lit rear strip, so far cars still read as cars (no shadows:
// invisible at range). 4-5 cheap meshes, shared geos/mats.
function buildSimpleCar(body, dims, paintMat) {
  const M = sharedMats();
  const g = new THREE.Group();
  const add = (mesh, x, y, z) => { mesh.position.set(x, y, z); mesh.castShadow = false; g.add(mesh); return mesh; };
  if (body === 'truck') {
    add(new THREE.Mesh(boxGeo(2.0, 1.7, 1.8), paintMat), 0, 1.35, -2.3);
    add(new THREE.Mesh(boxGeo(2.05, 1.9, 4.3), M.white), 0, 1.65, 0.95);
    add(new THREE.Mesh(boxGeo(1.9, 0.6, 6.0), M.dark), 0, 0.32, 0);
    add(new THREE.Mesh(boxGeo(1.4, 0.18, 0.08), M.tail), 0, 0.9, 3.16);
  } else if (body === 'tow') {
    add(new THREE.Mesh(boxGeo(2.0, 1.6, 1.7), paintMat), 0, 1.30, -2.0);  // cab
    add(new THREE.Mesh(boxGeo(2.0, 0.28, 3.8), M.dark), 0, 0.95, 0.95);    // flatbed
    add(new THREE.Mesh(boxGeo(1.9, 0.6, 5.6), M.dark), 0, 0.32, 0);        // wheel band
    add(new THREE.Mesh(boxGeo(1.4, 0.18, 0.08), M.tail), 0, 0.75, 2.96);   // tail strip
  } else {
    const { len, wid, top } = dims;
    const bodyH = top * 0.42, bodyTop = 0.35 + bodyH;
    const glassH = top * 0.30;
    add(new THREE.Mesh(boxGeo(wid, bodyH, len), paintMat), 0, 0.35 + bodyH / 2, 0);
    add(new THREE.Mesh(boxGeo(wid * 0.78, glassH, len * 0.45), M.glass), 0, bodyTop + glassH / 2 - 0.08, len * 0.05);
    add(new THREE.Mesh(boxGeo(wid * 0.9, 0.38, len * 0.92), M.dark), 0, 0.21, 0);
    add(new THREE.Mesh(boxGeo(wid * 0.7, 0.10, 0.06), M.tail), 0, bodyTop - 0.12, len / 2 + 0.01);
  }
  return g;
}

export function buildTrafficCar(body, colorHex, opts = {}) {
  const spec = BODY_SPECS[body] || BODY_SPECS.sedan;
  const group = new THREE.Group();
  const detail = new THREE.Group();
  group.add(detail);
  const paint = new THREE.MeshStandardMaterial({ color: colorHex, metalness: 0.7, roughness: 0.35, envMapIntensity: 1.0 });
  // ownLights: clone the emissive light mats so player/police builds can
  // flash their own brakes/beacons without touching the shared fleet mats.
  let lights = null;
  if (opts.ownLights) {
    const M = sharedMats();
    lights = { head: M.head.clone(), tail: M.tail.clone() };
  }
  const wheels = [];
  if (body === 'truck') buildTruckDetail(detail, paint, wheels);
  else if (body === 'tow') buildTowDetail(detail, paint, wheels);
  else buildCarDetail(detail, spec, paint, wheels, body, lights);
  const simplePaint = new THREE.MeshStandardMaterial({ color: colorHex, metalness: 0.6, roughness: 0.5 });
  const simple = (body === 'truck' || body === 'tow')
    ? buildSimpleCar(body, null, simplePaint)
    : buildSimpleCar(body, { len: spec.len, wid: spec.wid, top: spec.beltY + spec.cabin.h + 0.08 }, simplePaint);
  simple.visible = false;
  group.add(simple);
  group.visible = false;
  const wheelR = (body === 'truck' || body === 'tow') ? 0.40 : spec.wheelR;
  return { group, detail, simple, wheels, paintMats: [paint, simplePaint], len: spec.len, wid: spec.wid, wheelR, lightMats: lights };
}

// Box truck: cab + cargo trailer.
function buildBarrier() {
  // Low striped roadwork board — guards the player-facing end of a works cluster.
  const g = new THREE.Group();
  const add = (m, x, y, z) => { m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.6), std(0x333a4d, 0.4, 0.6)), -1.1, 0.06, 0);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.6), std(0x333a4d, 0.4, 0.6)), 1.1, 0.06, 0);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.8, 0.22), std(0x565e75, 0.6, 0.4)), -1.1, 0.45, 0);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.8, 0.22), std(0x565e75, 0.6, 0.4)), 1.1, 0.45, 0);
  const boardMat = new THREE.MeshStandardMaterial({ color: 0xff8c1a, emissive: 0xcc5500, emissiveIntensity: 0.45, roughness: 0.5 });
  add(new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.42, 0.16), boardMat), 0, 0.85, 0);
  const stripeMat = new THREE.MeshBasicMaterial({ color: 0xfff2cc });
  for (const x of [-0.85, 0, 0.85]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.44, 0.17), stripeMat);
    s.position.set(x, 0.85, 0); s.rotation.z = 0.5; g.add(s);
  }
  // Warning beacon on top
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xffa500, emissive: 0xff8800, emissiveIntensity: 2.0 }));
  beacon.position.set(0, 1.16, 0);
  g.add(beacon);
  g.visible = false;
  return { group: g, beacon, len: 1.0, wid: 2.6 };
}

// Small traffic cone: orange cone + white band + dark base. Cheap (~3 meshes).
function buildCone() {
  const g = new THREE.Group();
  const orange = new THREE.MeshStandardMaterial({ color: 0xe8641b, roughness: 0.6 });
  const white = new THREE.MeshBasicMaterial({ color: 0xf5f2e8 });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.52, 10), orange);
  cone.position.y = 0.30; cone.castShadow = true; g.add(cone);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.125, 0.12, 10), white);
  band.position.y = 0.32; g.add(band);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.34), std(0x2a2e38, 0.3, 0.7));
  base.position.y = 0.025; g.add(base);
  return g;
}

// Roadworks excavation cluster for the road EDGE: an excavated asphalt trench
// with orange rim + yellow painted markings, a striped warning board with a
// flashing beacon, and a taper of cones. Footprint matches CONF.worksLen/Wid
// and sits fully outside every lane's driving corridor (see logic tests).
function buildWorksCluster() {
  const g = new THREE.Group();
  const add = (m, x, y, z) => { m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };

  // Excavated asphalt: torn dark patch + recessed pit + orange safety rim.
  add(new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.05, 3.0), std(0x23262e, 0.1, 0.95)), 0, 0.028, -0.7);
  add(new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 2.1), std(0x0b0c10, 0.0, 1.0)), 0, 0.032, -0.7);
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xe8641b, roughness: 0.6 });
  add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 3.0), rimMat), -1.0, 0.035, -0.7);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 3.0), rimMat), 1.0, 0.035, -0.7);
  // Yellow painted construction markings edging the dig.
  const paintMat = new THREE.MeshBasicMaterial({ color: 0xd8b400 });
  for (const z of [-2.32, 0.92]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.055, 0.14), paintMat);
    stripe.position.set(0, 0.030, z); g.add(stripe);
  }

  // Striped warning board + flashing beacon guarding the player-facing end.
  const board = buildBarrier();
  board.group.visible = true;
  board.group.position.set(0, 0, 1.1);
  g.add(board.group);

  // Cone taper facing the oncoming player.
  const coneZ = [1.7, 2.1, 2.45];
  const coneX = [0.7, 0.1, -0.5];
  for (let i = 0; i < 3; i++) {
    const cone = buildCone();
    cone.position.set(coneX[i], 0, coneZ[i]);
    g.add(cone);
  }
  g.visible = false;
  return { group: g, beacon: board.beacon, len: CONF.worksLen, wid: CONF.worksWid };
}

export class TrafficSystem {
  constructor(scene) {
    this.scene = scene;
    this.cars = [];
    this.hazards = []; // roadworks clusters, road edges only
    this.lodFar = 55; // full-detail range (m); set by graphics quality
    for (let i = 0; i < POOL_CARS; i++) {
      const body = BODY_ORDER[i % BODY_ORDER.length];
      const color = TRAFFIC_COLORS[i % TRAFFIC_COLORS.length];
      const c = buildTrafficCar(body, color);
      c.active = false; c.speed = 0; c.counted = false; c._hitMark = false;
      c.body = body; c.kind = BODY_SPECS[body].kind; c.color = color;
      c._lodFar = null; // force LOD sync on first update
      scene.add(c.group);
      this.cars.push(c);
    }
    for (let i = 0; i < POOL_WORKS; i++) {
      const h = buildWorksCluster();
      h.active = false; h.jumpedOver = false; h._hitMark = false; h.phase = Math.random() * Math.PI * 2;
      scene.add(h.group);
      this.hazards.push(h);
    }
    this.distSinceRow = 0;
    this.distSinceWorks = 0;
    this.nextWorksGap = this._rollWorksGap();
    this.prevFree = [0, 1, 2];
    this.graceLeft = 60;
    this.time = 0;
    // Spawn-fairness stats (test hooks): recent rows, extremes, counters.
    this.rowHistory = [];
    this.maxBlockedInRow = 0;
    this.minRowGap = Infinity;
    this._lastRowDist = 0;
    this.carsSpawned = 0;
    this.rowsSpawned = 0;
    this.rowsDelayed = 0;
    this._validatorRetries = 0;
    this.worksSpawned = 0;
    // Variety hooks: recent spawn history (capped) + anti-repeat memory.
    this.spawnedBodies = [];
    this.spawnedColors = [];
    this.lastSpawnBody = null;
    this.lastSpawnColor = null;
  }

  reset() {
    for (const c of this.cars) { c.active = false; c.group.visible = false; c._hitMark = false; c._scrapeWob = 0; c.group.rotation.z = 0; }
    for (const h of this.hazards) { h.active = false; h.group.visible = false; h._hitMark = false; }
    this.distSinceRow = 0;
    this.distSinceWorks = 0;
    this.nextWorksGap = this._rollWorksGap();
    this.prevFree = [0, 1, 2];
    this.graceLeft = 60;
    this.rowHistory = [];
    this.maxBlockedInRow = 0;
    this.minRowGap = Infinity;
    this._lastRowDist = 0;
    this.carsSpawned = 0;
    this.rowsSpawned = 0;
    this.rowsDelayed = 0;
    this._validatorRetries = 0;
    this.worksSpawned = 0;
    this.spawnedBodies = [];
    this.spawnedColors = [];
    this.lastSpawnBody = null;
    this.lastSpawnColor = null;
  }

  // Prefer a body style different from the last spawn (variety), but never
  // fail to spawn when the pool is all one style.
  _freeCar() {
    return this.cars.find((c) => !c.active && c.body !== this.lastSpawnBody)
        || this.cars.find((c) => !c.active);
  }
  _freeWorks() { return this.hazards.find((h) => !h.active); }
  _rollWorksGap() {
    return CONF.worksGapMin + Math.random() * (CONF.worksGapMax - CONF.worksGapMin);
  }

  // Pick blocked lanes for a row (pure helper in config.js: 1-2 lanes, connected).
  pickRow(blockChance2) {
    return pickBlockedLanes(this.prevFree, blockChance2);
  }

  // spawnZ: where the row appears. Gameplay uses the default (CONF.spawnZ,
  // far ahead in the fog); the lobby passes a south-side z behind its camera.
  // ---- Fair-spawn validator (spawn-time only: zero per-frame cost) ----
  // Plain obstacle descriptors for the pure cluster math in config.js.
  // Footprints use the same collision half-extent the crash test uses
  // (overlapXZ), so validation exactly matches gameplay.
  _activeDescriptors(playerSpeed, distanceM) {
    const out = [];
    const hzP = (CONF.playerLength / 2) * CONF.hitShrinkZ;
    // Foreseeable speed envelope: base cruise .. full boost, widened by the
    // live speed so ANY regime (mid-boost, chase slowdown) stays covered.
    const base = playerSpeedFor(distanceM);
    const vLo = Math.min(base, playerSpeed);
    const vHi = Math.max(base * CONF.boostMult, playerSpeed);
    for (const c of this.cars) {
      if (!c.active) continue;
      const z = c.group.position.z;
      const hz = hzP + ((c.len / 2) * CONF.hitShrinkZ);
      out.push({ lanes: [c.lane], z0: z - hz, z1: z + hz,
        relLo: vLo - c.speed, relHi: vHi - c.speed });
    }
    // Roadworks hazards are DELIBERATELY excluded: they sit off-path at
    // x = +/-5.0 (dx 1.8 > maxDx 1.44 vs any lane center, even mid-switch),
    // so they can neither block a lane nor collide during a lane change.
    // Including them would only stretch cluster time spans and manufacture
    // phantom gap violations (verified by probe: a hazard at z=-112 pushed
    // a cluster edge 0.7 s later with zero physical meaning).
    return out;
  }

  // Fallback lane-sets when the first pick fails validation: same-size sets
  // first (preserve density), then singles; all keep the spawn-adjacent
  // connectivity invariant the row-history asserts rely on. Rotated by row
  // count so retries don't always collapse onto lane 0.
  _fallbackLanes(first) {
    const all = [[0], [1], [2], [0, 1], [0, 2], [1, 2]];
    const key = first.join(',');
    const same = [], rest = [];
    for (const l of all) {
      if (l.join(',') === key) continue;
      if (!rowsConnect(this.prevFree, freeLanes(l))) continue;
      (l.length === first.length ? same : rest).push(l);
    }
    const rot = (arr) => {
      if (!arr.length) return arr;
      const k = this.rowsSpawned % arr.length;
      return arr.slice(k).concat(arr.slice(0, k));
    };
    return rot(same).concat(rot(rest));
  }

  // Validate a candidate row against live occupancy. Returns
  // { lanes, cars: [{ car, lane, speed, z }] } or null (delay one gap cycle).
  // Bounded: <= 7 candidates, no retry loops, no RNG resampling.
  _planRow(distanceM, playerSpeed, spawnZ) {
    const cands = [this.pickRow(doubleRowChanceFor(distanceM))];
    for (const l of this._fallbackLanes(cands[0])) cands.push(l);
    const actives = this._activeDescriptors(playerSpeed, distanceM);
    const base = playerSpeedFor(distanceM);
    const vLo = Math.min(base, playerSpeed);
    const vHi = Math.max(base * CONF.boostMult, playerSpeed);
    const hzP = (CONF.playerLength / 2) * CONF.hitShrinkZ;
    for (const lanes of cands) {
      // Peek pool cars WITHOUT touching state (real lengths, exact footprints).
      // The running lastBody mirrors _freeCar's per-car update, so peeked
      // picks are exactly what sequential _freeCar calls would return
      // (consecutive-body variety preserved within a row).
      const seen = new Set();
      const cars = [];
      let lastBody = this.lastSpawnBody;
      for (const lane of lanes) {
        const car = this.cars.find((c) => !c.active && !seen.has(c) && c.body !== lastBody)
          || this.cars.find((c) => !c.active && !seen.has(c));
        if (!car) break; // pool short: validate the cars we DO have
        seen.add(car);
        lastBody = car.body;
        cars.push(car);
      }
      if (!cars.length) return null; // pool exhausted: skip, not a violation
      const planned = cars.map((car, i) => ({
        car, lane: lanes[i],
        speed: playerSpeed * (CONF.trafficSpeedMin + Math.random() * (CONF.trafficSpeedMax - CONF.trafficSpeedMin)),
        z: spawnZ - Math.random() * 6,
      }));
      const obs = actives.concat(planned.map((p) => {
        const hz = hzP + ((p.car.len / 2) * CONF.hitShrinkZ);
        return { lanes: [p.lane], z0: p.z - hz, z1: p.z + hz, relLo: vLo - p.speed, relHi: vHi - p.speed };
      }));
      if (fieldViolations(clusterObstacles(obs, CONF.playerZ)).length === 0) {
        return { lanes: planned.map((p) => p.lane), cars: planned };
      }
      this._validatorRetries++;
    }
    this.rowsDelayed++;
    return null;
  }

  // Independent live audit for tests/soak checks: violations in the CURRENT
  // field projected to encounter at the given player speed.
  auditFairness(playerSpeed, distanceM) {
    const clusters = clusterObstacles(this._activeDescriptors(playerSpeed, distanceM), CONF.playerZ);
    return { violations: fieldViolations(clusters), clusters: clusters.length };
  }

  _spawnRow(distanceM, playerSpeed, spawnZ = CONF.spawnZ, opts = {}) {
    // Fair-spawn validation: every planned row is projected to encounter
    // against ALL live traffic before it spawns (cross-batch safety). A row
    // that would complete a 3-lane wall or an unreachable escape is
    // regenerated into fair lanes, else delayed one gap cycle. Lobby ambient
    // passes { validate: false } (nose-first -z traffic, no player encounter).
    let blocked, planned = null;
    if (opts.validate === false) {
      blocked = this.pickRow(doubleRowChanceFor(distanceM));
    } else {
      const plan = this._planRow(distanceM, playerSpeed, spawnZ);
      if (!plan) return; // delayed: pool short, or no fair lanes this cycle
      blocked = plan.lanes;
      planned = plan.cars;
    }
    for (let i = 0; i < blocked.length; i++) {
      const lane = blocked[i];
      const pre = planned ? planned[i] : null;
      const car = pre ? pre.car : this._freeCar();
      if (!car) continue;
      car.speed = pre ? pre.speed : playerSpeed * (CONF.trafficSpeedMin + Math.random() * (CONF.trafficSpeedMax - CONF.trafficSpeedMin));
      car.lane = lane;
      car.group.position.set(LANES_X[lane], 0, pre ? pre.z : spawnZ - Math.random() * 6);
      car.active = true;
      car.counted = false;
      car.jumpedOver = false; // set when the player cleanly clears it airborne
      car._hitMark = false; // fresh spawn can trigger collision events again
      car._scrapeWob = 0; car.group.rotation.z = 0; // pooled car: clear any old scrape wobble
      car.group.visible = true;
      car._lodFar = null; // re-sync LOD on next update
      // Spawn recolor (different from the last car) + variety history.
      let color = TRAFFIC_COLORS[(Math.random() * TRAFFIC_COLORS.length) | 0];
      if (color === this.lastSpawnColor) {
        color = TRAFFIC_COLORS[(TRAFFIC_COLORS.indexOf(color) + 1) % TRAFFIC_COLORS.length];
      }
      for (const m of car.paintMats) m.color.set(color);
      car.color = color;
      this.lastSpawnBody = car.body;
      this.lastSpawnColor = color;
      this.spawnedBodies.push(car.body);
      this.spawnedColors.push(color);
      if (this.spawnedBodies.length > 50) this.spawnedBodies.shift();
      if (this.spawnedColors.length > 50) this.spawnedColors.shift();
      this.carsSpawned++;
    }
    const free = freeLanes(blocked);
    // Fairness stats: history (capped), extremes, gap between row spawns.
    this.rowHistory.push(blocked.slice());
    if (this.rowHistory.length > 60) this.rowHistory.shift();
    if (blocked.length > this.maxBlockedInRow) this.maxBlockedInRow = blocked.length;
    if (this.rowsSpawned > 0) {
      const gap = distanceM - this._lastRowDist;
      if (gap < this.minRowGap) this.minRowGap = gap;
    }
    this._lastRowDist = distanceM;
    this.rowsSpawned++;
    this.prevFree = free;
  }

  // Roadworks cluster at the far left or right road edge — never in a lane.
  _spawnWorks() {
    const h = this._freeWorks();
    if (!h) return;
    const side = Math.random() < 0.5 ? -1 : 1;
    h.group.position.set(side * CONF.worksEdgeX, 0, CONF.spawnZ - Math.random() * 10);
    h.active = true;
    h.jumpedOver = false;
    h._hitMark = false;
    h.group.visible = true;
    this.worksSpawned++;
  }

  // Returns events: { overtakes, nearMisses, aerials } for scoring.
  update(dt, playerSpeed, distanceM, playerX) {
    const events = { overtakes: 0, nearMisses: 0, aerials: 0 };
    this.time += dt;

    if (this.graceLeft > 0) {
      this.graceLeft -= playerSpeed * dt;
    } else {
      this.distSinceRow += playerSpeed * dt;
      if (this.distSinceRow >= spawnGapFor(distanceM)) {
        this.distSinceRow = 0;
        this._spawnRow(distanceM, playerSpeed);
      }
      this.distSinceWorks += playerSpeed * dt;
      if (this.distSinceWorks >= this.nextWorksGap) {
        this.distSinceWorks = 0;
        this.nextWorksGap = this._rollWorksGap();
        this._spawnWorks();
      }
    }

    for (const c of this.cars) {
      if (!c.active) continue;
      c.group.position.z += (playerSpeed - c.speed) * dt;
      // Scrape wobble: brief NPC tip-away after side contact (visual only;
      // x never leaves the lane center). Exponential decay, zeroed exactly.
      if (c._scrapeWob) {
        c.group.rotation.z = c._scrapeWob;
        c._scrapeWob *= Math.pow(0.02, dt);
        if (Math.abs(c._scrapeWob) < 0.004) { c._scrapeWob = 0; c.group.rotation.z = 0; }
      }
      const z = c.group.position.z;
      // Two-level LOD: full detail near, 3-mesh simple far. Cars approach
      // monotonically (traffic is slower than the player), so no flicker.
      const far = z < -this.lodFar;
      if (c._lodFar !== far) {
        c._lodFar = far;
        c.detail.visible = !far;
        c.simple.visible = far;
      }
      if (!far) {
        for (const w of c.wheels) w.rotation.x += (c.speed / c.wheelR) * dt;
      }
      if (!c.counted && z > CONF.playerZ + c.len / 2) {
        c.counted = true;
        events.overtakes++;
        if (c.jumpedOver) events.aerials++;
        if (Math.abs(c.group.position.x - playerX) < CONF.nearMissDist) events.nearMisses++;
      }
      if (z > CONF.despawnZ + c.len) { c.active = false; c.group.visible = false; }
    }
    for (const h of this.hazards) {
      if (!h.active) continue;
      h.group.position.z += playerSpeed * dt; // static world object
      // Flashing beacon
      h.beacon.material.emissiveIntensity = 1.2 + Math.sin(this.time * 9 + h.phase) * 1.2;
      if (h.group.position.z > CONF.despawnZ) { h.active = false; h.group.visible = false; }
    }
    return events;
  }

  // Lobby ambient traffic: cars drive nose-first (-z, away from the lobby
  // camera) under their own power, like real traffic passing the roadside
  // garage. Rows spawn behind the lobby camera (south, invisible) and
  // recycle deep in the northern fog. ONLY the lobby calls this; gameplay
  // uses update() and is untouched by it (no counting, no hazards here).
  updateAmbient(dt, cruiseSpeed, odometer) {
    const events = { overtakes: 0, nearMisses: 0, aerials: 0 };
    this.time += dt;
    this.distSinceRow += cruiseSpeed * dt;
    if (this.distSinceRow >= spawnGapFor(odometer)) {
      this.distSinceRow = 0;
      this._spawnRow(odometer, cruiseSpeed, CONF.despawnZ + 12, { validate: false });
    }
    for (const c of this.cars) {
      if (!c.active) continue;
      c.group.position.z -= c.speed * dt; // forward: nose (-z) first
      const z = c.group.position.z;
      const far = z < -this.lodFar;
      if (c._lodFar !== far) {
        c._lodFar = far;
        c.detail.visible = !far;
        c.simple.visible = far;
      }
      // Rolling forward (-z): rotation.x decreases — the top of the tyre
      // moves with the car (no-slip rolling direction for -z travel).
      if (!far) {
        for (const w of c.wheels) w.rotation.x -= (c.speed / c.wheelR) * dt;
      }
      if (z < CONF.spawnZ) { c.active = false; c.group.visible = false; }
    }
    return events;
  }

  // Active obstacles for collision checks: fn(x, z, len, wid, clearHeight, ob).
  // Clear heights match each model's measured visual top so a "clear" can
  // never clip (or ride on) the obstacle. `ob` lets the game track clean
  // airborne clears without touching the crash test itself.
  forEachObstacle(fn) {
    for (const c of this.cars) {
      if (!c.active) continue;
      const p = c.group.position;
      const clear = c.kind === 'truck' ? CONF.clearHeightTruck
        : c.kind === 'suv' ? CONF.clearHeightSuv : CONF.clearHeightSedan;
      if (p.z > -12 && p.z < 8) fn(p.x, p.z, c.len, c.wid, clear, c);
    }
    for (const h of this.hazards) {
      if (!h.active) continue;
      const p = h.group.position;
      if (p.z > -12 && p.z < 8) fn(p.x, p.z, h.len, h.wid, CONF.clearHeightWorks, h);
    }
  }
}
