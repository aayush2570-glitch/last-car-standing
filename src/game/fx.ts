import { PAL } from "./cars";

/**
 * Tiny particle / tracer engine. Everything is drawn with fillRect, lineTo and arc so it
 * runs on any canvas implementation (Chrome 109 included) without shadowBlur or filters.
 * Glow is faked with the additive "lighter" blend mode.
 */

type Kind = "spark" | "fire" | "smoke" | "shell" | "debris" | "flash" | "ring" | "streak";

type Particle = {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  rot: number;
  vr: number;
  drag: number;
  grow: number;
};

const MAX_PARTICLES = 700;

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class Fx {
  parts: Particle[] = [];
  /** screen shake magnitude in px, decays on its own */
  shake = 0;

  private add(
    p: Partial<Particle> & { kind: Kind; x: number; y: number; life: number; color: string },
  ) {
    if (this.parts.length >= MAX_PARTICLES) this.parts.shift();
    this.parts.push({ vx: 0, vy: 0, size: 3, rot: 0, vr: 0, drag: 0, grow: 0, max: p.life, ...p });
  }

  /** Public particle spawner (used by the SPEED race mode). */
  emit(p: Partial<Particle> & { kind: Kind; x: number; y: number; life: number; color: string }) {
    this.add(p);
  }

  /** Muzzle flash: bright cone, hot core and a few forward sparks. `angle` 0 = up. */
  muzzle(x: number, y: number, angle: number, color: string) {
    const fx = Math.sin(angle),
      fy = -Math.cos(angle);
    this.add({ kind: "flash", x, y, life: 0.07, color, size: rand(15, 22), rot: angle });
    this.add({ kind: "flash", x, y, life: 0.05, color: PAL.white, size: rand(7, 10), rot: angle });
    for (let i = 0; i < 4; i++) {
      const a = rand(-0.45, 0.45);
      const s = rand(180, 420);
      this.add({
        kind: "spark",
        x,
        y,
        vx: (fx * Math.cos(a) - fy * Math.sin(a)) * s,
        vy: (fx * Math.sin(a) + fy * Math.cos(a)) * s,
        life: rand(0.08, 0.2),
        color,
        size: rand(1.5, 2.5),
        drag: 4,
      });
    }
  }

  /** Ejected brass, thrown out sideways from the gun. */
  shell(x: number, y: number, angle: number) {
    const side = angle + Math.PI / 2 + rand(-0.4, 0.4);
    const s = rand(70, 150);
    this.add({
      kind: "shell",
      x,
      y,
      vx: Math.sin(side) * s,
      vy: -Math.cos(side) * s,
      life: rand(0.35, 0.6),
      color: PAL.yellow,
      size: 3,
      rot: rand(0, 6),
      vr: rand(-18, 18),
      drag: 3.2,
    });
  }

  /** Bullet impact: spark fan bouncing back against `angle` (the bullet's travel direction). */
  impact(x: number, y: number, angle: number, color: string, n = 9) {
    const back = angle + Math.PI;
    this.add({ kind: "ring", x, y, life: 0.16, color, size: 4, grow: 70 });
    this.add({ kind: "flash", x, y, life: 0.06, color: PAL.white, size: 9, rot: 0 });
    for (let i = 0; i < n; i++) {
      const a = back + rand(-1.15, 1.15);
      const s = rand(80, 340);
      this.add({
        kind: "spark",
        x,
        y,
        vx: Math.sin(a) * s,
        vy: -Math.cos(a) * s,
        life: rand(0.14, 0.42),
        color: i % 3 === 0 ? PAL.white : color,
        size: rand(1.5, 2.8),
        drag: 3.5,
      });
    }
  }

  /** Big arcade explosion: shockwave, fireball, sparks, debris and lingering smoke. */
  explode(x: number, y: number, color: string) {
    this.shake = Math.max(this.shake, 9);
    this.add({ kind: "ring", x, y, life: 0.5, color: PAL.white, size: 8, grow: 260 });
    this.add({ kind: "ring", x, y, life: 0.7, color, size: 4, grow: 190 });
    this.add({ kind: "flash", x, y, life: 0.18, color: PAL.yellow, size: 60, rot: 0 });
    for (let i = 0; i < 26; i++) {
      const a = rand(0, Math.PI * 2),
        s = rand(30, 190);
      this.add({
        kind: "fire",
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: rand(0.35, 0.8),
        color: i % 2 ? PAL.yellow : "#ff7a1a",
        size: rand(6, 15),
        drag: 2.4,
        grow: -6,
      });
    }
    for (let i = 0; i < 34; i++) {
      const a = rand(0, Math.PI * 2),
        s = rand(120, 520);
      this.add({
        kind: "spark",
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: rand(0.3, 0.9),
        color: i % 3 ? color : PAL.white,
        size: rand(1.5, 3),
        drag: 2.2,
      });
    }
    for (let i = 0; i < 14; i++) {
      const a = rand(0, Math.PI * 2),
        s = rand(60, 260);
      this.add({
        kind: "debris",
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: rand(0.6, 1.3),
        color: i % 2 ? "#2a2a3a" : color,
        size: rand(3, 7),
        rot: rand(0, 6),
        vr: rand(-12, 12),
        drag: 1.8,
      });
    }
    for (let i = 0; i < 10; i++) {
      const a = rand(0, Math.PI * 2),
        s = rand(10, 70);
      this.add({
        kind: "smoke",
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: rand(0.9, 1.7),
        color: "#3b2f66",
        size: rand(10, 18),
        drag: 1.6,
        grow: 14,
      });
    }
  }

  /** Damaged-car smoke puff. */
  puff(x: number, y: number) {
    this.add({
      kind: "smoke",
      x: x + rand(-6, 6),
      y: y + rand(-6, 6),
      vx: rand(-14, 14),
      vy: rand(-14, 14),
      life: rand(0.5, 0.9),
      color: "#4a3a7c",
      size: rand(5, 9),
      drag: 1.2,
      grow: 12,
    });
  }

  /** Tyre dust behind a moving car. */
  dust(x: number, y: number) {
    this.add({
      kind: "smoke",
      x,
      y,
      vx: rand(-10, 10),
      vy: rand(-10, 10),
      life: 0.35,
      color: "#5a4a94",
      size: 4,
      drag: 1.5,
      grow: 12,
    });
  }

  update(dt: number) {
    this.shake = Math.max(0, this.shake - dt * 30);
    const list = this.parts;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i] as Particle;
      p.life -= dt;
      if (p.life <= 0) {
        list.splice(i, 1);
        continue;
      }
      const k = Math.max(0, 1 - p.drag * dt);
      p.vx *= k;
      p.vy *= k;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.size = Math.max(0.5, p.size + p.grow * dt);
    }
  }

  /** Shake offset for this frame. */
  offset(): [number, number] {
    return this.shake > 0.05
      ? [rand(-this.shake, this.shake), rand(-this.shake, this.shake)]
      : [0, 0];
  }

  draw(ctx: CanvasRenderingContext2D) {
    // pass 1: solid stuff (normal blending)
    for (const p of this.parts) {
      const t = p.life / p.max;
      if (p.kind === "smoke") {
        ctx.globalAlpha = 0.55 * t;
        ctx.fillStyle = p.color;
        const s = Math.round(p.size / 2) * 2; // chunky, pixel-ish puffs
        ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
      } else if (p.kind === "shell" || p.kind === "debris") {
        ctx.globalAlpha = Math.min(1, t * 2);
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
    }
    // pass 2: light (additive)
    ctx.globalCompositeOperation = "lighter";
    for (const p of this.parts) {
      const t = p.life / p.max;
      if (p.kind === "spark") {
        ctx.globalAlpha = Math.min(1, t * 1.6);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
        ctx.stroke();
      } else if (p.kind === "fire") {
        ctx.globalAlpha = 0.85 * t;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === "flash") {
        ctx.globalAlpha = Math.min(1, t * 1.4);
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        // star-shaped muzzle burst, points along the barrel
        ctx.beginPath();
        ctx.moveTo(0, -p.size);
        ctx.lineTo(p.size * 0.22, -p.size * 0.15);
        ctx.lineTo(p.size * 0.6, 0);
        ctx.lineTo(p.size * 0.22, p.size * 0.15);
        ctx.lineTo(0, p.size * 0.35);
        ctx.lineTo(-p.size * 0.22, p.size * 0.15);
        ctx.lineTo(-p.size * 0.6, 0);
        ctx.lineTo(-p.size * 0.22, -p.size * 0.15);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (p.kind === "ring") {
        ctx.globalAlpha = t;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2 + 3 * t;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
  }
}

/** Neon tracer: hot white core, coloured sleeve, additive glow at the head. */
export function drawTracer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  vx: number,
  vy: number,
  color: string,
) {
  const tx = x - vx * 0.045,
    ty = y - vy * 0.045;
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.strokeStyle = PAL.white;
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x - vx * 0.02, y - vy * 0.02);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
}

/** Retro synth "pew" and boom via WebAudio. Silent no-op when audio is unavailable. */
export class Sfx {
  private ctx: AudioContext | null = null;
  muted = false;

  /** Call from a user gesture (key / click) so autoplay policies allow sound. */
  unlock() {
    try {
      if (!this.ctx) {
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
    } catch {
      /* audio is optional */
    }
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number) {
    const c = this.ctx;
    if (!c || this.muted || c.state !== "running") return;
    const o = c.createOscillator(),
      g = c.createGain();
    const t = c.currentTime;
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  shot(pitch = 1) {
    this.tone("square", 900 * pitch, 140, 0.09, 0.035);
  }
  hit() {
    this.tone("sawtooth", 260, 60, 0.07, 0.03);
  }
  boom() {
    this.tone("sawtooth", 160, 28, 0.5, 0.07);
    this.tone("square", 90, 20, 0.35, 0.04);
  }
  blip() {
    this.tone("square", 620, 980, 0.06, 0.03);
  }

  /* ───────── SPEED mode: engine, effects and procedural synthwave music ───────── */
  /** 1 = cruising, 2 = FIRE SPEED (adds lead + faster tempo) */
  level = 1;
  private eng: { o: OscillatorNode; g: GainNode } | null = null;
  private mTimer: ReturnType<typeof setInterval> | null = null;
  private mNext = 0;
  private mStep = 0;

  private noise(dur: number, vol: number, freq: number, type: BiquadFilterType = "highpass") {
    const c = this.ctx;
    if (!c || this.muted || c.state !== "running") return;
    const n = Math.floor(c.sampleRate * dur),
      b = c.createBuffer(1, n, c.sampleRate),
      d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource(),
      f = c.createBiquadFilter(),
      g = c.createGain();
    s.buffer = b;
    f.type = type;
    f.frequency.value = freq;
    g.gain.value = vol;
    s.connect(f);
    f.connect(g);
    g.connect(c.destination);
    s.start();
  }
  beep(f: number, dur = 0.12, vol = 0.05) {
    this.tone("square", f, f, dur, vol);
  }
  crash(big: boolean) {
    this.noise(0.35, big ? 0.14 : 0.06, big ? 900 : 1500, "lowpass");
    this.tone("sawtooth", big ? 180 : 240, 40, 0.3, big ? 0.07 : 0.03);
  }
  splash() {
    this.noise(0.45, 0.07, 1800);
  }
  ignite() {
    this.tone("sawtooth", 180, 1800, 0.6, 0.06);
    this.noise(0.6, 0.06, 700);
  }
  chime(n: number) {
    const f = 660 * Math.pow(1.122, Math.min(n, 10));
    this.tone("triangle", f, f * 1.5, 0.14, 0.06);
  }
  bump() {
    this.tone("square", 140, 70, 0.08, 0.04);
  }
  fanfare() {
    [523, 659, 784, 1047].forEach((f, i) =>
      setTimeout(() => this.tone("square", f, f, 0.2, 0.05), i * 110),
    );
  }
  engine(ratio: number, fire: boolean) {
    const c = this.ctx;
    if (!c || c.state !== "running") return;
    if (!this.eng) {
      const o = c.createOscillator(),
        g = c.createGain(),
        f = c.createBiquadFilter();
      o.type = "sawtooth";
      f.type = "lowpass";
      f.frequency.value = 700;
      g.gain.value = 0;
      o.connect(f);
      f.connect(g);
      g.connect(c.destination);
      o.start();
      this.eng = { o, g };
    }
    const t = c.currentTime;
    this.eng.o.frequency.setTargetAtTime(55 + ratio * 210 + (fire ? 40 : 0), t, 0.05);
    this.eng.g.gain.setTargetAtTime(this.muted ? 0 : 0.02 + ratio * 0.018, t, 0.08);
  }
  private mk(t: number, type: OscillatorType, f0: number, f1: number, dur: number, vol: number) {
    const c = this.ctx;
    if (!c) return;
    const o = c.createOscillator(),
      g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  startMusic() {
    this.stopMusic();
    const c = this.ctx;
    if (!c) return;
    this.mStep = 0;
    this.mNext = c.currentTime + 0.1;
    this.mTimer = setInterval(() => this.sched(), 30);
  }
  stopMusic() {
    if (this.mTimer) clearInterval(this.mTimer);
    this.mTimer = null;
    try {
      if (this.eng) {
        this.eng.g.gain.value = 0;
        this.eng.o.stop();
      }
    } catch {
      /* already stopped */
    }
    this.eng = null;
  }
  private sched() {
    const c = this.ctx;
    if (!c || c.state !== "running") return;
    const spb = 60 / (124 + this.level * 14) / 4; // one 16th note
    while (this.mNext < c.currentTime + 0.15) {
      const s = this.mStep++,
        t = this.mNext;
      this.mNext += spb;
      if (this.muted) continue;
      const root = [55, 55, 65.41, 49][(s >> 4) & 3] as number;
      if (s % 4 === 0) this.mk(t, "sine", 150, 42, 0.14, 0.16);
      if (s % 2 === 0) this.mk(t, "sawtooth", root * (s % 8 === 6 ? 2 : 1), root, spb * 1.8, 0.05);
      if (s % 4 === 2) this.mk(t, "square", 9000, 9000, 0.03, 0.012);
      this.mk(
        t,
        "square",
        root * 4 * ([1, 1.5, 1.2, 2][s % 4] as number),
        root * 4,
        spb * 0.9,
        0.016,
      );
      if (this.level > 1) {
        if (s % 8 === 4) this.mk(t, "sawtooth", 260, 120, 0.12, 0.05);
        this.mk(
          t,
          "triangle",
          root * 8 * ([1, 1.2, 1.5, 1.8][(s >> 1) % 4] as number),
          root * 8,
          spb * 1.4,
          0.03,
        );
      }
    }
  }
}
