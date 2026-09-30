import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Heart,
  Play,
  Shield,
  Trophy,
  Volume2,
  VolumeX,
  Zap,
  Gauge,
  Swords,
} from "lucide-react";
import { PAL, cars, carAt, drawFallbackCar, getSprites, spriteReady, type Car } from "@/game/cars";
import { Fx, Sfx, drawTracer } from "@/game/fx";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Last Car Standing — Combat Arena" },
      {
        name: "description",
        content: "Choose your ride. Enter the arena. Be the last car standing.",
      },
      { property: "og:title", content: "Last Car Standing — Combat Arena" },
      {
        property: "og:description",
        content: "Choose your ride and fight to survive in a top-down car combat arena.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap",
      },
    ],
  }),
  component: ArenaGame,
});

/* ───────────────────────────── types & world ───────────────────────────── */

type Vehicle = {
  x: number;
  y: number;
  angle: number;
  hp: number;
  alive: boolean;
  cooldown: number;
  bot: boolean;
  drift: number;
  strafe: number;
  carId: number;
  hit: number;
  speedT: number;
  dblT: number;
  dodgeT: number;
  dodgeDir: number;
  dodgeAng: number;
  react: number;
};
type PowerKind = "health" | "speed" | "double";
type Powerup = { x: number; y: number; kind: PowerKind; life: number };
type Projectile = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  owner: Vehicle;
  life: number;
  damage: number;
};
type Dot = { x: number; y: number; me: boolean };
type Game = {
  player: Vehicle;
  cars: Vehicle[];
  bullets: Projectile[];
  started: number;
  lastHud: number;
  kills: number;
  over: { won: boolean; position: number; t: number } | null;
  trail: number;
  powerups: Powerup[];
  spawnT: number;
};
type ShowBullet = { x: number; y: number; vx: number; vy: number; life: number };
type Show = {
  carId: number;
  enter: number;
  t: number;
  heading: number;
  cooldown: number;
  burstLeft: number;
  burstTimer: number;
  recoil: number;
  bullets: ShowBullet[];
  hits: number[];
  score: number;
};

const WORLD = { width: 2400, height: 1720 };
const TOTAL = 12;
const blocks: [number, number, number, number][] = [
  [370, 260, 180, 142],
  [720, 235, 240, 100],
  [1290, 230, 145, 195],
  [1810, 270, 220, 126],
  [245, 680, 260, 104],
  [885, 620, 130, 230],
  [1530, 655, 260, 105],
  [1990, 690, 138, 225],
  [410, 1120, 170, 220],
  [1010, 1150, 290, 115],
  [1550, 1090, 125, 244],
  [1870, 1180, 270, 106],
  [745, 935, 105, 72],
  [1380, 940, 100, 75],
  [1100, 400, 75, 72],
  [580, 900, 80, 72],
];
const TARGETS = 7;
const CAR_RADIUS = 27;
const POWER_KINDS: PowerKind[] = ["health", "speed", "double"];
const POWER_COLOR: Record<PowerKind, string> = {
  health: "#3dff7a",
  speed: "#2ef2ff",
  double: "#ffe23d",
};
const POWER_LABEL: Record<PowerKind, string> = { health: "+", speed: "»", double: "II" };

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const shotInterval = (c: Car) => (1 - c.fireRate / 140) * 0.53 + 0.14;
const rating = (c: Car) =>
  Math.round(((c.hp / 160) * 100 + c.speed + c.fireRate + c.damage + c.armor) / 5);
const rank = (r: number) => (r >= 76 ? "S" : r >= 70 ? "A" : r >= 64 ? "B" : "C");
const fmtTime = (s: number) =>
  `${Math.floor(s / 60)
    .toString()
    .padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

/* ───────────────────────────── component ───────────────────────────── */

function ArenaGame() {
  const [selected, setSelected] = useState(0);
  const [mode, setMode] = useState<"select" | "playing" | "result">("select");
  const [hud, setHud] = useState<{
    hp: number;
    alive: number;
    kills: number;
    time: number;
    dots: Dot[];
  }>({ hp: 100, alive: TOTAL, kills: 0, time: 0, dots: [] });
  const [result, setResult] = useState({ won: false, position: TOTAL, xp: 0 });
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [broken, setBroken] = useState<Record<number, boolean>>({});

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const fxRef = useRef<Fx>(new Fx());
  const sfxRef = useRef<Sfx>(new Sfx());
  const showRef = useRef<Show>({
    carId: 0,
    enter: 0,
    t: 0,
    heading: 0,
    cooldown: 0.4,
    burstLeft: 0,
    burstTimer: 1.1,
    recoil: 0,
    bullets: [],
    hits: Array(TARGETS).fill(0) as number[],
    score: 0,
  });
  const modeRef = useRef(mode);
  const pausedRef = useRef(paused);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const startRef = useRef<() => void>(() => {});

  const setModeSync = useCallback((m: "select" | "playing" | "result") => {
    modeRef.current = m;
    if (m === "select") fxRef.current = new Fx(); // drop arena particles so they don't leak into the garage
    setMode(m);
  }, []);

  const startMatch = useCallback(() => {
    const idx = selectedRef.current;
    const playerCar = carAt(idx);
    const player: Vehicle = {
      x: 1200,
      y: 860,
      angle: -Math.PI / 2,
      hp: playerCar.hp,
      alive: true,
      cooldown: 0,
      bot: false,
      drift: 0,
      strafe: 0,
      carId: idx,
      hit: 0,
      speedT: 0,
      dblT: 0,
      dodgeT: 0,
      dodgeDir: 1,
      dodgeAng: 0,
      react: 0,
    };
    const rivals: Vehicle[] = [];
    for (let i = 0; i < TOTAL - 1; i++) {
      let x = 170 + Math.random() * 2060,
        y = 160 + Math.random() * 1400;
      if (Math.hypot(x - player.x, y - player.y) < 390) {
        x = 220 + i * 175;
        y = i % 2 ? 340 : 1370;
      }
      const id = (i + idx + 1) % cars.length;
      rivals.push({
        x,
        y,
        angle: Math.random() * Math.PI * 2,
        hp: carAt(id).hp,
        alive: true,
        cooldown: Math.random() * 1.8,
        bot: true,
        drift: Math.random() * 5,
        strafe: 0,
        carId: id,
        hit: 0,
        speedT: 0,
        dblT: 0,
        dodgeT: 0,
        dodgeDir: 1,
        dodgeAng: 0,
        react: 0,
      });
    }
    fxRef.current = new Fx();
    gameRef.current = {
      player,
      cars: [player, ...rivals],
      bullets: [],
      started: performance.now(),
      lastHud: 0,
      kills: 0,
      over: null,
      trail: 0,
      powerups: [],
      spawnT: 1.5,
    };
    keysRef.current.clear();
    pausedRef.current = false;
    setHud({ hp: playerCar.hp, alive: TOTAL, kills: 0, time: 0, dots: [] });
    setPaused(false);
    setModeSync("playing");
    sfxRef.current.blip();
  }, [setModeSync]);
  startRef.current = startMatch;

  const finishMatch = useCallback(
    (won: boolean, position: number) => {
      const xp = won ? 750 : Math.max(80, (TOTAL - position) * 90 + 100);
      setResult({ won, position, xp });
      setModeSync("result");
    },
    [setModeSync],
  );

  const pick = useCallback((i: number) => {
    setSelected(((i % cars.length) + cars.length) % cars.length);
    sfxRef.current.blip();
  }, []);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);
  useEffect(() => {
    sfxRef.current.muted = muted;
  }, [muted]);

  /* garage swap animation: the newly picked car "drives in" onto the turntable */
  useEffect(() => {
    const s = showRef.current;
    s.carId = selected;
    s.enter = 0;
    s.bullets = [];
    s.burstLeft = 0;
    s.burstTimer = 1.4;
    s.score = 0;
    const a = anchorRef.current,
      c = canvasRef.current;
    if (a && c) {
      const ar = a.getBoundingClientRect(),
        cr = c.getBoundingClientRect();
      const fx = fxRef.current,
        cx = ar.left - cr.left + ar.width / 2,
        cy = ar.top - cr.top + ar.height / 2;
      for (let i = 0; i < 8; i++)
        fx.dust(cx - ar.width * 0.35 + Math.random() * 40, cy + (Math.random() - 0.5) * 60);
    }
  }, [selected]);

  /* ───────────────────────── render / simulation loop ───────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const sprites = getSprites();
    let frame = 0;
    let previous = performance.now();
    let width = 1,
      height = 1;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    ro?.observe(canvas);
    resize();
    window.addEventListener("resize", resize);

    /* ---------- showroom (garage) ---------- */
    const stepShowroom = (dt: number) => {
      const s = showRef.current,
        fx = fxRef.current,
        keys = keysRef.current;
      const car = carAt(s.carId);
      s.t += dt;
      s.enter = Math.min(1, s.enter + dt / 0.55);
      s.recoil = Math.max(0, s.recoil - dt * 7);
      s.heading = Math.sin(s.t * 0.75) * 0.5;
      for (let i = 0; i < s.hits.length; i++) s.hits[i] = Math.max(0, (s.hits[i] as number) - dt);
      const holding = keys.has(" ") || keys.has("5") || keys.has("testfire");
      s.burstTimer -= dt;
      if (s.burstTimer <= 0 && s.burstLeft <= 0 && !holding) {
        s.burstLeft = 9;
        s.burstTimer = 2.6;
      }
      s.cooldown -= dt;
      if ((holding || s.burstLeft > 0) && s.cooldown <= 0 && s.enter >= 1) {
        if (!holding) s.burstLeft--;
        s.cooldown = shotInterval(car) * 0.8;
        const g = showGeometry();
        const mx = g.cx + Math.sin(s.heading) * g.carH * 0.56,
          my = g.cy - Math.cos(s.heading) * g.carH * 0.56;
        s.bullets.push({
          x: mx,
          y: my,
          vx: Math.sin(s.heading) * 1000,
          vy: -Math.cos(s.heading) * 1000,
          life: 1.2,
        });
        fx.muzzle(mx, my, s.heading, car.color);
        fx.shell(
          g.cx + Math.sin(s.heading) * g.carH * 0.15,
          g.cy - Math.cos(s.heading) * g.carH * 0.15,
          s.heading,
        );
        s.recoil = 1;
        sfxRef.current.shot(0.8 + car.fireRate / 200);
      }
      const g = showGeometry();
      for (const b of s.bullets) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.life -= dt;
        if (b.y <= g.targetY + g.tSize / 2) {
          const ti = Math.round((b.x - (g.cx - g.spread)) / ((g.spread * 2) / (TARGETS - 1)));
          const hitTarget =
            ti >= 0 &&
            ti < TARGETS &&
            Math.abs(b.x - (g.cx - g.spread + ti * ((g.spread * 2) / (TARGETS - 1)))) <
              g.tSize * 0.6;
          if (hitTarget) {
            s.hits[ti] = 0.16;
            s.score++;
            sfxRef.current.hit();
          }
          fx.impact(
            b.x,
            g.targetY + g.tSize / 2,
            Math.atan2(b.vx, -b.vy),
            hitTarget ? PAL.white : car.color,
            hitTarget ? 12 : 6,
          );
          b.life = 0;
        }
      }
      s.bullets = s.bullets.filter((b) => b.life > 0);
    };

    const showGeometry = () => {
      const a = anchorRef.current;
      let cx = width / 2,
        cy = height / 2,
        w = Math.min(width, 520),
        h = Math.min(height, 520);
      if (a) {
        const ar = a.getBoundingClientRect(),
          cr = canvas.getBoundingClientRect();
        cx = ar.left - cr.left + ar.width / 2;
        cy = ar.top - cr.top + ar.height / 2;
        w = ar.width;
        h = ar.height;
      }
      const size = Math.max(160, Math.min(w, h));
      const car = carAt(showRef.current.carId);
      const carH = size * 0.5;
      const tSize = Math.max(16, size * 0.085);
      return {
        cx,
        cy,
        size,
        carH,
        carW: carH * (car.w / car.h),
        R: size * 0.4,
        targetY: cy - h / 2 + tSize * 0.9,
        tSize,
        spread: Math.min(w * 0.42, size * 0.62),
      };
    };

    const drawGrid = (t: number, scroll: number, alpha: number) => {
      const step = 64,
        off = (t * scroll) % step;
      ctx.strokeStyle = PAL.grid;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = -step + off; x < width + step; x += step) {
        ctx.moveTo(Math.round(x) + 0.5, 0);
        ctx.lineTo(Math.round(x) + 0.5, height);
      }
      for (let y = -step + off; y < height + step; y += step) {
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(width, Math.round(y) + 0.5);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    const renderShowroom = () => {
      const s = showRef.current,
        fx = fxRef.current;
      const car = carAt(s.carId);
      const g = showGeometry();
      // backdrop
      const bg = ctx.createLinearGradient(0, 0, 0, height);
      bg.addColorStop(0, "#0b0620");
      bg.addColorStop(0.55, "#1a0d40");
      bg.addColorStop(1, "#2a0f52");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);
      drawGrid(s.t, 14, 0.55);
      // spotlight tinted with the car colour
      ctx.globalCompositeOperation = "lighter";
      const glow = ctx.createRadialGradient(g.cx, g.cy, 10, g.cx, g.cy, g.size * 0.95);
      glow.addColorStop(0, hexA(car.color, 0.34));
      glow.addColorStop(0.55, hexA(car.color, 0.08));
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(g.cx - g.size, g.cy - g.size, g.size * 2, g.size * 2);
      ctx.globalCompositeOperation = "source-over";

      // turntable
      ctx.save();
      ctx.translate(g.cx, g.cy);
      ctx.fillStyle = "#120a30";
      ctx.beginPath();
      ctx.arc(0, 0, g.R, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = PAL.magenta;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, g.R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.rotate(s.t * 0.4);
      ctx.strokeStyle = PAL.yellow;
      ctx.lineWidth = 9;
      ctx.setLineDash([g.R * 0.16, g.R * 0.16]);
      ctx.beginPath();
      ctx.arc(0, 0, g.R * 0.9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.rotate(-s.t * 0.9);
      ctx.strokeStyle = PAL.cyan;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 10]);
      ctx.beginPath();
      ctx.arc(0, 0, g.R * 0.7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // targets
      for (let i = 0; i < TARGETS; i++) {
        const hit = (s.hits[i] as number) > 0;
        const tx = g.cx - g.spread + i * ((g.spread * 2) / (TARGETS - 1)),
          ty = g.targetY + (hit ? 3 : 0),
          z = g.tSize;
        ctx.fillStyle = "#000";
        ctx.fillRect(tx - z / 2 + 3, ty - z / 2 + 3, z, z);
        ctx.fillStyle = hit ? PAL.white : PAL.magenta;
        ctx.fillRect(tx - z / 2, ty - z / 2, z, z);
        ctx.fillStyle = hit ? PAL.yellow : PAL.white;
        ctx.fillRect(tx - z * 0.33, ty - z * 0.33, z * 0.66, z * 0.66);
        ctx.fillStyle = hit ? PAL.white : PAL.cyan;
        ctx.fillRect(tx - z * 0.17, ty - z * 0.17, z * 0.34, z * 0.34);
      }

      // car (drives in on swap)
      const e = 1 - Math.pow(1 - s.enter, 3);
      const rc = s.recoil * s.recoil;
      ctx.save();
      ctx.translate(
        g.cx + (1 - e) * -g.size * 0.9 - Math.sin(s.heading) * rc * 7,
        g.cy + Math.cos(s.heading) * rc * 7,
      );
      ctx.rotate(s.heading + (1 - e) * -1.3);
      ctx.globalAlpha = 0.25 + 0.75 * e;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.beginPath();
      ctx.ellipse(8, 12, g.carW * 0.55, g.carH * 0.52, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = hexA(car.color, 0.22);
      ctx.beginPath();
      ctx.ellipse(0, 0, g.carW * 0.78, g.carH * 0.66, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      const img = sprites[s.carId];
      if (spriteReady(img)) ctx.drawImage(img, -g.carW / 2, -g.carH / 2, g.carW, g.carH);
      else drawFallbackCar(ctx, car, g.carW, g.carH);
      ctx.restore();

      // bullets + particles
      for (const b of s.bullets) drawTracer(ctx, b.x, b.y, b.vx, b.vy, car.color);
      fx.draw(ctx);
    };

    /* ---------- arena (gameplay) ---------- */
    const step = (dt: number, now: number) => {
      const g = gameRef.current;
      if (!g) return;
      const fx = fxRef.current,
        sfx = sfxRef.current,
        keys = keysRef.current;
      const p = g.player,
        stats = carAt(p.carId);
      const canDrive = p.alive && !g.over;
      if (canDrive) {
        const forward =
          Number(keys.has("w") || keys.has("arrowup")) -
          Number(keys.has("s") || keys.has("arrowdown"));
        const side =
          Number(keys.has("d") || keys.has("arrowright")) -
          Number(keys.has("a") || keys.has("arrowleft"));
        if (forward || side) {
          const target = Math.atan2(side, -forward);
          const delta = ((target - p.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
          p.angle += delta * Math.min(1, dt * 4.2);
          const pSpeed = stats.speed * 2.15 * (p.speedT > 0 ? 1.6 : 1);
          p.x += Math.sin(p.angle) * pSpeed * dt;
          p.y -= Math.cos(p.angle) * pSpeed * dt;
          g.trail -= dt;
          if (g.trail <= 0) {
            g.trail = 0.05;
            fx.dust(p.x - Math.sin(p.angle) * 32, p.y + Math.cos(p.angle) * 32);
          }
        }
        collide(p);
        if ((keys.has("5") || keys.has(" ")) && p.cooldown <= 0) {
          const tx = p.x + Math.sin(p.angle) * (stats.h * 0.57),
            ty = p.y - Math.cos(p.angle) * (stats.h * 0.57);
          for (const off of p.dblT > 0 ? [-9, 9] : [0]) {
            g.bullets.push({
              x: tx + Math.cos(p.angle) * off,
              y: ty + Math.sin(p.angle) * off,
              vx: Math.sin(p.angle) * 570,
              vy: -Math.cos(p.angle) * 570,
              owner: p,
              life: 2.2,
              damage: stats.damage * 0.16,
            });
          }
          p.cooldown = shotInterval(stats);
          fx.muzzle(tx, ty, p.angle, PAL.friendly);
          fx.shell(p.x + Math.sin(p.angle) * 14, p.y - Math.cos(p.angle) * 14, p.angle);
          sfx.shot(0.8 + stats.fireRate / 200);
        }
      }
      for (const bot of g.cars) {
        if (!bot.bot || !bot.alive) continue;
        bot.cooldown -= dt;
        const targets = g.cars.filter(
          (x) => x.alive && x !== bot && !(g.over && x === p && !p.alive),
        );
        if (!targets.length) continue;
        let target: { x: number; y: number } = targets[0] as Vehicle;
        for (const c of targets)
          if (Math.hypot(c.x - bot.x, c.y - bot.y) < Math.hypot(target.x - bot.x, target.y - bot.y))
            target = c;
        // fighting comes first: bots only go for a power-up bubble when no enemy is near
        let pu: Powerup | null = null;
        const enemyNear = Math.hypot(target.x - bot.x, target.y - bot.y) < 650;
        if (!enemyNear)
          for (const q of g.powerups)
            if (
              !pu ||
              Math.hypot(q.x - bot.x, q.y - bot.y) < Math.hypot(pu.x - bot.x, pu.y - bot.y)
            )
              pu = q;
        if (pu) target = pu;
        const distance = Math.hypot(target.x - bot.x, target.y - bot.y);
        const desired = Math.atan2(target.x - bot.x, -(target.y - bot.y));
        const delta = ((desired - bot.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        bot.angle += Math.max(-1, Math.min(1, delta)) * dt * (pu ? 3 : distance < 310 ? 0.5 : 1.8);
        bot.drift -= dt;
        if (bot.drift <= 0) {
          bot.drift = 1.8 + Math.random() * 3.8;
          bot.strafe = -0.8 - Math.random() * 1.2;
        }
        bot.strafe = Math.min(0, bot.strafe + dt);
        const pace = pu ? 0.9 : distance < 260 ? -0.38 : distance < 410 ? 0.28 : 0.7;
        const bSpeed = 96 * (bot.speedT > 0 ? 1.6 : 1);
        bot.x +=
          Math.sin(bot.angle) * bSpeed * pace * dt +
          (bot.strafe < 0 ? Math.cos(bot.angle) * 28 : 0) * dt;
        bot.y -=
          Math.cos(bot.angle) * bSpeed * pace * dt -
          (bot.strafe < 0 ? Math.sin(bot.angle) * 28 : 0) * dt;
        // dodge: spot incoming enemy bullets on a collision course and sidestep across their path
        bot.dodgeT -= dt;
        bot.react -= dt;
        if (bot.dodgeT <= 0 && bot.react <= 0) {
          let urgent = 99;
          for (const b of g.bullets) {
            if (b.owner === bot || b.life <= 0) continue;
            const rx = bot.x - b.x,
              ry = bot.y - b.y;
            const sp2 = b.vx * b.vx + b.vy * b.vy;
            const tc = (rx * b.vx + ry * b.vy) / sp2; // time to closest approach
            if (tc <= 0 || tc > 0.85 || tc >= urgent) continue;
            const cx = rx - b.vx * tc,
              cy = ry - b.vy * tc;
            if (Math.hypot(cx, cy) > 46) continue;
            urgent = tc;
            // sidestep to the side the bot is already offset toward (perpendicular to the shot)
            const side = b.vx * ry - b.vy * rx >= 0 ? 1 : -1;
            bot.dodgeDir = side;
            bot.dodgeAng = Math.atan2(b.vx, -b.vy);
          }
          if (urgent < 99) {
            // not perfect: ~20% of the time a bot reacts too late
            if (Math.random() < 0.8) bot.dodgeT = 0.32;
            else bot.react = 0.4;
          }
        }
        if (bot.dodgeT > 0) {
          const dvx = Math.cos(bot.dodgeAng) * bot.dodgeDir,
            dvy = Math.sin(bot.dodgeAng) * bot.dodgeDir;
          bot.x += dvx * 210 * dt;
          bot.y += dvy * 210 * dt;
          if (Math.random() < dt * 14) fx.dust(bot.x, bot.y);
        }
        collide(bot);
        if (!pu && distance < 560 && bot.cooldown <= 0 && Math.abs(delta) < 1.0) {
          const aim = desired + (Math.random() - 0.5) * 0.2;
          const mx = bot.x + Math.sin(aim) * (carAt(bot.carId).h * 0.5),
            my = bot.y - Math.cos(aim) * (carAt(bot.carId).h * 0.5);
          for (const off of bot.dblT > 0 ? [-9, 9] : [0]) {
            g.bullets.push({
              x: mx + Math.cos(aim) * off,
              y: my + Math.sin(aim) * off,
              vx: Math.sin(aim) * 400,
              vy: -Math.cos(aim) * 400,
              owner: bot,
              life: 2.5,
              damage: 5.3,
            });
          }
          bot.cooldown = 0.52 + Math.random() * 0.58;
          fx.muzzle(mx, my, aim, PAL.hostile);
        }
      }
      // car-to-car collisions: solid bodies push each other apart
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < g.cars.length; i++) {
          const a = g.cars[i] as Vehicle;
          if (!a.alive) continue;
          for (let j = i + 1; j < g.cars.length; j++) {
            const b = g.cars[j] as Vehicle;
            if (!b.alive) continue;
            let dx = b.x - a.x,
              dy = b.y - a.y;
            let d = Math.hypot(dx, dy);
            const min = CAR_RADIUS * 2;
            if (d >= min) continue;
            if (d < 0.001) {
              const a0 = Math.random() * Math.PI * 2;
              dx = Math.cos(a0);
              dy = Math.sin(a0);
              d = 1;
            }
            const push = (min - d) / 2;
            a.x -= (dx / d) * push;
            a.y -= (dy / d) * push;
            b.x += (dx / d) * push;
            b.y += (dy / d) * push;
            if (pass === 0 && push > 3) {
              fx.impact((a.x + b.x) / 2, (a.y + b.y) / 2, Math.atan2(dx, -dy), PAL.yellow, 3);
              if (a === p || b === p) fx.shake = Math.max(fx.shake, 2);
            }
          }
        }
        for (const v of g.cars) if (v.alive) collide(v);
      }
      // power-up bubbles: spawn, expire, pick up
      g.spawnT -= dt;
      if (g.spawnT <= 0 && g.powerups.length < 4 && !g.over) {
        g.spawnT = 5 + Math.random() * 3;
        for (let tries = 0; tries < 20; tries++) {
          const x = 120 + Math.random() * (WORLD.width - 240),
            y = 120 + Math.random() * (WORLD.height - 240);
          if (
            blocks.some(
              ([bx, by, bw, bh]) =>
                x > bx - 40 && x < bx + bw + 40 && y > by - 40 && y < by + bh + 40,
            )
          )
            continue;
          g.powerups.push({
            x,
            y,
            kind: POWER_KINDS[Math.floor(Math.random() * POWER_KINDS.length)] as PowerKind,
            life: 25,
          });
          break;
        }
      }
      for (const q of g.powerups) q.life -= dt;
      for (const q of g.powerups) {
        for (const v of g.cars) {
          if (!v.alive || q.life <= 0 || Math.hypot(q.x - v.x, q.y - v.y) > 42) continue;
          q.life = 0;
          if (q.kind === "health")
            v.hp = Math.min(carAt(v.carId).hp, v.hp + carAt(v.carId).hp * 0.35);
          else if (q.kind === "speed") v.speedT = 10 + Math.random() * 2;
          else v.dblT = 10;
          fx.impact(q.x, q.y, 0, POWER_COLOR[q.kind], 12);
          if (v === p) sfx.blip();
        }
      }
      g.powerups = g.powerups.filter((q) => q.life > 0);
      for (const b of g.bullets) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.life -= dt;
        const dir = Math.atan2(b.vx, -b.vy);
        if (blocks.some(([x, y, w, h]) => b.x > x && b.x < x + w && b.y > y && b.y < y + h)) {
          b.life = 0;
          fx.impact(b.x, b.y, dir, PAL.yellow, 6);
        }
        for (const v of g.cars) {
          if (!v.alive || v === b.owner || b.life <= 0 || Math.hypot(b.x - v.x, b.y - v.y) >= 32)
            continue;
          const target = carAt(v.carId);
          v.hp -= b.damage * (1 - target.armor / 250);
          b.life = 0;
          v.hit = 0.14;
          fx.impact(b.x, b.y, dir, b.owner.bot ? PAL.hostile : PAL.friendly, 10);
          if (v === p) {
            fx.shake = Math.max(fx.shake, 4);
            sfx.hit();
          }
          if (v.hp <= 0) {
            v.hp = 0;
            v.alive = false;
            fx.explode(v.x, v.y, target.color);
            sfx.boom();
            if (b.owner === p) g.kills++;
          }
        }
      }
      g.bullets = g.bullets.filter(
        (b) => b.life > 0 && b.x > 0 && b.x < WORLD.width && b.y > 0 && b.y < WORLD.height,
      );
      p.cooldown = Math.max(0, p.cooldown - dt);
      for (const v of g.cars) {
        v.hit = Math.max(0, v.hit - dt);
        v.speedT = Math.max(0, v.speedT - dt);
        v.dblT = Math.max(0, v.dblT - dt);
        if (v.alive && v.hp < carAt(v.carId).hp * 0.4 && Math.random() < dt * 9) fx.puff(v.x, v.y);
      }
      const alive = g.cars.filter((x) => x.alive).length;
      if (!g.over) {
        if (!p.alive) g.over = { won: false, position: alive + 1, t: 1.6 };
        else if (alive === 1) g.over = { won: true, position: 1, t: 1.1 };
      } else {
        g.over.t -= dt;
        if (g.over.t <= 0) {
          finishMatch(g.over.won, g.over.position);
          return;
        }
      }
      if (now - g.lastHud > 140) {
        const dots: Dot[] = g.cars
          .filter((v) => v.alive)
          .map((v) => ({
            x: (v.x / WORLD.width) * 100,
            y: (v.y / WORLD.height) * 100,
            me: v === p,
          }));
        setHud({
          hp: Math.ceil(p.hp),
          alive,
          kills: g.kills,
          time: Math.floor((now - g.started) / 1000),
          dots,
        });
        g.lastHud = now;
      }
    };

    const collide = (v: Vehicle) => {
      v.x = clamp(v.x, 65, WORLD.width - 65);
      v.y = clamp(v.y, 65, WORLD.height - 65);
      const r = 26;
      for (const [bx, by, bw, bh] of blocks) {
        const nx = clamp(v.x, bx, bx + bw),
          ny = clamp(v.y, by, by + bh);
        const dx = v.x - nx,
          dy = v.y - ny,
          d = Math.hypot(dx, dy);
        if (d < r) {
          if (d > 0.001) {
            v.x = nx + (dx / d) * r;
            v.y = ny + (dy / d) * r;
          } else v.x = bx - r;
        }
      }
    };

    const renderArena = (t: number) => {
      const g = gameRef.current,
        fx = fxRef.current;
      const p = g?.player;
      const zoom = Math.min(width / 820, height / 560, 1);
      const cx = p ? p.x : WORLD.width / 2,
        cy = p ? p.y : WORLD.height / 2;
      const [sx, sy] = fx.offset();
      const ox = width / 2 - cx * zoom + sx,
        oy = height / 2 - cy * zoom + sy;
      ctx.fillStyle = PAL.void;
      ctx.fillRect(0, 0, width, height);
      ctx.save();
      ctx.translate(ox, oy);
      ctx.scale(zoom, zoom);
      // polished grey tile floor (pre-rendered once, then just blitted)
      ctx.drawImage(getFloor(), 0, 0);
      // shipping containers + crates (solid obstacles)
      blocks.forEach(([x, y, w, h], i) => drawBox(ctx, x, y, w, h, i));
      // tyre dust, sparks, smoke sit under the cars
      if (g) {
        for (const q of g.powerups) {
          const col = POWER_COLOR[q.kind];
          const bob = 1 + 0.12 * Math.sin(t * 5 + q.x);
          const blink = q.life < 5 && Math.floor(t * 6) % 2 === 0 ? 0.35 : 1;
          ctx.globalAlpha = blink;
          ctx.fillStyle = hexA(col, 0.22);
          ctx.beginPath();
          ctx.arc(q.x, q.y, 30 * bob, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = col;
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.fillStyle = col;
          ctx.font = '14px "Press Start 2P", monospace';
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(POWER_LABEL[q.kind], q.x, q.y + 1);
          ctx.globalAlpha = 1;
        }
        for (const v of g.cars) {
          if (!v.alive) continue;
          const car = carAt(v.carId);
          const img = sprites[v.carId];
          ctx.save();
          ctx.translate(v.x, v.y);
          ctx.rotate(v.angle);
          // One simple circle under every car: blue = you, red = everyone else.
          const r = Math.max(car.w, car.h) * 0.62;
          const rgb = v === p ? "56,160,255" : "255,64,64";
          ctx.fillStyle = `rgba(${rgb},${v.hit > 0 ? 0.55 : 0.28})`;
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = `rgba(${rgb},0.6)`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          if (spriteReady(img)) ctx.drawImage(img, -car.w / 2, -car.h / 2, car.w, car.h);
          else drawFallbackCar(ctx, car, car.w, car.h);
          if (v.speedT > 0) {
            ctx.strokeStyle = POWER_COLOR.speed;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
            ctx.stroke();
          }
          if (v.dblT > 0) {
            ctx.strokeStyle = POWER_COLOR.double;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, r + 9, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.restore();
          if (v === p || v.hp < car.hp * 0.63) {
            const pct = Math.max(0, v.hp / car.hp);
            ctx.fillStyle = "#000";
            ctx.fillRect(v.x - 25, v.y - 49, 50, 8);
            ctx.fillStyle = "#2a1a63";
            ctx.fillRect(v.x - 23, v.y - 47, 46, 4);
            ctx.fillStyle = v === p ? PAL.lime : PAL.red;
            ctx.fillRect(v.x - 23, v.y - 47, 46 * pct, 4);
          }
          if (v === p) {
            // yellow "YOU" tag above the player's car
            const tx = v.x,
              ty = v.y - 66;
            ctx.fillStyle = "#ffe23d";
            ctx.fillRect(tx - 17, ty - 8, 34, 16);
            ctx.beginPath();
            ctx.moveTo(tx - 4, ty + 8);
            ctx.lineTo(tx + 4, ty + 8);
            ctx.lineTo(tx, ty + 13);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = "#1a0b3d";
            ctx.font = '9px "Press Start 2P", monospace';
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("YOU", tx, ty + 1);
          }
        }
        for (const b of g.bullets)
          drawTracer(ctx, b.x, b.y, b.vx, b.vy, b.owner.bot ? PAL.hostile : PAL.friendly);
      }
      fx.draw(ctx);
      const pulse = 0.55 + 0.45 * Math.sin(t * 3);
      ctx.strokeStyle = PAL.boundary;
      ctx.lineWidth = 8;
      ctx.strokeRect(0, 0, WORLD.width, WORLD.height);
      ctx.globalAlpha = pulse;
      ctx.strokeStyle = PAL.cyan;
      ctx.lineWidth = 2;
      ctx.strokeRect(9, 9, WORLD.width - 18, WORLD.height - 18);
      ctx.globalAlpha = 1;
      ctx.restore();
    };

    const draw = (now: number) => {
      const dt = Math.min((now - previous) / 1000, 0.04);
      previous = now;
      const m = modeRef.current,
        t = now / 1000;
      const running = !(m === "playing" && pausedRef.current);
      if (running) fxRef.current.update(dt);
      if (m === "playing") {
        if (!pausedRef.current) step(dt, now);
        renderArena(t);
      } else if (m === "result" && gameRef.current) renderArena(t);
      else {
        stepShowroom(dt);
        renderShowroom();
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      ro?.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [finishMatch]);

  /* ───────────────────────── input ───────────────────────── */
  useEffect(() => {
    const drive = [
      "w",
      "a",
      "s",
      "d",
      "arrowup",
      "arrowdown",
      "arrowleft",
      "arrowright",
      "5",
      " ",
      "escape",
      "enter",
    ];
    const onKey = (e: KeyboardEvent, down: boolean) => {
      const key = e.key.toLowerCase();
      if (down) sfxRef.current.unlock();
      if (drive.includes(key)) e.preventDefault();
      if (down && !e.repeat) {
        const m = modeRef.current;
        if (key === "escape" && m === "playing") {
          const v = !pausedRef.current;
          pausedRef.current = v;
          setPaused(v);
        }
        if (m === "select") {
          if (key === "arrowleft" || key === "a") pick(selectedRef.current - 1);
          else if (key === "arrowright" || key === "d") pick(selectedRef.current + 1);
          else if (key === "enter") startRef.current();
        }
      }
      if (down) keysRef.current.add(key);
      else keysRef.current.delete(key);
    };
    const onDown = (e: KeyboardEvent) => onKey(e, true);
    const onUp = (e: KeyboardEvent) => onKey(e, false);
    const clear = () => keysRef.current.clear();
    const unlock = () => sfxRef.current.unlock();
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", clear);
    window.addEventListener("pointerdown", unlock);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", clear);
      window.removeEventListener("pointerdown", unlock);
    };
  }, [pick]);

  const hold = (key: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      keysRef.current.add(key);
    },
    onPointerUp: () => {
      keysRef.current.delete(key);
    },
    onPointerLeave: () => {
      keysRef.current.delete(key);
    },
    onPointerCancel: () => {
      keysRef.current.delete(key);
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  const current = carAt(selected);
  const ovr = rating(current);
  const vars = { "--c": current.color } as CSSProperties;
  const statRows: [string, number, number, typeof Heart][] = [
    ["HP", current.hp, (current.hp / 160) * 100, Heart],
    ["SPEED", current.speed, current.speed, Gauge],
    ["FIRE RATE", current.fireRate, current.fireRate, Zap],
    ["DAMAGE", current.damage, current.damage, Crosshair],
    ["ARMOR", current.armor, current.armor, Shield],
  ];
  const toggleMute = () => setMuted((v) => !v);
  const togglePause = () => {
    const v = !pausedRef.current;
    pausedRef.current = v;
    setPaused(v);
  };

  return (
    <main className="game-shell">
      <section className={`arena-stage mode-${mode}`} aria-label="Car combat arena" style={vars}>
        <canvas ref={canvasRef} className="arena-canvas" aria-label="Live car combat arena" />
        <div className="crt" aria-hidden="true" />

        {mode !== "playing" && (
          <header className="top-bar">
            <div className="logo" aria-label="Last Car Standing">
              <span className="logo-a">LAST CAR</span>
              <span className="logo-b">STANDING</span>
            </div>
            <div className="top-right">
              <span className="credit">
                CREDIT <b>01</b>
              </span>
              <button
                type="button"
                className="icon-btn"
                onClick={toggleMute}
                aria-label={muted ? "Unmute sound" : "Mute sound"}
                aria-pressed={muted}
              >
                {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
            </div>
          </header>
        )}

        {mode === "select" && (
          <div className="garage">
            <div className="garage-main">
              <section className="win spec-panel" aria-live="polite">
                <div className="win-title">
                  <span>P1 · SELECTED CAR</span>
                  <span className="win-dots">
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
                <div className="win-body">
                  <div className="name-row">
                    <h1 className="car-name">{current.name}</h1>
                    <span className="rank-badge" title="Overall rating">
                      {rank(ovr)}
                    </span>
                  </div>
                  <span className="car-model">{current.model}</span>
                  <div className="stat-list">
                    {statRows.map(([label, value, pct, Icon]) => (
                      <div className="stat-row" key={label}>
                        <span className="stat-label">
                          <Icon size={13} />
                          {label}
                        </span>
                        <span className="segs" aria-hidden="true">
                          {Array.from({ length: 10 }, (_, n) => (
                            <i key={n} className={n < Math.round(pct / 10) ? "on" : ""} />
                          ))}
                        </span>
                        <span className="stat-num">{String(value).padStart(3, "0")}</span>
                      </div>
                    ))}
                  </div>
                  <div className="ovr-line">
                    <span>OVERALL</span>
                    <b>{ovr}</b>
                  </div>
                </div>
              </section>

              <div className="showcase" ref={anchorRef}>
                <button
                  type="button"
                  className="nav-arrow nav-left"
                  onClick={() => pick(selected - 1)}
                  aria-label="Previous car"
                >
                  <ChevronLeft size={26} />
                </button>
                <button
                  type="button"
                  className="nav-arrow nav-right"
                  onClick={() => pick(selected + 1)}
                  aria-label="Next car"
                >
                  <ChevronRight size={26} />
                </button>
                <span className="showcase-count">
                  {String(selected + 1).padStart(2, "0")} / {String(cars.length).padStart(2, "0")}
                </span>
              </div>

              <aside className="action-panel">
                <button
                  type="button"
                  className="arcade-btn start-btn"
                  onClick={() => startRef.current()}
                >
                  <Play size={18} /> START <small>ENTER</small>
                </button>
                <button type="button" className="arcade-btn alt-btn" {...hold("testfire")}>
                  <Crosshair size={16} /> TEST FIRE <small>HOLD SPACE</small>
                </button>
                <p className="entry-note">
                  <Swords size={13} /> {TOTAL} CARS ENTER · 1 LEAVES
                </p>
                <p className="key-tip">
                  <kbd>←</kbd>
                  <kbd>→</kbd> CHANGE CAR
                </p>
              </aside>
            </div>

            <section className="win garage-strip" aria-label="Garage">
              <div className="win-title">
                <span>GARAGE</span>
                <span>{cars.length} VEHICLES</span>
              </div>
              <div className="tiles" role="listbox" aria-label="Choose your car">
                {cars.map((car, i) => (
                  <button
                    key={car.name}
                    type="button"
                    role="option"
                    aria-selected={selected === i}
                    className={`tile ${selected === i ? "tile-active" : ""}`}
                    style={{ "--c": car.color } as CSSProperties}
                    onClick={() => pick(i)}
                    aria-label={`Select ${car.name}`}
                  >
                    <span className="tile-index">{String(i + 1).padStart(2, "0")}</span>
                    {selected === i && <span className="tile-flag">P1</span>}
                    <span className="tile-art">
                      {broken[i] ? (
                        <span className="tile-swatch" />
                      ) : (
                        <img
                          src={car.url}
                          alt=""
                          loading="eager"
                          onError={() => setBroken((b) => ({ ...b, [i]: true }))}
                        />
                      )}
                    </span>
                    <span className="tile-name">{car.name}</span>
                    <span className="tile-rank">{rank(rating(car))}</span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}

        {mode === "playing" && (
          <>
            <div className="hud-top">
              <div className="hud-brand">
                <Crosshair size={14} /> LAST CAR <b>STANDING</b>
              </div>
              <div className="hud-timer">{fmtTime(hud.time)}</div>
              <div className="hud-top-right">
                <button
                  type="button"
                  className="icon-btn"
                  onClick={toggleMute}
                  aria-label={muted ? "Unmute sound" : "Mute sound"}
                >
                  {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={togglePause}
                  aria-label={paused ? "Resume" : "Pause"}
                >
                  {paused ? <Play size={15} /> : "II"}
                </button>
              </div>
            </div>
            <div className="hud-left win">
              <span className="hud-eyebrow">STILL IN THE FIGHT</span>
              <div className="hud-count">
                <b>{String(hud.alive).padStart(2, "0")}</b>
                <span>/{TOTAL}</span>
              </div>
              <span className="hud-kills">{String(hud.kills).padStart(2, "0")} ELIMINATIONS</span>
            </div>
            <div className="hud-vitals win">
              <div className="vital-head">
                <span>
                  <Heart size={13} /> HULL
                </span>
                <b>
                  {hud.hp}
                  <small> HP</small>
                </b>
              </div>
              <div className="vital-track">
                <span style={{ width: `${clamp((hud.hp / current.hp) * 100, 0, 100)}%` }} />
              </div>
              <div className="vital-car">{current.name.toUpperCase()}</div>
            </div>
            <div className="hud-map win">
              <span className="hud-eyebrow">RADAR</span>
              <div className="map-frame">
                {blocks.map(([x, y, w, h], i) => (
                  <i
                    key={i}
                    className="map-block"
                    style={{
                      left: `${(x / WORLD.width) * 100}%`,
                      top: `${(y / WORLD.height) * 100}%`,
                      width: `${(w / WORLD.width) * 100}%`,
                      height: `${(h / WORLD.height) * 100}%`,
                    }}
                  />
                ))}
                {hud.dots.map((d, i) => (
                  <i
                    key={i}
                    className={d.me ? "map-player" : "map-dot"}
                    style={{ left: `${d.x}%`, top: `${d.y}%` }}
                  />
                ))}
              </div>
            </div>
            <div className="hud-bottom">
              <div className="key-hints">
                <span>
                  <kbd>W</kbd>
                  <kbd>A</kbd>
                  <kbd>S</kbd>
                  <kbd>D</kbd> DRIVE
                </span>
                <span>
                  <kbd>5</kbd>
                  <kbd>SPACE</kbd> FIRE
                </span>
                <span>
                  <kbd>ESC</kbd> PAUSE
                </span>
              </div>
              <div className="mobile-controls">
                <div className="dpad">
                  <button type="button" className="pad-key pad-up" aria-label="Up" {...hold("w")}>
                    ▲
                  </button>
                  <button
                    type="button"
                    className="pad-key pad-left"
                    aria-label="Left"
                    {...hold("a")}
                  >
                    ◀
                  </button>
                  <button
                    type="button"
                    className="pad-key pad-down"
                    aria-label="Down"
                    {...hold("s")}
                  >
                    ▼
                  </button>
                  <button
                    type="button"
                    className="pad-key pad-right"
                    aria-label="Right"
                    {...hold("d")}
                  >
                    ▶
                  </button>
                </div>
                <button type="button" className="arcade-btn mobile-fire" {...hold("5")}>
                  <Crosshair size={18} /> FIRE
                </button>
              </div>
            </div>
            {paused && (
              <div className="overlay">
                <div className="win overlay-box">
                  <div className="win-title">
                    <span>PAUSED</span>
                  </div>
                  <div className="win-body center">
                    <h2 className="big-title">
                      MATCH
                      <br />
                      <em>PAUSED</em>
                    </h2>
                    <button type="button" className="arcade-btn start-btn" onClick={togglePause}>
                      <Play size={16} /> RESUME
                    </button>
                    <button
                      type="button"
                      className="arcade-btn alt-btn"
                      onClick={() => {
                        pausedRef.current = false;
                        setPaused(false);
                        setModeSync("select");
                      }}
                    >
                      ABANDON MATCH
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {mode === "result" && (
          <div className="overlay">
            <div className="win overlay-box">
              <div className="win-title">
                <span>
                  <Trophy size={13} /> MATCH COMPLETE
                </span>
              </div>
              <div className="win-body center">
                <h1 className="big-title">
                  {result.won ? (
                    <>
                      LAST CAR
                      <br />
                      <em>STANDING!</em>
                    </>
                  ) : (
                    <>
                      GAME
                      <br />
                      <em>OVER</em>
                    </>
                  )}
                </h1>
                <p className="result-sub">
                  {result.won ? "THE ARENA IS YOURS." : "THE ARENA CLAIMS ANOTHER."}
                </p>
                <div className="result-stats">
                  <div>
                    <span>POSITION</span>
                    <b>#{String(result.position).padStart(2, "0")}</b>
                  </div>
                  <div>
                    <span>XP</span>
                    <b>+{result.xp}</b>
                  </div>
                  <div>
                    <span>KILLS</span>
                    <b>{String(hud.kills).padStart(2, "0")}</b>
                  </div>
                </div>
                <button
                  type="button"
                  className="arcade-btn start-btn"
                  onClick={() => startRef.current()}
                >
                  <Play size={16} /> {result.won ? "PLAY AGAIN" : "CONTINUE?"}
                </button>
                <button
                  type="button"
                  className="arcade-btn alt-btn"
                  onClick={() => setModeSync("select")}
                >
                  BACK TO GARAGE
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

const BOX_COLORS = ["#b5482f", "#3f6f9a", "#5d7a3a", "#c9992e", "#7b838f"];

/** "#rrggbb" shaded toward black (f<0) or white (f>0). */
function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const m = (c: number) => Math.round(f < 0 ? c * (1 + f) : c + (255 - c) * f);
  return `rgb(${m((n >> 16) & 255)},${m((n >> 8) & 255)},${m(n & 255)})`;
}

/** Top-down box obstacle: small ones are wooden crates, big ones are shipping containers. */
function drawBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  i: number,
) {
  const lip = 9; // fake height: darker front face under the lid
  ctx.fillStyle = "rgba(0,0,0,0.38)";
  ctx.fillRect(x + 12, y + 14, w, h);
  if (w <= 110 && h <= 110) {
    // wooden crate
    ctx.fillStyle = "#6b4823";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#b07d45";
    ctx.fillRect(x, y, w, h - lip);
    ctx.strokeStyle = "rgba(60,35,10,0.35)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let py = y + 14; py < y + h - lip; py += 14) {
      ctx.moveTo(x, py);
      ctx.lineTo(x + w, py);
    }
    ctx.stroke();
    ctx.strokeStyle = "#7a5228";
    ctx.lineWidth = 6;
    ctx.strokeRect(x + 3, y + 3, w - 6, h - lip - 6);
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x + 6, y + 6);
    ctx.lineTo(x + w - 6, y + h - lip - 6);
    ctx.moveTo(x + w - 6, y + 6);
    ctx.lineTo(x + 6, y + h - lip - 6);
    ctx.stroke();
    ctx.fillStyle = "#d8b27a";
    for (const [cx, cy] of [
      [x + 6, y + 6],
      [x + w - 6, y + 6],
      [x + 6, y + h - lip - 6],
      [x + w - 6, y + h - lip - 6],
    ] as [number, number][])
      ctx.fillRect(cx - 2, cy - 2, 4, 4);
    return;
  }
  // shipping container
  const col = BOX_COLORS[i % BOX_COLORS.length] ?? "#7b838f";
  const horiz = w >= h;
  ctx.fillStyle = shade(col, -0.45);
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = col;
  ctx.fillRect(x, y, w, h - lip);
  // corrugation ribs run across the container's short side
  const th = h - lip;
  ctx.lineWidth = 2;
  for (let k = 10; k < (horiz ? w : th) - 6; k += 10) {
    ctx.strokeStyle = shade(col, -0.3);
    ctx.beginPath();
    if (horiz) {
      ctx.moveTo(x + k, y + 8);
      ctx.lineTo(x + k, y + th - 8);
    } else {
      ctx.moveTo(x + 8, y + k);
      ctx.lineTo(x + w - 8, y + k);
    }
    ctx.stroke();
    ctx.strokeStyle = shade(col, 0.22);
    ctx.beginPath();
    if (horiz) {
      ctx.moveTo(x + k + 2, y + 8);
      ctx.lineTo(x + k + 2, y + th - 8);
    } else {
      ctx.moveTo(x + 8, y + k + 2);
      ctx.lineTo(x + w - 8, y + k + 2);
    }
    ctx.stroke();
  }
  // door end: two locking bars
  ctx.strokeStyle = shade(col, -0.55);
  ctx.lineWidth = 3;
  ctx.beginPath();
  if (horiz) {
    ctx.moveTo(x + w - 14, y + 6);
    ctx.lineTo(x + w - 14, y + th - 6);
    ctx.moveTo(x + w - 22, y + 6);
    ctx.lineTo(x + w - 22, y + th - 6);
  } else {
    ctx.moveTo(x + 6, y + th - 14);
    ctx.lineTo(x + w - 6, y + th - 14);
    ctx.moveTo(x + 6, y + th - 22);
    ctx.lineTo(x + w - 6, y + th - 22);
  }
  ctx.stroke();
  // steel frame + corner posts
  ctx.strokeStyle = shade(col, -0.4);
  ctx.lineWidth = 4;
  ctx.strokeRect(x + 2, y + 2, w - 4, th - 4);
  ctx.fillStyle = shade(col, -0.6);
  for (const [cx, cy] of [
    [x, y],
    [x + w - 9, y],
    [x, y + th - 9],
    [x + w - 9, y + th - 9],
  ] as [number, number][])
    ctx.fillRect(cx, cy, 9, 9);
}

let floorCanvas: HTMLCanvasElement | null = null;

/** Builds the arena floor once: slate-grey polished tiles, soft wear, worn lane paint. */
function getFloor(): HTMLCanvasElement {
  if (floorCanvas) return floorCanvas;
  const c = document.createElement("canvas");
  c.width = WORLD.width;
  c.height = WORLD.height;
  const f = c.getContext("2d")!;
  let seed = 90210;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let z = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
  const T = 80;
  f.fillStyle = "#3a3e48";
  f.fillRect(0, 0, c.width, c.height);
  for (let y = 0; y < c.height; y += T) {
    for (let x = 0; x < c.width; x += T) {
      // each tile gets a slightly different grey so the surface feels laid, not flat
      const d = Math.round((rnd() - 0.5) * 14);
      f.fillStyle = `rgb(${58 + d},${62 + d},${72 + d})`;
      f.fillRect(x, y, T, T);
      // soft top-left sheen
      const g = f.createLinearGradient(x, y, x + T, y + T);
      g.addColorStop(0, "rgba(255,255,255,0.07)");
      g.addColorStop(0.5, "rgba(255,255,255,0)");
      g.addColorStop(1, "rgba(0,0,0,0.10)");
      f.fillStyle = g;
      f.fillRect(x, y, T, T);
      // grit
      for (let i = 0; i < 12; i++) {
        f.fillStyle = rnd() > 0.5 ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.12)";
        f.fillRect(x + rnd() * T, y + rnd() * T, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
      }
      // bevelled seams: light edge on top/left, dark grout on bottom/right
      f.fillStyle = "rgba(255,255,255,0.09)";
      f.fillRect(x, y, T, 1);
      f.fillRect(x, y, 1, T);
      f.fillStyle = "rgba(0,0,0,0.35)";
      f.fillRect(x, y + T - 2, T, 2);
      f.fillRect(x + T - 2, y, 2, T);
    }
  }
  // oil / wear stains
  for (let i = 0; i < 40; i++) {
    const sx = rnd() * c.width,
      sy = rnd() * c.height,
      r = 30 + rnd() * 70;
    const g = f.createRadialGradient(sx, sy, 0, sx, sy, r);
    g.addColorStop(0, "rgba(10,12,20,0.16)");
    g.addColorStop(1, "rgba(10,12,20,0)");
    f.fillStyle = g;
    f.fillRect(sx - r, sy - r, r * 2, r * 2);
  }
  // worn lane paint
  f.setLineDash([26, 20]);
  f.lineWidth = 5;
  f.strokeStyle = "rgba(240,205,90,0.5)";
  for (const y of [500, 1010]) {
    f.beginPath();
    f.moveTo(0, y);
    f.lineTo(c.width, y);
    f.stroke();
  }
  f.setLineDash([]);
  // soft vignette toward the walls
  const vg = f.createRadialGradient(
    c.width / 2,
    c.height / 2,
    Math.min(c.width, c.height) * 0.35,
    c.width / 2,
    c.height / 2,
    Math.max(c.width, c.height) * 0.75,
  );
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.35)");
  f.fillStyle = vg;
  f.fillRect(0, 0, c.width, c.height);
  floorCanvas = c;
  return c;
}

/** "#rrggbb" + alpha → "rgba(r,g,b,a)". Plain rgba() keeps canvas and CSS happy on old Chrome. */
function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
