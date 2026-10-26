// CARWAY TRAFFIC — Central tuning + pure game-logic helpers (no three.js import,
// so this file can be unit-tested in Node).
//
// All distances in meters, speeds in m/s. Forward = -Z. Player sits at z = 0,
// traffic spawns far ahead (z = -SPAWN_Z) and moves toward the camera.

export const LANES_X = [-3.2, 0, 3.2];
export const LANE_COUNT = 3;

export const CONF = {
  roadWidth: 11.4,
  laneWidth: 3.2,
  spawnZ: -120,          // where traffic appears (inside fog for soft pop-in)
  despawnZ: 16,          // behind camera -> recycle
  playerZ: 0,
  playerLength: 4.2,
  playerWidth: 2.0,
  trafficLength: 4.2,
  trafficWidth: 2.0,
  // Jump physics: apex ~3.3 m, air time ~1.15 s — sized so sedans/SUVs can
  // be fully cleared front-to-back (see canClearJump), trucks only with a
  // perfect high-speed jump, roadworks easily (they sit off the driving path).
  jumpVelocity: 11.5,
  gravity: -20.0,
  // Collision: player must be ABOVE this height to clear the object.
  // Derived from measured visual tops + margin (sedan 1.42 / SUV 1.94 /
  // truck 2.80 / roadworks board+beacon ~1.16) so a "clear" never clips.
  clearHeightSedan: 1.55,
  clearHeightSuv: 2.05,
  clearHeightTruck: 2.95,
  clearHeightWorks: 1.25,
  // Lateral (x/z) shrink factors so hits feel fair, not pixel-perfect cruel
  hitShrinkX: 0.72,
  hitShrinkZ: 0.74,
  // Speed / difficulty
  startSpeed: 22,        // m/s (~80 km/h)
  maxSpeed: 55,          // m/s (~198 km/h)
  speedRamp: 0.012,      // +m/s per meter travelled
  // Traffic density: ~45% fewer cars than the original 30m/15m tuning, so
  // lane changes alone can thread ordinary traffic (jump stays optional).
  gapStart: 48,          // spawn gap (m) at start
  gapEnd: 26,            // spawn gap (m) at full difficulty
  fullDifficultyAt: 2500,// meters to reach max difficulty
  doubleRowStart: 0.10,  // chance a row blocks 2 lanes (start; never 3)
  doubleRowEnd: 0.35,    // chance a row blocks 2 lanes (max diff; never 3)
  // Roadworks zones: spawn cadence in meters of player travel, placed only
  // at the road edges (x = +/- worksEdgeX), never in a lane.
  worksGapMin: 90,
  worksGapMax: 150,
  worksEdgeX: 5.0,       // road half-width is 5.7; 5.0 + half-width 1.0 hugs the edge
  worksLen: 5.0,
  worksWid: 2.0,
  trafficSpeedMin: 0.45, // fraction of player speed (same direction, slower)
  trafficSpeedMax: 0.55, // capped so relative approach speed keeps jump timing fair
  laneChangeRate: 10,    // exponential damp factor for smooth lane moves
  // Fair-spawn validator calibration (physics-based): laneChangeRate 10
  // settles a 3.2 m lane switch in ~0.3 s; escapes budget reaction time
  // plus one switch per lane between consecutive encounter clusters.
  fairReactT: 0.25,    // s of recognition time before a between-cluster move
  fairSwitchT: 0.35,   // s budgeted per lane change between clusters
  overtakeScore: 50,
  nearMissScore: 100,
  nearMissDist: 2.1,
  // Phase 3: coins + nitro boost
  boostMult: 1.6,     // speed multiplier while boosting
  boostDrain: 34,     // meter per second while boosting (~3 s of boost)
  boostRegen: 14,     // meter per second after boostRegenDelay
  boostRegenDelay: 1.0, // seconds before nitro starts recharging
  boostMin: 30,       // minimum meter needed to trigger boost
  // Jump energy: separate meter (0..100). One jump consumes the WHOLE bar
  // (jumpCost 100) and only a fully recharged bar allows the next jump.
  // Recharge mirrors nitro exactly: same delay + same rate => same ~8.1 s
  // full-recharge duration — but the two meters are fully independent.
  jumpCost: 100,
  jumpRegen: 14,      // === boostRegen (pinned by tests)
  jumpRegenDelay: 1.0, // === boostRegenDelay (pinned by tests)
  // Power-up upgrade ladders live in UPGRADES below (5 levels each).
  // Jump airtime NEVER changes recharge timing (only gravity weakens).
  coinScore: 10,      // score points per coin
  coinsPerOvertake: 2,
  coinDistReward: 100, // 1 bonus coin per N meters travelled
  // Power-ups: road pickups (shield = survive one collision, coin2x = double
  // coins, magnet = attract coins). Durations come from UPGRADES by level;
  // spawn cadence in meters; magnet pull in m/s + road-speed compensation.
  pickupGapMin: 140,
  pickupGapMax: 240,
  shieldGrace: 1.2,    // i-frames after a shield absorbs a hit
  magnetSpeed: 14,     // base coin attraction speed (m/s, + road speed)
  // Police chase: first side scrape triggers pursuit instead of game over.
  chaseDuration: 8,    // survive this long to lose the cops
  policeFollowZ: 6.5,  // chase position behind the player (playerZ + gap)
  policeFollowRate: 3, // lane-align exponential damp factor
};

// Difficulty 0..1 from distance travelled.
export function difficulty01(distanceM) {
  return Math.min(1, Math.max(0, distanceM / CONF.fullDifficultyAt));
}

// Current forward speed of the player (m/s).
export function playerSpeedFor(distanceM) {
  return Math.min(CONF.maxSpeed, CONF.startSpeed + distanceM * CONF.speedRamp);
}

// Gap in meters between traffic rows at this distance.
export function spawnGapFor(distanceM) {
  const t = difficulty01(distanceM);
  return CONF.gapStart + (CONF.gapEnd - CONF.gapStart) * t;
}

export function doubleRowChanceFor(distanceM) {
  const t = difficulty01(distanceM);
  return CONF.doubleRowStart + (CONF.doubleRowEnd - CONF.doubleRowStart) * t;
}

// Pick blocked lanes for a traffic row: 1 or 2 lanes (NEVER all 3), and the
// free lanes always connect to the previous row's free lanes with at most
// one lane change — so an escape route by steering always exists.
// Pure (unit-testable); TrafficSystem.pickRow delegates to this.
export function pickBlockedLanes(prevFree, blockChance2) {
  const lanes = [0, 1, 2];
  const two = Math.random() < blockChance2;
  if (!two) {
    const candidates = lanes.filter((l) => rowsConnect(prevFree, freeLanes([l])));
    const pick = candidates.length ? candidates[(Math.random() * candidates.length) | 0]
                                   : lanes[(Math.random() * 3) | 0];
    return [pick];
  }
  const options = [[0, 1], [0, 2], [1, 2]];
  const ok = options.filter(([a, b]) => rowsConnect(prevFree, freeLanes([a, b])));
  return ok.length ? ok[(Math.random() * ok.length) | 0] : options[(Math.random() * 3) | 0];
}

// X position of a lane index (clamped 0..2).
export function laneX(index) {
  const i = Math.max(0, Math.min(LANE_COUNT - 1, Math.round(index)));
  return LANES_X[i];
}

// Clamp a lane index after a left/right move.
export function moveLane(index, dir) {
  return Math.max(0, Math.min(LANE_COUNT - 1, index + dir));
}

// A row is fair if it leaves at least one lane free.
export function rowHasFreeLane(blockedLanes) {
  return blockedLanes.length < LANE_COUNT;
}

// Can the driver reach a free lane of `nextFree` from `prevFree`
// with at most one lane change between rows? (prevents diagonal traps)
export function rowsConnect(prevFree, nextFree) {
  for (const a of prevFree) {
    for (const b of nextFree) {
      if (Math.abs(a - b) <= 1) return true;
    }
  }
  return false;
}

// Free lanes given blocked lanes.
export function freeLanes(blockedLanes) {
  const blocked = new Set(blockedLanes);
  const out = [];
  for (let i = 0; i < LANE_COUNT; i++) if (!blocked.has(i)) out.push(i);
  return out;
}

// ---- Fair-spawn validation core (pure; Node-testable) ----
// Projection model: every obstacle becomes an arrival window [t0, t1] at the
// player (seconds), from its REAL z-extent and REAL relative approach speed.
// Transitively overlapping windows form an encounter cluster; a cluster is
// fair iff its lane union leaves >= 1 free lane, and consecutive clusters are
// fair iff the time gap covers the lane changes between their escape lanes
// (reaction + per-switch physics). Footprints stay lane-discrete (a future
// wide vehicle simply registers 2+ lanes), matching the collision test:
// same-lane dx ~= 0 vs threshold, cross-lane dx >= 3.2 vs max reach ~1.48,
// so a car can never overlap a neighbor lane's car, even mid-switch.
//
// An obstacle descriptor is { lanes, z0, z1, relLo, relHi }:
//   lanes = blocked lane indices,
//   z0/z1 = -z/+z footprint edges,
//   relLo/relHi = foreseeable +z approach-speed range in m/s (base cruise
//     .. full boost). A degenerate range (relLo == relHi) is single-speed.
//
// Arrival envelope with an uncertainty margin for in-trip speed drift
// (12% of t0, min 0.3 s each side). Earliest arrival if boost engages now,
// latest if it never does; boost may also engage BETWEEN two encounters, so
// mixed regimes (C1 slow, C2 fast) are reachable and covered. Returns null
// when the obstacle already fully passed the player (or recedes).
export function fairWindow(ob, playerZ) {
  if (!(ob.relHi > 0)) return null;
  // relLo >= 2.64 always (spawn ratio <= 0.55 < 1/1.6, base >= 22), so the
  // clamp below is a dead-code guard, never a live branch.
  const relLo = Math.max(1.0, ob.relLo);
  const t0 = (playerZ - ob.z1) / ob.relHi; // tail edge arrives first...
  const t1 = (playerZ - ob.z0) / relLo;    // ...nose edge last
  if (t1 < 0) return null;
  const m = Math.max(0.3, 0.12 * Math.max(0, t0));
  return { t0: t0 - m, t1: t1 + m };
}

// Group obstacles into encounter clusters (transitively overlapping
// windows), sorted by encounter time. Each cluster: { members, lanes, t0, t1 }.
export function clusterObstacles(obs, playerZ) {
  const ws = [];
  for (const ob of obs) {
    const w = fairWindow(ob, playerZ);
    if (w) ws.push({ ob, t0: w.t0, t1: w.t1 });
  }
  ws.sort((a, b) => a.t0 - b.t0);
  const clusters = [];
  for (const w of ws) {
    const last = clusters[clusters.length - 1];
    if (last && w.t0 <= last.t1) {
      last.members.push(w.ob);
      for (const l of w.ob.lanes) if (!last.lanes.includes(l)) last.lanes.push(l);
      if (w.t1 > last.t1) last.t1 = w.t1;
    } else {
      clusters.push({ members: [w.ob], lanes: w.ob.lanes.slice(), t0: w.t0, t1: w.t1 });
    }
  }
  for (const c of clusters) c.lanes.sort();
  return clusters;
}

// Minimum time gap (s) between consecutive clusters that need `changes`
// lane switches between their escape lanes (reaction + one switch each).
export function fairTimeGap(laneChanges) {
  return CONF.fairReactT + CONF.fairSwitchT * laneChanges;
}

// Fewest lane changes from any lane in freeA to any lane in freeB.
export function minLaneChanges(freeA, freeB) {
  let best = Infinity;
  for (const a of freeA) for (const b of freeB) {
    const d = Math.abs(a - b);
    if (d < best) best = d;
  }
  return best;
}

// Every cluster must leave a free lane; consecutive clusters needing >= 1
// lane change between escapes must be far enough apart in time. Holding a
// lane (0 changes) needs no gap. Returns violations (empty = fair).
export function fieldViolations(clusters) {
  const bad = [];
  for (let i = 0; i < clusters.length; i++) {
    const free = freeLanes(clusters[i].lanes);
    if (!free.length) { bad.push({ type: 'wall', at: i }); continue; }
    if (i === 0) continue;
    const need = minLaneChanges(freeLanes(clusters[i - 1].lanes), free);
    const have = clusters[i].t0 - clusters[i - 1].t1;
    if (need > 0 && have < fairTimeGap(need)) bad.push({ type: 'gap', at: i, need, have });
  }
  return bad;
}

// Lateral (x/z) footprint overlap, ignoring height. Used both by the crash
// test and by the airborne "cleanly clearing this obstacle" tracker.
export function overlapXZ(px, pz, ox, oz, oLen, oWid) {
  const dx = Math.abs(px - ox);
  const dz = Math.abs(pz - oz);
  const maxDx = ((CONF.playerWidth + oWid) / 2) * CONF.hitShrinkX;
  const maxDz = ((CONF.playerLength + oLen) / 2) * CONF.hitShrinkZ;
  return dx < maxDx && dz < maxDz;
}

// AABB-style collision. Returns true when the player hits the object.
// playerY = height of player chassis above ground; clearHeight = min height
// needed to jump clean over it.
export function checkCollision(px, pz, playerY, ox, oz, oLen, oWid, clearHeight) {
  if (playerY >= clearHeight) return false; // jumped over it
  return overlapXZ(px, pz, ox, oz, oLen, oWid);
}

// One step of jump physics. Returns {y, vy, landed}.
// `gravity` defaults to base gravity; upgraded jumps pass a weaker gravity
// (see jumpGravityFor) so the car floats longer with the same takeoff kick.
export function stepJump(y, vy, dt, gravity = CONF.gravity) {
  vy += gravity * dt;
  y += vy * dt;
  if (y <= 0) return { y: 0, vy: 0, landed: true };
  return { y, vy, landed: false };
}

// Theoretical jump apex, useful for tests.
export function jumpApex() {
  return (CONF.jumpVelocity * CONF.jumpVelocity) / (2 * -CONF.gravity);
}

// ---------------- Phase 3: paints, coins, boost (pure) ----------------
export const PAINTS = [
  { id: 'red', name: 'Racing Red', price: 0, color: 0xb81f26, dark: 0x6e1218 },
  { id: 'silver', name: 'Silver', price: 0, color: 0xd4dbe5, dark: 0x9aa4b2 },
  { id: 'black', name: 'Midnight Black', price: 100, color: 0x17191f, dark: 0x0a0b0e },
  { id: 'white', name: 'Pearl White', price: 100, color: 0xf2f4f6, dark: 0xc9ced6 },
  { id: 'blue', name: 'Electric Blue', price: 400, color: 0x1565ff, dark: 0x0b2f8f },
  { id: 'yellow', name: 'Racing Yellow', price: 250, color: 0xf7c500, dark: 0x8a6d00 },
];

// Roadside advertising billboards (logo boards): CENTRAL placement +
// artwork config so future ads swap in one place without redesigning the
// track. Boards sit well outside the rails (inner edge |x| 8.0 > rail 6.6)
// and face the approaching player (+Z, slight road-ward yaw).
// Artwork source: the in-page DOM <img> below (already shipped with the
// game, incl. the standalone bundle) — no extra downloads, no external ad
// scripts, trackers, or SDKs.
export const BILLBOARDS = {
  enabled: true,
  imgId: 'intro-logo',   // DOM image element used as the artwork source
  boardW: 4.4, boardH: 4.4, // square face: the logo maps 1:1, undistorted
  artSize: 3.9,          // logo plane size (floats on a dark backing)
  centerY: 3.8,          // board center height
  roadGap: 10.2,         // |x| of board centers (alternating sides)
  faceYaw: 0.12,         // slight turn toward the road (readability)
  poleDx: 1.5,           // support poles at center ± poleDx (local x)
  // Spots per matching segment: { role, side (-1 left / +1 right), z }.
  spots: [
    { role: 'plain', side: -1, z: -7 },
    { role: 'plain', side: 1, z: 7 },
  ],
};

export function paintById(id) {
  return PAINTS.find((p) => p.id === id) || PAINTS[0];
}

// Garage cars: id, showroom name, coin price, body builder key. 'roadster'
// is the default hero car (bespoke builder); the rest reuse the premium
// traffic body builders + player kit (flames, anchors, brake light).
// All player cars share one hitbox (playerLength/playerWidth) so handling
// and collisions stay consistent no matter the body style.
export const CARS = [
  { id: 'roadster', name: 'Roadster S', price: 0, body: 'roadster' },
  { id: 'coupe', name: 'Velocity Coupe', price: 600, body: 'coupe' },
  { id: 'volt', name: 'Volt Sedan', price: 900, body: 'esedan' },
  { id: 'supercar', name: 'Apex Supercar', price: 1200, body: 'supercar' },
];
export function carById(id) {
  return CARS.find((c) => c.id === id) || CARS[0];
}

// ---------------- Power-up upgrade ladders (pure) ----------------
// 5 levels each (1-based; fresh saves start at 1). durations[i] = active
// seconds at level i+1; prices[i] = coins to go from level i+1 to i+2.
// Jump durations are TOTAL airtime seconds; the base (1.15s) and max
// (1.60s) match the original jump physics so jump-clear feasibility and
// game feel are preserved (see canClearJump). Longer airtime NEVER
// changes recharge timing.
export const UPGRADE_IDS = ['shield', 'magnet', 'coin2x', 'jump'];
export const UPGRADES = {
  shield: { name: 'Shield', icon: '🛡', durations: [4, 5, 6, 7, 8], prices: [100, 225, 375, 550] },
  magnet: {
    name: 'Magnet', icon: '🧲', durations: [5, 6, 7, 8, 10], prices: [100, 225, 375, 550],
    radius: [8, 9, 11, 13, 15], // attraction radius (m) per level
  },
  coin2x: { name: '2X Coins', icon: '🪙', durations: [6, 7, 8, 10, 12], prices: [150, 300, 450, 600] },
  jump: { name: 'Jump', icon: '▲', durations: [1.15, 1.25, 1.35, 1.45, 1.60], prices: [150, 300, 450, 600] },
};

export function upgradeDef(id) {
  return UPGRADES[id] || null;
}

export function upgradeLevelMax() {
  return 5;
}

// Clamp any value to a valid 1-based upgrade level (validated at run start).
export function clampUpgradeLevel(level) {
  const n = Math.round(Number(level));
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(upgradeLevelMax(), n));
}

// Active seconds (airtime seconds for jump) at this level.
export function upgradeDuration(id, level) {
  const def = upgradeDef(id);
  if (!def) return 0;
  return def.durations[clampUpgradeLevel(level) - 1];
}

// Coins to go from `level` to `level+1`, or null when maxed/invalid.
export function upgradePrice(id, level) {
  const def = upgradeDef(id);
  if (!def) return null;
  const lv = clampUpgradeLevel(level);
  return lv >= upgradeLevelMax() ? null : def.prices[lv - 1];
}

// Magnet attraction radius (m) at this level.
export function magnetRadiusFor(level) {
  return UPGRADES.magnet.radius[clampUpgradeLevel(level) - 1];
}

// Collision classification: 'rear' = ran into the back of an obstacle
// (front-to-back overlap), 'side' = clipped its edge (usually mid lane
// change), null = no overlap at all. Uses the same shrunk bounds as
// overlapXZ; the axis of LEAST penetration is the impact normal, so a
// normal lane change or harmless visual overlap never classifies.
export function classifyCollision(px, pz, ox, oz, oLen, oWid) {
  const dx = Math.abs(px - ox);
  const dz = Math.abs(pz - oz);
  const maxDx = ((CONF.playerWidth + oWid) / 2) * CONF.hitShrinkX;
  const maxDz = ((CONF.playerLength + oLen) / 2) * CONF.hitShrinkZ;
  if (dx >= maxDx || dz >= maxDz) return null;
  // Relative penetration per axis: dead-center overlap reads as rear (a
  // head-on/rear-ender), while true side scrapes hug the x boundary.
  return ((maxDx - dx) / maxDx) < ((maxDz - dz) / maxDz) ? 'side' : 'rear';
}

// Side-contact resolution math (pure): separate the player from the NPC
// along x (the side-impact normal) and report the push direction, which is
// also the lane-return direction (back toward the lane the player came
// from). Idempotent: re-applying at the boundary changes nothing, so
// grinding against the same car can never stack, jitter, or stick.
export function sidePushOut(px, ox, oWid) {
  const maxDx = ((CONF.playerWidth + oWid) / 2) * CONF.hitShrinkX;
  const dir = px >= ox ? 1 : -1; // away from the NPC (dx > 0 whenever side-classified)
  return { x: ox + dir * maxDx, dir, maxDx };
}

// Coin award with the 2x power-up applied exactly once at award time.
// Call sites pass the BASE amount; doubling never stacks or repeats.
export function coinAward(base, doubleActive) {
  return doubleActive ? base * 2 : base;
}

// Traffic palette: varied brights/darks, but NEVER player red — the hero car
// must stay visually distinctive.
export const TRAFFIC_COLORS = [0x2b6fd6, 0xe8a020, 0x27b56b, 0x8e44ad, 0xd8dde6, 0x222831, 0x0ea5a5, 0x707880];

// Graphics quality levels (Medium is the default: balanced for Android).
// pixelRatioCap: renderer pixel ratio ceiling; shadows: shadow maps on/off;
// shadowSize: sun shadow map edge (px); vaporBudget: max live VFX particles;
// vaporScale: emission-rate multiplier; dust: landing-dust sprites on/off;
// lodFar: traffic full-detail range in meters (simple models beyond it);
// physicalPaint: clearcoat car paint (High only — costs mobile fragment ALU).
export const QUALITY_LEVELS = {
  low:    { pixelRatioCap: 1,   shadows: false, shadowSize: 512,  vaporBudget: 20, vaporScale: 0.5,  dust: false, lodFar: 40, physicalPaint: false },
  medium: { pixelRatioCap: 1.5, shadows: true,  shadowSize: 512,  vaporBudget: 40, vaporScale: 1.0,  dust: true,  lodFar: 55, physicalPaint: false },
  high:   { pixelRatioCap: 2,   shadows: true,  shadowSize: 1024, vaporBudget: 64, vaporScale: 1.25, dust: true,  lodFar: 70, physicalPaint: true },
};
export const DEFAULT_QUALITY = 'medium';
export const QUALITY_ORDER = ['low', 'medium', 'high'];

// Auto-quality stepper (pure): fixed-length frame-time windows drive tier
// changes with hysteresis — step DOWN after one poor window, step UP only
// after AUTOQ_UP_WINDOWS consecutive good windows, never above the manual
// ceiling. Returns { quality, good } (good = consecutive good-window count).
export const AUTOQ_WINDOW = 2.0;  // seconds per evaluation window
export const AUTOQ_DOWN_FPS = 27; // below this: step down at once
export const AUTOQ_UP_FPS = 57;   // above this 3x in a row: step up
export const AUTOQ_UP_WINDOWS = 3;
export function autoQualityStep(current, ceil, avgFps, good) {
  const ci = QUALITY_ORDER.indexOf(current);
  const top = QUALITY_ORDER.indexOf(ceil);
  if (ci < 0) return { quality: top >= 0 ? ceil : DEFAULT_QUALITY, good: 0 };
  if (avgFps < AUTOQ_DOWN_FPS) {
    return { quality: QUALITY_ORDER[Math.max(0, ci - 1)], good: 0 };
  }
  if (avgFps > AUTOQ_UP_FPS && ci < top) {
    const g = good + 1;
    if (g >= AUTOQ_UP_WINDOWS) return { quality: QUALITY_ORDER[ci + 1], good: 0 };
    return { quality: current, good: g };
  }
  return { quality: current, good: 0 }; // mid band: hold, streak reset
}

// 3D pickup test: player chassis center is ~0.6 m above ground (py).
export function coinHit(px, py, pz, cx, cy, cz) {
  return Math.abs(px - cx) < 1.7 && Math.abs(pz - cz) < 2.3 && Math.abs((py + 0.6) - cy) < 1.65;
}

export function boostCanStart(meter) {
  return meter >= CONF.boostMin;
}

export function jumpCanStart(meter) {
  return meter >= CONF.jumpCost;
}

// ---------------- Jump skill upgrades (pure, 1-based, 5 levels) ----------------
export function clampJumpLevel(level) {
  return clampUpgradeLevel(level);
}

export function jumpLevelMax() {
  return upgradeLevelMax();
}

// Coins to go from `level` to `level+1`, or null when maxed out.
export function jumpUpgradeCost(level) {
  return upgradePrice('jump', level);
}

// Total airborne seconds for one jump at this upgrade level.
export function jumpAirtimeFor(level) {
  return upgradeDuration('jump', level);
}

// Effective gravity giving that airtime with the same takeoff velocity.
export function jumpGravityFor(level) {
  return -((2 * CONF.jumpVelocity) / jumpAirtimeFor(level));
}

// Full 0 -> 100 recharge seconds for a delay-then-linear meter (nitro/jump).
export function fullRechargeTime(regenPerSec, delaySec) {
  return delaySec + 100 / regenPerSec;
}

// ---------------- Jump-clearance analysis (pure) ----------------
// Seconds per jump spent with y strictly above `clearHeight`.
// Parabola y = v0*t - (g/2)*t^2  =>  window = 2*sqrt(v0^2-2*g*clear)/g.
export function timeAboveClearance(clearHeight) {
  const v0 = CONF.jumpVelocity;
  const g = -CONF.gravity;
  const disc = v0 * v0 - 2 * g * clearHeight;
  if (disc <= 0) return 0;
  return (2 * Math.sqrt(disc)) / g;
}

// Full z length (m) of the collision window an obstacle must cross.
export function zWindowLength(oLen) {
  return 2 * ((CONF.playerLength + oLen) / 2) * CONF.hitShrinkZ;
}

// Can a perfectly timed jump clear this obstacle from front to back at the
// given relative approach speed? (Crossing must fit inside the above-clear
// window.) Used to prove tuning fairness in tests.
export function canClearJump(oLen, oClear, relSpeed) {
  return timeAboveClearance(oClear) > zWindowLength(oLen) / relSpeed;
}
