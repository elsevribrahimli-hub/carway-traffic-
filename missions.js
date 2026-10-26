// CARWAY TRAFFIC — Missions: pure definitions (no DOM/storage), so the
// progress/claim math stays unit-testable. Persistence lives in save.js.
export const MISSIONS = [
  { id: 'bank100', name: 'Treasure Hunter', desc: 'Bank 100 coins (all runs)', target: 100, reward: 50, type: 'banked' },
  { id: 'over30', name: 'Overtaker', desc: 'Overtake 30 cars in one run', target: 30, reward: 40, type: 'overtakes' },
  { id: 'dist2k', name: 'Marathon', desc: 'Drive 2,000 m in one run', target: 2000, reward: 40, type: 'distance' },
];

export function missionById(id) {
  return MISSIONS.find((m) => m.id === id) || null;
}

// Current progress value for a mission given save data + live run stats.
export function missionProgress(def, store, run) {
  if (def.type === 'banked') return store.totalBanked;
  if (def.type === 'overtakes') return Math.max(store.missions[def.id]?.progress || 0, run.overtakes);
  return Math.max(store.missions[def.id]?.progress || 0, Math.floor(run.distance));
}

// First incomplete mission (featured on the main menu), or null if all done.
export function featuredMission(store, run) {
  for (const def of MISSIONS) {
    if (!store.missions[def.id]?.done) return def;
  }
  return null;
}
