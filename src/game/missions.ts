import { useCallback, useEffect, useState } from "react";
import { cars, v2Cars, v2Of } from "./cars";
import { addXp, loadWallet } from "./xp";

/**
 * Missions: 3 active at a time, saved in localStorage as {exp, list:[{id, p(rogress)}]}.
 * A finished mission pays its XP once and stays marked as done; all 3 re-roll when the 24h timer runs out.
 */
const KEY = "lcs.missions";
const EVT = "lcs-missions";
export const DONE_EVT = "lcs-mission-done";
const DAY = 24 * 60 * 60 * 1000;
const V2_IDS = v2Cars.map((_, i) => cars.length + i);

export type Def = {
  id: string;
  name: string;
  desc: string;
  target: number;
  xp: number;
  unit?: string;
  /** only offered when this is true (e.g. don't ask for a V2 power the player can't use) */
  ok?: (owned: number[]) => boolean;
};
export type Slot = { id: string; p: number; d?: number[]; done?: boolean };
type State = { exp: number; list: Slot[] };

export const DEFS: Def[] = [
  { id: "first_blood", name: "First Blood", desc: "Get 1 kill in FFA", target: 1, xp: 150 },
  { id: "warm_up", name: "Warm-Up", desc: "Finish 3 matches in any mode", target: 3, xp: 250 },
  {
    id: "pickups",
    name: "Pickup Hunter",
    desc: "Collect 5 power-ups in a single match",
    target: 5,
    xp: 250,
  },
  { id: "hat_trick", name: "Hat Trick", desc: "Get 5 kills in one FFA match", target: 5, xp: 500 },
  { id: "podium", name: "Podium Finish", desc: "Finish top 3 in a Race", target: 1, xp: 100 },
  {
    id: "survivor",
    name: "Survivor",
    desc: "Stay alive for 5 minutes in FFA",
    target: 300,
    xp: 600,
    unit: "s",
  },
  { id: "garage_rat", name: "Garage Rat", desc: "Play 5 different cars", target: 5, xp: 400 },
  {
    id: "close_shave",
    name: "Close Shave",
    desc: "Win a match with under 10% HP left",
    target: 1,
    xp: 800,
  },
  {
    id: "comeback",
    name: "Comeback",
    desc: "Win a TDM match after being 20+ points behind",
    target: 1,
    xp: 1500,
  },
  {
    id: "untouchable",
    name: "Untouchable",
    desc: "Win an FFA match without taking any damage",
    target: 1,
    xp: 2000,
  },
  { id: "kill_v2", name: "V2 Hunter", desc: "Kill a V2 car", target: 1, xp: 1000 },
  {
    id: "road_warrior",
    name: "Road Warrior",
    desc: "Play 25 matches in total",
    target: 25,
    xp: 3000,
  },
  {
    id: "centurion",
    name: "Centurion",
    desc: "Get 100 total kills across all matches",
    target: 100,
    xp: 5000,
  },
  {
    id: "collector",
    name: "Collector",
    desc: "Own all V2 cars",
    target: V2_IDS.length,
    xp: 20000,
    ok: (o) => V2_IDS.some((i) => !o.includes(i)),
  },
  { id: "veteran", name: "Veteran", desc: "Win 50 matches in total", target: 50, xp: 10000 },
  {
    id: "frostbite",
    name: "Clone Wars",
    desc: "Land 3 kills with Blue Turret v2's Virtual Clones",
    target: 3,
    xp: 1500,
    ok: (o) => o.includes(v2Of(1)),
  },
  {
    id: "ghost",
    name: "Ghost Protocol",
    desc: "Get 3 kills during one Phantom v2 cloak",
    target: 3,
    xp: 1500,
    ok: (o) => o.includes(v2Of(5)),
  },
  {
    id: "brick",
    name: "Minefield",
    desc: "Blow up 3 opponents with Redline v2 landmines in one match",
    target: 3,
    xp: 1500,
    ok: (o) => o.includes(v2Of(6)),
  },
  {
    id: "sharpshooter",
    name: "Sharpshooter",
    desc: "Land 25 hits in one match",
    target: 25,
    xp: 500,
  },
  { id: "top3_ffa", name: "Top Three", desc: "Finish in the top 3 in FFA", target: 1, xp: 300 },
  { id: "streak", name: "Hot Streak", desc: "Win 3 matches in a row", target: 3, xp: 1500 },
  { id: "tdm_wins", name: "Team Victory", desc: "Win 5 TDM matches", target: 5, xp: 1200 },
  {
    id: "tdm_slayer",
    name: "Team Slayer",
    desc: "Get 10 kills in one TDM match",
    target: 10,
    xp: 800,
  },
  { id: "ffa_champ", name: "FFA Champion", desc: "Win 10 FFA matches", target: 10, xp: 2000 },
  { id: "spender", name: "Big Spender", desc: "Buy a car in the garage", target: 1, xp: 500 },
  {
    id: "hoarder",
    name: "Power Hoarder",
    desc: "Collect 30 power-ups in total",
    target: 30,
    xp: 1000,
  },
  { id: "race_win", name: "Race Winner", desc: "Win a Race", target: 1, xp: 600 },
  {
    id: "nitro_hunter",
    name: "Nitro Hunter",
    desc: "Collect 5 nitro pickups in one Race",
    target: 5,
    xp: 400,
  },
  {
    id: "close_calls",
    name: "Close Calls",
    desc: "Get 15 near misses in one Race",
    target: 15,
    xp: 500,
  },
  {
    id: "clean_driver",
    name: "Clean Driver",
    desc: "Finish a Race without blowing up",
    target: 1,
    xp: 700,
  },
  {
    id: "time_lord",
    name: "Clone Master",
    desc: "Use Virtual Clone 3 times",
    target: 3,
    xp: 1000,
    ok: (o) => o.includes(v2Of(1)),
  },
  {
    id: "ghost_walker",
    name: "Ghost Walker",
    desc: "Use the Phantom cloak 3 times",
    target: 3,
    xp: 1000,
    ok: (o) => o.includes(v2Of(5)),
  },
  {
    id: "fortress",
    name: "Mine Layer",
    desc: "Drop 3 Magnetic Splash landmines",
    target: 3,
    xp: 1000,
    ok: (o) => o.includes(v2Of(6)),
  },
  {
    id: "turret_master",
    name: "Turret Master",
    desc: "Use the Military Jeep auto turret 3 times",
    target: 3,
    xp: 1000,
    ok: (o) => o.includes(v2Of(2)),
  },
  { id: "rampage", name: "Rampage", desc: "Get 8 kills in one FFA match", target: 8, xp: 2500 },
];
export const defOf = (id: string) => DEFS.find((d) => d.id === id);

const ownedV2 = () => V2_IDS.filter((i) => loadWallet().owned.includes(i)).length;

function pick(avoid: string[]): Slot {
  const owned = loadWallet().owned;
  const pool = DEFS.filter((d) => !avoid.includes(d.id) && (!d.ok || d.ok(owned)));
  const d = pool[Math.floor(Math.random() * pool.length)] ?? (DEFS[0] as Def);
  return { id: d.id, p: d.id === "collector" ? ownedV2() : 0 };
}
function fresh(): State {
  const list: Slot[] = [];
  for (let i = 0; i < 3; i++) list.push(pick(list.map((s) => s.id)));
  return { exp: Date.now() + DAY, list };
}
function write(s: State) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
  try {
    window.dispatchEvent(new Event(EVT));
  } catch {
    /* ignore */
  }
}
/** current missions; makes a new set when there is none or the 24h timer ran out */
export function readMissions(): State {
  let s: State | null = null;
  try {
    const j = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (j && Array.isArray(j.list) && typeof j.exp === "number") {
      s = { exp: j.exp, list: j.list.filter((x: Slot) => x && defOf(x.id)) };
    }
  } catch {
    s = null;
  }
  if (!s || s.list.length < 3 || Date.now() >= s.exp) {
    s = fresh();
    write(s);
  }
  return s;
}

function set(id: string, value: number, d?: number[]) {
  const s = readMissions();
  const i = s.list.findIndex((x) => x.id === id);
  if (i < 0) return;
  const slot = s.list[i] as Slot;
  const def = defOf(id) as Def;
  if (slot.done) return; // already paid; it stays on the list until the 24h timer re-rolls everything
  const p = Math.min(def.target, Math.max(slot.p, value));
  if (p === slot.p && !d) return;
  slot.p = p;
  if (d) slot.d = d;
  if (p >= def.target) {
    addXp(def.xp);
    try {
      window.dispatchEvent(new CustomEvent(DONE_EVT, { detail: { name: def.name, xp: def.xp } }));
    } catch {
      /* ignore */
    }
    slot.done = true;
  }
  write(s);
}
function add(id: string, n = 1) {
  const x = readMissions().list.find((m) => m.id === id);
  if (x) set(id, x.p + n);
}

/* ---------- match events (called from the game) ---------- */
const ms = {
  ffa: false,
  tdm: false,
  hits: 0,
  kills: 0,
  pickups: 0,
  blocks: 0,
  ghost: 0,
  dmg: false,
  behind: 0,
  t: 0,
  sec: -1,
};

export function mStart(mode: "ffa" | "tdm" | "race", car: number) {
  Object.assign(ms, {
    ffa: mode === "ffa",
    tdm: mode === "tdm",
    hits: 0,
    kills: 0,
    pickups: 0,
    blocks: 0,
    ghost: 0,
    dmg: false,
    behind: 0,
    t: 0,
    sec: -1,
  });
  const x = readMissions().list.find((m) => m.id === "garage_rat");
  if (x && !(x.d ?? []).includes(car))
    set("garage_rat", (x.d ?? []).length + 1, [...(x.d ?? []), car]);
}
export function mKill(o: { victimV2: boolean; byClone: boolean; ghost: boolean }) {
  ms.kills++;
  add("centurion");
  if (ms.ffa) {
    add("first_blood");
    set("hat_trick", ms.kills);
    set("rampage", ms.kills);
  }
  if (ms.tdm) set("tdm_slayer", ms.kills);
  if (o.victimV2) add("kill_v2");
  if (o.byClone) add("frostbite");
  if (o.ghost) set("ghost", ++ms.ghost);
}
export function mHit() {
  set("sharpshooter", ++ms.hits);
}
export function mPickup() {
  add("hoarder");
  set("pickups", ++ms.pickups);
}
/** a Redline v2 landmine just killed someone */
export function mMine() {
  set("brick", ++ms.blocks);
}
export const mDamage = () => {
  ms.dmg = true;
};
export const mPower = (kind: string) => {
  const use = {
    clone: "time_lord",
    ghost: "ghost_walker",
    mine: "fortress",
    turret: "turret_master",
  }[kind];
  if (use) add(use);
  if (kind === "ghost") ms.ghost = 0; // "during one cloak" starts counting from zero each time
};
export function mBehind(n: number) {
  if (n > ms.behind) ms.behind = n;
}
/** seconds alive in FFA, called every frame */
export function mAlive(dt: number) {
  ms.t += dt;
  const s = Math.floor(ms.t);
  if (s !== ms.sec) {
    ms.sec = s;
    set("survivor", s);
  }
}
export function mEnd(o: {
  mode: "ffa" | "tdm" | "race";
  won: boolean;
  top3?: boolean;
  hpFrac?: number;
  position?: number;
  race?: { nitros: number; near: number; blasts: number };
}) {
  let run = 0;
  try {
    run = o.won ? (Number(localStorage.getItem("lcs.streak")) || 0) + 1 : 0;
    localStorage.setItem("lcs.streak", String(run));
  } catch {
    run = o.won ? 1 : 0;
  }
  if (run) set("streak", run);
  if (o.mode === "ffa") {
    if ((o.position ?? 99) <= 3) add("top3_ffa");
    if (o.won) add("ffa_champ");
  }
  if (o.mode === "tdm" && o.won) add("tdm_wins");
  if (o.mode === "race" && o.race) {
    if (o.won) add("race_win");
    set("nitro_hunter", o.race.nitros);
    set("close_calls", o.race.near);
    if (o.race.blasts === 0) add("clean_driver");
  }
  add("warm_up");
  add("road_warrior");
  if (o.won) add("veteran");
  if (o.mode === "race" && o.top3) add("podium");
  if (o.won && (o.hpFrac ?? 1) < 0.1) add("close_shave");
  if (o.mode === "tdm" && o.won && ms.behind >= 20) add("comeback");
  if (o.mode === "ffa" && o.won && !ms.dmg) add("untouchable");
}
export const mBuy = () => {
  set("collector", ownedV2());
  add("spender");
};

/** live missions for the UI */
export function useMissions() {
  const [s, setS] = useState<State | null>(null);
  const refresh = useCallback(() => setS(readMissions()), []);
  useEffect(() => {
    refresh();
    window.addEventListener(EVT, refresh);
    return () => window.removeEventListener(EVT, refresh);
  }, [refresh]);
  return { state: s, refresh };
}
