// CARWAY TRAFFIC — Boot: wires DOM UI to the Game and starts the loop.
import { Game } from './systems/game.js';
import { PAINTS, CARS, UPGRADE_IDS, UPGRADES, upgradePrice, upgradeLevelMax } from './config.js';
import { MISSIONS, missionProgress } from './systems/missions.js';

function $(id) { return document.getElementById(id); }
function hex(c) { return '#' + c.toString(16).padStart(6, '0'); }
function durFmt(d) { return Number.isInteger(d) ? `${d}s` : `${d.toFixed(2)}s`; }

const container = $('game-container');

const ui = {
  hud: $('hud'),
  dist: $('hud-dist'),
  score: $('hud-score'),
  speed: $('hud-speed'),
  coins: $('hud-coins'),
  boostFill: $('boost-fill'),
  nitroBtn: $('btn-nitro'),
  jumpFill: $('jump-fill'),
  jumpBtn: $('btn-jump'),
  toast: $('hud-toast'),
  fps: $('hud-fps'),
  badges: $('hud-badges'),
  chaseBanner: $('chase-banner'),
  touch: $('touch-controls'),
  bestLine: $('best-line'),

  _hideOverlays() {
    for (const id of ['start-screen', 'garage-screen', 'upgrades-screen', 'missions-screen', 'settings-screen', 'gameover-screen', 'pause-screen']) {
      $(id).classList.add('hidden');
    }
  },
  openNav() {
    $('nav-drawer').classList.add('open');
    $('nav-backdrop').classList.remove('hidden');
  },
  closeNav() {
    $('nav-drawer').classList.remove('open');
    $('nav-backdrop').classList.add('hidden');
  },
  toggleNav() {
    if ($('nav-drawer').classList.contains('open')) this.closeNav();
    else { this.openNav(); game.sound.click(); }
  },
  showPlaying() {
    this._hideOverlays();
    this.closeNav();
    this.hud.classList.remove('hidden');
    this.touch.classList.remove('hidden');
    this.nitroBtn.classList.remove('hidden');
  },
  showMenu(best) {
    this._hideOverlays();
    this.closeNav();
    $('start-screen').classList.remove('hidden');
    this.hud.classList.add('hidden');
    this.touch.classList.add('hidden');
    this.nitroBtn.classList.add('hidden');
    if (best !== undefined) this.bestLine.textContent = `BEST: ${best}`;
  },
  showPaused() {
    $('pause-screen').classList.remove('hidden');
  },
  showGarage(saveData) {
    this._hideOverlays();
    $('garage-screen').classList.remove('hidden');
    this.refreshGarage(saveData);
  },
  refreshGarage(saveData) {
    $('garage-coins-val').textContent = `${saveData.coins}`;
    const list = $('paint-list');
    list.innerHTML = '';
    for (const p of PAINTS) {
      const owned = saveData.paints.includes(p.id);
      const selected = saveData.paint === p.id;
      const row = document.createElement('div');
      row.className = 'paint-row';
      const sw = document.createElement('span');
      sw.className = 'paint-swatch';
      sw.style.background = `linear-gradient(135deg, ${hex(p.color)}, ${hex(p.dark)})`;
      const nm = document.createElement('span');
      nm.className = 'paint-name';
      nm.textContent = p.name;
      const btn = document.createElement('button');
      if (selected) {
        btn.className = 'paint-btn selected';
        btn.textContent = 'SELECTED';
        btn.disabled = true;
      } else if (owned) {
        btn.className = 'paint-btn select';
        btn.textContent = 'SELECT';
        btn.addEventListener('click', () => game.selectPaint(p.id));
      } else {
        btn.className = 'paint-btn';
        btn.textContent = `◉ ${p.price}`;
        btn.addEventListener('click', () => {
          const res = game.buyPaint(p.id);
          if (!res.ok) {
            btn.textContent = 'NEED ◉!';
            setTimeout(() => ui.refreshGarage(game.save.data), 800);
          }
        });
      }
      row.append(sw, nm, btn);
      list.append(row);
    }
    // --- Car collection (same buy/select economy as paints) ---
    const clist = $('car-list');
    clist.innerHTML = '';
    for (const c of CARS) {
      const owned = (saveData.cars || ['roadster']).includes(c.id);
      const selected = saveData.car === c.id;
      const row = document.createElement('div');
      row.className = 'paint-row';
      const sw = document.createElement('span');
      sw.className = 'paint-swatch car-swatch';
      sw.textContent = c.body === 'supercar' ? '🏎' : c.body === 'coupe' ? '🚗' : c.body === 'volt' ? '🚙' : '🚘';
      const nm = document.createElement('span');
      nm.className = 'paint-name';
      nm.textContent = c.name;
      const btn = document.createElement('button');
      if (selected) {
        btn.className = 'paint-btn selected';
        btn.textContent = 'SELECTED';
        btn.disabled = true;
      } else if (owned) {
        btn.className = 'paint-btn select';
        btn.textContent = 'SELECT';
        btn.addEventListener('click', () => game.selectCar(c.id));
      } else {
        btn.className = 'paint-btn';
        btn.textContent = `◉ ${c.price}`;
        btn.addEventListener('click', () => {
          const res = game.buyCar(c.id);
          if (!res.ok) {
            btn.textContent = 'NEED ◉!';
            setTimeout(() => ui.refreshGarage(game.save.data), 800);
          }
        });
      }
      row.append(sw, nm, btn);
      clist.append(row);
    }
  },
  showUpgrades(saveData) {
    this._hideOverlays();
    $('upgrades-screen').classList.remove('hidden');
    this.refreshUpgrades(saveData);
  },
  refreshUpgrades(saveData) {
    $('upgrades-coins-val').textContent = `${saveData.coins}`;
    const list = $('upgrades-list');
    list.innerHTML = '';
    const levels = saveData.upgrades || {};
    for (const id of UPGRADE_IDS) {
      const def = UPGRADES[id];
      const lv = levels[id] || 1;
      const maxed = lv >= upgradeLevelMax();
      const cost = upgradePrice(id, lv);
      const card = document.createElement('div');
      card.className = 'up-card';
      card.dataset.upgrade = id;
      const head = document.createElement('div');
      head.className = 'up-head';
      const ico = document.createElement('span');
      ico.className = 'up-ico';
      ico.textContent = def.icon;
      const nm = document.createElement('span');
      nm.className = 'up-name';
      nm.textContent = def.name;
      const lvl = document.createElement('span');
      lvl.className = 'up-level';
      lvl.textContent = `LV ${lv}/${upgradeLevelMax()}`;
      head.append(ico, nm, lvl);
      card.append(head);
      const dur = document.createElement('div');
      dur.className = 'up-dur';
      dur.innerHTML = maxed
        ? `${durFmt(def.durations[lv - 1])} — MAX`
        : `${durFmt(def.durations[lv - 1])} → <b>${durFmt(def.durations[lv])}</b>`;
      card.append(dur);
      if (def.radius) { // magnet: radius ladder shown too
        const sub = document.createElement('div');
        sub.className = 'up-sub';
        sub.innerHTML = maxed
          ? `Radius ${def.radius[lv - 1]}m — MAX`
          : `Radius ${def.radius[lv - 1]}m → <b>${def.radius[lv]}m</b>`;
        card.append(sub);
      }
      const foot = document.createElement('div');
      foot.className = 'up-foot';
      const price = document.createElement('span');
      price.className = 'up-price';
      price.textContent = maxed ? '—' : `◉ ${cost}`;
      const btn = document.createElement('button');
      btn.className = 'paint-btn up-btn';
      if (maxed) {
        btn.classList.add('maxed');
        btn.textContent = 'MAXED';
        btn.disabled = true;
      } else if (saveData.coins < cost) {
        btn.classList.add('poor');
        btn.textContent = 'UPGRADE';
        btn.disabled = true;
      } else {
        btn.textContent = 'UPGRADE';
        btn.addEventListener('click', () => game.buyUpgrade(id));
      }
      foot.append(price, btn);
      card.append(foot);
      list.append(card);
    }
  },
  showSettings(saveData) {
    this._hideOverlays();
    $('settings-screen').classList.remove('hidden');
    this.refreshSettings(saveData);
  },
  refreshSettings(saveData) {
    // Sync controls with live state (called on open + after reset).
    const sm = $('set-music'), ss = $('set-sfx');
    if (sm) sm.value = String(Math.round(game.sound.musicVol * 100));
    if (ss) ss.value = String(Math.round(game.sound.sfxVol * 100));
    syncMuteBtn();
    disarmReset();
  },
  refreshMenu(balance) {
    // Lobby chrome: coin chip only (missions live on their own screen now).
    $('menu-coins-val').textContent = `${balance}`;
  },
  showMissions(saveData, run) {
    this._hideOverlays();
    $('missions-screen').classList.remove('hidden');
    this.refreshMissions(saveData, run);
  },
  refreshMissions(saveData, run) {
    const list = $('missions-list');
    list.innerHTML = '';
    const live = run || { overtakes: 0, distance: 0 };
    for (const def of MISSIONS) {
      const done = !!saveData.missions?.[def.id]?.done;
      const prog = done ? def.target : Math.min(missionProgress(def, saveData, live), def.target);
      const row = document.createElement('div');
      row.className = 'mission-row' + (done ? ' done' : '');
      row.dataset.mission = def.id;
      const head = document.createElement('div');
      head.className = 'mission-head';
      const nm = document.createElement('span');
      nm.className = 'mission-name';
      nm.textContent = (done ? '★ ' : '') + def.name;
      const rw = document.createElement('span');
      rw.className = 'mission-reward';
      rw.textContent = `◉ ${def.reward}`;
      head.append(nm, rw);
      const desc = document.createElement('div');
      desc.className = 'mission-desc';
      desc.textContent = def.desc;
      const bar = document.createElement('div');
      bar.className = 'mission-bar';
      const fill = document.createElement('div');
      fill.className = 'mission-fill';
      fill.style.width = `${Math.round((prog / def.target) * 100)}%`;
      bar.append(fill);
      const pr = document.createElement('div');
      pr.className = 'mission-progress';
      pr.textContent = done ? '★ COMPLETE' : `${prog} / ${def.target}`;
      row.append(head, desc, bar, pr);
      list.append(row);
    }
  },
  showGameOver(distance, score, best, isBest, runCoins, completed, reason) {
    $('crash-title').textContent = reason || 'CRASH!';
    $('over-dist').textContent = `${Math.floor(distance)} m`;
    $('over-score').textContent = `${score}`;
    $('over-coins').textContent = `+${runCoins || 0}`;
    $('over-best').textContent = `${best}`;
    $('newbest').classList.toggle('hidden', !isBest);
    const om = $('over-missions');
    if (completed && completed.length) {
      om.innerHTML = completed.map((m) => `<div>★ ${m.name} +${m.reward}</div>`).join('');
      om.classList.remove('hidden');
    } else {
      om.innerHTML = '';
      om.classList.add('hidden');
    }
    $('gameover-screen').classList.remove('hidden');
    this.touch.classList.add('hidden');
    this.nitroBtn.classList.add('hidden');
  },
};

// Logo pre-decode: billboards bind the in-page logo at road construction,
// so wait for its pixels first (bounded, non-fatal) — boards are correct
// from frame 1 even on cold-cache/slow first loads instead of popping in.
try {
  const logoImg = document.getElementById('intro-logo');
  if (logoImg && !(logoImg.complete && logoImg.naturalWidth)) {
    await Promise.race([
      logoImg.decode(),
      new Promise((res) => setTimeout(res, 4000)),
    ]);
  }
} catch (e) { /* broken image: game boots on, boards degrade dark, road retries */ }

const game = new Game(container, ui);

// Buttons
$('btn-start').addEventListener('click', () => game.start());
$('btn-restart').addEventListener('click', () => game.start());
$('btn-menu').addEventListener('click', () => game.toMenu());
$('btn-menu2').addEventListener('click', () => game.toMenu());
$('btn-resume').addEventListener('click', () => game.resume());
$('btn-quit').addEventListener('click', () => game.start());
$('btn-pause').addEventListener('click', () => game.togglePause());
function syncMuteBtn() {
  const muted = game.sound.muted;
  $('btn-mute').classList.toggle('muted', muted);
  const sm = $('btn-mute-settings');
  if (sm) sm.textContent = muted ? '🔇 MUTED' : '🔊 SOUND ON';
}
$('btn-mute').addEventListener('click', () => { game.toggleMute(); syncMuteBtn(); });
$('btn-mute-settings').addEventListener('click', () => { game.toggleMute(); syncMuteBtn(); });
$('btn-nav').addEventListener('click', () => ui.toggleNav());
$('nav-backdrop').addEventListener('click', () => ui.closeNav());
$('btn-garage').addEventListener('click', () => game.showGarage());
$('btn-garage-back').addEventListener('click', () => game.hideGarage());
$('btn-upgrades').addEventListener('click', () => game.showUpgrades());
$('btn-upgrades-back').addEventListener('click', () => game.hideUpgrades());
$('btn-missions').addEventListener('click', () => game.showMissions());
$('btn-missions-back').addEventListener('click', () => game.hideMissions());
$('btn-settings').addEventListener('click', () => game.showSettings());
$('btn-settings-back').addEventListener('click', () => game.hideSettings());
// Garage tabs: PAINT first (visible immediately), CARS one tap away.
function selectGarageTab(which) {
  const paint = which === 'paint';
  $('btn-garage-tab-paint').classList.toggle('active', paint);
  $('btn-garage-tab-cars').classList.toggle('active', !paint);
  $('garage-paint-section').classList.toggle('hidden', !paint);
  $('garage-cars-section').classList.toggle('hidden', paint);
}
$('btn-garage-tab-paint').addEventListener('click', () => { selectGarageTab('paint'); game.sound.click(); });
$('btn-garage-tab-cars').addEventListener('click', () => { selectGarageTab('cars'); game.sound.click(); });

// Nitro button: touch + mouse, no swipe interference
$('btn-nitro').addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); game.sound.unlock(); game.activateBoost(); }, { passive: false });
$('btn-nitro').addEventListener('mousedown', (e) => { e.preventDefault(); game.sound.unlock(); game.activateBoost(); });

game.input.bindButtons({ left: $('btn-left'), right: $('btn-right'), jump: $('btn-jump') });

// Quality toggle (pause + settings screens stay in sync via .quality-label)
for (const id of ['btn-quality', 'btn-quality-settings']) {
  const b = $(id);
  if (b) b.addEventListener('click', () => {
    game.sound.unlock();
    // Cycle Low → Medium → High (labels sync via .quality-label).
    const order = ['low', 'medium', 'high'];
    game.setQuality(order[(order.indexOf(game.quality) + 1) % order.length]);
    game.sound.click();
  });
}
// Independent music / sound volumes (pause + settings sliders stay synced).
function wireVolumes(a, b, setter) {
  const els = [$(a), $(b)].filter(Boolean);
  for (const el of els) {
    el.value = String(Math.round(setter.get() * 100));
    el.addEventListener('input', () => {
      setter.set(el.value / 100);
      for (const other of els) if (other !== el) other.value = el.value;
    });
  }
}
wireVolumes('vol-music', 'set-music', {
  get: () => game.sound.musicVol, set: (v) => game.sound.setMusicVolume(v),
});
wireVolumes('vol-sfx', 'set-sfx', {
  get: () => game.sound.sfxVol, set: (v) => game.sound.setSfxVolume(v),
});
// Reset progress: two-tap confirm (auto-disarms after 3 s).
let resetArmed = false, resetTimer = null;
function disarmReset() {
  resetArmed = false;
  clearTimeout(resetTimer);
  const b = $('btn-reset');
  if (b) { b.textContent = 'RESET PROGRESS'; b.classList.remove('armed'); }
}
$('btn-reset').addEventListener('click', () => {
  const b = $('btn-reset');
  game.sound.unlock();
  if (!resetArmed) {
    resetArmed = true;
    b.textContent = 'TAP AGAIN TO CONFIRM';
    b.classList.add('armed');
    game.sound.click();
    clearTimeout(resetTimer);
    resetTimer = setTimeout(disarmReset, 3000);
  } else {
    disarmReset();
    game.resetProgress();
  }
});
syncMuteBtn();

// Auto-pause when the tab is hidden (phone call, app switch, ...).
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state === 'playing') game.togglePause();
});

// Prevent pull-to-refresh / context menu / double-tap zoom on mobile.
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());
container.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

// Brand intro: YF reveal (~2.4 s), tap-to-skip after 0.6 s, once per tab
// session (a reload is not a fresh launch). ?nointro=1 skips instantly
// (automated tests). The sting plays on skip taps / when audio is already
// unlocked — never scheduled on a suspended context (no stale bursts).
const introEl = $('intro-screen');
let introDone = false;
let introT0 = 0;
function endIntro(withSound) {
  if (introDone || !introEl) return;
  introDone = true;
  introEl.classList.add('intro-done');
  try { sessionStorage.setItem('carway_intro_seen', '1'); } catch (e) {}
  if (withSound) {
    game.sound.unlock();
    game.sound.introSweep();
  }
  setTimeout(() => introEl.classList.add('hidden'), 400);
}
(function bootIntro() {
  if (!introEl) return;
  let skip = false;
  try {
    skip = new URLSearchParams(location.search).has('nointro') ||
      sessionStorage.getItem('carway_intro_seen') === '1';
  } catch (e) {
    skip = new URLSearchParams(location.search).has('nointro');
  }
  if (skip) {
    introDone = true;
    introEl.classList.add('hidden');
    return;
  }
  introEl.classList.add('intro-run');
  introT0 = performance.now();
  introEl.addEventListener('click', () => {
    game.sound.unlock(); // harvest the gesture even for early taps
    if (performance.now() - introT0 > 600) endIntro(true);
  });
  setTimeout(() => endIntro(!!(game.sound.ctx && game.sound.ctx.state === 'running')), 2400);
})();

// Expose for debugging / automated tests.
window.__carway = game;

// Go!
ui.showMenu(game.best);
game.refreshMenuUI();
game.frame();
