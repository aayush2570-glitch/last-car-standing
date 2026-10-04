import { PAL, carAt, cars, drawFallbackCar, getSprites, spriteReady } from "./cars";
import { Fx, type Sfx } from "./fx";

/**
 * SPEED mode: top-down endless-feeling race. Cars accelerate on their own, you only steer.
 * Hitting an obstacle (drum / barrier / water cannon jet) slows you and kills FIRE SPEED.
 * Reach your car's top speed and FIRE SPEED ignites for a big extra boost.
 * Simulation (class Race) is DOM-free; RaceView adds juice (particles, shake, sound, HUD).
 * Only plain hex colours and basic canvas calls are used (Chrome 109 safe).
 */

export const LEN = 22000;
export const HALF = 320;
const N = 8;
const FIRE = 1.32;
const PERIOD = 3.4;
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

export type Kind = "drum" | "barrier" | "cannon";
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
  t0: number;
  min: number;
  nm: boolean;
  on: boolean;
  hit: boolean;
};
export type Racer = {
  id: number;
  x: number;
  y: number;
  v: number;
  vx: number;
  maxV: number;
  fire: boolean;
  charge: number;
  ang: number;
  inv: number;
  slip: number;
  bot: boolean;
  skill: number;
  lane: number;
  think: number;
  fin: number;
  hits: number;
  bump: number;
  top: number;
};
export type Ev = {
  t: "cd" | "go" | "ignite" | "hit" | "near" | "bump" | "jet" | "finish" | "scrape";
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
  xp: number;
  total: number;
};

export class Race {
  cars: Racer[] = [];
  obs: Obs[] = [];
  ev: Ev[] = [];
  me: Racer;
  clock = -3.4;
  order: Racer[] = [];
  near = 0;
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
        charge: 0,
        ang: 0,
        inv: 0,
        slip: 0,
        bot,
        skill: rnd(0.7, 0.97),
        lane: 0,
        think: Math.random() * 0.1,
        fin: 0,
        hits: 0,
        bump: 0,
        top: 0,
      });
    }
    this.me = this.cars[0] as Racer;
    this.genObstacles();
  }

  private genObstacles() {
    const add = (kind: Kind, x: number, y: number, hw: number, hh: number, side = 0) =>
      this.obs.push({
        kind,
        x,
        y,
        hw,
        hh,
        vx: 0,
        vy: 0,
        rot: 0,
        vr: 0,
        gone: 0,
        side,
        t0: Math.random() * PERIOD,
        min: 999,
        nm: false,
        on: false,
        hit: false,
      });
    for (let d = 1100; d < LEN - 700; d += rnd(240, 420)) {
      const y = -d;
      const rx = roadX(y);
      const r = Math.random();
      if (r < 0.4) {
        const n = 1 + Math.floor(Math.random() * 3);
        const base = rnd(-HALF + 40, HALF - 40 - (n - 1) * 42);
        for (let j = 0; j < n; j++)
          add("drum", rx + base + j * 42 + rnd(-5, 5), y + rnd(-8, 8), 18, 18);
      } else if (r < 0.7) {
        if (Math.random() < 0.3) {
          add("barrier", rx - (HALF - 90), y, 90, 17);
          add("barrier", rx + (HALF - 90), y, 90, 17);
        } else add("barrier", rx + rnd(-HALF + 100, HALF - 100), y, 90, 17);
      } else {
        const side = Math.random() < 0.5 ? -1 : 1;
        add("cannon", rx + side * (HALF - 200), y, 200, 16, side);
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

  step(dt: number, steer: number) {
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
      }
    }
    const go = this.clock >= 0;
    for (const c of this.cars) this.drive(c, dt, go, c === this.me && !c.fin ? steer : undefined);
    this.collide();
  }

  private drive(c: Racer, dt: number, go: boolean, steer: number | undefined) {
    const car = carAt(c.id);
    const target = steer === undefined ? this.ai(c, dt) : steer;
    c.inv = Math.max(0, c.inv - dt);
    c.slip = Math.max(0, c.slip - dt);
    c.bump = Math.max(0, c.bump - dt);
    if (!go) return;
    let cap = c.maxV * (c.fire ? FIRE : 1);
    if (c.fin) cap = c.maxV * 0.45;
    else if (c.bot) cap *= clamp(1 - (this.me.y - c.y) * 0.00012, 0.93, 1.07);
    const acc = c.fire ? 320 : 150 + 240 * Math.max(0, 1 - c.v / c.maxV);
    c.v = c.v < cap ? Math.min(cap, c.v + acc * dt) : Math.max(cap, c.v - 300 * dt);
    c.top = Math.max(c.top, c.v);
    if (!c.fire && !c.fin) {
      if (c.v >= c.maxV * 0.985) {
        c.charge += dt;
        if (c.charge > 0.7) {
          c.fire = true;
          c.charge = 0;
          this.ev.push({ t: "ignite", c });
        }
      } else c.charge = Math.max(0, c.charge - dt * 2);
    }
    const lat = 380;
    c.vx += (target * lat - c.vx) * Math.min(1, dt * 8);
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
      this.order.push(c);
      this.ev.push({ t: "finish", c });
    }
    // obstacles
    const hx = car.w * 0.4,
      hy = car.h * 0.42;
    for (const o of this.obs) {
      if (o.gone !== 0 || Math.abs(o.y - c.y) > 160) continue;
      if (o.kind === "cannon" && !this.jetOn(o)) continue;
      const jx = o.kind === "cannon" ? roadX(o.y) + o.side * (HALF - 200) : o.x;
      const dx = Math.abs(c.x - jx) - hx - o.hw;
      const dy = Math.abs(c.y - o.y) - hy - o.hh;
      if (c === this.me && !o.nm && o.kind !== "cannon") {
        if (dy < 0 && dx >= 0) o.min = Math.min(o.min, dx);
        if (o.y > c.y + hy + o.hh + 4 && o.min < 28 && !o.hit) {
          o.nm = true;
          this.near++;
          c.v += 12;
          this.ev.push({ t: "near", c, n: this.near });
        }
      }
      if (dx < 0 && dy < 0 && c.inv <= 0 && !c.fin) this.hit(c, o);
    }
  }

  private hit(c: Racer, o: Obs) {
    const fire = c.fire;
    c.fire = false;
    c.charge = 0;
    c.inv = 0.55;
    c.hits++;
    c.v *= o.kind === "barrier" ? 0.5 : 0.72;
    if (o.kind === "barrier") {
      o.hit = true;
      c.vx = (c.x >= o.x ? 1 : -1) * 280;
    } else if (o.kind === "drum") {
      o.gone = 1.1;
      o.vx = (o.x - c.x) * 4 + rnd(-90, 90);
      o.vy = -c.v * 1.5 - 100;
      o.vr = rnd(-14, 14);
    } else c.slip = 1.3;
    this.ev.push({ t: "hit", c, k: o.kind, fire });
  }

  private collide() {
    const cs = this.cars;
    for (let i = 0; i < cs.length; i++)
      for (let j = i + 1; j < cs.length; j++) {
        const a = cs[i] as Racer,
          b = cs[j] as Racer;
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

  /** Bot brain: pick the safest lane ahead, steer towards it. Also used as autopilot after finishing. */
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
      let best = 1e9,
        bl = c.lane || c.x;
      for (let l = -HALF + 55; l <= HALF - 55; l += 35) {
        const lx = rx + l;
        let cost = Math.abs(lx - c.x) * 0.012 + Math.abs(l) * 0.002;
        for (const o of near) {
          const ox = o.kind === "cannon" ? rx + o.side * (HALF - 200) : o.x;
          if (Math.abs(lx - ox) < o.hw + car.w * 0.4 + 14) cost += 3 * (1 - (c.y - o.y) / look) + 1;
        }
        for (const r of this.cars)
          if (r !== c && c.y - r.y > -20 && c.y - r.y < 160 && Math.abs(lx - r.x) < 50) cost += 0.6;
        if (cost < best) {
          best = cost;
          bl = lx;
        }
      }
      c.lane = bl;
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
      xp: (pos === 1 ? 750 : Math.max(80, (N - pos) * 90 + 100)) + this.near * 10,
      total: N,
    };
  }
}

/* ───────────────────────────── view: juice, drawing, HUD ───────────────────────────── */

type Pop = { t: string; c: string; l: number };
type Puddle = { x: number; y: number; w: number; l: number };

export class RaceView {
  race: Race;
  fx = new Fx();
  result: RaceResult | null = null;
  private sprites = getSprites();
  private camX: number;
  private zoom = 1;
  private heat = 0;
  private flash = 0;
  private stop = 0;
  private combo = 0;
  private pops: Pop[] = [];
  private puddles: Puddle[] = [];
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

  update(dt: number, steer: number, sfx: Sfx) {
    const R = this.race,
      me = R.me,
      fx = this.fx;
    let sdt = dt;
    if (this.stop > 0) {
      this.stop -= dt;
      sdt = dt * 0.12; // hit-stop: freeze-frame punch on impact
    }
    R.step(sdt, steer);
    fx.update(dt);
    const near = (c: Racer) => Math.abs(c.y - me.y) < 700;
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
        const col = "#ff9a2e";
        fx.emit({
          kind: "ring",
          x: e.c.x,
          y: e.c.y,
          life: 0.5,
          color: PAL.yellow,
          size: 10,
          grow: 420,
        });
        fx.emit({ kind: "flash", x: e.c.x, y: e.c.y, life: 0.2, color: col, size: 90, rot: 0 });
        if (mine) {
          this.say("FIRE SPEED!", col, 1.3);
          this.flash = 0.7;
          this.flashCol = "#ff8a1e";
          fx.shake = 14;
          sfx.ignite();
        }
      } else if (e.t === "hit" && e.c && e.k) {
        const c = e.c,
          k = e.k,
          col = k === "cannon" ? "#9be8ff" : k === "barrier" ? PAL.yellow : "#ff7a3d";
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
          if (k === "cannon") sfx.splash();
          this.pop(e.fire ? "FIRE LOST!" : k === "cannon" ? "SOAKED!" : "SLOWED!", PAL.red);
        } else if (near(c)) sfx.crash(false);
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
        if (Math.abs(o.y - me.y) < 800) sfx.splash();
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

    // continuous effects
    for (const c of R.cars) {
      if (!near(c) || c.v < 30) continue;
      const car = carAt(c.id);
      if (c.fire && Math.random() < 0.9)
        fx.emit({
          kind: "fire",
          x: c.x + rnd(-10, 10),
          y: c.y + car.h * 0.45,
          vx: rnd(-25, 25),
          vy: c.v * 0.3 + rnd(0, 80),
          life: rnd(0.25, 0.45),
          size: rnd(6, 11),
          grow: -12,
          color: ["#ffe23d", "#ff9a2e", "#ff4b2b"][Math.floor(Math.random() * 3)] as string,
          drag: 1.5,
        });
      else if (c.v > c.maxV * 0.6 && Math.random() < 0.35)
        fx.emit({
          kind: "smoke",
          x: c.x + rnd(-8, 8),
          y: c.y + car.h * 0.5,
          vy: 40,
          life: 0.4,
          size: 5,
          grow: 14,
          color: "#7a6bbf",
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
            color: "#9be8ff",
            drag: 2.5,
          });
    }
    for (const o of R.obs)
      if (o.kind === "cannon" && o.on && Math.abs(o.y - me.y) < 700) {
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
            color: "#bff3ff",
            drag: 2,
          });
      }
    for (const p of this.puddles) p.l -= dt;
    this.puddles = this.puddles.filter((p) => p.l > 0);

    // camera, zoom, heat, music, engine
    this.camX += (me.x + me.vx * 0.18 - this.camX) * Math.min(1, dt * 6);
    const ratio = me.v / (me.maxV * FIRE);
    this.zoom += ((me.fire ? 0.86 : 1 - 0.06 * ratio) - this.zoom) * Math.min(1, dt * 3);
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

    ctx.fillStyle = PAL.ground;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2 + sx, H * 0.72 + sy);
    ctx.scale(sc, sc);
    ctx.translate(-this.camX, -me.y);

    // ground grid
    ctx.strokeStyle = PAL.grid;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let y = Math.floor(top / 120) * 120; y < bot; y += 120) {
      ctx.moveTo(L, y);
      ctx.lineTo(Rt, y);
    }
    for (let x = Math.floor(L / 120) * 120; x < Rt; x += 120) {
      ctx.moveTo(x, top);
      ctx.lineTo(x, bot);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    // neon buildings: windows pulse with the beat and flare up when a car streaks past
    for (let i = Math.floor(top / 220) - 1; i <= Math.ceil(bot / 220); i++)
      for (const s of [-1, 1]) {
        const h = hs(i, s),
          y = i * 220,
          rx = roadX(y);
        const bw = 80 + h * 90,
          bh = 170 + hs(i, s + 9) * 40,
          gap = 70 + hs(i, s + 3) * 60;
        const x0 = s < 0 ? rx - HALF - gap - bw : rx + HALF + gap;
        const r = react(y + bh / 2);
        ctx.fillStyle = PAL.building;
        ctx.fillRect(x0, y, bw, bh);
        ctx.fillStyle = PAL.roof;
        ctx.fillRect(x0 + 6, y + 6, bw - 12, bh - 12);
        ctx.fillStyle = h > 0.5 ? PAL.window : PAL.windowCyan;
        ctx.globalAlpha = clamp(
          0.3 + 0.3 * Math.sin(t * (3 + this.heat * 4) + i * 1.7 + s) + r.g * 0.7,
          0,
          1,
        );
        for (let wx = x0 + 14; wx < x0 + bw - 14; wx += 22)
          for (let wy = y + 14; wy < y + bh - 14; wy += 22) ctx.fillRect(wx, wy, 10, 10);
        ctx.strokeStyle = r.g > 0.15 ? r.col : h > 0.5 ? PAL.window : PAL.windowCyan;
        ctx.globalAlpha = 0.35 + r.g * 0.65;
        ctx.lineWidth = 3;
        ctx.strokeRect(x0, y, bw, bh);
        ctx.globalAlpha = 1;
      }

    // road
    const y0 = Math.floor(top / 40) * 40;
    for (let y = y0; y < bot; y += 40) {
      const a = roadX(y),
        b = roadX(y + 40);
      ctx.fillStyle = Math.floor(y / 160) & 1 ? PAL.floor : PAL.floorAlt;
      ctx.beginPath();
      ctx.moveTo(a - HALF, y);
      ctx.lineTo(a + HALF, y);
      ctx.lineTo(b + HALF, y + 41);
      ctx.lineTo(b - HALF, y + 41);
      ctx.closePath();
      ctx.fill();
    }
    // lane dashes
    ctx.strokeStyle = PAL.white;
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

    // puddles left by water cannons
    for (const p of this.puddles) {
      ctx.fillStyle = "#4fb8ff";
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
      const a = roadX(y),
        b = roadX(y + 40);
      const col = this.heat > 0.5 ? "#ff9a2e" : Math.floor(y / 160) & 1 ? PAL.magenta : PAL.cyan;
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
        ctx.fillStyle = r.g > 0.1 ? r.col : PAL.cyan;
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
      if (o.kind === "drum") {
        ctx.save();
        ctx.translate(o.x, o.y);
        const fl = o.gone > 0 ? 1 + 0.5 * Math.sin((1 - o.gone / 1.1) * Math.PI) : 1;
        ctx.scale(fl, fl);
        ctx.rotate(o.rot);
        ctx.globalAlpha = o.gone > 0 ? clamp(o.gone * 2, 0, 1) : 1;
        ctx.fillStyle = PAL.shadow;
        ctx.beginPath();
        ctx.arc(4, 5, 19, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ff7a1a";
        ctx.beginPath();
        ctx.arc(0, 0, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#1a0b3d";
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = "#ffb347";
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#1a0b3d";
        ctx.fillRect(-12, -2, 24, 4);
        ctx.restore();
      } else if (o.kind === "barrier") {
        ctx.fillStyle = PAL.shadow;
        ctx.fillRect(o.x - o.hw + 4, o.y - o.hh + 6, o.hw * 2, o.hh * 2);
        ctx.fillStyle = PAL.yellow;
        ctx.fillRect(o.x - o.hw, o.y - o.hh, o.hw * 2, o.hh * 2);
        ctx.fillStyle = "#1a0b3d";
        for (let x = -o.hw; x < o.hw; x += 30) ctx.fillRect(o.x + x, o.y - o.hh, 14, o.hh * 2);
        ctx.fillStyle = PAL.red;
        ctx.fillRect(o.x - o.hw, o.y - o.hh, o.hw * 2, 4);
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
        if (ph >= 2.5) {
          ctx.fillStyle = "#6fd6ff";
          ctx.globalAlpha = 0.55;
          ctx.fillRect(jx - o.hw, o.y - o.hh, o.hw * 2, o.hh * 2);
          ctx.fillStyle = PAL.white;
          ctx.globalAlpha = 0.7;
          for (let i = 0; i < 6; i++)
            ctx.fillRect(jx - o.hw + ((t * 900 + i * 133) % (o.hw * 2)), o.y - 10 + i * 4, 40, 3);
          ctx.globalAlpha = 1;
        }
        ctx.fillStyle = "#2b1a63";
        ctx.fillRect(cx - 24, o.y - 26, 48, 52);
        ctx.fillStyle = "#4da3ff";
        ctx.fillRect(o.side < 0 ? cx + 8 : cx - 40, o.y - 8, 32, 16);
        ctx.fillStyle = ph >= 1.6 && ph < 2.5 ? PAL.red : PAL.lime;
        ctx.fillRect(cx - 6, o.y - 6, 12, 12);
      }
    }

    // cars
    const order = [...R.cars].sort((p, q) => q.y - p.y);
    for (const c of order) {
      if (c.y < top - 100 || c.y > bot + 100) continue;
      const car = carAt(c.id),
        img = this.sprites[c.id];
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = c.fire ? "#ff7a1a" : car.color;
      ctx.globalAlpha = c.fire ? 0.35 : 0.14;
      ctx.beginPath();
      ctx.arc(0, 0, car.h * 0.8, 0, Math.PI * 2);
      ctx.fill();
      if (c.fire) {
        const fl = 60 + Math.random() * 40;
        for (const [col, k, w] of [
          ["#ff4b2b", 1, 0.45],
          ["#ff9a2e", 0.7, 0.32],
          ["#ffe23d", 0.4, 0.18],
        ] as [string, number, number][]) {
          ctx.fillStyle = col;
          ctx.globalAlpha = 0.85;
          ctx.beginPath();
          ctx.moveTo(-car.w * w, car.h * 0.4);
          ctx.lineTo(car.w * w, car.h * 0.4);
          ctx.lineTo(0, car.h * 0.4 + fl * k);
          ctx.closePath();
          ctx.fill();
        }
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
      ctx.strokeStyle = me.fire ? "#ffd27a" : PAL.white;
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

    const vig = (rgb: string, a: number) => {
      const g = ctx.createRadialGradient(
        W / 2,
        H / 2,
        Math.min(W, H) * 0.25,
        W / 2,
        H / 2,
        Math.max(W, H) * 0.75,
      );
      g.addColorStop(0, `rgba(${rgb},0)`);
      g.addColorStop(1, `rgba(${rgb},${a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    };
    if (this.heat > 0.02) vig("255,110,0", 0.55 * this.heat);
    if (this.flash > 0.02) {
      const hit = this.flashCol === "#ff2b4d";
      vig(hit ? "255,43,77" : "255,138,30", 0.7 * this.flash);
      ctx.fillStyle = hit ? "#ff2b4d" : "#ffb347";
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

    // speed bar
    const bw = Math.min(300, W - 160),
      bx = W / 2 - bw / 2,
      by = H - 54;
    const ratio = clamp(me.v / (me.maxV * FIRE), 0, 1);
    ctx.fillStyle = "rgba(10,4,32,.8)";
    ctx.fillRect(bx - 4, by - 4, bw + 8, 22);
    ctx.fillStyle = me.fire ? "#ff7a1a" : ratio > 0.7 ? PAL.yellow : PAL.cyan;
    ctx.fillRect(bx, by, bw * ratio, 14);
    ctx.fillStyle = PAL.white;
    ctx.fillRect(bx + (bw * 1) / FIRE - 1, by - 4, 2, 22); // top-speed mark: cross it for FIRE
    this.text(
      ctx,
      `${Math.round(me.v * 0.36)} KM/H`,
      W / 2,
      by - 18,
      12,
      me.fire ? "#ffb347" : PAL.white,
      "center",
    );
    if (me.fire)
      this.text(
        ctx,
        "FIRE SPEED",
        W / 2,
        by - 40,
        11,
        Math.floor(t * 8) % 2 ? PAL.yellow : "#ff7a1a",
        "center",
      );
    else if (me.charge > 0.02)
      this.text(ctx, "IGNITING...", W / 2, by - 40, 10, PAL.yellow, "center");

    // progress rail
    const rx = W - 22,
      r0 = 100,
      r1 = H - 150;
    ctx.fillStyle = "rgba(10,4,32,.7)";
    ctx.fillRect(rx - 3, r0, 6, r1 - r0);
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
        (1 + 0.5 * Math.pow(Math.max(0, 1 - k * 1.6), 2) + (b.t.length > 3 ? -0.35 : 0));
      ctx.globalAlpha = clamp(b.l * 2, 0, 1);
      this.text(ctx, b.t, W / 2, H * 0.4, size, b.c, "center");
      ctx.globalAlpha = 1;
    }
  }
}
