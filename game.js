// CARWAY TRAFFIC — Game: scene, camera, lights, loop, states, scoring.
// Phase 2: golden-daylight look, gradient sky, smoother chase camera with
// speed FOV, landing dust, and Low/Medium/High quality scaling for Android.
import * as THREE from 'three';
import { CONF, QUALITY_LEVELS, DEFAULT_QUALITY, QUALITY_ORDER, AUTOQ_WINDOW, autoQualityStep, playerSpeedFor, checkCollision, classifyCollision, overlapXZ, sidePushOut, coinHit, coinAward, boostCanStart, jumpCanStart, jumpGravityFor, jumpAirtimeFor, upgradeDuration, magnetRadiusFor, paintById, carById } from '../config.js';
import { Player } from './player.js';
import { LobbySystem } from './lobby.js';
import { RoadSystem } from './road.js';
import { TrafficSystem } from './traffic.js';
import { CoinsSystem } from './coins.js';
import { PickupsSystem } from './pickups.js';
import { PoliceSystem } from './police.js';
import { VaporSystem } from './vapor.js';
import { InputSystem } from './input.js';
import { SoundSystem } from './sound.js';
import { SaveData } from './save.js';
import { featuredMission, missionProgress } from './missions.js';

export class Game {
  // ui: { hud, dist, score, speed, toast, fps, touch, start, over, pause, ... }
  constructor(container, ui) {
    this.container = container;
    this.ui = ui;
    this.state = 'menu'; // menu | playing | paused | over
    this.distance = 0;
    this.score = 0;
    this.overtakes = 0;
    this.best = this._loadBest();
    this.speed = CONF.startSpeed;
    this.shake = 0;
    this.overTimer = 0;
    this.clock = new THREE.Clock();
    this.fpsAcc = 0; this.fpsN = 0; this.fpsShown = 60;
    this.quality = this._loadQuality();
    this.autoQTried = false; // external kill-switch (tests set it to disable auto-Q)
    this.qtAcc = 0; this.qtN = 0; this.qtTime = 0; this._aqGood = 0;
    this._manualQuality = this.quality; // manual tier = auto step-up ceiling
    this.camX = 0;
    this.fov = 68;

    this._initThree();
    this.save = new SaveData();
    this.lobby = new LobbySystem(this.scene);
    this.lobbyDist = 300;
    this.road = new RoadSystem(this.scene);
    this.traffic = new TrafficSystem(this.scene);
    this.coins = new CoinsSystem(this.scene);
    this.pickups = new PickupsSystem(this.scene);
    this.police = new PoliceSystem(this.scene);
    this.player = new Player(this.scene);
    this.sound = new SoundSystem();
    this.vapor = new VaporSystem(this.scene);
    this.aerials = 0; // clean jump-overs this run (test hook + bonus scoring)
    this._initDust();

    // Phase 3 run state
    this.boost = { meter: 100, active: false, regenDelay: 0 };
    // Separate jump energy (0..100): one jump empties it, then it recharges
    // on nitro timing (delay, then linear) — fully independent of nitro.
    this.jumpMeter = 100;
    this.jumpDelay = 0;
    this.runCoins = 0;
    this.runBanked = true;
    this.coinDistAcc = 0;
    this.runTime = 0;
    // Power-ups + police penalty (reset on every genuinely new run only).
    // Power-up rules: one timer per ability; re-pickup refreshes (never
    // stacks); shield holds 1 charge and expires; all three may run together.
    this.shield = { charges: 0, timeLeft: 0 };
    this.coin2x = { timeLeft: 0 };
    this.magnet = { timeLeft: 0 };
    this.shieldGrace = 0;
    this.penalty = { used: false, chase: false, chaseT: 0 };
    this._runCompleted = [];
    this.garageAngle = -0.45;
    this._lastDragT = 0;

    this.input = new InputSystem(container, {
      onLeft: () => this.steer(-1),
      onRight: () => this.steer(1),
      onJump: () => this.jump(),
      onBoost: () => this.activateBoost(),
      onPause: () => this.togglePause(),
      onAny: () => this.sound.unlock(),
    });

    this.player.setCar(carById(this.save.data.car).body);
    this.player.setPaint(paintById(this.save.data.paint));
    this.player.gravity = jumpGravityFor(this.save.data.upgrades.jump); // saved jump skill

    // Garage inspection: drag horizontally on the 3D view to spin the car.
    // (The panel keeps pointer events; only the open 3D area drags.)
    let dragging = false, dragX = 0;
    const cv = this.renderer.domElement;
    cv.addEventListener('pointerdown', (e) => {
      if (this.state !== 'garage') return;
      dragging = true; dragX = e.clientX;
      this._lastDragT = performance.now();
    });
    cv.addEventListener('pointermove', (e) => {
      if (!dragging || this.state !== 'garage') return;
      this.garageAngle += (e.clientX - dragX) * 0.008;
      dragX = e.clientX;
      this._lastDragT = performance.now();
    });
    const endDrag = () => { dragging = false; };
    cv.addEventListener('pointerup', endDrag);
    cv.addEventListener('pointercancel', endDrag);

    this.applyQuality(false);
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this._updateBestLine();
    this._enterLobby('menu'); // boot straight into the roadside-garage lobby
  }

  _loadBest() {
    try { return parseInt(localStorage.getItem('carway_best') || '0', 10) || 0; }
    catch (e) { return 0; }
  }
  _saveBest() {
    try { localStorage.setItem('carway_best', String(this.best)); } catch (e) {}
  }
  _loadQuality() {
    // Legacy saves stored 'high'/'low' — both are still valid tiers.
    try {
      const q = localStorage.getItem('carway_quality');
      return QUALITY_ORDER.includes(q) ? q : DEFAULT_QUALITY;
    } catch (e) { return DEFAULT_QUALITY; }
  }

  _initThree() {
    const w = this.container.clientWidth || 400;
    const h = this.container.clientHeight || 700;

    // MSAA is decided once at boot from the saved tier (a context cannot
    // toggle it later): Low boots without antialiasing for weak GPUs.
    this.renderer = new THREE.WebGLRenderer({ antialias: this.quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.container.prepend(this.renderer.domElement);
    // WebGL context loss: allow restore, park gameplay on the pause screen
    // (three.js recompiles on restore; the render loop never stops).
    const gl = this.renderer.domElement;
    gl.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      if (this.state === 'playing') this.togglePause();
      this._toast('GRAPHICS RESET — TAP TO RESUME');
    });
    gl.addEventListener('webglcontextrestored', () => {
      this._toast('GRAPHICS RESTORED');
    });

    // Golden-daylight atmosphere
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xc3d9f2);
    this.scene.fog = new THREE.Fog(0xc3d9f2, 70, 190);
    this._buildSky();
    this._buildEnvironment();

    this.camera = new THREE.PerspectiveCamera(68, w / h, 0.1, 500);
    this.camera.position.set(0, 5.6, 9.8);

    // --- Sun + ambient (4 cheap lights, 1 shadow caster) ---
    const hemi = new THREE.HemisphereLight(0xbcd4ff, 0x6a7a55, 0.9);
    this.scene.add(hemi);

    const fill = new THREE.DirectionalLight(0xaac4ff, 0.4);
    fill.position.set(-10, 12, 25);
    this.scene.add(fill);

    this.sun = new THREE.DirectionalLight(0xfff1d8, 2.4); // warm sun
    this.sun.position.set(18, 30, 10);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -14; this.sun.shadow.camera.right = 14;
    this.sun.shadow.camera.top = 14; this.sun.shadow.camera.bottom = -30;
    this.sun.shadow.camera.near = 1; this.sun.shadow.camera.far = 80;
    this.sun.shadow.bias = -0.002;
    this.sun.target.position.set(0, 0, -12);
    this.scene.add(this.sun, this.sun.target);

    const head = new THREE.SpotLight(0xfff4e0, 25, 40, 0.5, 0.6, 1.6);
    head.position.set(0, 2.2, 2.5);
    head.target.position.set(0, 0, -18);
    this.scene.add(head, head.target);
    this.headlight = head;
  }

  // Gradient sky dome (one cheap BackSide sphere, no fog on it).
  _buildSky() {
    const c = document.createElement('canvas');
    c.width = 4; c.height = 128;
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0.0, '#3d6fc4');  // zenith
    grad.addColorStop(0.45, '#7fb0e8'); // mid sky
    grad.addColorStop(0.62, '#c3d9f2'); // horizon (matches fog)
    grad.addColorStop(0.63, '#a8bf9a'); // haze below horizon
    grad.addColorStop(1.0, '#6f7f5e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 4, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(320, 20, 14),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }));
    dome.renderOrder = -10;
    this.scene.add(dome);
  }

  // Procedural DAY environment map so metallic paint always has bright,
  // correct reflections (paint can never go black: sky is luminous).
  _buildEnvironment() {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0.0, '#8fb8f2');   // bright sky
    grad.addColorStop(0.45, '#cfe2f7');  // horizon glow
    grad.addColorStop(0.55, '#7d8f6a');  // ground bounce (greenish)
    grad.addColorStop(1.0, '#3a4433');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 64);
    // Sun blob so chrome gets a hot highlight
    ctx.fillStyle = 'rgba(255,250,235,0.95)';
    ctx.beginPath();
    ctx.arc(96, 18, 7, 0, Math.PI * 2);
    ctx.fill();
    const tex = new THREE.CanvasTexture(canvas);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromEquirectangular(tex).texture;
    this.scene.environmentIntensity = 0.85;
    tex.dispose();
    pmrem.dispose();
  }

  // Landing-dust sprite pool (soft radial puffs, no textures to load).
  _initDust() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(235,232,225,0.85)');
    grad.addColorStop(1, 'rgba(235,232,225,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    this.dustTex = new THREE.CanvasTexture(c);
    this.dust = [];
    for (let i = 0; i < 12; i++) {
      const mat = new THREE.SpriteMaterial({ map: this.dustTex, transparent: true, opacity: 0, depthWrite: false });
      const sp = new THREE.Sprite(mat);
      sp.visible = false;
      this.scene.add(sp);
      this.dust.push({ sp, life: 0, max: 1, vx: 0, vy: 0, vz: 0 });
    }
    this.dustEnabled = true;
  }

  spawnDust(x, z, n = 5) {
    if (!this.dustEnabled) return;
    let spawned = 0;
    for (const p of this.dust) {
      if (p.life > 0) continue;
      p.life = p.max = 0.55 + Math.random() * 0.25;
      p.sp.position.set(x + (Math.random() - 0.5) * 2.4, 0.25, z + 1.2 + Math.random() * 1.2);
      p.vx = (Math.random() - 0.5) * 3;
      p.vy = 1.5 + Math.random() * 1.5;
      p.vz = 2 + Math.random() * 2;
      p.sp.visible = true;
      if (++spawned >= n) break;
    }
  }

  _updateDust(dt) {
    for (const p of this.dust) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.sp.visible = false; p.sp.material.opacity = 0; continue; }
      const k = 1 - p.life / p.max; // 0 -> 1
      p.sp.position.x += p.vx * dt;
      p.sp.position.y += p.vy * dt;
      p.sp.position.z += p.vz * dt;
      const s = 0.7 + k * 2.0;
      p.sp.scale.set(s, s, 1);
      p.sp.material.opacity = 0.5 * (1 - k);
    }
  }

  // ---------------- quality ----------------
  setQuality(q, auto = false) {
    if (!QUALITY_ORDER.includes(q)) return;
    this.quality = q;
    if (!auto) { this._manualQuality = q; this._aqGood = 0; } // manual = new ceiling
    try { localStorage.setItem('carway_quality', q); } catch (e) {}
    this.applyQuality(true);
  }

  applyQuality(refreshMaterials) {
    const level = QUALITY_LEVELS[this.quality] || QUALITY_LEVELS[DEFAULT_QUALITY];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, level.pixelRatioCap));
    const hadShadows = this.renderer.shadowMap.enabled;
    this.renderer.shadowMap.enabled = level.shadows;
    this.sun.castShadow = level.shadows;
    if (level.shadows && this.sun.shadow.mapSize.x !== level.shadowSize) {
      // Resize shadow map (dispose forces re-allocation at the new size).
      this.sun.shadow.mapSize.set(level.shadowSize, level.shadowSize);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    this.dustEnabled = level.dust;
    // Effect budgets follow the tier (Medium default balances look + mobile fps).
    if (this.traffic) this.traffic.lodFar = level.lodFar;
    if (this.vapor) { this.vapor.setBudget(level.vaporBudget); this.vapor.setCountScale(level.vaporScale); }
    if (this.player) this.player.setPaintQuality(level.physicalPaint);
    if (refreshMaterials || hadShadows !== level.shadows) {
      // Toggling shadowMap support requires a shader recompile.
      this.scene.traverse((o) => {
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) m.needsUpdate = true;
        }
      });
    }
    this.resize();
    document.querySelectorAll('.quality-label').forEach((el) => {
      el.textContent = this.quality.toUpperCase();
    });
  }

  resize() {
    const w = this.container.clientWidth || 400;
    const h = this.container.clientHeight || 700;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  // ---------------- state changes ----------------
  start() {
    this.sound.unlock();
    this.sound.click();
    this.distance = 0; this.score = 0; this.overtakes = 0;
    this.runCoins = 0; this.runBanked = false; this.coinDistAcc = 0; this.runTime = 0;
    // Fresh run: validate upgrade levels, then power-ups cleared, police
    // penalty fully reset.
    this.save.validateUpgrades();
    this.shield = { charges: 0, timeLeft: 0 };
    this.coin2x = { timeLeft: 0 };
    this.magnet = { timeLeft: 0 };
    this.shieldGrace = 0;
    this.penalty = { used: false, chase: false, chaseT: 0 };
    this.player.shieldMesh.visible = false;
    this.player.magnetMesh.visible = false;
    this.pickups.reset();
    this.police.reset();
    this.sound.stopSiren();
    this.lobby.hide();
    this._runCompleted = [];
    this.boost = { meter: 100, active: false, regenDelay: 0 };
    this.jumpMeter = 100;
    this.jumpDelay = 0;
    this.speed = CONF.startSpeed;
    this.shake = 0;
    this.autoQTried = false;
    this.qtAcc = 0; this.qtN = 0; this.qtTime = 0; this._aqGood = 0;
    this.player.reset();
    this.player.gravity = jumpGravityFor(this.save.data.upgrades.jump);
    this.road.reset();
    this.traffic.reset();
    this.coins.reset();
    this.vapor.reset();
    this.aerials = 0;
    this.state = 'playing';
    this.clock.getDelta();
    this.sound.startEngine();
    this.sound.startMusic();
    this.ui.showPlaying();
    this._updateHud();
  }

  toMenu() {
    this.sound.click();
    this._bankRunCoins(); // quitting mid-run still banks earned coins
    this.sound.stopEngine();
    this.sound.stopMusic();
    this.vapor.reset();
    this._goLobby('menu', 'menu');
    this._updateBestLine();
    this.ui.showMenu(this.best);
    this.refreshMenuUI();
  }

  // Lobby-ish states share one 3D scene (roadside garage + live highway);
  // moving between them never resets background traffic (no popping).
  _isLobbyState(s) {
    return s === 'menu' || s === 'garage' || s === 'upgrades' || s === 'settings' || s === 'missions';
  }

  _goLobby(state, mode) {
    const wasLobby = this._isLobbyState(this.state);
    this.state = state;
    if (!wasLobby) this._enterLobby(mode);
    else this.lobby.show(mode);
  }

  // Full lobby entry from gameplay: park everything, pre-warm background
  // traffic so the highway feels alive on the very first frame.
  _enterLobby(mode) {
    this.player.reset();
    this.player.shieldMesh.visible = false;
    this.player.magnetMesh.visible = false;
    // Park the road at its deterministic lobby pose (tall props clear the
    // garage pad there); the lobby never scrolls it afterwards.
    this.road.parkForLobby();
    this.traffic.reset();
    this.traffic.graceLeft = 0; // rows may spawn immediately back here
    this.traffic.nextWorksGap = Infinity; // roadworks would sit on the garage pad
    this.coins.reset();
    this.pickups.reset();
    this.police.reset();
    this.sound.stopSiren();
    this.lobbyDist = 300;
    // Pre-warm: spread rows along the visible highway so the first frame is
    // alive. Cars drive north (-z, nose-first), so the stagger runs south->north.
    for (let k = 0; k < 4; k++) {
      const before = new Set(this.traffic.cars.filter((c) => c.active));
      this.traffic._spawnRow(this.lobbyDist, 12);
      for (const c of this.traffic.cars) {
        if (c.active && !before.has(c)) c.group.position.z = -8 - k * 24 - Math.random() * 6;
      }
    }
    this.lobby.show(mode);
  }

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.sound.click();
      this.ui.showPaused();
    } else if (this.state === 'paused') {
      this.resume();
    }
  }

  resume() {
    if (this.state !== 'paused') return;
    this.sound.click();
    this.state = 'playing';
    this.clock.getDelta();
    this.ui.showPlaying();
  }

  // Side-contact resolution: separate the cars along x and send the
  // player back toward the lane it came from. Called on every
  // side-overlapping frame — hit-marked or not — so grinding against the
  // same car stays solid without refiring events. Positional and
  // idempotent: no impulses to stack, no jitter, nothing to get stuck.
  // Rear overlaps are never resolved here (game over / shield own those).
  _resolveSideContact(ob, ox, oWid) {
    const p = this.player;
    if (p.crashed) return;
    const push = sidePushOut(p.x, ox, oWid);
    p.x = push.x;
    p.mesh.position.x = p.x;
    p.move(push.dir); // target lane home; the existing damp glides back
    if (ob.group) ob._scrapeWob = -push.dir * 0.10; // NPC tip-away (visual only)
  }

  gameOver(reason = null) {
    this.state = 'over';
    this.overTimer = 0;
    this.overReason = reason; // e.g. 'CAUGHT BY THE POLICE!' (null = crash)
    this.shake = 1.2;
    this.boost.active = false;
    this.player.crash();
    this.player.shieldMesh.visible = false;
    this.player.magnetMesh.visible = false;
    this.shield = { charges: 0, timeLeft: 0 };
    this.coin2x = { timeLeft: 0 };
    this.magnet = { timeLeft: 0 };
    this.penalty.chase = false;
    this.police.reset();
    this.sound.stopSiren();
    this.sound.crash();
    this.sound.stopEngine();
    this.sound.stopMusic();
    const isBest = this.score > this.best;
    if (isBest) { this.best = this.score; this._saveBest(); }
    this._pendingBest = isBest;
    this._runCompleted = this._bankRunCoins();
    this._pendingCoins = this.runCoins;
  }

  // ---------------- actions ----------------
  steer(dir) {
    if (this.state !== 'playing') return;
    if (this.player.move(dir)) this.sound.lane();
  }

  jump() {
    if (this.state !== 'playing') return false;
    // No repeated jumps while airborne (or after a crash) — silent deny.
    if (this.player.airborne || this.player.crashed) return false;
    // Jump energy gate: only a FULL bar allows a jump.
    if (!jumpCanStart(this.jumpMeter)) { this._toast('JUMP CHARGING…'); return false; }
    // Takeoff puff fires once per actual jump (smaller while nitro purges).
    if (this.player.jump()) {
      this.jumpMeter = 0; // one jump consumes the entire bar
      this.jumpDelay = CONF.jumpRegenDelay; // nitro-matched recharge pause
      this.sound.jump();
      this.vapor.burst(this.player.underbodyWorld(), this.boost.active);
      return true;
    }
    return false;
  }

  toggleMute() {
    this.sound.unlock();
    return this.sound.toggleMute();
  }

  // ---------------- Phase 3: boost / garage / shop / missions ----------------
  // Single choke point for run-coin awards: the 2x multiplier applies here
  // exactly once per award (pickups, trickle, overtakes alike).
  awardCoins(base) {
    this.runCoins += coinAward(base, this.coin2x.timeLeft > 0);
  }
  runStats() { return { overtakes: this.overtakes, distance: this.distance }; }

  _bankRunCoins() {
    if (this.runBanked) return [];
    this.runBanked = true;
    return this.save.bankRun(this.runCoins, this.runStats());
  }

  activateBoost() {
    if (this.state !== 'playing' || this.boost.active) return false;
    if (!boostCanStart(this.boost.meter)) { this._toast('NITRO CHARGING…'); return false; }
    this.boost.active = true;
    this.boost.regenDelay = 0;
    this.player.setBoostVisual(true);
    this.sound.boost();
    this.container.classList.add('boosting');
    return true;
  }

  _endBoost() {
    this.boost.active = false;
    this.boost.regenDelay = CONF.boostRegenDelay;
    this.player.setBoostVisual(false);
    this.container.classList.remove('boosting');
  }

  showGarage() {
    if (this.state !== 'menu') return;
    this.sound.click();
    this._goLobby('garage', 'garage');
    this.garageAngle = -0.45; // continue from the lobby pose (no snap)
    this._lastDragT = 0;
    this.ui.showGarage(this.save.data);
  }

  hideGarage() {
    if (this.state !== 'garage') return;
    this.sound.click();
    this._goLobby('menu', 'menu');
    this.ui.showMenu(this.best);
    this.refreshMenuUI();
  }

  showUpgrades() {
    if (this.state !== 'menu') return;
    this.sound.click();
    this._goLobby('upgrades', 'menu');
    this.ui.showUpgrades(this.save.data);
  }

  hideUpgrades() {
    if (this.state !== 'upgrades') return;
    this.sound.click();
    this._goLobby('menu', 'menu');
    this.ui.showMenu(this.best);
    this.refreshMenuUI();
  }

  showMissions() {
    if (this.state !== 'menu') return;
    this.sound.click();
    this._goLobby('missions', 'menu');
    this.ui.showMissions(this.save.data, this.runStats());
  }

  hideMissions() {
    if (this.state !== 'missions') return;
    this.sound.click();
    this._goLobby('menu', 'menu');
    this.ui.showMenu(this.best);
    this.refreshMenuUI();
  }

  showSettings() {
    if (this.state !== 'menu') return;
    this.sound.click();
    this._goLobby('settings', 'menu');
    this.ui.showSettings(this.save.data);
  }

  hideSettings() {
    if (this.state !== 'settings') return;
    this.sound.click();
    this._goLobby('menu', 'menu');
    this.ui.showMenu(this.best);
    this.refreshMenuUI();
  }

  buyPaint(id) {
    const def = paintById(id);
    const res = this.save.buyPaint(def);
    if (res.ok) {
      this.player.setPaint(def);
      this.sound.coin();
    } else {
      this.sound.click();
    }
    this.ui.refreshGarage(this.save.data);
    return res;
  }

  selectPaint(id) {
    if (!this.save.selectPaint(id)) return false;
    this.player.setPaint(paintById(id));
    this.sound.click();
    this.ui.refreshGarage(this.save.data);
    return true;
  }

  buyCar(id) {
    const def = carById(id);
    const res = this.save.buyCar(def);
    if (res.ok) {
      this.player.setCar(def.body);
      this.player.setPaint(paintById(this.save.data.paint));
      this.sound.coin();
    } else {
      this.sound.click();
    }
    this.ui.refreshGarage(this.save.data);
    return res;
  }

  selectCar(id) {
    if (!this.save.selectCar(id)) return false;
    this.player.setCar(carById(id).body);
    this.player.setPaint(paintById(this.save.data.paint));
    this.sound.click();
    this.ui.refreshGarage(this.save.data);
    return true;
  }

  // Power-up upgrade (upgrades screen, coins). Longer durations, same rules.
  // Returns { ok, reason, level, cost }; arrival duration in res.dur.
  buyUpgrade(id) {
    const res = this.save.buyUpgrade(id);
    if (res.ok) {
      if (id === 'jump') this.player.gravity = jumpGravityFor(res.level);
      res.dur = upgradeDuration(id, res.level);
      this.sound.coin();
    } else {
      this.sound.click();
    }
    this.ui.refreshUpgrades(this.save.data);
    return res;
  }

  // Full progress wipe (settings, after two-tap confirmation there).
  resetProgress() {
    this.save.resetProgress();
    this.best = 0;
    this.player.setCar('roadster');
    this.player.setPaint(paintById('red'));
    this.player.gravity = jumpGravityFor(1);
    this.sound.click();
    this._updateBestLine();
    this.ui.refreshSettings(this.save.data);
    this.refreshMenuUI();
  }

  refreshMenuUI() {
    if (!this.ui.refreshMenu) return;
    const feat = featuredMission(this.save.data, this.runStats());
    this.ui.refreshMenu(this.save.data.coins, feat ? {
      name: feat.name,
      desc: feat.desc,
      progress: Math.min(missionProgress(feat, this.save.data, this.runStats()), feat.target),
      target: feat.target,
      reward: feat.reward,
    } : null);
  }

  _updateBestLine() {
    if (this.ui.bestLine) this.ui.bestLine.textContent = `BEST: ${this.best}`;
  }

  _toast(text) {
    const el = this.ui.toast;
    if (!el) return;
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => el.classList.remove('show'), 1200);
  }

  // ---------------- main loop ----------------
  frame() {
    requestAnimationFrame(() => this.frame());
    const rawDt = Math.min(this.clock.getDelta(), 0.05);
    this._fps(rawDt);

    if (this.state === 'playing') {
      this._update(rawDt);
    } else if (this.state === 'over') {
      this.overTimer += rawDt;
      this.player.update(rawDt, this.speed * 0.2);
      this._updateCamera(rawDt);
      this._updateDust(rawDt);
      this.vapor.update(rawDt); // let purge vapor dissipate through the crash
      if (this.overTimer > 0.9 && !this._overShown) {
        this._overShown = true;
        this.ui.showGameOver(this.distance, this.score, this.best, this._pendingBest,
          this._pendingCoins || 0, this._runCompleted || [], this.overReason || null);
      }
    } else if (this.state === 'garage') {
      // Showroom: the car turntable is the ONLY motion here (road, camera
      // and scenery hold still; pose fully owned by garageAngle + lobby).
      if (performance.now() - this._lastDragT > 2500) this.garageAngle += rawDt * 0.55;
      this.player.mesh.rotation.y = this.garageAngle;
      this.lobby.update(rawDt, this.player.mesh, this.camera, this.headlight);
      this._updateDust(rawDt);
    } else if (this.state === 'menu' || this.state === 'upgrades' || this.state === 'settings' || this.state === 'missions') {
      // Roadside-garage lobby: the environment is FROZEN (road segments,
      // barriers, garage, camera and display car never move). ONLY the
      // background traffic advances — nose-first (-z), under its own power.
      // lobbyDist is a virtual odometer for spawn pacing — it moves nothing.
      this.lobbyDist += 12 * rawDt;
      this.traffic.updateAmbient(rawDt, 12, this.lobbyDist);
      this.lobby.update(rawDt, this.player.mesh, this.camera, this.headlight);
      this._updateDust(rawDt);
    }

    this.renderer.render(this.scene, this.camera);
  }

  _fps(dt) {
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc >= 0.5) {
      this.fpsShown = Math.round(this.fpsN / this.fpsAcc);
      this.fpsAcc = 0; this.fpsN = 0;
      if (this.ui.fps) this.ui.fps.textContent = `${this.fpsShown} fps`;
    }
    // Auto quality: fixed windows with hysteresis (down fast, up slowly),
    // never above the manually selected tier. autoQTried disables it.
    if (this.state === 'playing' && !this.autoQTried) {
      this.qtAcc += dt; this.qtN++; this.qtTime += dt;
      if (this.qtTime >= AUTOQ_WINDOW) {
        const avg = this.qtN / Math.max(this.qtAcc, 1e-3);
        const step = autoQualityStep(this.quality, this._manualQuality, avg, this._aqGood);
        this._aqGood = step.good;
        this.qtAcc = 0; this.qtN = 0; this.qtTime = 0;
        if (step.quality !== this.quality) {
          this.setQuality(step.quality, true);
          this._toast(step.quality === 'low' ? 'LOW-QUALITY MODE (auto)'
            : `QUALITY: ${step.quality.toUpperCase()} (auto)`);
        }
      }
    }
  }

  _update(dt) {
    this._overShown = false;

    // --- Nitro boost meter ---
    if (this.boost.active) {
      this.boost.meter -= CONF.boostDrain * dt;
      if (this.boost.meter <= 0) { this.boost.meter = 0; this._endBoost(); }
    } else if (this.boost.regenDelay > 0) {
      this.boost.regenDelay -= dt;
    } else if (this.boost.meter < 100) {
      this.boost.meter = Math.min(100, this.boost.meter + CONF.boostRegen * dt);
    }
    // --- Jump energy meter: same delay-then-linear recharge as nitro, but
    // fully independent state (jump and nitro can recharge side by side) ---
    if (this.jumpDelay > 0) {
      this.jumpDelay -= dt;
    } else if (this.jumpMeter < 100) {
      this.jumpMeter = Math.min(100, this.jumpMeter + CONF.jumpRegen * dt);
    }
    const mult = this.boost.active ? CONF.boostMult : 1;
    this.speed = playerSpeedFor(this.distance) * mult;
    this.distance += this.speed * dt;
    this.runTime += dt;

    this.road.update(dt, this.speed);
    this.player.update(dt, this.speed);
    const events = this.traffic.update(dt, this.speed, this.distance, this.player.x);
    this.coins.update(dt, this.speed, this.runTime);
    this.pickups.update(dt, this.speed, this.runTime);
    this.police.update(dt, this.player.x, this.speed);
    // Power-up timers.
    if (this.shieldGrace > 0) this.shieldGrace -= dt;
    if (this.shield.timeLeft > 0) {
      this.shield.timeLeft -= dt;
      if (this.shield.timeLeft <= 0) {
        this.shield.charges = 0;
        this.player.shieldMesh.visible = false;
      }
    }
    if (this.coin2x.timeLeft > 0) this.coin2x.timeLeft -= dt;
    if (this.magnet.timeLeft > 0) {
      this.magnet.timeLeft -= dt;
      if (this.magnet.timeLeft <= 0) this.player.magnetMesh.visible = false;
    }
    // Police chase state machine: NORMAL (chase=false, used=false) <->
    // POLICE_CHASE_ACTIVE (both true) -> GAME_OVER (state='over').
    // Surviving the timer escapes back to NORMAL with a FRESH second
    // chance — the next side scrape starts a new chase, not a game over.
    // The timer is frame-polled (no async callbacks), so nothing stale can
    // fire after the chase ends.
    if (this.penalty.chase) {
      this.penalty.chaseT -= dt;
      if (this.penalty.chaseT <= 0) {
        this.penalty.chase = false;
        this.penalty.used = false; // escaped: second chance restored
        this.police.startLeave();
        this.sound.stopSiren();
        this._toast('YOU LOST THEM!');
      }
    }
    if (this.boost.active) this.vapor.emitNitro(dt, this.player.exhaustWorld());
    // Airborne underbody vapor: launch surge tapering to a thin wisp (vy
    // falls 11.5 → 0 → negative through the arc; decorative only).
    if (this.player.airborne) {
      const taper = 0.25 + 0.75 * Math.max(0, Math.min(1, this.player.vy / CONF.jumpVelocity));
      this.vapor.emitAir(dt, this.player.underbodyWorld(), taper);
    }

    if (this.player.justLanded) {
      this.sound.land();
      this.spawnDust(this.player.x, CONF.playerZ);
      this.vapor.burst(this.player.underbodyWorld(), true); // brief landing puff
    }

    // --- Coin collection (immediate counter + sound + sparkle) ---
    const px = this.player.x, pz = CONF.playerZ, py = this.player.y;
    const magnetOn = this.magnet.timeLeft > 0;
    const magnetR = magnetOn ? magnetRadiusFor(this.save.data.upgrades.magnet) : 0;
    for (const c of this.coins.items) {
      if (!c.active) continue;
      const wp = c.root.position;
      // Magnet: coins inside the radius arc toward the car (never teleport,
      // never orbit past it); outside coins behave exactly as before.
      if (magnetOn) {
        const dxm = px - wp.x, dzm = pz - wp.z;
        const distXZ = Math.hypot(dxm, dzm);
        if (distXZ <= magnetR && distXZ > 0.001) {
          // Pull beats road advection at any speed so captured coins arrive.
          const pull = (CONF.magnetSpeed + this.speed * 0.9) * dt;
          const step = Math.min(pull, distXZ);
          const nx = dxm / distXZ, nz = dzm / distXZ;
          const swirl = Math.sin(this.runTime * 7 + c.phase) * 0.35;
          wp.x += (nx - nz * swirl) * step;
          wp.z += (nz + nx * swirl) * step;
          const ty = py + 0.9;
          c.baseY += Math.sign(ty - c.baseY) * Math.min(Math.abs(ty - c.baseY), pull * 0.8);
        }
      }
      if (coinHit(px, py, pz, wp.x, c.spinner.position.y, wp.z)) {
        this.coins.collect(c);
        this.awardCoins(1);
        this.score += CONF.coinScore;
        this.sound.coin();
      }
    }
    // --- Power-up pickup collection (same radius as coins) ---
    for (const p of this.pickups.items) {
      if (!p.active) continue;
      const wp = p.root.position;
      if (coinHit(px, py, pz, wp.x, p.spinner.position.y, wp.z)) {
        const type = this.pickups.collect(p);
        this.coins.burst(wp.x, p.spinner.position.y, wp.z);
        const upLv = this.save.data.upgrades;
        if (type === 'shield') {
          this.shield.charges = 1;
          this.shield.timeLeft = upgradeDuration('shield', upLv.shield);
          this.player.shieldMesh.visible = true;
          this._toast('SHIELD UP!');
        } else if (type === 'coin2x') {
          this.coin2x.timeLeft = upgradeDuration('coin2x', upLv.coin2x); // re-pickup refreshes
          this._toast('2X COINS!');
        } else if (type === 'magnet') {
          this.magnet.timeLeft = upgradeDuration('magnet', upLv.magnet); // re-pickup refreshes
          this.player.magnetMesh.visible = true;
          this._toast('MAGNET!');
        }
        this.sound.pickup();
      }
    }
    // Distance trickle: 1 coin per coinDistReward meters
    this.coinDistAcc += this.speed * dt;
    if (this.coinDistAcc >= CONF.coinDistReward) {
      this.coinDistAcc -= CONF.coinDistReward;
      this.awardCoins(1);
    }

    if (events.overtakes > 0) {
      this.overtakes += events.overtakes;
      this.score += events.overtakes * CONF.overtakeScore;
      this.awardCoins(events.overtakes * CONF.coinsPerOvertake);
    }
    if (events.aerials > 0) {
      this.aerials += events.aerials;
      this.score += events.aerials * 25;
      this._toast(`AERIAL +${events.aerials * 25}`);
      this.sound.coin();
    }
    if (events.nearMisses > 0) {
      this.score += events.nearMisses * CONF.nearMissScore;
      this.sound.nearMiss();
      this._toast(`NEAR MISS +${events.nearMisses * CONF.nearMissScore}`);
    }
    this.score += Math.floor(this.speed * dt);

    // Live mission checks (single-run missions complete mid-drive)
    const done = this.save.checkMissions(this.runStats());
    for (const m of done) {
      this._runCompleted.push(m);
      this._toast(`★ ${m.name} +${m.reward}`);
      this.sound.coin();
    }

    let hit = false;
    let hitReason = null;
    let staticAerials = 0;
    // Contact resolution: rear-enders end the run, a side scrape calls
    // the police (repeatable: each escape restores the second chance),
    // shields absorb. Every obstacle fires exactly one event per
    // spawn (hitMark) and each frame collapses to a single event, so one
    // impact can never multi-fire — and nothing can rest on traffic.
    let penaltyEvent = false;
    this.traffic.forEachObstacle((ox, oz, len, wid, clear, ob) => {
      if (!checkCollision(px, pz, py, ox, oz, len, wid, clear)) {
        // Dedicated airborne-over-obstacle detection: overlapping the
        // footprint while fully above the clear height = a clean clear.
        if (!hit && this.player.airborne && py >= clear && ob && !ob.jumpedOver &&
            overlapXZ(px, pz, ox, oz, len, wid)) {
          ob.jumpedOver = true;
          if (!ob.kind) staticAerials++; // roadworks: no overtake flow, award now
        }
        return;
      }
      // Physical side-contact response: runs on EVERY overlapping frame,
      // event or not, so the cars stay solid while they overlap. The event
      // below still fires once per spawn (hitMark) with the pre-push
      // classification — only the positions are resolved here.
      const cls0 = classifyCollision(px, pz, ox, oz, len, wid);
      if (cls0 === 'side' && ob) this._resolveSideContact(ob, ox, wid);
      if (!ob || ob._hitMark || this.shieldGrace > 0) return;
      ob._hitMark = true;
      if (penaltyEvent) return; // same impact instant: one event only
      penaltyEvent = true;
      // Shield absorbs ANY first contact: no game over, no police penalty.
      if (this.shield.charges > 0) {
        this.shield.charges = 0;
        this.shield.timeLeft = 0;
        this.player.shieldMesh.visible = false;
        this.shieldGrace = CONF.shieldGrace;
        this.sound.shieldBreak();
        this._toast('SHIELD ABSORBED!');
        return;
      }
      const cls = cls0; // pre-push classification: the event sees the contact as detected
      if (cls === 'side' && !this.penalty.used && !this.penalty.chase) {
        // Side scrape with a fresh second chance: police chase instead of
        // game over. Guarded by BOTH flags so an active chase can never
        // re-trigger (the timer runs once, never reset by later contacts).
        this.penalty.used = true;
        this.penalty.chase = true;
        this.penalty.chaseT = CONF.chaseDuration;
        this.police.spawn(this.player.x);
        this.sound.scrape(); // impact thump, once per scrape (hitMark-gated)
        this.sound.startSiren();
        this._toast('ONE CHANCE LEFT!');
        return;
      }
      // Rear-ender (always), or a side scrape mid-chase (caught red-handed).
      hit = true;
      hitReason = (cls === 'side' && this.penalty.chase) ? 'CAUGHT BY THE POLICE!' : null;
    });
    if (hit) { this.gameOver(hitReason); return; }
    if (staticAerials > 0) {
      this.aerials += staticAerials;
      this.score += staticAerials * 25;
      this._toast(`AERIAL +${staticAerials * 25}`);
      this.sound.coin();
    }

    this.sound.setEngineSpeed((this.speed - CONF.startSpeed) / (CONF.maxSpeed * CONF.boostMult - CONF.startSpeed));
    this._updateCamera(dt);
    this._updateDust(dt);
    this.vapor.update(dt);
    this._updateHud();
  }

  _updateCamera(dt) {
    // Smoother chase: damped lateral lag + speed pullback + FOV kick.
    const px = this.player.x;
    const speedNorm = Math.min(1, Math.max(0,
      (this.speed - CONF.startSpeed) / (CONF.maxSpeed - CONF.startSpeed)));
    const k = Math.min(1, dt * 4.2); // slower than the car -> pleasing lag
    this.camX += (px * 0.55 - this.camX) * k;
    const targetY = 5.6 + this.player.y * 0.32;
    this.camera.position.x = this.camX;
    this.camera.position.y += (targetY - this.camera.position.y) * Math.min(1, dt * 5);
    this.camera.position.z = 9.8 + speedNorm * 1.4;

    // Speed vibration + crash shake (restrained; no motion blur for perf)
    // Nitro adds extra shake + FOV kick for the speed sensation.
    const boosting = this.boost.active ? 1 : 0;
    const vib = speedNorm * speedNorm * 0.12 + boosting * 0.15;
    if (vib > 0.003 && this.state === 'playing') {
      this.camera.position.x += (Math.random() - 0.5) * vib;
      this.camera.position.y += (Math.random() - 0.5) * vib * 0.7;
    }
    if (this.shake > 0.01) {
      this.shake *= Math.pow(0.02, dt);
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.6;
    }
    this.camera.lookAt(px * 0.7, 1.0 - this.player.y * 0.08, -12);

    // FOV widens with speed (+ nitro kick) for a sense of velocity
    const targetFov = 68 + speedNorm * 9 + (this.boost.active ? 7 : 0);
    if (Math.abs(targetFov - this.fov) > 0.05) {
      this.fov += (targetFov - this.fov) * Math.min(1, dt * 3);
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }

    this.headlight.position.x = px;
    this.headlight.target.position.x = px;
  }

  _setText(el, key, value) {
    if (el && value !== this[key]) { this[key] = value; el.textContent = value; }
  }
  _updateHud() {
    this._setText(this.ui.dist, '_hudDist', `${Math.floor(this.distance)} m`);
    this._setText(this.ui.score, '_hudScore', `${this.score}`);
    this._setText(this.ui.speed, '_hudSpeed', `${Math.round(this.speed * 3.6)}`);
    this._setText(this.ui.coins, '_hudCoins', `${this.runCoins}`);
    const boostPct = Math.round(this.boost.meter);
    if (this.ui.boostFill && boostPct !== this._hudBoost) {
      this._hudBoost = boostPct;
      this.ui.boostFill.style.width = `${boostPct}%`;
    }
    if (this.ui.boostFill && this.boost.active !== this._hudBoostOn) {
      this._hudBoostOn = this.boost.active;
      this.ui.boostFill.classList.toggle('active', this.boost.active);
    }
    const nitroReady = boostCanStart(this.boost.meter) && !this.boost.active;
    if (this.ui.nitroBtn && nitroReady !== this._hudNitroReady) {
      this._hudNitroReady = nitroReady;
      this.ui.nitroBtn.classList.toggle('ready', nitroReady);
    }
    if (this.ui.nitroBtn && this.boost.active !== this._hudNitroOn) {
      this._hudNitroOn = this.boost.active;
      this.ui.nitroBtn.classList.toggle('active', this.boost.active);
    }
    // Jump energy bar: smooth fill + charged/low states.
    const jumpPct = Math.round(this.jumpMeter);
    if (this.ui.jumpFill && jumpPct !== this._hudJump) {
      this._hudJump = jumpPct;
      this.ui.jumpFill.style.width = `${jumpPct}%`;
    }
    const jumpReady = jumpCanStart(this.jumpMeter);
    if (this.ui.jumpFill && jumpReady !== this._hudJumpReady) {
      this._hudJumpReady = jumpReady;
      this.ui.jumpFill.classList.toggle('low', !jumpReady);
      this.ui.jumpFill.classList.toggle('full', jumpReady);
    }
    // Jump button dims whenever a jump is unavailable (airborne or low meter).
    if (this.ui.jumpBtn) {
      const canJump = this.state === 'playing' && !this.player.airborne &&
        !this.player.crashed && jumpReady;
      if (canJump !== this._hudCanJump) {
        this._hudCanJump = canJump;
        this.ui.jumpBtn.classList.toggle('depleted', !canJump);
      }
    }
    // Power-up badges: rebuild the HTML only when it changes (no per-frame
    // DOM churn — countdowns tick once per second at most).
    const badges =
      (this.shield.charges > 0 ? `<span class="hud-badge badge-shield">🛡 ${Math.ceil(this.shield.timeLeft)}</span>` : '') +
      (this.magnet.timeLeft > 0 ? `<span class="hud-badge badge-magnet">🧲 ${Math.ceil(this.magnet.timeLeft)}</span>` : '') +
      (this.coin2x.timeLeft > 0 ? `<span class="hud-badge badge-coin2x">2X🪙 ${Math.ceil(this.coin2x.timeLeft)}</span>` : '');
    if (this.ui.badges && badges !== this._badgeHtml) {
      this._badgeHtml = badges;
      this.ui.badges.innerHTML = badges;
    }
    // Chase banner: persistent "one chance left" countdown while pursued.
    if (this.ui.chaseBanner) {
      const chasing = this.state === 'playing' && this.penalty.chase;
      this.ui.chaseBanner.classList.toggle('hidden', !chasing);
      if (chasing) {
        const txt = `🚔 POLICE CHASE — ${Math.max(1, Math.ceil(this.penalty.chaseT))}s — ONE CHANCE LEFT!`;
        if (txt !== this._chaseTxt) { this._chaseTxt = txt; this.ui.chaseBanner.textContent = txt; }
      }
    }
  }
}
