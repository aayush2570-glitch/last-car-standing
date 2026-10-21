/* Broken-car props for the night "Wreck Garage" map: solid, pushable, and they blow up after enough bullets. */
import w01 from "@/assets/wrecks/wreck_01.webp";
import w02 from "@/assets/wrecks/wreck_02.webp";
import w03 from "@/assets/wrecks/wreck_03.webp";
import w04 from "@/assets/wrecks/wreck_04.webp";
import w05 from "@/assets/wrecks/wreck_05.webp";
import w06 from "@/assets/wrecks/wreck_06.webp";
import w07 from "@/assets/wrecks/wreck_07.webp";
import w08 from "@/assets/wrecks/wreck_08.webp";
import w09 from "@/assets/wrecks/wreck_09.webp";
import w10 from "@/assets/wrecks/wreck_10.webp";
import w11 from "@/assets/wrecks/wreck_11.webp";
import w12 from "@/assets/wrecks/wreck_12.webp";
import w13 from "@/assets/wrecks/wreck_13.webp";
import w14 from "@/assets/wrecks/wreck_14.webp";

const SRC = [w01, w02, w03, w04, w05, w06, w07, w08, w09, w10, w11, w12, w13, w14];
/** width / height of each sprite (all drawn nose-up) */
const RATIO = [118, 124, 125, 126, 121, 135, 119, 119, 131, 136, 114, 132, 135, 131].map(
  (w) => w / 250,
);

let imgs: HTMLImageElement[] | null = null;
export function wreckImages(): HTMLImageElement[] {
  if (imgs) return imgs;
  imgs = SRC.map((s) => {
    const im = new Image();
    im.src = s;
    return im;
  });
  return imgs;
}

export const WRECK_HITS = 10; // bullets a wreck takes before it blows up
export const WRECK_BLAST_R = 190;
export const WRECK_BLAST_DMG = 60;
const CAR_R = 26;
const MASS = 3; // a wreck is this many times heavier than a car, so it only gives way slowly

export type Wreck = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number; // 0 = nose up
  av: number;
  len: number;
  wid: number;
  r: number; // capsule radius
  half: number; // half length of the capsule's centre segment
  sprite: number;
  hits: number;
  flash: number;
  /** last car that shot it (gets the credit for the blast) */
  by?: unknown;
  /** chain reaction: seconds until this wreck blows up */
  fuse?: number;
};

export function makeWreck(x: number, y: number, angle: number, sprite: number): Wreck {
  const len = 116 + (sprite % 3) * 4;
  const wid = len * (RATIO[sprite] ?? 0.5);
  const r = wid * 0.46;
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    angle,
    av: 0,
    len,
    wid,
    r,
    half: Math.max(0, len / 2 - r),
    sprite,
    hits: 0,
    flash: 0,
  };
}

/** world-space end points of a wreck's centre segment */
const ends = (w: Wreck): [number, number, number, number] => {
  const ax = Math.sin(w.angle) * w.half,
    ay = -Math.cos(w.angle) * w.half;
  return [w.x - ax, w.y - ay, w.x + ax, w.y + ay];
};
const segPoint = (x1: number, y1: number, x2: number, y2: number, px: number, py: number) => {
  const dx = x2 - x1,
    dy = y2 - y1,
    l2 = dx * dx + dy * dy;
  const t = l2 < 1e-6 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2));
  return [x1 + dx * t, y1 + dy * t] as const;
};

/** true when a point (a bullet) is inside the wreck's body */
export function wreckContains(w: Wreck, px: number, py: number, pad = 0): boolean {
  const [x1, y1, x2, y2] = ends(w);
  const [cx, cy] = segPoint(x1, y1, x2, y2, px, py);
  return Math.hypot(px - cx, py - cy) < w.r + pad;
}

/** layout: a few parked lines plus scattered ones, none on top of a car start or inside the given keep-clear spots */
export function garageLayout(
  world: { width: number; height: number },
  keepClear: [number, number, number?][],
): Wreck[] {
  const list: Wreck[] = [];
  const dx = (world.width - 2400) / 2; // the layout is built for the 2400-wide map and centred on wider ones
  let k = Math.floor(Math.random() * 14);
  const next = () => (k++ * 5 + Math.floor(Math.random() * 3)) % SRC.length;
  const add = (x: number, y: number, a: number) => list.push(makeWreck(x, y, a, next()));
  // parked rows (nose up / down, side by side)
  for (let i = 0; i < 7; i++)
    add(330 + dx + i * 92, 420, Math.PI * (i % 2 ? 1 : 0) + (Math.random() - 0.5) * 0.12);
  for (let i = 0; i < 6; i++) add(1380 + dx + i * 94, 1290, (Math.random() - 0.5) * 0.14);
  // a sideways column (cars lined nose to tail)
  for (let i = 0; i < 5; i++)
    add(1850 + dx, 480 + i * 138, Math.PI / 2 + (Math.random() - 0.5) * 0.1);
  for (let i = 0; i < 4; i++)
    add(560 + dx, 1020 + i * 138, -Math.PI / 2 + (Math.random() - 0.5) * 0.1);
  // random wrecks
  for (let i = 0, n = Math.round((16 * world.width) / 2400); i < n; i++) {
    for (let t = 0; t < 30; t++) {
      const x = 150 + Math.random() * (world.width - 300),
        y = 150 + Math.random() * (world.height - 300);
      if (list.some((o) => Math.hypot(o.x - x, o.y - y) < 150)) continue;
      add(x, y, Math.random() * Math.PI * 2);
      break;
    }
  }
  return list.filter((w) =>
    keepClear.every(([x, y, r]) => Math.hypot(w.x - x, w.y - y) > (r ?? 170)),
  );
}

type Rect = [number, number, number, number];
const carPrev = new WeakMap<object, { x: number; y: number }>();

type CarLike = { x: number; y: number; alive: boolean };

/** one physics step: cars push wrecks (and lose speed doing it), wrecks bump each other, walls and blocks */
export function stepWrecks(
  wrecks: Wreck[],
  cars: CarLike[],
  dt: number,
  world: { width: number; height: number },
  blocks: Rect[],
  onBump?: (x: number, y: number, hard: boolean) => void,
) {
  if (dt <= 0) return;
  // car versus wreck
  for (const c of cars) {
    const prev = carPrev.get(c);
    const cvx = prev ? (c.x - prev.x) / dt : 0,
      cvy = prev ? (c.y - prev.y) / dt : 0;
    if (!c.alive) {
      carPrev.set(c, { x: c.x, y: c.y });
      continue;
    }
    for (const w of wrecks) {
      if (Math.abs(w.x - c.x) > w.len / 2 + 70 || Math.abs(w.y - c.y) > w.len / 2 + 70) continue;
      const [x1, y1, x2, y2] = ends(w);
      const [px, py] = segPoint(x1, y1, x2, y2, c.x, c.y);
      let dx = c.x - px,
        dy = c.y - py,
        d = Math.hypot(dx, dy);
      const min = w.r + CAR_R;
      if (d >= min) continue;
      if (d < 0.001) {
        dx = 0;
        dy = 1;
        d = 1;
      }
      const nx = dx / d,
        ny = dy / d,
        pen = min - d;
      // the wreck gives way most of the way, the car loses the rest as speed
      const wShare = MASS > 1 ? 0.62 : 0.5;
      c.x += nx * pen * (1 - wShare);
      c.y += ny * pen * (1 - wShare);
      w.x -= nx * pen * wShare;
      w.y -= ny * pen * wShare;
      // wreck contact point velocity (spin included)
      const rx = px - w.x,
        ry = py - w.y;
      const wvx = w.vx - w.av * ry,
        wvy = w.vy + w.av * rx;
      const closing = (cvx - wvx) * -nx + (cvy - wvy) * -ny; // car moving into the wreck
      if (closing > 0) {
        const j = closing * 0.55;
        w.vx -= nx * j * 0.9;
        w.vy -= ny * j * 0.9;
        const inertia = (MASS * (w.len * w.len + w.wid * w.wid)) / 12;
        w.av += ((rx * -ny - ry * -nx) * j * MASS * 0.4) / inertia;
        w.av = Math.max(-3.2, Math.min(3.2, w.av));
        // the car is slowed by shoving it
        c.x -= cvx * dt * 0.16 * Math.min(1, closing / 120) * 1;
        c.y -= cvy * dt * 0.16 * Math.min(1, closing / 120) * 1;
        if (closing > 110) onBump?.(px, py, closing > 260);
      }
    }
  }
  // wreck versus wreck (3 circles each)
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < wrecks.length; i++) {
      const a = wrecks[i] as Wreck;
      for (let j = i + 1; j < wrecks.length; j++) {
        const b = wrecks[j] as Wreck;
        if (Math.hypot(a.x - b.x, a.y - b.y) > (a.len + b.len) / 2 + 12) continue;
        const [a1, a2, a3, a4] = ends(a),
          [b1, b2, b3, b4] = ends(b);
        const ac = [
          [a1, a2],
          [a.x, a.y],
          [a3, a4],
        ];
        const bc = [
          [b1, b2],
          [b.x, b.y],
          [b3, b4],
        ];
        let worst = 0,
          wnx = 0,
          wny = 0,
          wpx = 0,
          wpy = 0;
        for (const [ax, ay] of ac as [number, number][])
          for (const [bx, by] of bc as [number, number][]) {
            const dx = bx - ax,
              dy = by - ay,
              d = Math.hypot(dx, dy),
              min = a.r + b.r;
            if (d < min && min - d > worst) {
              worst = min - d;
              const dd = d < 0.001 ? 1 : d;
              wnx = d < 0.001 ? 1 : dx / dd;
              wny = d < 0.001 ? 0 : dy / dd;
              wpx = (ax + bx) / 2;
              wpy = (ay + by) / 2;
            }
          }
        if (worst <= 0) continue;
        a.x -= wnx * worst * 0.5;
        a.y -= wny * worst * 0.5;
        b.x += wnx * worst * 0.5;
        b.y += wny * worst * 0.5;
        const rel = (b.vx - a.vx) * wnx + (b.vy - a.vy) * wny;
        if (rel < 0) {
          a.vx += wnx * rel * 0.5;
          a.vy += wny * rel * 0.5;
          b.vx -= wnx * rel * 0.5;
          b.vy -= wny * rel * 0.5;
          if (pass === 0 && -rel > 140) onBump?.(wpx, wpy, false);
        }
        // a little spin from the off-centre shove
        a.av -= ((wpx - a.x) * wny - (wpy - a.y) * wnx) * 0.0006 * Math.min(worst, 14);
        b.av += ((wpx - b.x) * wny - (wpy - b.y) * wnx) * 0.0006 * Math.min(worst, 14);
      }
    }
  }
  // integrate, friction, walls
  const damp = Math.exp(-2.4 * dt),
    adamp = Math.exp(-3 * dt);
  for (const w of wrecks) {
    w.x += w.vx * dt;
    w.y += w.vy * dt;
    w.angle += w.av * dt;
    w.vx *= damp;
    w.vy *= damp;
    w.av *= adamp;
    if (Math.hypot(w.vx, w.vy) < 3) {
      w.vx = 0;
      w.vy = 0;
    }
    if (Math.abs(w.av) < 0.02) w.av = 0;
    w.flash = Math.max(0, w.flash - dt * 5);
    const [x1, y1, x2, y2] = ends(w);
    for (const [cx, cy] of [
      [x1, y1],
      [w.x, w.y],
      [x2, y2],
    ] as [number, number][]) {
      let ox = 0,
        oy = 0;
      const m = 34 + w.r;
      if (cx < m) ox = m - cx;
      else if (cx > world.width - m) ox = world.width - m - cx;
      if (cy < m) oy = m - cy;
      else if (cy > world.height - m) oy = world.height - m - cy;
      for (const [bx, by, bw, bh] of blocks) {
        const nx = Math.max(bx, Math.min(cx, bx + bw)),
          ny = Math.max(by, Math.min(cy, by + bh));
        const dx = cx - nx,
          dy = cy - ny,
          d = Math.hypot(dx, dy);
        if (d < w.r && d > 0.001) {
          ox += (dx / d) * (w.r - d);
          oy += (dy / d) * (w.r - d);
        }
      }
      if (ox || oy) {
        w.x += ox;
        w.y += oy;
        if (ox) w.vx *= -0.25;
        if (oy) w.vy *= -0.25;
      }
    }
  }
}

/** the wreck's damage state: 0..1 (smoking from ~0.5, burning near 1) */
export const wreckHeat = (w: Wreck) => Math.min(1, w.hits / WRECK_HITS);

export function drawWreck(ctx: CanvasRenderingContext2D, w: Wreck, t: number) {
  const img = wreckImages()[w.sprite];
  ctx.save();
  ctx.translate(w.x + 9, w.y + 12);
  ctx.rotate(w.angle);
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(0, 0, w.wid * 0.58, w.len * 0.54, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(w.x, w.y);
  ctx.rotate(w.angle);
  if (img && img.complete && img.naturalWidth)
    ctx.drawImage(img, -w.wid / 2, -w.len / 2, w.wid, w.len);
  else {
    ctx.fillStyle = "#555";
    ctx.fillRect(-w.wid / 2, -w.len / 2, w.wid, w.len);
  }
  const heat = wreckHeat(w);
  if (heat > 0.3 || w.flash > 0) {
    ctx.globalCompositeOperation = "lighter";
    const a = Math.max(w.flash * 0.5, (heat - 0.3) * 0.5 * (0.75 + 0.25 * Math.sin(t * 14 + w.x)));
    const g = ctx.createRadialGradient(0, 0, 4, 0, 0, w.len * 0.6);
    g.addColorStop(0, `rgba(255,120,30,${a})`);
    g.addColorStop(1, "rgba(255,60,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(-w.len * 0.6, -w.len * 0.6, w.len * 1.2, w.len * 1.2);
  }
  ctx.restore();
}
