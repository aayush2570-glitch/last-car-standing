import { PAL, carAt, cars, drawFallbackCar, getSprites, spriteReady } from "./cars";
import { Fx, type Sfx } from "./fx";
import crateImg from "@/assets/race/crates.webp";
import drumImg from "@/assets/race/drum.webp";
import jerseyImg from "@/assets/race/jersey.webp";
import laserImg from "@/assets/race/laser.webp";
import nitroImg from "@/assets/race/nitro.webp";
import oilImg from "@/assets/race/oil.webp";
import sawhorseImg from "@/assets/race/sawhorse.webp";
import tiresImg from "@/assets/race/tires.webp";
import truckImg from "@/assets/race/truck.webp";

const PROP_URLS = {
  crates: crateImg,
  drum: drumImg,
  jersey: jerseyImg,
  laser: laserImg,
  nitro: nitroImg,
  oil: oilImg,
  sawhorse: sawhorseImg,
  tires: tiresImg,
  truck: truckImg,
};
type PropName = keyof typeof PROP_URLS;
let propCache: Record<PropName, HTMLImageElement> | null = null;
/** Obstacle / pickup artwork (transparent webp, already oriented: truck faces up the road). */
function getProps() {
  if (propCache) return propCache;
  const o = {} as Record<PropName, HTMLImageElement>;
  for (const k of Object.keys(PROP_URLS) as PropName[]) {
    const img = new Image();
    img.src = PROP_URLS[k];
    o[k] = img;
  }
  return (propCache = o);
}

/**
 * SPEED mode: top-down race through four zones (neon city, sunset canyon, frozen highway, lava inferno).
 * Cars accelerate on their own, you steer. NITRO is no longer free: grab glowing nitro canisters
 * (guarded by hazards), then HOLD the nitro key / button to burn the tank for a huge speed boost.
 * Obstacles: drums, barriers, water cannons, cones, oil slicks, mines, explosive drums and slow trucks.
 * Mines, explosive drums and trucks hit at speed BLOW YOUR CAR UP (you respawn after a moment).
 * Simulation (class Race) is DOM-free; RaceView adds juice (particles, shake, sound, HUD).
 * Only plain hex colours and basic canvas calls are used (Chrome 109 safe).
 */

export const LEN = 22000;
export const HALF = 320;
const N = 8;
const FIRE = 1.38; // speed multiplier while nitro burns
const NITRO_USE = 0.3; // tank per second (a full tank lasts ~3.3 s)
const NITRO_PICK = 0.55; // tank gained from a canister
const PERIOD = 3.4;
const ZLEN = LEN / 4;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const hs = (i: number, s: number) => {
  const h = Math.imul(i * 31 + s * 17 + 5, 2654435761);
  return (((h ^ (h >>> 15)) >>> 0) % 1000) / 1000;
};

/** Road centre line: gentle S-bends, dead straight on the starting grid. */
export const roadX = (y: number) => {
  const d = -y;
  return (
    clamp((d - 300) / 700, 0, 1) * (220 * Math.sin(d * 0.0008) + 90 * Math.sin(d * 0.002 + 1.3))
  );
};

/* ───────────────────────────── zones (map themes) ───────────────────────────── */

export type Decor = "city" | "desert" | "ice" | "lava";
type ZoneCols = {
  ground: string;
  grid: string;
  floor: string;
  floorAlt: string;
  bldg: string;
  roof: string;
  w1: string;
  w2: string;
  rail1: string;
  rail2: string;
  line: string;
};
export type Zone = ZoneCols & { name: string; decor: Decor };
const COLKEYS: (keyof ZoneCols)[] = [
  "ground",
  "grid",
  "floor",
  "floorAlt",
  "bldg",
  "roof",
  "w1",
  "w2",
  "rail1",
  "rail2",
  "line",
];
export const ZONES: Zone[] = [
  {
    name: "NEON CITY",
    decor: "city",
    ground: PAL.ground,
    grid: PAL.grid,
    floor: PAL.floor,
    floorAlt: PAL.floorAlt,
    bldg: PAL.building,
    roof: PAL.roof,
    w1: PAL.window,
    w2: PAL.windowCyan,
    rail1: PAL.cyan,
    rail2: PAL.magenta,
    line: "#ffffff",
  },
  {
    name: "SUNSET CANYON",
    decor: "desert",
    ground: "#3a1a10",
    grid: "#6b3418",
    floor: "#4a2a22",
    floorAlt: "#563128",
    bldg: "#8a4a26",
    roof: "#c47a44",
    w1: "#ffb347",
    w2: "#ff6a3d",
    rail1: "#ffb347",
    rail2: "#ff4b2b",
    line: "#ffe9b0",
  },
  {
    name: "FROZEN HIGHWAY",
    decor: "ice",
    ground: "#0a1a33",
    grid: "#1f4a80",
    floor: "#16315a",
    floorAlt: "#1b3a6a",
    bldg: "#2a5a8a",
    roof: "#bfe9ff",
    w1: "#9be8ff",
    w2: "#ffffff",
    rail1: "#7fe0ff",
    rail2: "#c9a8ff",
    line: "#dff6ff",
  },
  {
    name: "LAVA INFERNO",
    decor: "lava",
    ground: "#150606",
    grid: "#5a1a10",
    floor: "#26100f",
    floorAlt: "#321614",
    bldg: "#1a0c0c",
    roof: "#2a1210",
    w1: "#ff7a1a",
    w2: "#ffd23d",
    rail1: "#ff4b2b",
    rail2: "#ffb347",
    line: "#ffb08a",
  },
];
const rgb = (h: string) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];
const mix = (a: string, b: string, t: number) => {
  const p = rgb(a),
    q = rgb(b);
  const c = (i: number) =>
    Math.round((p[i] as number) + ((q[i] as number) - (p[i] as number)) * t)
      .toString(16)
      .padStart(2, "0");
  return `#${c(0)}${c(1)}${c(2)}`;
};
export const zoneIndex = (y: number) => clamp(Math.floor(Math.max(0, -y) / ZLEN), 0, 3);
const zcache = new Map<string, Zone>();
/** Zone palette at world y; colours cross-fade over the last 700 units before a zone border. */
export function zoneAt(y: number): Zone {
  const i = zoneIndex(y);
  const BL = 700;
  const t = i < 3 ? clamp((Math.max(0, -y) - ((i + 1) * ZLEN - BL)) / BL, 0, 1) : 0;
  const q = Math.round(t * 12);
  const key = `${i}:${q}`;
  const hit = zcache.get(key);
  if (hit) return hit;
  const a = ZONES[i] as Zone,
    b = ZONES[Math.min(3, i + 1)] as Zone;
  const z = { ...(q > 6 ? b : a) } as Zone;
  for (const k of COLKEYS) z[k] = mix(a[k], b[k], q / 12);
  zcache.set(key, z);
  return z;
}

/* ───────────────────────────── simulation ───────────────────────────── */

export type Kind =
  "drum" | "barrier" | "cannon" | "cone" | "oil" | "mine" | "tdrum" | "truck" | "crates";
export type Obs = {
  kind: Kind;
  x: number;
  y: number;
  hw: number;
  hh: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  gone: number; // 0 solid, >0 flying away, -1 removed
  side: number;
  off: number; // lateral offset from road centre (moving trucks follow the bends)
  t0: number;
  min: number;
  nm: boolean;
  on: boolean;
  hit: boolean;
};
export type Pickup = { x: number; y: number; taken: boolean; ph: number };
export type Racer = {
  id: number;
  x: number;
  y: number;
  v: number;
  vx: number;
  maxV: number;
  fire: boolean; // nitro burning
  nitro: number; // tank 0..1
  want: boolean; // bot wants nitro
  dead: number; // >0 = wrecked, counting down to respawn
  ang: number;
  inv: number;
  slip: number;
  bot: boolean;
  skill: number;
  lane: number;
  think: number;
  fin: number;
  hits: number;
  blasts: number;
  bump: number;
  top: number;
};
export type Ev = {
  t:
    | "cd"
    | "go"
    | "ignite"
    | "hit"
    | "near"
    | "bump"
    | "jet"
    | "finish"
    | "scrape"
    | "pick"
    | "blast"
    | "boom"
    | "respawn";
  c?: Racer;
  k?: Kind;
  n?: number;
  o?: Obs;
  fire?: boolean;
  x?: number;
  y?: number;
};
export type RaceResult = {
  pos: number;
  time: number;
  top: number;
  hits: number;
  near: number;
  blasts: number;
  nitros: number;
  xp: number;
  total: number;
};

const SOLID: Kind[] = ["drum", "barrier", "tdrum", "mine", "truck", "crates"];
// obstacle mix per zone: drum, barrier, cannon(laser), cone, oil, mine, tdrum, truck, crates
const MIX = [
  [30, 22, 16, 32, 0, 0, 0, 0, 14],
  [16, 14, 10, 14, 14, 8, 8, 16, 14],
  [12, 12, 16, 8, 28, 6, 4, 14, 6],
  [8, 8, 6, 6, 10, 22, 18, 22, 4],
];
const KINDS: Kind[] = [
  "drum",
  "barrier",
  "cannon",
  "cone",
  "oil",
  "mine",
  "tdrum",
  "truck",
  "crates",
];

export class Race {
  cars: Racer[] = [];
  obs: Obs[] = [];
  picks: Pickup[] = [];
  ev: Ev[] = [];
  me: Racer;
  clock = -3.4;
  order: Racer[] = [];
  near = 0;
  nitros = 0;
  private cd = 4;
  private went = false;

  constructor(pick: number) {
    const slots = [0, 1, 2, 3, 4, 5, 6, 7].sort(() => Math.random() - 0.5);
    const mine = slots.indexOf(2 + Math.floor(Math.random() * 4));
    [slots[0], slots[mine]] = [slots[mine] as number, slots[0] as number];
    const cols = [-170, 0, 170];
    for (let i = 0; i < N; i++) {
      const id = (pick + i) % cars.length;
      const s = slots[i] as number;
      const base = 330 + carAt(id).speed * 3.2;
      const bot = i > 0;
      this.cars.push({
        id,
        x: cols[s % 3] as number,
        y: 90 + Math.floor(s / 3) * 150,
        v: 0,
        vx: 0,
        maxV: bot ? base * rnd(0.95, 1.01) : base,
        fire: false,
        nitro: 0,
        want: false,
        dead: 0,
        ang: 0,
        inv: 0,
        slip: 0,
        bot,
        skill: rnd(0.7, 0.97),
        lane: 0,
        think: Math.random() * 0.1,
        fin: 0,
        hits: 0,
        blasts: 0,
        bump: 0,
        top: 0,
      });
    }
    this.me = this.cars[0] as Racer;
    this.genObstacles();
  }

  private genObstacles() {
    const add = (kind: Kind, x: number, y: number, hw: number, hh: number, side = 0, vy = 0) =>
      this.obs.push({
        kind,
        x,
        y,
        hw,
        hh,
        vx: 0,
        vy,
        rot: 0,
        vr: 0,
        gone: 0,
        side,
        off: x - roadX(y),
        t0: Math.random() * PERIOD,
        min: 999,
        nm: false,
        on: false,
        hit: false,
      });
    for (let d = 1100; d < LEN - 700; d += rnd(240, 420)) {
      const z = Math.min(3, Math.floor(d / ZLEN));
      const y = -d;
      const rx = roadX(y);
      const w = MIX[z] as number[];
      let r = Math.random() * w.reduce((a, b) => a + b, 0),
        k = 0;
      while (k < w.length - 1 && r >= (w[k] as number)) r -= w[k++] as number;
      const kind = KINDS[k] as Kind;
      if (kind === "drum") {
        const n = 1 + Math.floor(Math.random() * 3);
        const base = rnd(-HALF + 40, HALF - 40 - (n - 1) * 42);
        for (let j = 0; j < n; j++)
          add("drum", rx + base + j * 42 + rnd(-5, 5), y + rnd(-8, 8), 18, 18);
      } else if (kind === "barrier") {
        if (Math.random() < 0.3) {
          add("barrier", rx - (HALF - 90), y, 90, 17);
          add("barrier", rx + (HALF - 90), y, 90, 17);
        } else add("barrier", rx + rnd(-HALF + 100, HALF - 100), y, 90, 17);
      } else if (kind === "cannon") {
        const side = Math.random() < 0.5 ? -1 : 1;
        add("cannon", rx + side * (HALF - 200), y, 200, 16, side);
      } else if (kind === "cone") {
        const n = 3 + Math.floor(Math.random() * 4);
        const dir = Math.random() < 0.5 ? -1 : 1;
        const base = rnd(-HALF + 60, HALF - 60 - n * 26);
        for (let j = 0; j < n; j++)
          add("cone", rx + (dir > 0 ? base + j * 26 : base + (n - j) * 26), y + j * 16, 10, 10);
      } else if (kind === "oil") {
        add("oil", rx + rnd(-HALF + 100, HALF - 100), y, 62, 44);
      } else if (kind === "mine") {
        const n = 1 + Math.floor(Math.random() * 3);
        for (let j = 0; j < n; j++)
          add("mine", rx + rnd(-HALF + 50, HALF - 50), y + rnd(-60, 60), 16, 16);
      } else if (kind === "crates") {
        const n = 1 + (Math.random() < 0.4 ? 1 : 0);
        const base = rnd(-HALF + 60, HALF - 60 - n * 90);
        for (let j = 0; j < n; j++) add("crates", rx + base + j * 92, y + rnd(-10, 10), 40, 34);
      } else if (kind === "tdrum") {
        const base = rnd(-HALF + 60, HALF - 100);
        add("tdrum", rx + base, y, 18, 18);
        if (Math.random() < 0.6) add("tdrum", rx + base + 40, y + rnd(-10, 10), 18, 18);
        if (Math.random() < 0.4) add("drum", rx + base + 80, y + rnd(-10, 10), 18, 18);
      } else {
        add("truck", rx + rnd(-HALF + 70, HALF - 70), y, 28, 60, 0, -rnd(110, 190));
      }
    }
    // nitro canisters: rare, off to the side, guarded by hazards
    for (let d = 1500; d < LEN - 900; d += rnd(1800, 2700)) {
      const y = -d;
      const x = roadX(y) + ((Math.floor(Math.random() * 3) - 1) * 190 + rnd(-30, 30));
      this.obs = this.obs.filter((o) => !(Math.abs(o.y - y) < 90 && Math.abs(o.x - x) < 80));
      this.picks.push({ x, y, taken: false, ph: Math.random() * 6 });
      const z = Math.min(3, Math.floor(d / ZLEN));
      const guard: Kind = z === 0 ? "cone" : z === 2 ? "oil" : "mine";
      for (const s of [-1, 1]) {
        const gx = x + s * (guard === "oil" ? 100 : 78);
        if (Math.abs(gx - roadX(y)) < HALF - 30)
          add(
            guard,
            gx,
            y - 30,
            guard === "oil" ? 56 : guard === "cone" ? 10 : 16,
            guard === "oil" ? 40 : guard === "cone" ? 10 : 16,
          );
      }
    }
  }

  phase(o: Obs) {
    return (((this.clock + o.t0) % PERIOD) + PERIOD) % PERIOD;
  }
  jetOn(o: Obs) {
    return this.phase(o) >= 2.5;
  }
  jetSoon(o: Obs) {
    return this.phase(o) >= 1.2;
  }
  rank(c: Racer) {
    let r = 1;
    for (const o of this.cars) if (o.y < c.y) r++;
    return r;
  }

  step(dt: number, steer: number, nitro: boolean) {
    this.clock += dt;
    if (this.clock < 0) {
      const n = Math.ceil(-this.clock);
      if (n !== this.cd && n <= 3) {
        this.cd = n;
        this.ev.push({ t: "cd", n });
      }
    } else if (!this.went) {
      this.went = true;
      this.ev.push({ t: "go" });
    }
    for (const o of this.obs) {
      if (o.kind === "cannon") {
        const on = this.jetOn(o);
        if (on && !o.on) this.ev.push({ t: "jet", o });
        o.on = on;
      } else if (o.gone > 0) {
        o.x += o.vx * dt;
        o.y += o.vy * dt;
        o.rot += o.vr * dt;
        o.gone -= dt;
        if (o.gone <= 0) o.gone = -1;
      } else if (o.kind === "truck" && o.gone === 0 && this.clock > 0) {
        o.y += o.vy * dt;
        o.x = roadX(o.y) + o.off;
      }
    }
    const go = this.clock >= 0;
    for (const c of this.cars)
      this.drive(c, dt, go, c === this.me && !c.fin ? steer : undefined, nitro);
    this.collide();
  }

  private drive(c: Racer, dt: number, go: boolean, steer: number | undefined, nit: boolean) {
    const car = carAt(c.id);
    c.inv = Math.max(0, c.inv - dt);
    c.slip = Math.max(0, c.slip - dt);
    c.bump = Math.max(0, c.bump - dt);
    if (c.dead > 0) {
      c.dead -= dt;
      if (c.dead <= 0) {
        c.dead = 0;
        c.inv = 2;
        c.v = c.maxV * 0.4;
        const rx = roadX(c.y);
        c.x = rx + clamp(c.x - rx, -HALF + 90, HALF - 90);
        this.ev.push({ t: "respawn", c });
      }
      return;
    }
    const target = steer === undefined ? this.ai(c, dt) : steer;
    if (!go) return;
    // nitro: needs a tank, burns while the key is held
    const want = steer === undefined ? c.want : nit;
    const burn = !c.fin && want && (c.fire || c.nitro > 0.12);
    if (burn && !c.fire) {
      c.fire = true;
      this.ev.push({ t: "ignite", c });
    } else if (!burn && c.fire) c.fire = false;
    if (c.fire) {
      c.nitro = Math.max(0, c.nitro - NITRO_USE * dt);
      if (c.nitro <= 0) c.fire = false;
    }
    let cap = c.maxV * (c.fire ? FIRE : 1);
    if (c.fin) cap = c.maxV * 0.45;
    else if (c.bot) cap *= clamp(1 - (this.me.y - c.y) * 0.00012, 0.93, 1.07);
    const acc = c.fire ? 340 : 150 + 240 * Math.max(0, 1 - c.v / c.maxV);
    c.v = c.v < cap ? Math.min(cap, c.v + acc * dt) : Math.max(cap, c.v - 300 * dt);
    c.top = Math.max(c.top, c.v);
    const lat = 380;
    const grip = c.slip > 0 ? 2.2 : zoneIndex(c.y) === 2 ? 4.5 : 8; // ice is slippery
    c.vx += (target * lat - c.vx) * Math.min(1, dt * grip);
    c.x += c.vx * dt;
    c.y -= c.v * dt;
    c.ang =
      clamp((c.vx / lat) * 0.4, -0.4, 0.4) +
      (c.slip > 0 ? Math.sin(c.slip * 24) * 0.25 * Math.min(1, c.slip) : 0);
    // road edges: scrape, lose a little speed
    const lim = HALF - car.w * 0.5 - 4;
    const off = c.x - roadX(c.y);
    if (Math.abs(off) > lim) {
      const s = Math.sign(off);
      c.x = roadX(c.y) + s * lim;
      if (c.vx * s > 0) c.vx *= -0.2;
      c.v *= 1 - 0.7 * dt;
      if (c.bump <= 0) {
        c.bump = 0.1;
        this.ev.push({ t: "scrape", c, x: c.x + s * car.w * 0.5, y: c.y });
      }
    }
    if (!c.fin && -c.y >= LEN) {
      c.fin = Math.max(0.01, this.clock);
      c.fire = false;
      this.order.push(c);
      this.ev.push({ t: "finish", c });
    }
    const hx = car.w * 0.4,
      hy = car.h * 0.42;
    // nitro canisters
    for (const p of this.picks) {
      if (p.taken || Math.abs(p.y - c.y) > 120 || c.fin) continue;
      if (Math.abs(c.x - p.x) < hx + 26 && Math.abs(c.y - p.y) < hy + 26) {
        p.taken = true;
        c.nitro = Math.min(1, c.nitro + NITRO_PICK);
        if (c === this.me) this.nitros++;
        this.ev.push({ t: "pick", c, x: p.x, y: p.y });
      }
    }
    // obstacles
    for (const o of this.obs) {
      if (o.gone !== 0 || Math.abs(o.y - c.y) > 160) continue;
      if (o.kind === "cannon" && !this.jetOn(o)) continue;
      const jx = o.kind === "cannon" ? roadX(o.y) + o.side * (HALF - 200) : o.x;
      const dx = Math.abs(c.x - jx) - hx - o.hw;
      const dy = Math.abs(c.y - o.y) - hy - o.hh;
      if (c === this.me && !o.nm && SOLID.includes(o.kind)) {
        if (dy < 0 && dx >= 0) o.min = Math.min(o.min, dx);
        if (o.y > c.y + hy + o.hh + 4 && o.min < 28 && !o.hit) {
          o.nm = true;
          this.near++;
          c.v += 12;
          c.nitro = Math.min(1, c.nitro + 0.05); // risky driving charges the tank a little
          this.ev.push({ t: "near", c, n: this.near });
        }
      }
      if (dx < 0 && dy < 0 && c.inv <= 0 && !c.fin) this.hit(c, o);
    }
  }

  private hit(c: Racer, o: Obs) {
    const k = o.kind;
    if (k === "cone") {
      o.gone = 0.9;
      o.vx = (o.x - c.x) * 5 + rnd(-80, 80);
      o.vy = -c.v * 1.2;
      o.vr = rnd(-18, 18);
      c.v *= 0.95;
      this.ev.push({ t: "hit", c, k, fire: false });
      return;
    }
    if (k === "oil") {
      c.slip = 1.2;
      c.vx += rnd(-1, 1) * 260;
      c.v *= 0.97;
      c.inv = 0.7;
      this.ev.push({ t: "hit", c, k, fire: false });
      return;
    }
    if (k === "mine" || k === "tdrum" || k === "truck") {
      const tv = k === "truck" ? -o.vy : 0;
      const lethal =
        k === "mine" || (k === "tdrum" && c.v > c.maxV * 0.5) || (k === "truck" && c.v - tv > 150);
      if (lethal) {
        this.detonate(o, c);
        this.blast(c, k);
        return;
      }
      if (k === "truck") {
        c.v = Math.min(c.v, tv * 0.9);
        c.vx = (c.x >= o.x ? 1 : -1) * 240;
        c.inv = 0.5;
        c.hits++;
        c.fire = false;
        this.ev.push({ t: "hit", c, k, fire: false });
        return;
      }
    }
    const fire = c.fire;
    if (fire) c.nitro = Math.max(0, c.nitro - 0.25);
    c.fire = false;
    c.inv = 0.55;
    c.hits++;
    c.v *= k === "barrier" ? 0.5 : 0.72;
    if (k === "barrier") {
      o.hit = true;
      c.vx = (c.x >= o.x ? 1 : -1) * 280;
    } else if (k === "drum" || k === "tdrum" || k === "crates") {
      o.gone = 1.1;
      o.vx = (o.x - c.x) * 4 + rnd(-90, 90);
      o.vy = -c.v * 1.5 - 100;
      o.vr = rnd(-14, 14);
    } else c.slip = 1.3;
    this.ev.push({ t: "hit", c, k, fire });
  }

  /** An explosive obstacle goes off: shockwave slows nearby cars, nearby mines / red drums chain-react. */
  private detonate(o: Obs, by?: Racer) {
    o.gone = -1;
    this.ev.push({ t: "boom", o, k: o.kind, x: o.x, y: o.y });
    for (const r of this.cars) {
      if (r === by || r.dead > 0 || r.inv > 0 || r.fin) continue;
      if (Math.hypot(r.x - o.x, r.y - o.y) < 120) {
        r.v *= 0.55;
        r.slip = 1;
        r.vx += (Math.sign(r.x - o.x) || 1) * 260;
        r.inv = 0.4;
        r.hits++;
        this.ev.push({ t: "hit", c: r, k: "tdrum", fire: r.fire });
        r.fire = false;
      }
    }
    for (const p of this.obs)
      if (
        p !== o &&
        p.gone === 0 &&
        (p.kind === "mine" || p.kind === "tdrum") &&
        Math.hypot(p.x - o.x, p.y - o.y) < 110
      )
        this.detonate(p);
  }

  /** The car itself blows up. It is out for a moment, then respawns with shields. */
  private blast(c: Racer, k: Kind) {
    c.dead = 1.7;
    c.fire = false;
    c.nitro = Math.max(0, c.nitro - 0.3);
    c.hits++;
    c.blasts++;
    c.slip = 0;
    c.v = 0;
    c.vx = 0;
    c.inv = 0;
    this.ev.push({ t: "blast", c, k, x: c.x, y: c.y });
  }

  private collide() {
    const cs = this.cars;
    for (let i = 0; i < cs.length; i++)
      for (let j = i + 1; j < cs.length; j++) {
        const a = cs[i] as Racer,
          b = cs[j] as Racer;
        if (a.dead > 0 || b.dead > 0) continue;
        const A = carAt(a.id),
          B = carAt(b.id);
        const dx = b.x - a.x,
          dy = b.y - a.y;
        const ox = (A.w + B.w) * 0.42 - Math.abs(dx),
          oy = (A.h + B.h) * 0.45 - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        let hard = false;
        if (ox < oy) {
          const s = Math.sign(dx) || 1;
          a.x -= (s * ox) / 2;
          b.x += (s * ox) / 2;
          a.vx -= s * 140;
          b.vx += s * 140;
        } else {
          const rear = dy > 0 ? b : a,
            front = dy > 0 ? a : b;
          rear.y += oy;
          if (rear.v > front.v) {
            rear.v = Math.max(front.v * 0.97, rear.v * 0.93);
            hard = true;
          }
        }
        if (a.bump <= 0 && b.bump <= 0) {
          a.bump = b.bump = 0.2;
          this.ev.push({ t: "bump", c: a, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, fire: hard });
        }
      }
  }

  /** Bot brain: pick the safest lane ahead (and nitro canisters when it needs fuel). */
  private ai(c: Racer, dt: number) {
    c.think -= dt;
    if (c.think <= 0) {
      c.think = 0.09 + Math.random() * 0.08;
      const car = carAt(c.id);
      const rx = roadX(c.y);
      const look = (90 + c.v * 0.6) * (0.55 + 0.5 * c.skill);
      const near = this.obs.filter(
        (o) =>
          o.gone === 0 &&
          c.y - o.y > -30 &&
          c.y - o.y < look &&
          (o.kind !== "cannon" || this.jetSoon(o)),
      );
      const pk =
        c.nitro < 0.9
          ? this.picks.filter((p) => !p.taken && c.y - p.y > 0 && c.y - p.y < look * 2.2)
          : [];
      let best = 1e9,
        bl = c.lane || c.x;
      for (let l = -HALF + 55; l <= HALF - 55; l += 35) {
        const lx = rx + l;
        let cost = Math.abs(lx - c.x) * 0.012 + Math.abs(l) * 0.002;
        for (const o of near) {
          const ox = o.kind === "cannon" ? rx + o.side * (HALF - 200) : o.x;
          const wk =
            o.kind === "cone"
              ? 0.3
              : o.kind === "oil"
                ? 0.6
                : o.kind === "mine" || o.kind === "tdrum" || o.kind === "truck"
                  ? 1.4
                  : 1;
          if (Math.abs(lx - ox) < o.hw + car.w * 0.4 + 14)
            cost += wk * (3 * (1 - (c.y - o.y) / look) + 1);
        }
        for (const r of this.cars)
          if (r !== c && c.y - r.y > -20 && c.y - r.y < 160 && Math.abs(lx - r.x) < 50) cost += 0.6;
        for (const p of pk)
          if (Math.abs(lx - p.x) < 40) cost -= 1.4 * (1 - (c.y - p.y) / (look * 2.2));
        if (cost < best) {
          best = cost;
          bl = lx;
        }
      }
      c.lane = bl;
      const risky = near.filter((o) => o.kind !== "cone" && o.kind !== "oil").length;
      c.want = (c.nitro > 0.35 && risky === 0) || c.nitro > 0.95;
    }
    return clamp((c.lane - c.x) / 70, -1, 1);
  }

  result(): RaceResult {
    const pos = this.order.indexOf(this.me) + 1;
    return {
      pos,
      time: this.me.fin,
      top: Math.round(this.me.top * 0.36),
      hits: this.me.hits,
      near: this.near,
      blasts: this.me.blasts,
      nitros: this.nitros,
      xp:
        (pos === 1 ? 750 : Math.max(80, (N - pos) * 90 + 100)) + this.near * 10 + this.nitros * 15,
      total: N,
    };
  }
}

/* ───────────────────────────── view: juice, drawing, HUD ───────────────────────────── */

type Pop = { t: string; c: string; l: number };
type Puddle = { x: number; y: number; w: number; l: number };
type Scorch = { x: number; y: number; r: number; l: number };
const NITRO = "#4dc8ff";
const poly = (ctx: CanvasRenderingContext2D, pts: number[][], x: number, y: number) => {
  ctx.beginPath();
  pts.forEach((p, i) => {
    if (i) ctx.lineTo(x + (p[0] as number), y + (p[1] as number));
    else ctx.moveTo(x + (p[0] as number), y + (p[1] as number));
  });
  ctx.closePath();
};
const disc = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
};

export class RaceView {
  race: Race;
  fx = new Fx();
  result: RaceResult | null = null;
  private sprites = getSprites();
  private props = getProps();
  private camX: number;
  private zoom = 1;
  private heat = 0;
  private flash = 0;
  private stop = 0;
  private combo = 0;
  private zone = 0;
  private pops: Pop[] = [];
  private puddles: Puddle[] = [];
  private scorches: Scorch[] = [];
  private trails = new Map<Racer, { x: number; y: number; a: number }[]>();
  private banner = { t: "", l: 0, c: "#fff" };
  private lines: { x: number; y: number; s: number }[] = [];
  private lastNow = 0;

  constructor(pick: number) {
    this.race = new Race(pick);
    this.camX = this.race.me.x;
  }

  private pop(t: string, c: string) {
    this.pops.push({ t, c, l: 1.1 });
    if (this.pops.length > 3) this.pops.shift();
  }
  private say(t: string, c: string, l = 0.9) {
    this.banner = { t, l, c };
  }

  update(dt: number, steer: number, nitro: boolean, sfx: Sfx) {
    const R = this.race,
      me = R.me,
      fx = this.fx;
    let sdt = dt;
    if (this.stop > 0) {
      this.stop -= dt;
      sdt = dt * 0.12; // hit-stop: freeze-frame punch on impact
    }
    R.step(sdt, steer, nitro);
    fx.update(dt);
    const near = (c: Racer) => Math.abs(c.y - me.y) < 700;
    const dist = (x: number, y: number) => Math.hypot(x - me.x, y - me.y);
    for (const e of R.ev) {
      const mine = e.c === me;
      if (e.t === "cd") {
        sfx.beep(440, 0.15, 0.06);
        this.say(String(e.n), PAL.yellow, 0.95);
      } else if (e.t === "go") {
        sfx.beep(880, 0.4, 0.07);
        this.say("GO!", PAL.lime, 0.8);
        fx.shake = 8;
      } else if (e.t === "ignite" && e.c) {
        fx.emit({ kind: "ring", x: e.c.x, y: e.c.y, life: 0.5, color: NITRO, size: 10, grow: 460 });
        fx.emit({
          kind: "ring",
          x: e.c.x,
          y: e.c.y,
          life: 0.35,
          color: PAL.white,
          size: 6,
          grow: 300,
        });
        fx.emit({
          kind: "flash",
          x: e.c.x,
          y: e.c.y + 40,
          life: 0.22,
          color: NITRO,
          size: 110,
          rot: 0,
        });
        if (mine) {
          this.say("NITRO!", NITRO, 1.0);
          this.flash = 0.6;
          this.flashCol = NITRO;
          fx.shake = 14;
          sfx.ignite();
        } else if (near(e.c)) sfx.ignite();
      } else if (e.t === "pick" && e.c && e.x !== undefined && e.y !== undefined) {
        for (let i = 0; i < 18; i++)
          fx.emit({
            kind: "spark",
            x: e.x,
            y: e.y,
            vx: rnd(-260, 260),
            vy: rnd(-260, 260),
            life: rnd(0.3, 0.7),
            color: [NITRO, PAL.white, "#2e9bff"][i % 3] as string,
            size: 3,
            drag: 2.5,
          });
        fx.emit({ kind: "ring", x: e.x, y: e.y, life: 0.45, color: NITRO, size: 8, grow: 300 });
        if (mine) {
          sfx.chime(5);
          this.pop("+NITRO", NITRO);
        } else if (near(e.c)) sfx.beep(1300, 0.06, 0.03);
      } else if (e.t === "hit" && e.c && e.k) {
        const c = e.c,
          k = e.k;
        if (k === "cone") {
          for (let i = 0; i < 6; i++)
            fx.emit({
              kind: "debris",
              x: c.x + rnd(-14, 14),
              y: c.y - 30,
              vx: rnd(-200, 200),
              vy: rnd(-300, 0),
              life: 0.6,
              color: i % 2 ? "#ff7a1a" : PAL.white,
              size: rnd(3, 6),
              vr: rnd(-14, 14),
              drag: 2,
            });
          if (mine) {
            fx.shake = Math.max(fx.shake, 3);
            sfx.bump();
          }
          continue;
        }
        if (k === "oil") {
          for (let i = 0; i < 10; i++)
            fx.emit({
              kind: "smoke",
              x: c.x + rnd(-24, 24),
              y: c.y + rnd(-10, 30),
              vx: rnd(-90, 90),
              vy: rnd(20, 120),
              life: 0.6,
              size: 6,
              grow: 16,
              color: i % 2 ? "#3a2a5e" : PAL.cyan,
              drag: 2.5,
            });
          if (mine) {
            this.pop("SLIPPERY!", PAL.cyan);
            sfx.splash();
          }
          continue;
        }
        const col =
          k === "cannon"
            ? "#ff4bd8"
            : k === "barrier"
              ? PAL.yellow
              : k === "truck" || k === "tdrum"
                ? "#ff5a3d"
                : k === "crates"
                  ? "#c08a4a"
                  : "#ff7a3d";
        fx.impact(c.x, c.y - 30, 0, col, 16);
        fx.emit({
          kind: "ring",
          x: c.x,
          y: c.y - 30,
          life: 0.35,
          color: PAL.white,
          size: 6,
          grow: 240,
        });
        fx.emit({
          kind: "flash",
          x: c.x,
          y: c.y - 30,
          life: 0.15,
          color: PAL.yellow,
          size: 46,
          rot: 0,
        });
        for (let i = 0; i < 14; i++)
          fx.emit({
            kind: k === "cannon" ? "smoke" : "debris",
            x: c.x + rnd(-20, 20),
            y: c.y - 30 + rnd(-10, 10),
            vx: rnd(-240, 240),
            vy: rnd(-320, 80),
            life: 0.7,
            color: col,
            size: k === "cannon" ? rnd(10, 18) : rnd(4, 9),
            vr: rnd(-14, 14),
            drag: 2.5,
            grow: k === "cannon" ? 20 : 0,
          });
        if (mine) {
          this.stop = 0.09;
          this.flash = 1;
          this.flashCol = "#ff2b4d";
          fx.shake = e.fire ? 22 : 15;
          this.combo = 0;
          sfx.crash(true);
          if (k === "cannon") sfx.beep(1500, 0.2, 0.05);
          this.pop(
            e.fire
              ? "NITRO LOST!"
              : k === "cannon"
                ? "ZAPPED!"
                : k === "truck"
                  ? "T-BONED!"
                  : "SLOWED!",
            PAL.red,
          );
        } else if (near(c)) sfx.crash(false);
      } else if (e.t === "boom" && e.x !== undefined && e.y !== undefined) {
        fx.explode(e.x, e.y, e.k === "mine" ? PAL.yellow : "#ff7a1a");
        fx.emit({ kind: "ring", x: e.x, y: e.y, life: 0.6, color: "#ff9a2e", size: 10, grow: 420 });
        this.scorches.push({ x: e.x, y: e.y, r: rnd(34, 50), l: 14 });
        const d = dist(e.x, e.y);
        if (d < 800) {
          fx.shake = Math.max(fx.shake, 18 * (1 - d / 800));
          sfx.boom();
        }
      } else if (e.t === "blast" && e.c && e.x !== undefined && e.y !== undefined) {
        const c = e.c,
          car = carAt(c.id);
        fx.explode(e.x, e.y, car.color);
        fx.explode(e.x, e.y - 20, "#ff7a1a");
        fx.emit({ kind: "ring", x: e.x, y: e.y, life: 0.8, color: PAL.white, size: 12, grow: 620 });
        fx.emit({ kind: "ring", x: e.x, y: e.y, life: 0.6, color: "#ff4b2b", size: 8, grow: 480 });
        fx.emit({ kind: "flash", x: e.x, y: e.y, life: 0.3, color: PAL.white, size: 170, rot: 0 });
        for (let i = 0; i < 26; i++)
          fx.emit({
            kind: "debris",
            x: e.x + rnd(-16, 16),
            y: e.y + rnd(-26, 26),
            vx: rnd(-520, 520),
            vy: rnd(-620, 220),
            life: rnd(0.8, 1.5),
            color: i % 3 ? car.color : "#2a2433",
            size: rnd(5, 12),
            vr: rnd(-20, 20),
            drag: 1.6,
          });
        for (let i = 0; i < 22; i++)
          fx.emit({
            kind: "fire",
            x: e.x + rnd(-24, 24),
            y: e.y + rnd(-34, 34),
            vx: rnd(-260, 260),
            vy: rnd(-340, 120),
            life: rnd(0.4, 0.9),
            size: rnd(10, 22),
            grow: -14,
            color: ["#ffe23d", "#ff9a2e", "#ff4b2b"][i % 3] as string,
            drag: 2,
          });
        this.scorches.push({ x: e.x, y: e.y, r: 62, l: 20 });
        if (mine) {
          this.stop = 0.16;
          this.flash = 1;
          this.flashCol = "#ffb347";
          fx.shake = 34;
          this.combo = 0;
          sfx.boom();
          sfx.crash(true);
          this.say("BOOM!", "#ff7a1a", 1.2);
          this.pop(e.k === "mine" ? "MINED!" : e.k === "truck" ? "TRUCKED!" : "BLOWN UP!", PAL.red);
        } else if (near(c)) {
          sfx.boom();
          fx.shake = Math.max(fx.shake, 14);
        }
      } else if (e.t === "respawn" && e.c) {
        fx.emit({
          kind: "ring",
          x: e.c.x,
          y: e.c.y,
          life: 0.5,
          color: PAL.cyan,
          size: 8,
          grow: 260,
        });
        if (mine) this.pop("BACK IN!", PAL.cyan);
      } else if (e.t === "near") {
        this.combo++;
        sfx.chime(this.combo);
        this.pop(this.combo > 1 ? `NEAR MISS x${this.combo}` : "NEAR MISS!", PAL.cyan);
        fx.shake = Math.max(fx.shake, 3);
      } else if (e.t === "bump" && e.x !== undefined && e.y !== undefined) {
        fx.impact(e.x, e.y, 0, PAL.white, 8);
        if (e.c === me || near(e.c as Racer)) {
          sfx.bump();
          fx.shake = Math.max(fx.shake, e.fire ? 8 : 4);
        }
      } else if (e.t === "scrape" && e.x !== undefined && e.y !== undefined) {
        for (let i = 0; i < 3; i++)
          fx.emit({
            kind: "spark",
            x: e.x,
            y: e.y + rnd(-20, 20),
            vx: rnd(-120, 120),
            vy: rnd(60, 260),
            life: rnd(0.15, 0.4),
            color: i ? PAL.yellow : PAL.white,
            size: 2,
            drag: 3,
          });
        if (mine) fx.shake = Math.max(fx.shake, 2.5);
      } else if (e.t === "jet" && e.o) {
        const o = e.o,
          jx = roadX(o.y) + o.side * (HALF - 200);
        this.puddles.push({ x: jx, y: o.y, w: o.hw, l: 4 });
        if (Math.abs(o.y - me.y) < 800) sfx.beep(1900, 0.25, 0.04);
      } else if (e.t === "finish" && e.c === me) {
        sfx.fanfare();
        this.say("FINISH!", PAL.yellow, 2);
        fx.shake = 12;
        for (let i = 0; i < 40; i++)
          fx.emit({
            kind: "spark",
            x: me.x,
            y: me.y - 60,
            vx: rnd(-420, 420),
            vy: rnd(-420, 100),
            life: rnd(0.5, 1.1),
            color: [PAL.yellow, PAL.magenta, PAL.cyan, PAL.lime][i % 4] as string,
            size: 3,
            drag: 2,
          });
      }
    }
    R.ev.length = 0;

    // zone change banner
    const zi = zoneIndex(me.y);
    if (zi !== this.zone) {
      this.zone = zi;
      this.say((ZONES[zi] as Zone).name, (ZONES[zi] as Zone).rail1, 1.6);
      fx.shake = Math.max(fx.shake, 6);
    }

    // continuous effects
    for (const c of R.cars) {
      if (!near(c)) continue;
      const car = carAt(c.id);
      if (c.dead > 0) {
        // burning wreck
        if (Math.random() < 0.8)
          fx.emit({
            kind: "fire",
            x: c.x + rnd(-18, 18),
            y: c.y + rnd(-26, 26),
            vy: -rnd(20, 90),
            life: rnd(0.3, 0.6),
            size: rnd(7, 14),
            grow: -10,
            color: ["#ffe23d", "#ff9a2e", "#ff4b2b"][Math.floor(Math.random() * 3)] as string,
            drag: 1.5,
          });
        if (Math.random() < 0.6)
          fx.emit({
            kind: "smoke",
            x: c.x + rnd(-14, 14),
            y: c.y + rnd(-20, 20),
            vy: rnd(40, 100),
            life: 0.9,
            size: 8,
            grow: 20,
            color: "#2a2433",
            drag: 1.5,
          });
        continue;
      }
      if (c.v < 30) continue;
      if (c.fire) {
        for (const s of [-1, 1])
          if (Math.random() < 0.9)
            fx.emit({
              kind: "fire",
              x: c.x + s * car.w * 0.2 + rnd(-3, 3),
              y: c.y + car.h * 0.46,
              vx: rnd(-18, 18),
              vy: c.v * 0.3 + rnd(40, 140),
              life: rnd(0.2, 0.4),
              size: rnd(5, 9),
              grow: -12,
              color: [PAL.white, NITRO, "#2e9bff"][Math.floor(Math.random() * 3)] as string,
              drag: 1.5,
            });
        if (Math.random() < 0.4)
          fx.emit({
            kind: "spark",
            x: c.x + rnd(-10, 10),
            y: c.y + car.h * 0.5,
            vx: rnd(-90, 90),
            vy: c.v * 0.35 + rnd(0, 120),
            life: rnd(0.2, 0.5),
            color: Math.random() < 0.5 ? PAL.yellow : NITRO,
            size: 2,
            drag: 2,
          });
      } else if (c.v > c.maxV * 0.6 && Math.random() < 0.35)
        fx.emit({
          kind: "smoke",
          x: c.x + rnd(-8, 8),
          y: c.y + car.h * 0.5,
          vy: 40,
          life: 0.4,
          size: 5,
          grow: 14,
          color: zoneAt(c.y).decor === "city" ? "#7a6bbf" : "#8a8a95",
          drag: 2,
        });
      for (const p of this.puddles)
        if (Math.abs(c.y - p.y) < 22 && Math.abs(c.x - p.x) < p.w && Math.random() < 0.6)
          fx.emit({
            kind: "smoke",
            x: c.x + rnd(-25, 25),
            y: c.y + rnd(-10, 30),
            vx: rnd(-80, 80),
            vy: rnd(40, 160),
            life: 0.5,
            size: 6,
            grow: 22,
            color: "#ff9af0",
            drag: 2.5,
          });
    }
    for (const o of R.obs) {
      if (Math.abs(o.y - me.y) > 700 || o.gone !== 0) continue;
      if (o.kind === "cannon" && o.on) {
        const jx = roadX(o.y) + o.side * (HALF - 200);
        for (let i = 0; i < 3; i++)
          fx.emit({
            kind: "smoke",
            x: jx + rnd(-o.hw, o.hw),
            y: o.y + rnd(-14, 14),
            vx: rnd(-30, 30),
            vy: rnd(-50, 50),
            life: 0.35,
            size: 8,
            grow: 22,
            color: "#ff9af0",
            drag: 2,
          });
      } else if (o.kind === "truck" && R.clock > 0 && Math.random() < 0.3)
        fx.emit({
          kind: "smoke",
          x: o.x + rnd(-10, 10),
          y: o.y + o.hh,
          vy: 50,
          life: 0.5,
          size: 6,
          grow: 14,
          color: "#555566",
          drag: 2,
        });
    }
    for (const p of R.picks)
      if (!p.taken && Math.abs(p.y - me.y) < 700 && Math.random() < 0.25) {
        const a = Math.random() * Math.PI * 2;
        fx.emit({
          kind: "spark",
          x: p.x + Math.cos(a) * 36,
          y: p.y + Math.sin(a) * 36,
          vx: -Math.cos(a) * 30,
          vy: -Math.sin(a) * 30 - 20,
          life: 0.5,
          color: Math.random() < 0.5 ? NITRO : PAL.white,
          size: 2,
          drag: 1,
        });
      }
    for (const p of this.puddles) p.l -= dt;
    this.puddles = this.puddles.filter((p) => p.l > 0);
    for (const s of this.scorches) s.l -= dt;
    this.scorches = this.scorches.filter((s) => s.l > 0);

    // camera, zoom, heat, music, engine
    this.camX += (me.x + me.vx * 0.18 - this.camX) * Math.min(1, dt * 6);
    const ratio = me.v / (me.maxV * FIRE);
    this.zoom += ((me.fire ? 0.84 : 1 - 0.06 * ratio) - this.zoom) * Math.min(1, dt * 3);
    this.heat += ((me.fire ? 1 : 0) - this.heat) * Math.min(1, dt * 4);
    this.flash = Math.max(0, this.flash - dt * 2.4);
    this.banner.l -= dt;
    for (const p of this.pops) p.l -= dt;
    this.pops = this.pops.filter((p) => p.l > 0);
    sfx.level = me.fire ? 2 : 1;
    sfx.engine(ratio, me.fire);
    if (me.fin && R.clock - me.fin > 1.8 && !this.result) this.result = R.result();
  }

  private flashCol = "#ff2b4d";

  private propFor(o: Obs): HTMLImageElement | undefined {
    const P = this.props;
    switch (o.kind) {
      case "drum":
        return P.drum;
      case "oil":
        return P.oil;
      case "truck":
        return P.truck;
      case "crates":
        return P.crates;
      case "barrier":
        return [P.jersey, P.sawhorse, P.tires][Math.floor((o.t0 / PERIOD) * 3)];
      default:
        return undefined;
    }
  }

  /** Draw an obstacle with its artwork. Drums and crates tumble away when hit. */
  private drawProp(ctx: CanvasRenderingContext2D, o: Obs, img: HTMLImageElement) {
    const k = o.kind,
      asp = img.naturalWidth / img.naturalHeight;
    ctx.save();
    ctx.translate(o.x, o.y);
    if (k === "drum" || k === "crates") {
      const fl = o.gone > 0 ? 1 + 0.5 * Math.sin((1 - o.gone / 1.1) * Math.PI) : 1;
      ctx.scale(fl, fl);
      ctx.rotate(o.rot);
      ctx.globalAlpha = o.gone > 0 ? clamp(o.gone * 2, 0, 1) : 1;
    }
    let w = o.hw * 2,
      h = w / asp;
    if (k === "drum") {
      w = o.hw * 2.5;
      h = w / asp;
    } else if (k === "truck") {
      h = o.hh * 2;
      w = h * asp;
    } else if (k === "oil") {
      w = o.hw * 2.2;
      h = w / asp;
    } else if (k === "crates") {
      w = o.hw * 2.2;
      h = w / asp;
    } else if (k === "barrier") {
      // tile narrow artwork (sawhorse, tyres) across the barrier's width
      const n = Math.max(1, Math.round(w / (70 * asp)));
      const cw = w / n,
        ch = cw / asp;
      ctx.fillStyle = "#000000";
      ctx.globalAlpha = 0.3;
      ctx.fillRect(-o.hw + 6, -ch * 0.3 + 10, w, ch * 0.6);
      ctx.globalAlpha = 1;
      for (let i = 0; i < n; i++) ctx.drawImage(img, -o.hw + i * cw, -ch / 2, cw, ch);
      ctx.restore();
      return;
    }
    if (k !== "oil") {
      ctx.fillStyle = "#000000";
      ctx.globalAlpha *= 0.3;
      ctx.beginPath();
      ctx.ellipse(6, 8, w * 0.5, h * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha =
        k === "drum" || k === "crates" ? (o.gone > 0 ? clamp(o.gone * 2, 0, 1) : 1) : 1;
    }
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  draw(ctx: CanvasRenderingContext2D, W: number, H: number, now: number) {
    const R = this.race,
      me = R.me,
      fx = this.fx,
      t = now / 1000;
    const dt = Math.min(0.05, Math.max(0, t - this.lastNow));
    this.lastNow = t;
    const sc = Math.min(H / 980, W / 860) * this.zoom;
    const [sx, sy] = fx.offset();
    const top = me.y - (H * 0.72) / sc - 80,
      bot = me.y + (H * 0.28) / sc + 80;
    const L = this.camX - W / 2 / sc - 40,
      Rt = this.camX + W / 2 / sc + 40;
    const ratio = me.v / (me.maxV * FIRE);
    const react = (y: number) => {
      let g = 0,
        col: string = PAL.cyan;
      for (const c of R.cars) {
        const d = (c.y - y) / 170,
          v = Math.exp(-d * d);
        if (v > g) {
          g = v;
          col = carAt(c.id).color;
        }
      }
      return { g, col };
    };

    ctx.fillStyle = zoneAt(me.y).ground;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2 + sx, H * 0.72 + sy);
    ctx.scale(sc, sc);
    ctx.translate(-this.camX, -me.y);

    // ground bands + grid (colour follows the zone)
    const y0 = Math.floor(top / 40) * 40;
    for (let y = y0; y < bot; y += 40) {
      const z = zoneAt(y);
      ctx.fillStyle = z.ground;
      ctx.fillRect(L, y, Rt - L, 41);
      ctx.strokeStyle = z.grid;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (y % 120 === 0) {
        ctx.moveTo(L, y);
        ctx.lineTo(Rt, y);
      }
      for (let x = Math.floor(L / 120) * 120; x < Rt; x += 120) {
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + 40);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // scenery per zone
    for (let i = Math.floor(top / 220) - 1; i <= Math.ceil(bot / 220); i++)
      for (const s of [-1, 1]) {
        const z = zoneAt(i * 220 + 110);
        const h = hs(i, s),
          y = i * 220 + (z.decor === "city" ? 0 : hs(i, s + 4) * 60),
          rx = roadX(y);
        if (z.decor === "city") {
          const bw = 80 + h * 90,
            bh = 170 + hs(i, s + 9) * 40,
            gap = 70 + hs(i, s + 3) * 60;
          const x0 = s < 0 ? rx - HALF - gap - bw : rx + HALF + gap;
          const r = react(y + bh / 2);
          ctx.fillStyle = PAL.shadow;
          ctx.globalAlpha = 0.5;
          ctx.fillRect(x0 + 8, y + 10, bw, bh);
          ctx.globalAlpha = 1;
          ctx.fillStyle = z.bldg;
          ctx.fillRect(x0, y, bw, bh);
          ctx.fillStyle = z.roof;
          ctx.fillRect(x0 + 6, y + 6, bw - 12, bh - 12);
          ctx.fillStyle = h > 0.5 ? z.w1 : z.w2;
          ctx.globalAlpha = clamp(
            0.3 + 0.3 * Math.sin(t * (3 + this.heat * 4) + i * 1.7 + s) + r.g * 0.7,
            0,
            1,
          );
          for (let wx = x0 + 14; wx < x0 + bw - 14; wx += 22)
            for (let wy = y + 14; wy < y + bh - 14; wy += 22) ctx.fillRect(wx, wy, 10, 10);
          ctx.strokeStyle = r.g > 0.15 ? r.col : h > 0.5 ? z.w1 : z.w2;
          ctx.globalAlpha = 0.35 + r.g * 0.65;
          ctx.lineWidth = 3;
          ctx.strokeRect(x0, y, bw, bh);
          ctx.globalAlpha = 1;
          // rooftop beacon
          ctx.fillStyle = Math.floor(t * 2 + i) % 2 ? PAL.red : z.bldg;
          disc(ctx, x0 + bw - 12, y + 12, 4);
        } else {
          const gap = 50 + hs(i, s + 3) * 110;
          const bx = rx + s * (HALF + gap);
          if (z.decor === "desert") {
            if (h > 0.5) {
              // stepped mesa
              const w = 90 + h * 100,
                ht = 100 + hs(i, s + 9) * 90;
              const x0 = s < 0 ? bx - w : bx;
              ctx.fillStyle = PAL.shadow;
              ctx.globalAlpha = 0.45;
              ctx.fillRect(x0 + 10, y + 12, w, ht);
              ctx.globalAlpha = 1;
              ctx.fillStyle = z.bldg;
              ctx.fillRect(x0, y, w, ht);
              ctx.fillStyle = z.roof;
              ctx.fillRect(x0 + 8, y + 8, w - 16, ht - 16);
              ctx.fillStyle = "#e2a066";
              ctx.fillRect(x0 + 20, y + 20, w - 40, ht - 40);
              ctx.fillStyle = "#000000";
              ctx.globalAlpha = 0.15;
              ctx.fillRect(x0 + w * 0.5, y, w * 0.5, ht);
              ctx.globalAlpha = 1;
            } else {
              // cactus (seen from above) + rocks
              ctx.fillStyle = PAL.shadow;
              ctx.globalAlpha = 0.4;
              disc(ctx, bx + 6, y + 8, 18);
              ctx.globalAlpha = 1;
              ctx.fillStyle = "#2f7d3a";
              disc(ctx, bx, y, 16);
              disc(ctx, bx - 20, y + 6, 8);
              disc(ctx, bx + 20, y - 6, 8);
              ctx.fillStyle = "#58c26a";
              disc(ctx, bx, y, 9);
              ctx.fillStyle = "#ff6aa8";
              disc(ctx, bx, y, 4);
              ctx.fillStyle = "#8f6a4a";
              poly(
                ctx,
                [
                  [-14, -6],
                  [-4, -14],
                  [12, -8],
                  [16, 6],
                  [0, 14],
                  [-12, 8],
                ],
                bx + s * 60,
                y + 40,
              );
              ctx.fill();
              ctx.fillStyle = "#b88a62";
              poly(
                ctx,
                [
                  [-8, -4],
                  [0, -8],
                  [8, -3],
                  [6, 4],
                  [-4, 6],
                ],
                bx + s * 60 - 2,
                y + 38,
              );
              ctx.fill();
            }
          } else if (z.decor === "ice") {
            if (h > 0.55) {
              // frozen pond
              ctx.fillStyle = "#2a5a8a";
              ctx.beginPath();
              ctx.ellipse(bx + s * 40, y, 90, 55, 0, 0, Math.PI * 2);
              ctx.fill();
              ctx.fillStyle = "#9be8ff";
              ctx.globalAlpha = 0.35;
              ctx.beginPath();
              ctx.ellipse(bx + s * 40, y - 6, 70, 38, 0, 0, Math.PI * 2);
              ctx.fill();
              ctx.globalAlpha = 1;
              ctx.strokeStyle = z.w2;
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.moveTo(bx + s * 10, y - 20);
              ctx.lineTo(bx + s * 50, y + 10);
              ctx.lineTo(bx + s * 70, y - 10);
              ctx.stroke();
            } else {
              // pine trees from above
              for (let j = 0; j < 2; j++) {
                const px = bx + s * j * 54,
                  py = y + j * 30;
                ctx.fillStyle = PAL.shadow;
                ctx.globalAlpha = 0.4;
                disc(ctx, px + 7, py + 9, 30);
                ctx.globalAlpha = 1;
                ctx.fillStyle = "#14503f";
                disc(ctx, px, py, 30);
                ctx.fillStyle = "#1f7a5c";
                disc(ctx, px, py, 21);
                ctx.fillStyle = "#e9f8ff";
                disc(ctx, px, py, 11);
                ctx.fillStyle = z.rail1;
                disc(ctx, px, py, 4);
              }
            }
          } else {
            if (h > 0.5) {
              // lava pool
              const pr = 46 + h * 40;
              ctx.fillStyle = "#0c0404";
              disc(ctx, bx + s * 30, y, pr + 10);
              ctx.fillStyle = "#c2300f";
              disc(ctx, bx + s * 30, y, pr);
              ctx.fillStyle = "#ff7a1a";
              disc(ctx, bx + s * 30, y, pr * 0.72 + 3 * Math.sin(t * 3 + i));
              ctx.fillStyle = "#ffd23d";
              disc(
                ctx,
                bx + s * 30 + 8 * Math.sin(t * 2 + i),
                y + 4 * Math.cos(t * 2 + i),
                pr * 0.3,
              );
              ctx.globalCompositeOperation = "lighter";
              ctx.fillStyle = "#ff4b2b";
              ctx.globalAlpha = 0.2;
              disc(ctx, bx + s * 30, y, pr + 40);
              ctx.globalCompositeOperation = "source-over";
              ctx.globalAlpha = 1;
            } else {
              // obsidian spires with glowing cracks
              const sp = [
                [-30, 10],
                [-14, -34],
                [6, -12],
                [22, -40],
                [34, 8],
                [8, 30],
              ];
              ctx.fillStyle = PAL.shadow;
              ctx.globalAlpha = 0.5;
              poly(ctx, sp, bx + 8, y + 10);
              ctx.fill();
              ctx.globalAlpha = 1;
              ctx.fillStyle = "#1c1214";
              poly(ctx, sp, bx, y);
              ctx.fill();
              ctx.fillStyle = "#3a2428";
              poly(
                ctx,
                [
                  [-14, -34],
                  [6, -12],
                  [-4, 4],
                  [-20, 0],
                ],
                bx,
                y,
              );
              ctx.fill();
              ctx.strokeStyle = "#ff7a1a";
              ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 4 + i);
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.moveTo(bx - 6, y - 20);
              ctx.lineTo(bx + 4, y - 2);
              ctx.lineTo(bx - 2, y + 18);
              ctx.stroke();
              ctx.globalAlpha = 1;
            }
          }
        }
      }

    // road surface with texture
    for (let y = y0; y < bot; y += 40) {
      const z = zoneAt(y);
      const a = roadX(y),
        b = roadX(y + 40);
      ctx.fillStyle = Math.floor(y / 160) & 1 ? z.floor : z.floorAlt;
      ctx.beginPath();
      ctx.moveTo(a - HALF, y);
      ctx.lineTo(a + HALF, y);
      ctx.lineTo(b + HALF, y + 41);
      ctx.lineTo(b - HALF, y + 41);
      ctx.closePath();
      ctx.fill();
      // worn centre + speckles (sand, ice sparkle, embers, grit)
      ctx.fillStyle = z.line;
      const si = y / 40;
      for (let k = 0; k < 4; k++) {
        const px = a + (hs(si, k + 20) - 0.5) * HALF * 1.8,
          py = y + hs(si, k + 40) * 40;
        ctx.globalAlpha =
          z.decor === "ice"
            ? 0.12 + 0.25 * Math.max(0, Math.sin(t * 4 + si * 3 + k))
            : z.decor === "lava"
              ? 0.15 + 0.3 * Math.max(0, Math.sin(t * 3 + si + k))
              : 0.1;
        ctx.fillRect(px, py, 3, 3);
      }
      ctx.globalAlpha = 1;
      // solid edge lines
      ctx.strokeStyle = z.line;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (const s of [-1, 1]) {
        ctx.moveTo(a + s * (HALF - 22), y);
        ctx.lineTo(b + s * (HALF - 22), y + 41);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // lane dashes
    ctx.strokeStyle = zoneAt(me.y).line;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 6;
    ctx.beginPath();
    for (let k = Math.floor(top / 160) - 1; k <= Math.ceil(bot / 160); k++)
      for (const o of [-HALF / 3, HALF / 3]) {
        ctx.moveTo(roadX(k * 160) + o, k * 160);
        ctx.lineTo(roadX(k * 160 + 90) + o, k * 160 + 90);
      }
    ctx.stroke();
    ctx.globalAlpha = 1;

    // scorch marks from explosions
    for (const s of this.scorches) {
      ctx.fillStyle = "#000000";
      ctx.globalAlpha = 0.55 * Math.min(1, s.l / 4);
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, s.r, s.r * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      if (s.l > 12) {
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = "#ff4b2b";
        ctx.globalAlpha = (s.l - 12) * 0.12;
        disc(ctx, s.x, s.y, s.r * 0.8);
        ctx.globalCompositeOperation = "source-over";
      }
    }
    ctx.globalAlpha = 1;

    // puddles left by water cannons
    for (const p of this.puddles) {
      ctx.fillStyle = "#ff4bd8";
      ctx.globalAlpha = 0.28 * Math.min(1, p.l);
      ctx.fillRect(p.x - p.w, p.y - 22, p.w * 2, 44);
      ctx.fillStyle = PAL.white;
      ctx.globalAlpha = 0.18 * Math.min(1, p.l);
      ctx.fillRect(p.x - p.w * 0.8, p.y - 6, p.w * 1.6, 5);
    }
    ctx.globalAlpha = 1;

    // glowing rails + pylons
    ctx.globalCompositeOperation = "lighter";
    for (let y = y0; y < bot; y += 40) {
      const z = zoneAt(y);
      const a = roadX(y),
        b = roadX(y + 40);
      const col = this.heat > 0.5 ? NITRO : Math.floor(y / 160) & 1 ? z.rail2 : z.rail1;
      for (const s of [-1, 1]) {
        ctx.strokeStyle = col;
        ctx.globalAlpha = 0.18 + 0.1 * Math.sin(t * 6 + y * 0.01);
        ctx.lineWidth = 30;
        ctx.beginPath();
        ctx.moveTo(a + s * HALF, y);
        ctx.lineTo(b + s * HALF, y + 41);
        ctx.stroke();
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = 7;
        ctx.stroke();
      }
    }
    for (let k = Math.floor(top / 240) - 1; k <= Math.ceil(bot / 240); k++) {
      const y = k * 240,
        r = react(y);
      for (const s of [-1, 1]) {
        ctx.fillStyle = r.g > 0.1 ? r.col : zoneAt(y).rail1;
        ctx.globalAlpha = 0.45 + r.g * 0.5;
        ctx.beginPath();
        ctx.arc(roadX(y) + s * (HALF + 26), y, 9 + r.g * 22, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;

    // start & finish
    const checker = (y: number, h: number) => {
      const rx = roadX(y),
        n = 16,
        w = (HALF * 2) / n;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < 2; j++) {
          ctx.fillStyle = (i + j) & 1 ? PAL.white : "#120a2c";
          ctx.fillRect(rx - HALF + i * w, y + (j * h) / 2, w, h / 2);
        }
    };
    checker(20, 24);
    checker(-LEN, 44);
    const fr = roadX(-LEN);
    ctx.fillStyle = PAL.magenta;
    ctx.fillRect(fr - HALF - 30, -LEN - 20, 30, 80);
    ctx.fillRect(fr + HALF, -LEN - 20, 30, 80);
    ctx.fillStyle = PAL.yellow;
    ctx.font = '26px "Press Start 2P", monospace';
    ctx.textAlign = "center";
    ctx.fillText("FINISH", fr, -LEN - 50);

    // obstacles
    for (const o of R.obs) {
      if (o.gone < 0 || o.y < top - 100 || o.y > bot + 100) continue;
      const k = o.kind;
      const pimg = this.propFor(o);
      if (pimg && spriteReady(pimg)) {
        this.drawProp(ctx, o, pimg);
        continue;
      }
      if (k === "drum" || k === "tdrum" || k === "cone") {
        ctx.save();
        ctx.translate(o.x, o.y);
        const fl = o.gone > 0 ? 1 + 0.5 * Math.sin((1 - o.gone / 1.1) * Math.PI) : 1;
        ctx.scale(fl, fl);
        ctx.rotate(o.rot);
        ctx.globalAlpha = o.gone > 0 ? clamp(o.gone * 2, 0, 1) : 1;
        if (k === "cone") {
          ctx.fillStyle = PAL.shadow;
          ctx.fillRect(-9, -7, 22, 22);
          ctx.fillStyle = "#222030";
          ctx.fillRect(-11, -11, 22, 22);
          ctx.fillStyle = "#ff7a1a";
          disc(ctx, 0, 0, 9);
          ctx.fillStyle = PAL.white;
          disc(ctx, 0, 0, 6);
          ctx.fillStyle = "#ff7a1a";
          disc(ctx, 0, 0, 3);
        } else {
          const hot = k === "tdrum";
          ctx.fillStyle = PAL.shadow;
          disc(ctx, 4, 5, 19);
          if (hot) {
            ctx.globalCompositeOperation = "lighter";
            ctx.fillStyle = "#ff2b4d";
            ctx.globalAlpha *= 0.22 + 0.12 * Math.sin(t * 8 + o.t0);
            disc(ctx, 0, 0, 34);
            ctx.globalCompositeOperation = "source-over";
            ctx.globalAlpha = o.gone > 0 ? clamp(o.gone * 2, 0, 1) : 1;
          }
          ctx.fillStyle = hot ? "#d81f3a" : "#ff7a1a";
          disc(ctx, 0, 0, 18);
          ctx.strokeStyle = "#1a0b3d";
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.fillStyle = hot ? "#ff6a7a" : "#ffb347";
          disc(ctx, 0, 0, 10);
          ctx.fillStyle = "#1a0b3d";
          ctx.fillRect(-12, -2, 24, 4);
          if (hot) {
            // hazard flame sign
            ctx.fillStyle = PAL.yellow;
            poly(
              ctx,
              [
                [0, -8],
                [7, 6],
                [-7, 6],
              ],
              0,
              0,
            );
            ctx.fill();
            ctx.fillStyle = "#1a0b3d";
            ctx.fillRect(-1, -3, 2, 5);
            ctx.fillRect(-1, 4, 2, 1.5);
          } else {
            ctx.fillStyle = "#ffffff";
            ctx.globalAlpha *= 0.35;
            disc(ctx, -6, -6, 4);
          }
        }
        ctx.restore();
      } else if (k === "barrier") {
        ctx.fillStyle = PAL.shadow;
        ctx.fillRect(o.x - o.hw + 4, o.y - o.hh + 6, o.hw * 2, o.hh * 2);
        ctx.fillStyle = PAL.yellow;
        ctx.fillRect(o.x - o.hw, o.y - o.hh, o.hw * 2, o.hh * 2);
        ctx.fillStyle = "#1a0b3d";
        for (let x = -o.hw; x < o.hw; x += 30) ctx.fillRect(o.x + x, o.y - o.hh, 14, o.hh * 2);
        ctx.fillStyle = PAL.red;
        ctx.fillRect(o.x - o.hw, o.y - o.hh, o.hw * 2, 4);
        // blinking amber warning lamps
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = "#ffb347";
        ctx.globalAlpha = Math.floor(t * 3 + o.t0) % 2 ? 0.7 : 0.15;
        disc(ctx, o.x - o.hw + 8, o.y, 9);
        disc(ctx, o.x + o.hw - 8, o.y, 9);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
      } else if (k === "oil") {
        ctx.save();
        ctx.translate(o.x, o.y);
        ctx.fillStyle = "#06040e";
        ctx.globalAlpha = 0.88;
        ctx.beginPath();
        ctx.ellipse(0, 0, o.hw, o.hh, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.4;
        ctx.lineWidth = 3;
        const cols = [PAL.cyan, PAL.magenta, PAL.lime];
        for (let i = 0; i < 3; i++) {
          ctx.strokeStyle = cols[i] as string;
          ctx.beginPath();
          ctx.ellipse(
            4 * Math.sin(t * 1.5 + i),
            2 * Math.cos(t * 1.5 + i),
            o.hw * (0.8 - i * 0.2),
            o.hh * (0.75 - i * 0.2),
            0,
            0,
            Math.PI * 2,
          );
          ctx.stroke();
        }
        ctx.fillStyle = PAL.white;
        ctx.globalAlpha = 0.14;
        ctx.beginPath();
        ctx.ellipse(-o.hw * 0.3, -o.hh * 0.3, o.hw * 0.3, o.hh * 0.16, -0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (k === "mine") {
        const blink = Math.floor(t * 4 + o.t0) % 2;
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = "#ff2b4d";
        ctx.globalAlpha = blink ? 0.3 : 0.1;
        disc(ctx, o.x, o.y, 32);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
        ctx.fillStyle = PAL.shadow;
        disc(ctx, o.x + 3, o.y + 4, 17);
        ctx.fillStyle = "#555566";
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          poly(
            ctx,
            [
              [Math.cos(a - 0.2) * 14, Math.sin(a - 0.2) * 14],
              [Math.cos(a) * 23, Math.sin(a) * 23],
              [Math.cos(a + 0.2) * 14, Math.sin(a + 0.2) * 14],
            ],
            o.x,
            o.y,
          );
          ctx.fill();
        }
        ctx.fillStyle = "#2a2a38";
        disc(ctx, o.x, o.y, 15);
        ctx.fillStyle = "#44445a";
        disc(ctx, o.x, o.y, 10);
        ctx.fillStyle = blink ? "#ff2b4d" : "#5a1020";
        disc(ctx, o.x, o.y, 5);
      } else if (k === "truck") {
        const v = Math.floor((o.t0 / PERIOD) * 4);
        const body = ["#e8423f", "#3fa7e8", "#ffb02e", "#7e5bef"][v] as string;
        const x = o.x - o.hw,
          y = o.y - o.hh,
          w = o.hw * 2,
          h = o.hh * 2;
        ctx.fillStyle = PAL.shadow;
        ctx.globalAlpha = 0.5;
        ctx.fillRect(x + 6, y + 8, w, h);
        ctx.globalAlpha = 1;
        ctx.fillStyle = body; // trailer
        ctx.fillRect(x, y + 40, w, h - 40);
        ctx.fillStyle = "#000000";
        ctx.globalAlpha = 0.18;
        for (let i = 0; i < 4; i++) ctx.fillRect(x + 4, y + 50 + i * 16, w - 8, 3);
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#222030"; // cab
        ctx.fillRect(x + 2, y, w - 4, 38);
        ctx.fillStyle = "#2ef2ff";
        ctx.fillRect(x + 8, y + 8, w - 16, 12);
        ctx.fillStyle = PAL.white;
        ctx.fillRect(x + 4, y + 2, 8, 4);
        ctx.fillRect(x + w - 12, y + 2, 8, 4);
        ctx.strokeStyle = "#1a0b3d";
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y + 40, w, h - 40);
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = "#ff2b4d";
        ctx.globalAlpha = 0.8;
        ctx.fillRect(x + 3, y + h - 7, 12, 7);
        ctx.fillRect(x + w - 15, y + h - 7, 12, 7);
        ctx.globalAlpha = 0.25;
        disc(ctx, x + 9, y + h, 14);
        disc(ctx, x + w - 9, y + h, 14);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
      } else {
        const rx = roadX(o.y),
          cx = rx + o.side * (HALF + 18),
          ph = R.phase(o),
          jx = rx + o.side * (HALF - 200);
        if (ph >= 1.6 && ph < 2.5 && Math.floor(t * 10) % 2 === 0) {
          ctx.strokeStyle = PAL.red;
          ctx.lineWidth = 5;
          ctx.setLineDash([16, 12]);
          ctx.beginPath();
          ctx.moveTo(jx - o.hw, o.y);
          ctx.lineTo(jx + o.hw, o.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        const mx = cx - o.side * 52; // muzzle x
        if (ph >= 2.5) {
          // laser beam: additive magenta glow, hot core, flicker
          const fl = 0.8 + 0.2 * Math.sin(t * 90);
          ctx.globalCompositeOperation = "lighter";
          ctx.fillStyle = "#ff2bd6";
          ctx.globalAlpha = 0.3 * fl;
          ctx.fillRect(jx - o.hw, o.y - o.hh - 12, o.hw * 2, o.hh * 2 + 24);
          ctx.fillStyle = "#ff4bd8";
          ctx.globalAlpha = 0.75 * fl;
          ctx.fillRect(jx - o.hw, o.y - o.hh, o.hw * 2, o.hh * 2);
          ctx.fillStyle = PAL.white;
          ctx.globalAlpha = 0.95;
          ctx.fillRect(jx - o.hw, o.y - 4, o.hw * 2, 8);
          ctx.globalAlpha = 0.6;
          for (let i = 0; i < 5; i++)
            ctx.fillRect(jx - o.hw + ((t * 1400 + i * 97) % (o.hw * 2)), o.y - 12 + i * 5, 30, 2);
          disc(ctx, mx, o.y, 26 * fl);
          ctx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = 1;
        } else if (ph >= 1.6) {
          // charging: muzzle glow grows
          ctx.globalCompositeOperation = "lighter";
          ctx.fillStyle = "#ff4bd8";
          ctx.globalAlpha = 0.25 + 0.5 * (ph - 1.6);
          disc(ctx, mx, o.y, 12 + (ph - 1.6) * 24);
          ctx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = 1;
        }
        // launcher body: sprite faces down, rotate so the muzzle points across the road
        const lim = this.props.laser;
        if (spriteReady(lim)) {
          const len = 92,
            wid = (len * lim.naturalWidth) / lim.naturalHeight;
          ctx.save();
          ctx.translate(cx - o.side * 6, o.y);
          ctx.fillStyle = "#000000";
          ctx.globalAlpha = 0.35;
          ctx.beginPath();
          ctx.ellipse(6, 8, len * 0.5, wid * 0.5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.rotate(o.side * (Math.PI / 2));
          ctx.drawImage(lim, -wid / 2, -len / 2, wid, len);
          ctx.restore();
        } else {
          ctx.fillStyle = "#2b1a63";
          ctx.fillRect(cx - 24, o.y - 26, 48, 52);
          ctx.fillStyle = ph >= 1.6 && ph < 2.5 ? PAL.red : PAL.lime;
          ctx.fillRect(cx - 6, o.y - 6, 12, 12);
        }
      }
    }

    // nitro canisters
    for (const p of R.picks) {
      if (p.taken || p.y < top - 100 || p.y > bot + 100) continue;
      const pulse = 0.5 + 0.5 * Math.sin(t * 6 + p.ph);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "#2e9bff";
      ctx.globalAlpha = 0.2 + 0.15 * pulse;
      disc(ctx, 0, 0, 56 + pulse * 10);
      ctx.fillStyle = NITRO;
      ctx.globalAlpha = 0.25;
      disc(ctx, 0, 0, 34);
      ctx.strokeStyle = "#9be8ff";
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 8]);
      ctx.lineDashOffset = -t * 70;
      ctx.beginPath();
      ctx.arc(0, 0, 38 + pulse * 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      const nim = this.props.nitro;
      if (spriteReady(nim)) {
        const nh = 74,
          nw = (nh * nim.naturalWidth) / nim.naturalHeight;
        ctx.fillStyle = "#000000";
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.ellipse(6, 30, nw * 0.45, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.drawImage(nim, -nw / 2, -nh / 2 - 4 * pulse, nw, nh);
      }
      ctx.restore();
    }

    // cars
    const order = [...R.cars].sort((p, q) => q.y - p.y);
    for (const c of order) {
      if (c.y < top - 100 || c.y > bot + 100) continue;
      const car = carAt(c.id),
        img = this.sprites[c.id];
      if (c.dead > 0) {
        // charred wreck
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.ang + 0.3);
        ctx.fillStyle = "#0d0a10";
        ctx.globalAlpha = 0.92;
        ctx.fillRect(-car.w * 0.45, -car.h * 0.45, car.w * 0.9, car.h * 0.9);
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = "#ff4b2b";
        ctx.globalAlpha = 0.25 + 0.2 * Math.sin(t * 20);
        ctx.fillRect(-car.w * 0.3, -car.h * 0.3, car.w * 0.6, car.h * 0.6);
        ctx.restore();
        continue;
      }
      // nitro afterimages
      let tr = this.trails.get(c);
      if (!tr) this.trails.set(c, (tr = []));
      if (c.fire) {
        const last = tr[tr.length - 1];
        if (!last || Math.hypot(last.x - c.x, last.y - c.y) > 26) {
          tr.push({ x: c.x, y: c.y, a: c.ang });
          if (tr.length > 5) tr.shift();
        }
      } else tr.length = 0;
      if (tr.length && spriteReady(img)) {
        ctx.globalCompositeOperation = "lighter";
        tr.forEach((p, i) => {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.a);
          ctx.globalAlpha = 0.07 + (i / tr.length) * 0.12;
          ctx.drawImage(img, -car.w / 2, -car.h / 2, car.w, car.h);
          ctx.restore();
        });
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.save();
      ctx.translate(c.x, c.y);
      // soft drop shadow
      ctx.fillStyle = "#000000";
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.ellipse(6, 9, car.w * 0.52, car.h * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "lighter";
      // underglow
      ctx.fillStyle = c.fire ? NITRO : car.color;
      ctx.globalAlpha = c.fire ? 0.38 : 0.14;
      disc(ctx, 0, 0, car.h * 0.8);
      // headlight beams
      const hb = ctx.createLinearGradient(0, -car.h * 0.45, 0, -car.h * 0.45 - 280);
      hb.addColorStop(0, "rgba(255,255,225,0.34)");
      hb.addColorStop(1, "rgba(255,255,225,0)");
      ctx.fillStyle = hb;
      ctx.globalAlpha = 1;
      for (const s of [-1, 1]) {
        const bx = s * car.w * 0.27;
        ctx.beginPath();
        ctx.moveTo(bx - 5, -car.h * 0.45);
        ctx.lineTo(bx + 5, -car.h * 0.45);
        ctx.lineTo(bx + s * 36 + 24, -car.h * 0.45 - 280);
        ctx.lineTo(bx + s * 36 - 24, -car.h * 0.45 - 280);
        ctx.closePath();
        ctx.fill();
      }
      // tail lights
      ctx.fillStyle = "#ff2b4d";
      ctx.globalAlpha = c.fire ? 0.2 : 0.8;
      for (const s of [-1, 1]) ctx.fillRect(s * car.w * 0.3 - 4, car.h * 0.44, 8, 4);
      if (c.fire) {
        // twin nitro flames: teardrop layers + shock diamonds
        const fl = 80 + Math.random() * 50;
        for (const s of [-1, 1]) {
          const ex = s * car.w * 0.2,
            y1 = car.h * 0.44;
          for (const [col, kk, w] of [
            ["#1e6bff", 1, 0.13],
            [NITRO, 0.72, 0.09],
            [PAL.white, 0.4, 0.05],
          ] as [string, number, number][]) {
            ctx.fillStyle = col;
            ctx.globalAlpha = 0.85;
            ctx.beginPath();
            ctx.moveTo(ex - car.w * w, y1);
            ctx.quadraticCurveTo(ex - car.w * w * 0.9, y1 + fl * kk * 0.6, ex, y1 + fl * kk);
            ctx.quadraticCurveTo(ex + car.w * w * 0.9, y1 + fl * kk * 0.6, ex + car.w * w, y1);
            ctx.closePath();
            ctx.fill();
          }
          ctx.fillStyle = PAL.white;
          for (let i = 0; i < 3; i++) {
            ctx.globalAlpha = 0.5 + Math.random() * 0.4;
            ctx.beginPath();
            ctx.ellipse(ex, y1 + fl * (0.2 + i * 0.2), 4 - i, 6 - i, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.fillStyle = NITRO;
        ctx.globalAlpha = 0.18;
        disc(ctx, 0, car.h * 0.5 + 30, 46);
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.rotate(c.ang);
      if (c.inv > 0 && Math.floor(t * 20) % 2 === 0) ctx.globalAlpha = 0.45;
      if (spriteReady(img)) ctx.drawImage(img, -car.w / 2, -car.h / 2, car.w, car.h);
      else drawFallbackCar(ctx, car, car.w, car.h);
      ctx.restore();
      if (c === me) {
        ctx.fillStyle = PAL.yellow;
        ctx.fillRect(c.x - 17, c.y - 70, 34, 16);
        ctx.fillStyle = "#1a0b3d";
        ctx.font = '9px "Press Start 2P", monospace';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("YOU", c.x, c.y - 61);
      }
    }
    fx.draw(ctx);
    ctx.restore();

    // ── screen-space effects ──
    if (ratio > 0.62) {
      if (this.lines.length < 70 && Math.random() < 0.9)
        this.lines.push({ x: Math.random(), y: -0.1, s: rnd(0.8, 1.4) });
      ctx.strokeStyle = me.fire ? "#bfeaff" : PAL.white;
      ctx.lineWidth = 2;
      ctx.globalAlpha = clamp((ratio - 0.5) * 0.9, 0, 0.6);
      ctx.beginPath();
      for (const l of this.lines) {
        const px = l.x * W,
          py = l.y * H,
          len = 30 + ratio * 120 * l.s;
        ctx.moveTo(px, py);
        ctx.lineTo(px, py + len);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (const l of this.lines) l.y += (0.6 + ratio * 2.2) * l.s * dt * 1.6;
    this.lines = this.lines.filter((l) => l.y < 1.2);

    const vig = (col: string, a: number) => {
      const g = ctx.createRadialGradient(
        W / 2,
        H / 2,
        Math.min(W, H) * 0.25,
        W / 2,
        H / 2,
        Math.max(W, H) * 0.75,
      );
      g.addColorStop(0, `rgba(${col},0)`);
      g.addColorStop(1, `rgba(${col},${a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    };
    if (this.heat > 0.02) vig("40,150,255", 0.55 * this.heat);
    if (this.flash > 0.02) {
      const hit = this.flashCol === "#ff2b4d";
      const nit = this.flashCol === NITRO;
      vig(hit ? "255,43,77" : nit ? "60,170,255" : "255,160,40", 0.7 * this.flash);
      ctx.fillStyle = hit ? "#ff2b4d" : nit ? NITRO : "#ffb347";
      ctx.globalAlpha = this.flash * 0.18;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    this.hud(ctx, W, H, t);
  }

  private text(
    ctx: CanvasRenderingContext2D,
    s: string,
    x: number,
    y: number,
    size: number,
    col: string,
    al: CanvasTextAlign = "left",
  ) {
    ctx.font = `${size}px "Press Start 2P", monospace`;
    ctx.textAlign = al;
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#000";
    ctx.fillText(s, x + size * 0.12, y + size * 0.12);
    ctx.fillStyle = col;
    ctx.fillText(s, x, y);
  }

  private hud(ctx: CanvasRenderingContext2D, W: number, H: number, t: number) {
    const R = this.race,
      me = R.me;
    const mob = W < 600;
    const rank = R.rank(me);
    this.text(ctx, String(rank), 18, 66, mob ? 34 : 44, PAL.yellow);
    this.text(
      ctx,
      `/${R.cars.length}`,
      18 + String(rank).length * (mob ? 34 : 44) + 6,
      74,
      14,
      "#a99ee0",
    );
    this.text(ctx, "POS", 18, 30, 10, "#a99ee0");
    const tm = Math.max(0, me.fin || R.clock);
    this.text(
      ctx,
      `${Math.floor(tm / 60)}:${(tm % 60).toFixed(2).padStart(5, "0")}`,
      W / 2,
      30,
      mob ? 14 : 18,
      PAL.white,
      "center",
    );
    if (this.combo > 1) this.text(ctx, `COMBO x${this.combo}`, W / 2, 58, 11, PAL.cyan, "center");
    this.text(
      ctx,
      (ZONES[this.zone] as Zone).name,
      W / 2,
      this.combo > 1 ? 78 : 56,
      8,
      "#a99ee0",
      "center",
    );

    // speed bar
    const bw = Math.min(300, W - 160),
      bx = W / 2 - bw / 2,
      by = H - 54;
    const ratio = clamp(me.v / (me.maxV * FIRE), 0, 1);
    ctx.fillStyle = "rgba(10,4,32,.8)";
    ctx.fillRect(bx - 4, by - 4, bw + 8, 22);
    ctx.fillStyle = me.fire ? NITRO : ratio > 0.7 ? PAL.yellow : PAL.cyan;
    ctx.fillRect(bx, by, bw * ratio, 14);
    this.text(
      ctx,
      `${Math.round(me.v * 0.36)} KM/H`,
      W / 2,
      by - 18,
      12,
      me.fire ? NITRO : PAL.white,
      "center",
    );

    // nitro tank: 10 segments
    const ny = by - 46;
    ctx.fillStyle = "rgba(10,4,32,.8)";
    ctx.fillRect(bx - 4, ny - 4, bw + 8, 18);
    const segs = 10,
      sw = (bw - (segs - 1) * 3) / segs;
    for (let i = 0; i < segs; i++) {
      const on = me.nitro > (i + 0.5) / segs;
      ctx.fillStyle = on ? (me.fire ? (i % 2 ? PAL.white : NITRO) : "#2e9bff") : "#1b1546";
      ctx.fillRect(bx + i * (sw + 3), ny, sw, 10);
    }
    if (me.fire)
      this.text(
        ctx,
        "NITRO!",
        W / 2,
        ny - 14,
        11,
        Math.floor(t * 10) % 2 ? PAL.white : NITRO,
        "center",
      );
    else if (me.nitro > 0.12)
      this.text(
        ctx,
        mob ? "TAP NITRO" : "HOLD SPACE = NITRO",
        W / 2,
        ny - 14,
        9,
        Math.floor(t * 3) % 2 ? NITRO : PAL.white,
        "center",
      );
    else if (R.nitros === 0 && R.clock > 0)
      this.text(ctx, "FIND NITRO CANISTERS", W / 2, ny - 14, 8, "#a99ee0", "center");

    // progress rail (coloured by zone)
    const rx = W - 22,
      r0 = 100,
      r1 = H - 150;
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = (ZONES[i] as Zone).rail1;
      ctx.globalAlpha = 0.45;
      ctx.fillRect(rx - 3, r1 - ((i + 1) / 4) * (r1 - r0), 6, (r1 - r0) / 4 - 1);
    }
    ctx.globalAlpha = 1;
    for (const p of R.picks) {
      if (p.taken) continue;
      ctx.fillStyle = NITRO;
      ctx.fillRect(rx + 5, r1 - clamp(-p.y / LEN, 0, 1) * (r1 - r0) - 2, 4, 4);
    }
    for (const c of R.cars) {
      const y = r1 - clamp(-c.y / LEN, 0, 1) * (r1 - r0);
      ctx.fillStyle = carAt(c.id).color;
      const s = c === me ? 7 : 4;
      ctx.fillRect(rx - s, y - s, s * 2, s * 2);
      if (c === me) {
        ctx.strokeStyle = PAL.white;
        ctx.lineWidth = 2;
        ctx.strokeRect(rx - s, y - s, s * 2, s * 2);
      }
    }
    this.text(ctx, "🏁", rx, r0 - 12, 12, PAL.white, "center");

    // popups & banner
    this.pops.forEach((p, i) => {
      const k = clamp(p.l / 1.1, 0, 1);
      ctx.globalAlpha = Math.min(1, k * 2);
      this.text(ctx, p.t, W / 2, H * 0.34 + i * 26 - (1 - k) * 30, mob ? 12 : 15, p.c, "center");
    });
    ctx.globalAlpha = 1;
    const b = this.banner;
    if (b.l > 0) {
      const k = clamp(b.l / 0.9, 0, 1);
      const size =
        (mob ? 34 : 52) *
        (1 + 0.5 * Math.pow(Math.max(0, 1 - k * 1.6), 2) + (b.t.length > 3 ? -0.35 : 0)) *
        (b.t.length > 9 ? 0.6 : 1);
      ctx.globalAlpha = clamp(b.l * 2, 0, 1);
      this.text(ctx, b.t, W / 2, H * 0.4, size, b.c, "center");
      ctx.globalAlpha = 1;
    }
  }
}
