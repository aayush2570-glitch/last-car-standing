/* Night lighting for the Wreck Garage: a dark veil with soft holes cut by every car's headlights. */

export type Storm = { next: number; flash: number; echo: number };
export const newStorm = (): Storm => ({ next: 3 + Math.random() * 4, flash: 0, echo: 0 });

/** call every frame: occasional lightning (a main flash, often followed by a weaker second one) */
export function stepStorm(s: Storm, dt: number) {
  s.next -= dt;
  if (s.next <= 0) {
    s.flash = 1;
    s.echo = Math.random() < 0.6 ? 0.18 + Math.random() * 0.15 : 0;
    s.next = 7 + Math.random() * 10;
  }
  if (s.echo > 0) {
    s.echo -= dt;
    if (s.echo <= 0) s.flash = Math.max(s.flash, 0.75);
  }
  s.flash = Math.max(0, s.flash - dt * 3.4);
}

let lc: HTMLCanvasElement | null = null;

export type Lamp = { x: number; y: number; angle: number; h: number; w: number };

/**
 * Draws the darkness over the already-drawn world. `ox, oy, zoom` are the same camera numbers the world was drawn with.
 * The veil is ~90% black; headlight cones, a small glow around each car and each bullet punch through it.
 */
export function drawNight(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  ox: number,
  oy: number,
  zoom: number,
  lamps: Lamp[],
  glows: { x: number; y: number; r: number; a: number }[],
  flash: number,
) {
  if (!lc) lc = document.createElement("canvas");
  if (lc.width !== width || lc.height !== height) {
    lc.width = width;
    lc.height = height;
  }
  const l = lc.getContext("2d");
  if (!l) return;
  l.setTransform(1, 0, 0, 1, 0, 0);
  l.globalCompositeOperation = "source-over";
  l.clearRect(0, 0, width, height);
  const dark = 0.92 - flash * 0.66;
  l.fillStyle = `rgba(2,4,14,${dark})`;
  l.fillRect(0, 0, width, height);
  l.globalCompositeOperation = "destination-out";
  l.setTransform(zoom, 0, 0, zoom, ox, oy);
  for (const g of glows) {
    const rg = l.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.r);
    rg.addColorStop(0, `rgba(0,0,0,${g.a})`);
    rg.addColorStop(1, "rgba(0,0,0,0)");
    l.fillStyle = rg;
    l.fillRect(g.x - g.r, g.y - g.r, g.r * 2, g.r * 2);
  }
  for (const c of lamps) {
    l.save();
    l.translate(c.x, c.y);
    l.rotate(c.angle);
    // soft pool around the car itself, so you can always see what you are driving
    const pool = l.createRadialGradient(0, 0, 0, 0, 0, 110);
    pool.addColorStop(0, "rgba(0,0,0,0.62)");
    pool.addColorStop(1, "rgba(0,0,0,0)");
    l.fillStyle = pool;
    l.fillRect(-110, -110, 220, 220);
    // headlight cone: wide, long, fading with distance
    const fy = -c.h * 0.44;
    l.beginPath();
    l.moveTo(-c.w * 0.28, fy);
    l.lineTo(c.w * 0.28, fy);
    l.lineTo(240, fy - 560);
    l.lineTo(-240, fy - 560);
    l.closePath();
    l.save();
    l.clip();
    const cone = l.createRadialGradient(0, fy, 10, 0, fy, 580);
    cone.addColorStop(0, "rgba(0,0,0,1)");
    cone.addColorStop(0.45, "rgba(0,0,0,0.78)");
    cone.addColorStop(1, "rgba(0,0,0,0)");
    l.fillStyle = cone;
    l.fillRect(-260, fy - 600, 520, 620);
    l.restore();
    l.restore();
  }
  ctx.drawImage(lc, 0, 0);
  if (flash > 0.02) {
    // cold white-blue flash over everything
    const prev = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = `rgba(150,175,235,${flash * 0.22})`;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = prev;
  }
}
