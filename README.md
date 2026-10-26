# CARWAY TRAFFIC — 3D Endless Traffic Runner (all updates ✅ incl. 3D lobby + upgrades + magnet + settings)

A playable, mobile-first 3D lane runner. You drive a glossy red Roadster-style
electric sports car down an endless daylight highway, overtaking traffic
across 3 lanes. The main menu is a 3D roadside garage: your selected car sits
on a turntable in front of the CARWAY GARAGE workshop while live traffic
flows past on the highway beside it.

## Phone-only quick start (no PC needed)

- **`standalone.html`** (in this folder) is the ENTIRE game in one 961 KB file:
  no server, no internet needed. Open it in any browser / web preview and play.
  Verified: boots into the 3D lobby and plays with zero errors; the full
  lobby/upgrades/magnet/settings suite passes on it (83/83), zero external
  requests. Rebuild it after any change with `npm run build:standalone`
  (needs `npm install` once for esbuild).
- **`carway-traffic.zip`** (workspace root) is the whole project for download.
  On Android: download → unzip with the Files app → open **`standalone.html`**
  (NOT `index.html` — browsers block its modules from `file://`).
  Note: save data (coins/paints) persists only when served over http(s) or in
  Chrome; local-file viewers may keep it for the session only.

## Play it

### Option A — Live preview (this workspace)
The game server is running on port **8080**. Open the **live preview**
(`Carway Traffic game`) in your browser. On a phone: open the same preview URL.

### Option B — Any static server
No build step. Serve the folder and open `index.html`:

```bash
cd carway-traffic
python3 -m http.server 8080
# → http://localhost:8080  (use your PC's LAN IP on your phone, same Wi-Fi)
```

### Option C — On Android (Phase 4 preview)
1. **Quickest:** put the folder on your phone and open `index.html` in Chrome
   (via any static-server app, e.g. "Simple HTTP Server"), or host it free on
   GitHub Pages / Netlify / itch.io and open the URL in Chrome → *Add to Home
   screen* for a fullscreen game icon.
2. **APK:** wrap with Capacitor (exact steps in “Android APK build” below).
   The game is already touch + portrait + offline-ready (Three.js is
   vendored in `libs/`).

## Controls

| Action      | Android (touch)        | Desktop          |
|-------------|------------------------|------------------|
| Steer       | Swipe ◀ / ▶ or buttons | ← / → (or A/D)   |
| Jump        | Swipe ▲ or ▲ button    | ↑ / W / Space    |
| Pause       | ⏸ button               | P / Esc          |
| Mute        | 🔊 button              | —                |

Jump clears striped roadwork barriers easily; with a well-timed full jump you
can also clear traffic cars. Near-misses give bonus points.

## Project structure (maintainable systems)

```
carway-traffic/
├── index.html            # portrait 9:16 shell, HUD, overlays, import map
├── css/style.css         # mobile-first UI styling
├── libs/three.module.js  # vendored Three.js r160 (MIT, works offline)
├── js/config.js          # tuning + pure logic (lanes, jump, collision, difficulty)
├── js/main.js            # boot + UI wiring
├── js/systems/
│   ├── game.js           # scene, camera, lights, loop, states, scoring
│   ├── lobby.js          # 3D roadside-garage diorama + menu/garage cameras
│   ├── player.js         # player cars (4 bodies) + shield/magnet shells + motion
│   ├── road.js           # pooled endless highway segments (recycled)
│   ├── traffic.js        # 8-body pooled traffic + LOD + fair-gap spawner
│   ├── pickups.js        # shield / magnet / 2x pickup orbs (thirds spawn)
│   ├── police.js         # police interceptor + chase/leave behavior
│   ├── vapor.js          # pooled jump/nitro vapor particles (budgeted)
│   ├── coins.js          # pooled pickups
│   ├── missions.js       # mission defs + progress
│   ├── save.js           # localStorage persistence (coins/cars/paints/
│   │                     #   missions/upgrades + legacy migrations)
│   ├── input.js          # swipe / buttons / keyboard
│   └── sound.js          # synthesized WebAudio SFX (no assets to license)
├── tools/standalone.mjs  # bundles standalone.html (esbuild, zero ext refs)
└── test/
    ├── logic.test.mjs    # 239 Node unit tests (no WebGL needed)
    ├── browser.test.mjs  # 110 headless-Chromium gameplay tests + screenshots
    ├── browser-features.test.mjs  # 79 power-up/chase/soak/collision tests
    └── browser-lobby.test.mjs     # 90 lobby/billboard/magnet/settings tests
```

## Test report (actually executed ✅)

- `node test/logic.test.mjs` → **239/239 pass**: all previous checks (lanes,
  jump physics incl. the 5-level airtime ladder with a simulated 1.60 s
  max-level landing, collisions incl. dead-center = rear-ender, 10000-row
  spawner fuzz, difficulty, swipe, coins, boost, jump meter, feasibility
  math, paints, quality tables, traffic palette, measured 3D envelopes,
  variety, LOD) plus the 4×5 upgrade tables (durations, prices, magnet
  radius ladder, clamping), upgrade purchase/reject/max rules, legacy
  jumpLevel → ladder migration, corrupt-save self-heal, and
  progress-reset semantics; fair-spawn validator core units (arrival
  windows, clustering, gap math), a 6000 m simulated run with boost
  phases (zero violations, density + delay bounds), and the
  saturation-delay + pool-exhaustion paths; side-contact push-out math
  (boundary, mirroring, idempotence), no-tunnel step/window proofs, and
  the dead-center = rear rule; side-thump routing + mute behavior with a
  counting fake AudioContext; tow-truck pool share, spawn selection,
  validator footprints, despawn + reset — **zero failures**.
- `node test/browser.test.mjs` (headless Chromium, WebGL2, 390×844 touch
  viewport) → **110/110 pass**: all previous checks preserved (boot, driving,
  coins, boost, garage, missions, persistence, collisions, jump-clear,
  roadworks, meter), with the shop assertions moved to the upgrades screen
  (jump card, LV 1/5 → MAXED, persistence, live 1.60 s airtime), GPU
  budgets, auto-Q step-down, visibility pause, context loss/restore,
  landscape letterbox, boot MSAA — **zero page/console errors**.
- `node test/browser-features.test.mjs` → **79/79 pass**: rear-ender =
  instant `CRASH!`; side scrape → police chase + siren + banner → survive
  8 s → police leaves → second hit `CAUGHT BY THE POLICE!`; shield absorbs
  once then breaks; 2x pays +2/+4 exactly once then expires; garage car
  buy/select/persist/poor-reject; steering-only AI soak to full
  difficulty (2500 m, zero violations, never scraped, never shielded);
  side-collision physics (real-steer swipe, grind blocking, NPC wobble,
  high-speed contact, near-miss sterility) plus the side-impact thump
  (once per scrape, silent on near miss/grind, rear keeps crash()) plus
  tow-truck side/rear/cleanup behavior — **zero page/console errors**.
- `node test/browser-lobby.test.mjs` → **90/90 pass**: lobby boots with
  live background traffic on a fully frozen stage (road, barriers, garage,
  camera and display car bit-identical across samples) + no roadworks and
  no road furniture inside the garage pad;
  PLAY/GARAGE/UPGRADES/SETTINGS all navigate (no dead buttons); showroom
  turntable + drag inspection + purchase-gated selection; upgrade cards,
  price deduction, poor/maxed states, persistence; magnet collection,
  curved attraction, exact-once awards, refresh, expiry, out-of-radius
  behavior; 3-badge coexistence + HUD layout vs meters/touch targets;
  level-driven 8 s/10 s/12 s durations; settings sliders/mute/quality/
  two-tap reset; landscape boot — **zero page/console errors**.
- Same lobby suite re-run against `standalone.html`
  (`CARWAY_URL=.../standalone.html`) → **83/83 pass**; plus standalone
  boot → lobby → PLAY smoke (zero errors). Total: **518 assertions green.**
- Screenshots: `test/shot-intro.png`, `test/shot-lobby.png`, `test/shot-billboards.png`, `test/shot-garage.png`,
  `test/shot-upgrades.png`, `test/shot-settings.png`,
  `test/shot-hud-badges.png`, `test/shot-menu.png`, `test/shot-gameplay.png`,
  `test/shot-pause.png`, `test/shot-gameover.png`, plus jump/vapor/nitro/
  traffic/roadworks/tunnel/standalone shots.
- No Android-device testing was performed (no device in this environment);
  no on-device FPS is claimed. Phone test steps: install the ZIP's
  `standalone.html` via the Files app (or serve the folder over LAN),
  play one run on each quality tier, and confirm smooth steering, visible
  jump vapor + nitro trail, and no stuck particles.

## Performance notes (Android)

- Reasonable poly counts (extruded car shells, torus tires), 2-level LOD
  for traffic (full detail near, 4–5 mesh simple far), shared geometries +
  materials across the fleet, pooled cars/coins/particles, zero per-frame
  allocation in hot loops, 64px shared particle sprite (no big textures),
  no post-processing, no dynamic lights for VFX, fog-bounded draw distance.
- Low / Medium (default) / High tiers scale pixel ratio (1 / 1.5 / 2),
  shadows (off / 512 / 1024), traffic LOD range (40 / 55 / 70 m), vapor
  budget (20 / 40 / 64) and clearcoat paint (High only), plus one-time auto
  step-down if the device can't keep up.
- Under CPU-only software WebGL (SwiftShader, 780×1688, High) the HUD reads
  ~20 game-fps; wall-clock frame rate on real phone GPUs was not measured
  here and is not claimed — verify on device with the steps above.

## Phase 2 changelog (implemented ✅)

- **Player car:** detailed Roadster-style build — sculpted hull, raked
  windshield/roof/rear glass, mirrors, intakes, diffuser fins, active spoiler,
  5-spoke wheels with brake discs + calipers, DRL strips, full-width brake bar.
- **Traffic:** proper sedan / SUV / box-truck models (glasshouses, mirrors,
  grilles, headlights/taillights, roof rails, 6-wheel trucks), flashing
  barrier beacons.
- **Highway:** procedural asphalt texture, W-beam guardrails with posts,
  overhead sign gantries (readable green freeway signs), bridge overpasses,
  and a lit 60 m tunnel section — all recycled with the road segments.
- **Lighting/environment:** golden-daylight look — gradient sky dome, warm sun
  with shadows, hemisphere ambient, fill light, grass/hills/clouds/city, and a
  bright procedural day environment map so metallic paint can never go black.
- **Camera/animation:** damped chase with speed pullback + FOV kick, speed
  vibration, suspension bounce, steering front wheels, landing squash spring,
  landing dust puffs. No real-time motion blur (perf).
- **Sound:** EV motor whine, speed-following road ambience, lane whoosh,
  landing thud, richer crash, generative 126 BPM synth loop, independent
  Music/Sound sliders (persisted) + master mute.
- **Performance:** High/Low quality toggle (pixel ratio + shadows + dust),
  one-time auto step-down if FPS is low, cheap lights only, pooled effects.
- **Tests:** logic 33/33, browser 28/28 (all Phase 1 checks preserved, plus
  quality/audio/dust checks), zero console errors. Screenshots: `test/shot-*.png`
  (menu, gameplay, pause, game-over, open-road, tunnel).

## Phase 3 changelog (implemented ✅)

- **Coins:** pooled spinning gold coins with glow (ground lines + jump arcs),
  3D pickup, instant HUD counter, collect sound + sparkle burst, +10 score each.
- **Rewards:** +2 coins per overtake, +1 per 100 m; run earnings banked to the
  persistent balance on game over (or when quitting to menu).
- **Nitro boost:** touch NITRO button (or Shift/F) — 1.6× speed, meter + regen
  + 30-point trigger gate, exhaust flames, screen glow, extra FOV/shake, whoosh
  sound. Collision detection unchanged and verified under boost.
- **Garage:** menu-accessible showroom with live 3D turntable preview; 5 paints
  (Silver free, Black 100, White 100, Red 250, Electric Blue 400); buy/select
  with live repaint; poor purchases rejected without deduction.
- **Missions:** Treasure Hunter (bank 100), Overtaker (30/run), Marathon
  (2,000 m/run) — auto-claim + toast + reward; featured card on main menu.
- **UI:** 4-stat HUD + nitro bar, pause menu gains Main-menu button, game-over
  shows coins earned + completed missions; all portrait 9:16 touch-friendly.
- **Save:** localStorage (in-memory fallback): balance, paints, selection,
  lifetime banked, missions. Verified across page reload.
- **Tests:** logic 56/56, browser 46/46 (all Phase 1+2 checks preserved),
  zero console errors. Shots: `test/shot-*.png` incl. boost + garage.

## Jump-clear + vapor update (implemented ✅)

- **Stronger jump:** v0 11.5 m/s, gravity −20 → apex ~3.3 m, ~1.15 s airtime;
  takeoff body stretch, exhaust anchors under the rear bumper.
- **Per-type clearances:** collision now uses each obstacle's real height —
  sedan 1.55 m, SUV 2.05 m, truck 2.95 m, barrier 0.95 m — so ordinary cars
  clear cleanly with visible daylight, trucks demand near-perfect timing,
  and mistimed jumps still collide and end the run (no riding/stuck states).
- **Aerial bonus:** fully clearing a car mid-air without touching it pays
  +25 with an "AERIAL +25" toast; `jumpedOver` tracking survives overtake.
- **Nitro/jump vapor:** pooled 48-sprite additive vapor system (zero
  per-frame allocation) — nitro purging streams mist from the exhausts,
  jump takeoff fires a 4–7 puff burst that fades fully in ~1 s.
- **Tests:** logic 67/67, browser 57/57 on both `index.html` and the rebuilt
  `standalone.html`, zero console errors. Shot: `test/shot-jumpclear.png`.

## Roadworks + jump-meter update (implemented ✅)

- **No lane obstacles:** jumpable barriers no longer spawn in lanes — traffic
  cars are the only obstacles in the driving paths.
- **Edge roadworks:** pooled excavation clusters (dug-up asphalt trench with
  orange rim, yellow painted markings, striped warning board with flashing
  beacon, cone taper) spawn sparsely (every 90–150 m) at the far left/right
  road edges only, fully outside every lane's footprint — scenery that never
  forces a jump.
- **Lighter traffic:** row gaps widened 30→48 m (start) and 15→26 m (max),
  double-row chance cut 22→10% (start) and 62→35% (max) — ~45% fewer cars;
  rows still never block all 3 lanes and stay connected, so steering alone
  threads everything (proven by a 500 m no-jump/no-nitro bot drive in tests).
- **Jump energy bar:** separate gold HUD meter under nitro — one jump costs
  50, recharges 30/s while playing, jumps need 50+; bar shows charged (glow),
  low (red), and smooth fill; the ▲ button dims while airborne or depleted.
- **Balance:** lane changes are the primary dodge, jump is optional, nitro is
  untouched with its own meter; jump/nitro/collision/steering verified
  independent by the full suite.
- **Tests:** logic 79/79, browser 74/74 on both `index.html` and the rebuilt
  `standalone.html`, zero console errors. Shot: `test/shot-roadworks.png`.

## Jump-skill update (implemented ✅)

- **Full-bar jumps:** one jump empties the entire 100% bar; the next jump
  needs a fully recharged bar. Airborne, crashed, and recharging jumps are
  denied (recharging shows "JUMP CHARGING…").
- **Nitro-matched recharge:** jump recharges on exact nitro timing — 1.0 s
  delay then 14/s, i.e. the same ~8.1 s full duration — measured equal in
  game-time tests, while the two meters stay fully independent.
- **Jump skill shop (garage):** 3 coin-bought levels (150/300/600) add +0.15 s
  airtime each (1.15 → 1.60 s) via weaker jump gravity with the same takeoff
  kick; section shows level, current/next duration, and price; the buy button
  disables when poor or maxed; purchases persist in the existing save.
- **Duration ≠ recharge:** upgrades only extend airtime — recharge timing is
  untouched; longer jumps use the same collision/clear-height logic, so no
  stuck-on-traffic states; bar keeps nitro-consistent styling (full glow,
  red low state, smooth fill, depleted ▲ button).
- **Tests:** logic 96/96, browser 85/85 on both `index.html` and the rebuilt
  `standalone.html`, zero console errors. Shot: `test/shot-jump-shop.png`.

## Visuals / VFX / perf update (implemented ✅)

- **Player car:** rebuilt as a red Roadster-style sports car — smooth extruded
  body shell + glass canopy (no blocky boxes), torus tires with 5-spoke rims,
  brake discs + red calipers, DRL headlights, full-width brake bar, active
  spoiler, diffuser fins, mirrors, side skirts; glossy red paint (clearcoat
  physical material on High). Footprint stays ~4.4×2.0 m; orientation, camera,
  controls, lanes, jump and hitbox untouched. No external models (keeps the
  offline single-file build + garage repaint working).
- **Traffic:** 9 body styles from one spec-driven builder — luxury sedan,
  sports coupe, supercar (wing, intake, quad exhausts), hatchback, electric
  sedan (glass roof, no grille), SUV (rails, cladding), pickup (open bed),
  box truck, tow truck (open flatbed) — headlights, taillights, mirrors,
  wheels throughout;
  8-color palette that never uses player red; spawn recolor + no-consecutive-
  repeat bodies/colors; same pool size, gaps, speeds, lanes and collisions.
- **Jump vapor:** white underbody vapor with icy-blue highlights — launch
  burst at takeoff, continuous airborne sheet tapering with climb rate,
  brief landing puff; emitters parented to the car (follows lane changes
  and nitro); pooled sprites with a per-tier live budget so jump + nitro
  together can't overload weak phones; decorative only (no physics touched).
- **Nitro:** kept distinct — bluer thin directional trail from the rear
  outlets plus flames/glow/FOV, same meter/drain/recharge/boost tuning.
- **Perf:** traffic LOD (40/55/70 m by tier), shared geos/mats, wheel-spin
  skipped for far cars, Low/Medium-default/High settings (pixel ratio,
  shadows, dust, vapor budget/rate, paint), auto step-down preserved.
- **Tests:** logic 125/125, browser 97/97 on both `index.html` and the rebuilt
  `standalone.html`, zero console errors. Shots: `test/shot-vapor.png`,
  `test/shot-nitro.png`, `test/shot-traffic-new.png`.

## Power-ups + garage cars + police update (implemented ✅)

- **Garage cars:** 4 collectible bodies (Roadster S stock, Velocity Coupe
  600, Volt Sedan 900, Apex Supercar 1200) — buy/select with coins,
  purchase-gated selection, persisted; each with its own 3D body + hitbox.
- **Shield:** cyan orb pickup → one-charge shell around the car, absorbs ANY
  first contact (no game over, no police), then breaks with grace time;
  HUD countdown badge; expires cleanly when unused.
- **2x coins:** gold orb pickup → every award doubled while active (coins,
  overtakes, trickle), exactly once per award; HUD countdown badge.
- **Police chase:** first side scrape calls the cops instead of ending the
  run — interceptor with strobing beacons + siren chases for 8 s; survive
  and they leave, but any later contact ends the run (`CAUGHT BY THE
  POLICE!`); rear-enders still end the run instantly (`CRASH!`).
- **Collision classes:** rear (instant over) vs side (chase once) via
  relative-penetration classification; dead-center overlap counts as rear.
- **Tests:** logic +37, browser-features 37/37, browser 97/97 preserved.

## Lobby + upgrades + magnet + settings update (implemented ✅)

- **3D lobby:** roadside-garage diorama beside the live highway — concrete
  pad + glowing turntable, open workshop (bench, tools, tires, crates,
  ceiling glow, pulsing roof beacon), CARWAY GARAGE fascia sign, racing
  banners, guardrail, lamp, road sign, cones; your real selected car
  parked in 3/4 front view with brake glow; the REAL road + pooled traffic
  move behind it (no second scene/loop); the stage itself — road,
  barriers, garage, camera, display car, lights — is completely frozen and
  only traffic cars advance under their own velocity; zero
  quality/resolution/effects cuts.
- **Menu:** compact bottom sheet — PLAY (prominent) + GARAGE / UPGRADES /
  SETTINGS with icons; best score, coin balance, mission card; no dead
  buttons; Back always returns to the lobby.
- **Garage showroom:** smooth camera glide from the lobby, auto-turntable +
  drag-to-inspect rotation, compact scrollable sheet (cars, paints);
  collection, purchases, selection and paints fully preserved.
- **Magnet:** red-white horseshoe orb pickup (spawn is now shield/2x/magnet
  thirds) → coins within the level radius (8→15 m) arc to the car with a
  gentle swirl and collect exactly once; pink field ring + orbiting sparks
  on the car; HUD countdown badge; one timer per power-up, re-pickup
  refreshes, all three may coexist; out-of-radius coins behave normally.
- **Upgrades screen:** 4 cards × 5 levels — Shield 4/5/6/7/8 s, Magnet
  5/6/7/8/10 s (+ radius ladder), 2x 6/7/8/10/12 s, Jump 1.15–1.60 s
  airtime (base 1.15 s preserved: jump-clear feasibility untouched);
  each card shows icon, level, current → next duration, price and an
  UPGRADE button with poor/maxed states; deduct-only-on-valid-purchase;
  levels drive real gameplay durations, validated at every run start;
  legacy 0..3 jump skill migrates up (nobody loses paid airtime).
- **HUD badges:** shield/magnet/2x pills with live countdowns sit below the
  nitro/jump meters — never over stats, road, car or touch targets.
- **Settings:** music/sound sliders (live, synced with pause screen),
  mute toggle (synced with HUD icon), quality cycle (persisted),
  two-tap confirmed progress reset (wipes coins/cars/paints/missions/
  upgrades/best, keeps quality + volumes).
- **Tests:** logic 192/192, browser 97/97, features 37/37, lobby 60/60
  (also 60/60 on `standalone.html`), zero console errors everywhere
  (current totals after the chase/billboard update below: 196/196,
  97/97, 43/43, 83/83 + 83/83 standalone, 15/15 acceptance —
  419 assertions green).

## Brand intro + lobby redesign + traffic-direction fix (implemented ✅)

- **Brand intro:** the provided YF monogram (`assets/yf-logo.png`, used
  as-is) reveals over ~2.4 s (mask wipe + fade + settle zoom, premium
  easing) with a subtle mechanical ignition sting (servo rise, two metal
  clunks, low settle) that honors mute/SFX volume and platform autoplay
  rules; tap-to-skip after 0.6 s; once per fresh launch; `?nointro=1`
  skips instantly (automated tests).
- **Lobby traffic direction fix:** background cars used to creep toward
  the camera tail-first; they now drive nose-first (-z, away from the
  camera) under their own power via a dedicated `updateAmbient` (gameplay
  `update` untouched), spawning invisibly behind the camera and recycling
  in the northern fog, with lane hold + upright pose + forward wheel roll;
  pre-warmed rows make frame 1 alive; the lobby stays otherwise frozen.
- **Lobby redesign:** best-score chip top-center, settings gear top-right,
  left hamburger → slide-in drawer (GARAGE / UPGRADES / MISSIONS, all live,
  closes via toggle/backdrop/navigation), PLAY bottom-center prominent;
  the 3D roadside-garage scene stays fully visible; missions moved to
  their own screen (all 3 with live progress, rewards, done states).
- **Garage:** circular Back top-left (pure navigation, never resets
  progress), PAINT/CARS tabs with paint visible first; new 6th color
  Racing Yellow (250); locked paints/cars show real prices; selection
  repaints the live 3D car in lobby + gameplay via existing persistence.
- **Tests:** logic 193/193, browser 97/97, features 37/37, lobby 75/75
  (also 75/75 on `standalone.html`, superseded by the chase/billboard
  update below: 196/196, 97/97, 43/43, 83/83 + 83/83), 12-point acceptance probe
  (`test/verify-12.mjs`) 15/15, zero console errors everywhere.

## Police-chase repeat + gantry sightline + logo billboards (implemented ✅)

- **Police-chase state machine (bug fix):** root cause — `penalty.used`
  was set on the first chase and never cleared at escape, so the next
  side scrape fell through to game over. Now NORMAL ↔ POLICE_CHASE_ACTIVE
  → GAME_OVER: escaping resets the flag, the next side scrape starts a
  NEW chase with a fresh 8 s timer (repeatable all run); a side scrape
  mid-chase ends the run as CAUGHT (coins still bank); rear-enders stay
  instant CRASH; trigger is double-guarded so the timer runs once and the
  per-spawn hit-mark + per-frame single-event rules stop multi-fires.
- **Gantry sightline fix:** sign boards rode at y 5.3 (camera height) and
  swept through the frame center; they now hang at y 6.9 (bottom 6.1,
  above the 5.6 camera) with columns moved off-road to ±8.3 — boards
  cross the top of the frame, road/car/obstacles stay visible.
- **Logo billboards:** reusable roadside ad-board system on plain
  segments (4 boards, alternating sides, staggered pairs ~120 m apart):
  dark backing + square YF art (supplied PNG, 1:1, undistorted) + frame
  rails + twin poles, facing the player; poles/boards well outside the
  rails; one shared texture/geometries/materials; artwork binds from the
  in-page image (zero new downloads, works in standalone); central
  `BILLBOARDS` config for image/placement/activation — future ads swap
  without touching the track. No external scripts/trackers/SDKs.
- **Tests:** logic 196/196, browser 97/97, features 43/43, lobby 83/83
  (also 83/83 on `standalone.html`), 12-point acceptance probe
  (`test/verify-12.mjs`) 15/15, zero console errors everywhere.

## Fair-spawn update (implemented ✅)

- **Fair traffic spawning (validator):** root cause of unavoidable
  3-lane walls — every row spawns at the same z (~-120 m) on a
  travel-gap cadence while per-car speeds vary ±10 %, so a later slow
  row compresses up to ~24 m into an earlier fast row (spawn
  separation is only ~13 m at max difficulty) and two separately-fair
  2-lane rows merge into a wall. Now every planned row is projected
  to encounter against ALL live traffic before it spawns: each car
  becomes an arrival-time envelope (real z-extent × foreseeable
  approach-speed range, base cruise .. full boost, so mid-trip boost
  engage/disengage can't break fairness); overlapping envelopes form
  encounter clusters; each cluster's lane union must leave ≥1 free
  lane and consecutive clusters must be far enough apart in time for
  the lane changes between their escapes (0.25 s reaction + 0.35 s
  per switch, calibrated from the real lane-change physics).
  Violating rows are regenerated into fair lanes (same-size first,
  connectivity-preserving, bounded ≤7 candidates), else delayed one
  gap cycle; roadworks are excluded by proof (off-path, can't eat
  switch time). Spawn-time only — zero per-frame cost, Android-safe.
- **Untouched:** all gameplay, visuals, controls, UI, garage,
  upgrades, missions, coins, nitro, power-ups, scoring, saves, and
  the difficulty progression (gap 48→26 m, double chance 0.10→0.35).
- **Tests:** logic 214/214 (validator units + 6000 m sim, run 10×),
  browser 97/97, features 49/49 (incl. steering-only 2500 m soak),
  lobby 83/83 (also 83/83 on the rebuilt `standalone.html`),
  acceptance probe 16/16, zero console errors everywhere.

## Side-collision physics fix (implemented ✅)

- **Player pass-through fix:** root cause — a side scrape fired the
  police-chase event but applied zero physical response, so the
  lane-change damp kept pulling the player through the NPC while the
  per-spawn hit-mark silenced further events. Now every side overlap
  is resolved on every frame: the player is pushed out along the
  side-impact normal to the exact contact boundary (pure
  `sidePushOut` math, real per-car widths) and its target lane
  reverts to the lane it came from, so the EXISTING damp glides it
  home smoothly — no teleport, no pass-through, no grind-through
  exploit. The resolution is positional and idempotent (no impulses,
  no jitter, nothing stuck); hit-marked cars stay solid without
  refiring events. NPCs answer with a brief tip-away wobble
  (visual-only, lane centers untouched). Tunneling is impossible by
  construction (max frame steps < collision windows; pinned by unit
  tests). Chase trigger, timing, escape, re-chase, CAUGHT rules,
  rear-enders, shield, jump, nitro, spawner, and saves untouched.
- **Tests:** logic 220/220, browser 97/97, features 66/66 (incl. 17
  new side-physics asserts: real-steer swipe, grind blocking, wobble
  set/decay, 55 m/s contact, near-miss sterility), lobby 83/83 (also
  83/83 on the rebuilt `standalone.html`), acceptance probe 16/16,
  zero console errors everywhere.

## Side-sound + billboard update (implemented ✅)

- **Side-collision thump:** new `SoundSystem.scrape()` — a brief
  bodywork bump (panel-thud noise + low sine, vols 0.30/0.28 between
  land and crash) through the existing sfx bus, so mute + SFX volume
  apply with no new assets. Triggered once per confirmed side scrape
  in the chase-start branch (hitMark-gated: grinding replays
  nothing, a new car replays); rear/game-over keeps `crash()`.
- **Black-logo fix:** root cause — the one-shot bind ran at road
  construction and, if the logo fetch had already FAILED by then
  (`complete` true, zero width), it attached a `load` listener that
  could never fire, leaving boards on the near-black unbound
  material. Now boot pre-decodes the logo (bounded 4 s, non-fatal),
  the binder retries a failed fetch exactly once (skipped for
  data-URIs), and the update loop lazy-heals the bind the instant
  pixels exist. Slow loads bind from frame 1, flaky loads heal via
  retry, total failure degrades dark without errors. Shared
  texture/material, sRGB, transparency, and proportions preserved;
  recycling moves segments only, so the map persists.
- **Build:** standalone bundle switched esbuild iife → esm + module
  script tag (top-level await needs a module context); output still
  one file, zero external refs, boots clean.
- **Tests:** logic 223/223, browser 98/98 (logo survives 500 m of
  recycling), features 70/70 (thump once/swipe, silent near-miss +
  grind, rear keeps crash intact), lobby 90/90 served (slow/flaky/failed
  fetch pages) + 88/88 standalone, acceptance probe 16/16, zero
  console errors everywhere. Visual proof: `test/shot-logo-proof.png`.

## Tow-truck NPC update (implemented ✅)

- **New vehicle:** procedural flatbed tow truck (cab, windshield, amber
  roof beacon, mirrors, headlights, winch frame, open lowered steel
  deck with low rims, reflective strips, 6 wheels) from shared
  boxes/cylinders/materials — ~25 meshes detail, 4-mesh far LOD, no
  textures, no new libraries. 9th pooled body, truck clearance class
  (6.0 × 2.10 m, top 2.17 m < 2.95 m clear height).
- **Gameplay:** 2 of 18 pool slots (~11% of spawns, never consecutive)
  through the untouched spawn/selection/validator path — the
  fair-spawn validator uses the real tow footprint automatically, so
  no 3-lane walls. Speed, lanes, LOD, wheels, cleanup, reset, and
  scoring all inherited. Side scrape = police chase + thump once
  (pushed out, no clipping); rear-ender = game over + crash sting.
- **Limitation (by design, not faked):** the flatbed is visual only —
  the player has no ramp/landing physics (any overlap below the clear
  height is a hit), so driving onto the platform was deliberately not
  implemented. Touching the truck obeys normal traffic rules.
- **Tests:** logic 231/231 (envelope loop auto-covers the tow + 8
  integration asserts), features 79/79 (rigged tow side/rear/cleanup),
  browser 98/98, lobby 90/90 served + 88/88 standalone, acceptance
  probe 16/16, zero console errors everywhere. Visual proof:
  `test/shot-tow-proof.png`.

## Graphics/perf/stability pass (implemented ✅)

- **Audit first:** one RAF loop, dt clamped 0.05, pooled cars/coins/
  particles, 4 lights (1 shadow caster), sRGB albedo everywhere, no
  per-frame allocations in hot loops, visibility auto-pause already
  present. Baseline: ~400 draw calls, ~10.5k tris, 385 GPU geometries,
  11 textures. Confirmed waste: a unique BoxGeometry per road prop.
- **Road GPU diet:** shared geometry cache for all road boxes/planes +
  shared gantry sign materials (385 → 166 geometries, hierarchy and
  recycling untouched). Asphalt gained seamless large-scale tonal
  variation at zero GPU cost (wrap-offset patches, same 256 px canvas).
- **Adaptive quality v2:** the one-shot high→low auto step is now a
  pure hysteresis stepper (2 s windows, down fast below 27 fps, up only
  after 3 good windows above 57 fps, never above the manual tier).
  Manual Low/Medium/High selection + persistence unchanged.
- **Boot MSAA:** fresh boots into saved Low skip antialiasing (weak-GPU
  win; decided once since contexts can't toggle it). HUD writes are now
  value-cached (identical output, no redundant DOM churn).
- **Stability:** WebGL context loss pauses + toasts and rendering
  resumes on restore (three.js recompiles; loop never stops).
- **Rejected with reason (measured, not assumed):** asphalt normal map
  (fragment cost on the biggest surface), InstancedMesh (segment
  recycling + test-hierarchy coupling), shadow autoUpdate tricks
  (traffic moves every frame), headlight removal (tunnels need it).
- **Tests:** logic 239/239 (8 stepper asserts), browser 110/110 (GPU
  budgets, live auto-Q step, visibility pause, context loss/restore,
  landscape letterbox, both MSAA boots), features 79/79, lobby 90/90
  served + 88/88 standalone, probe 16/16, zero console errors
  everywhere. Visual proof: `test/shot-perf-road.png`.
- **Recommended Android tiers:** weak/old phones (Mali-400 class,
  720p, ≤3 GB RAM) → Low; mainstream phones (2019+, 1080p) → Medium
  (default); flagships / 120 Hz phones → High. Auto-Q steps down from
  any tier when a device can't sustain it and climbs back only after
  sustained headroom — never above the manually selected tier.

## Android APK build (exact steps)

Prerequisites: Node 18+, JDK 17, Android Studio (SDK + a debug keystore,
which Android Studio creates automatically). On the machine that builds:

```bash
# 1. Copy the game into a Capacitor shell folder (this exact structure):
carway-apk/
├── package.json        # { "name": "carway", "private": true }
├── capacitor.config.ts # appId 'com.carway.traffic', appName 'Carway Traffic',
│                       # webDir 'www', android: { allowMixedContent: false }
└── www/                # ← copy the ZIP's carway-traffic/standalone.html here
                        #   renamed to index.html (single file, fully offline)
# 2. Install + init + add Android:
cd carway-apk && npm i @capacitor/core @capacitor/cli @capacitor/android
npx cap init "Carway Traffic" com.carway.traffic --web-dir=www
npx cap add android
# 3. Open in Android Studio and build:
npx cap open android
#    → Build > Build Bundle(s)/APK(s) > Build APK(s) → app-debug.apk
#    (first build downloads the Gradle wrapper; allow a few minutes)
```

Lock portrait + fullscreen (once, in the generated project):
`android/app/src/main/AndroidManifest.xml` → activity
`android:screenOrientation="portrait"`,
`android:theme="@style/AppTheme.NoActionBar"` (default Capacitor theme is
already fullscreen-friendly). No extra permissions needed (no network:
the game makes zero requests).

On-device test pass (do this before any release build):
1. Install `app-debug.apk`, launch cold → 3D lobby appears (car +
   garage + moving traffic), no white/black flash longer than ~1 s.
2. Tap PLAY → run starts; steer with buttons + swipes; jump; nitro.
3. Collect each orb (cyan/gold/red-white) → matching HUD badge counts
   down; magnet visibly bends coins inward.
4. Scrape once → police chase + siren; crash → game over → restart.
5. Open Garage/Upgrades/Settings and return; buy one upgrade; confirm
   the balance dropped and the level persists after an app restart.
6. Run one full battery-draining session on each quality tier
   (Settings → Quality): steering must stay smooth, no stuck particles,
   no ANR dialogs. Keep the tier that holds 60 fps on the target phone.

## Roadmap

- **Phase 4:** on-device FPS verification + release signing (`Build >
  Generate Signed Bundle/APK`, own keystore, `zipalign` + `apksigner`
  are handled by Android Studio automatically).
