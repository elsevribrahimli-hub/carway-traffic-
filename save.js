// CARWAY TRAFFIC — SaveData: coin balance, unlocked paints, selected paint,
// jump skill level, lifetime stats and mission progress. Uses localStorage
// when available, transparent in-memory fallback otherwise (private mode, tests).
import { MISSIONS, missionProgress } from './missions.js';
import { UPGRADE_IDS, upgradeDef, upgradePrice, clampUpgradeLevel } from '../config.js';

export class SaveData {
  // storage: optional Web Storage (defaults to localStorage when present).
  constructor(storage = null) {
    this.storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    this.mem = {};
    this.data = {
      coins: this._get('coins', 0),
      paints: this._get('paints', ['red', 'silver']),
      paint: this._get('paint', 'red'),
      cars: this._get('cars', ['roadster']),
      car: this._get('car', 'roadster'),
      totalBanked: this._get('totalBanked', 0),
      missions: this._get('missions', {}),
      upgrades: this._get('upgrades', null),
    };
    if (!this.data.paints.includes(this.data.paint)) this.data.paint = 'red';
    if (!this.data.paints.includes('red')) this.data.paints.unshift('red');
    if (!this.data.paints.includes('silver')) this.data.paints.unshift('silver');
    // Car migration: every save owns the roadster; unknown selections reset.
    if (!Array.isArray(this.data.cars) || !this.data.cars.length) this.data.cars = ['roadster'];
    if (!this.data.cars.includes('roadster')) this.data.cars.unshift('roadster');
    if (!this.data.cars.includes(this.data.car)) this.data.car = 'roadster';
    if (!this.data.upgrades) {
      // Migrate the legacy 0..3 jump skill into the 5-level ladder. Old
      // airtimes were [1.15, 1.30, 1.45, 1.60]s; round UP so nobody loses
      // airtime they already paid for (new: 1.15/1.25/1.35/1.45/1.60).
      const oldJump = this._get('jumpLevel', 0);
      const map = [1, 3, 4, 5];
      const j = (typeof oldJump === 'number' && oldJump >= 0 && oldJump <= 3) ? map[oldJump] : 1;
      this.data.upgrades = { shield: 1, magnet: 1, coin2x: 1, jump: j };
      try { if (this.storage) this.storage.removeItem('carway_jumpLevel'); } catch (e) {}
      this._set('upgrades', this.data.upgrades);
    }
    this.validateUpgrades();
  }

  // Clamp every upgrade level to 1..max (also called when a run starts).
  // Repairs hand-edited or corrupt saves instead of crashing on them.
  validateUpgrades() {
    if (!this.data.upgrades || typeof this.data.upgrades !== 'object') {
      this.data.upgrades = { shield: 1, magnet: 1, coin2x: 1, jump: 1 };
    }
    for (const id of UPGRADE_IDS) {
      this.data.upgrades[id] = clampUpgradeLevel(this.data.upgrades[id]);
    }
    this._set('upgrades', this.data.upgrades);
    return this.data.upgrades;
  }

  _get(key, fallback) {
    try {
      if (this.storage) {
        const raw = this.storage.getItem('carway_' + key);
        return raw === null ? fallback : JSON.parse(raw);
      }
      return key in this.mem ? this.mem[key] : fallback;
    } catch (e) { return fallback; }
  }

  _set(key, value) {
    this.data[key] = value;
    try {
      if (this.storage) this.storage.setItem('carway_' + key, JSON.stringify(value));
      else this.mem[key] = value;
    } catch (e) { /* storage unsupported: in-memory only */ }
  }

  _persist() {
    for (const k of ['coins', 'paints', 'paint', 'cars', 'car', 'totalBanked', 'missions', 'upgrades']) this._set(k, this.data[k]);
  }

  // Bank run earnings into the persistent balance. Returns missions completed.
  bankRun(coinCount, run) {
    if (coinCount > 0) {
      this.data.coins += coinCount;
      this.data.totalBanked += coinCount;
    }
    const completed = this.checkMissions(run);
    this._persist();
    return completed;
  }

  ownsPaint(id) { return this.data.paints.includes(id); }

  // Buy + auto-select. Only deducts when the purchase is valid.
  // paintDef: { id, price }. Returns { ok, reason }.
  buyPaint(paintDef) {
    if (!paintDef || !paintDef.id) return { ok: false, reason: 'invalid' };
    if (this.ownsPaint(paintDef.id)) { this.selectPaint(paintDef.id); return { ok: true, reason: 'owned' }; }
    if (this.data.coins < paintDef.price) return { ok: false, reason: 'coins' };
    this.data.coins -= paintDef.price;
    this.data.paints.push(paintDef.id);
    this.data.paint = paintDef.id;
    this._persist();
    return { ok: true, reason: 'bought' };
  }

  selectPaint(id) {
    if (!this.ownsPaint(id)) return false;
    this.data.paint = id;
    this._set('paint', id);
    return true;
  }

  ownsCar(id) { return this.data.cars.includes(id); }

  // Buy + auto-select a garage car. Only deducts when valid.
  // carDef: { id, price }. Returns { ok, reason }.
  buyCar(carDef) {
    if (!carDef || !carDef.id) return { ok: false, reason: 'invalid' };
    if (this.ownsCar(carDef.id)) { this.selectCar(carDef.id); return { ok: true, reason: 'owned' }; }
    if (this.data.coins < carDef.price) return { ok: false, reason: 'coins' };
    this.data.coins -= carDef.price;
    this.data.cars.push(carDef.id);
    this.data.car = carDef.id;
    this._persist();
    return { ok: true, reason: 'bought' };
  }

  selectCar(id) {
    if (!this.ownsCar(id)) return false;
    this.data.car = id;
    this._set('car', id);
    return true;
  }

  // Buy the next level of a power-up upgrade with coins. Only deducts when
  // the purchase is valid (known id + affordable + not maxed).
  // Returns { ok, reason, level, cost } (level = arrival level).
  buyUpgrade(id) {
    if (!upgradeDef(id)) return { ok: false, reason: 'invalid', level: 1, cost: null };
    this.validateUpgrades();
    const level = this.data.upgrades[id];
    const cost = upgradePrice(id, level);
    if (cost === null) return { ok: false, reason: 'maxed', level, cost: null };
    if (this.data.coins < cost) return { ok: false, reason: 'coins', level, cost };
    this.data.coins -= cost;
    this.data.upgrades[id] = level + 1;
    this._persist();
    return { ok: true, reason: 'bought', level: level + 1, cost };
  }

  // Wipe gameplay progress (coins, unlocks, missions, upgrades, best) after
  // an explicit two-tap confirmation in Settings. Quality + volume
  // preferences are NOT progress, so they are preserved.
  resetProgress() {
    for (const k of ['coins', 'paints', 'paint', 'cars', 'car', 'totalBanked', 'missions', 'upgrades', 'jumpLevel', 'best']) {
      try { if (this.storage) this.storage.removeItem('carway_' + k); else delete this.mem[k]; }
      catch (e) {}
    }
    this.data = {
      coins: 0,
      paints: ['red', 'silver'],
      paint: 'red',
      cars: ['roadster'],
      car: 'roadster',
      totalBanked: 0,
      missions: {},
      upgrades: { shield: 1, magnet: 1, coin2x: 1, jump: 1 },
    };
    this._persist();
  }

  // Update mission progress from live run stats { overtakes, distance }.
  // Auto-claims rewards. Returns newly completed mission defs.
  checkMissions(run) {
    const completed = [];
    for (const def of MISSIONS) {
      const st = this.data.missions[def.id] || (this.data.missions[def.id] = { progress: 0, done: false });
      if (st.done) continue;
      const cur = missionProgress(def, this.data, run);
      st.progress = Math.min(cur, def.target);
      if (cur >= def.target) {
        st.done = true;
        this.data.coins += def.reward;
        completed.push(def);
      }
    }
    this._persist();
    return completed;
  }
}
