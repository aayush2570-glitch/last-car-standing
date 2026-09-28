import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Crosshair, Heart, MoveUpRight, Shield, Trophy, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import blackTruck from "@/assets/black_gatling_pickup.png.asset.json";
import blueTruck from "@/assets/blue_turret_truck.png.asset.json";
import greenJeep from "@/assets/green_military_jeep.png.asset.json";
import orangeSportsCar from "@/assets/orange_sports_car.png.asset.json";
import policeCar from "@/assets/police_car.png.asset.json";
import purpleCar from "@/assets/purple_futuristic_car.png.asset.json";
import redMuscleCar from "@/assets/red_muscle_car.png.asset.json";
import yellowTruck from "@/assets/yellow_turret_truck.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Last Car Standing — Combat Arena" },
      { name: "description", content: "Choose your ride. Enter the arena. Be the last car standing." },
      { property: "og:title", content: "Last Car Standing — Combat Arena" },
      { property: "og:description", content: "Choose your ride and fight to survive in a top-down car combat arena." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ArenaGame,
});

const cars = [
  { name: "Gatling", model: "BLACK GATLING PICKUP", asset: blackTruck, hp: 112, speed: 72, fireRate: 81, damage: 81, armor: 56, color: "var(--car-black)" },
  { name: "Blue Turret", model: "ARMORED SUPPORT", asset: blueTruck, hp: 148, speed: 49, fireRate: 54, damage: 70, armor: 93, color: "var(--car-blue)" },
  { name: "Military Jeep", model: "FIELD COMMANDER", asset: greenJeep, hp: 125, speed: 65, fireRate: 66, damage: 64, armor: 76, color: "var(--car-green)" },
  { name: "Street Runner", model: "ORANGE SPORTS CAR", asset: orangeSportsCar, hp: 86, speed: 96, fireRate: 61, damage: 55, armor: 41, color: "var(--car-orange)" },
  { name: "Interceptor", model: "POLICE PURSUIT", asset: policeCar, hp: 115, speed: 72, fireRate: 91, damage: 59, armor: 68, color: "var(--car-blue)" },
  { name: "Phantom", model: "FUTURE DIVISION", asset: purpleCar, hp: 96, speed: 91, fireRate: 86, damage: 63, armor: 49, color: "var(--car-violet)" },
  { name: "Redline", model: "RED MUSCLE CAR", asset: redMuscleCar, hp: 139, speed: 70, fireRate: 62, damage: 87, armor: 78, color: "var(--car-red)" },
  { name: "Heavy Metal", model: "YELLOW TURRET TRUCK", asset: yellowTruck, hp: 158, speed: 45, fireRate: 53, damage: 97, armor: 95, color: "var(--car-yellow)" },
] as const;

type Vehicle = { x: number; y: number; angle: number; hp: number; alive: boolean; cooldown: number; bot: boolean; drift: number; carId: number; hit: number };
type Projectile = { x: number; y: number; vx: number; vy: number; owner: Vehicle; life: number; damage: number };
const WORLD = { width: 2400, height: 1720 };
const blocks = [
  [370, 260, 180, 142], [720, 235, 240, 100], [1290, 230, 145, 195], [1810, 270, 220, 126],
  [245, 680, 260, 104], [885, 620, 130, 230], [1530, 655, 260, 105], [1990, 690, 138, 225],
  [410, 1120, 170, 220], [1010, 1150, 290, 115], [1550, 1090, 125, 244], [1870, 1180, 270, 106],
  [745, 935, 105, 72], [1380, 940, 100, 75], [1100, 400, 75, 72], [580, 900, 80, 72],
];

function ArenaGame() {
  const [selected, setSelected] = useState(0);
  const [mode, setMode] = useState<"select" | "playing" | "result">("select");
  const [hud, setHud] = useState({ hp: 100, alive: 12, kills: 0, time: 0 });
  const [result, setResult] = useState({ won: false, position: 12, xp: 0 });
  const [paused, setPaused] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<{ player: Vehicle; cars: Vehicle[]; bullets: Projectile[]; keys: Set<string>; started: number; lastHud: number; kills: number; images: HTMLImageElement[] } | null>(null);
  const modeRef = useRef(mode);
  const pausedRef = useRef(paused);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  const startMatch = useCallback(() => {
    const playerCar = cars[selected];
    const player: Vehicle = { x: 1200, y: 860, angle: -Math.PI / 2, hp: playerCar.hp, alive: true, cooldown: 0, bot: false, drift: 0, carId: selected, hit: 0 };
    const rivals: Vehicle[] = [];
    for (let i = 0; i < 11; i++) {
      let x = 170 + Math.random() * 2060, y = 160 + Math.random() * 1400;
      if (Math.hypot(x - player.x, y - player.y) < 390) { x = 220 + i * 175; y = i % 2 ? 340 : 1370; }
      rivals.push({ x, y, angle: Math.random() * Math.PI * 2, hp: cars[(i + selected + 1) % cars.length].hp, alive: true, cooldown: Math.random() * 1.8, bot: true, drift: Math.random() * 5, carId: (i + selected + 1) % cars.length, hit: 0 });
    }
    const images = cars.map(car => { const img = new Image(); img.src = car.asset.url; return img; });
    gameRef.current = { player, cars: [player, ...rivals], bullets: [], keys: new Set(), started: performance.now(), lastHud: 0, kills: 0, images };
    setHud({ hp: playerCar.hp, alive: 12, kills: 0, time: 0 }); setPaused(false); setMode("playing");
  }, [selected]);

  const finishMatch = useCallback((won: boolean, position: number) => {
    const g = gameRef.current;
    const xp = won ? 750 : Math.max(80, (12 - position) * 90 + 100);
    setResult({ won, position, xp });
    setMode("result");
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let frame = 0;
    let previous = performance.now();
    let resizeObserver: ResizeObserver | null = null;
    let width = 1, height = 1, pixelRatio = 1;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width; height = rect.height;
      canvas.width = Math.round(width * pixelRatio); canvas.height = Math.round(height * pixelRatio);
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    };
    resizeObserver = new ResizeObserver(resize); resizeObserver.observe(canvas); resize();
    const style = getComputedStyle(document.documentElement);
    const color = (name: string) => style.getPropertyValue(name).trim();
    const draw = (now: number) => {
      const dt = Math.min((now - previous) / 1000, 0.04); previous = now;
      const g = gameRef.current;
      const active = g && modeRef.current === "playing" && !pausedRef.current;
      if (active) {
        const p = g.player; const stats = cars[p.carId];
        const keys = g.keys;
        const forward = Number(keys.has("w") || keys.has("arrowup")) - Number(keys.has("s") || keys.has("arrowdown"));
        const side = Number(keys.has("d") || keys.has("arrowright")) - Number(keys.has("a") || keys.has("arrowleft"));
        if (forward || side) {
          const target = Math.atan2(side, -forward);
          let delta = ((target - p.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
          p.angle += delta * Math.min(1, dt * 4.2);
          p.x += Math.sin(p.angle) * (stats.speed * 2.15) * dt;
          p.y -= Math.cos(p.angle) * (stats.speed * 2.15) * dt;
        }
        p.x = Math.max(65, Math.min(WORLD.width - 65, p.x)); p.y = Math.max(65, Math.min(WORLD.height - 65, p.y));
        if ((keys.has("5") || keys.has(" ")) && p.cooldown <= 0) {
          const tx = p.x + Math.sin(p.angle) * 44, ty = p.y - Math.cos(p.angle) * 44;
          g.bullets.push({ x: tx, y: ty, vx: Math.sin(p.angle) * 570, vy: -Math.cos(p.angle) * 570, owner: p, life: 2.2, damage: stats.damage * 0.16 });
          p.cooldown = (1 - stats.fireRate / 140) * 0.53 + 0.14;
        }
        for (const bot of g.cars.slice(1)) {
          if (!bot.alive) continue;
          bot.cooldown -= dt;
          const targets = g.cars.filter(x => x.alive && x !== bot);
          if (!targets.length) continue;
          let target = targets[0];
          for (const candidate of targets) if (Math.hypot(candidate.x - bot.x, candidate.y - bot.y) < Math.hypot(target.x - bot.x, target.y - bot.y)) target = candidate;
          const distance = Math.hypot(target.x - bot.x, target.y - bot.y);
          const desired = Math.atan2(target.x - bot.x, -(target.y - bot.y));
          let delta = ((desired - bot.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
          bot.angle += Math.max(-1, Math.min(1, delta)) * dt * (distance < 310 ? 0.5 : 1.8);
          bot.drift -= dt;
          if (bot.drift <= 0) { bot.drift = 1.8 + Math.random() * 3.8; bot.hit = -0.8 - Math.random() * 1.2; }
          const pace = distance < 260 ? -0.38 : distance < 410 ? 0.28 : 0.7;
          bot.x += Math.sin(bot.angle) * 96 * pace * dt + (bot.hit < 0 ? Math.cos(bot.angle) * 28 : 0) * dt;
          bot.y -= Math.cos(bot.angle) * 96 * pace * dt - (bot.hit < 0 ? Math.sin(bot.angle) * 28 : 0) * dt;
          bot.x = Math.max(65, Math.min(WORLD.width - 65, bot.x)); bot.y = Math.max(65, Math.min(WORLD.height - 65, bot.y));
          if (distance < 560 && bot.cooldown <= 0 && Math.abs(delta) < 1.0) {
            const aim = desired + (Math.random() - 0.5) * 0.2;
            g.bullets.push({ x: bot.x + Math.sin(aim) * 37, y: bot.y - Math.cos(aim) * 37, vx: Math.sin(aim) * 400, vy: -Math.cos(aim) * 400, owner: bot, life: 2.5, damage: 5.3 });
            bot.cooldown = 0.52 + Math.random() * 0.58;
          }
        }
        for (const bullet of g.bullets) {
          bullet.x += bullet.vx * dt; bullet.y += bullet.vy * dt; bullet.life -= dt;
          if (blocks.some(([x, y, w, h]) => bullet.x > x && bullet.x < x + w && bullet.y > y && bullet.y < y + h)) bullet.life = 0;
          for (const v of g.cars) if (v.alive && v !== bullet.owner && bullet.life > 0 && Math.hypot(bullet.x - v.x, bullet.y - v.y) < 32) {
            const target = cars[v.carId];
            v.hp -= bullet.damage * (1 - target.armor / 250); bullet.life = 0; v.hit = 0.14;
            if (v.hp <= 0) { v.hp = 0; v.alive = false; if (bullet.owner === p) g.kills++; }
          }
        }
        g.bullets = g.bullets.filter(b => b.life > 0 && b.x > 0 && b.x < WORLD.width && b.y > 0 && b.y < WORLD.height);
        p.cooldown = Math.max(0, p.cooldown - dt); p.hit = Math.max(0, p.hit - dt);
        const alive = g.cars.filter(x => x.alive).length;
        if (!p.alive) finishMatch(false, alive + 1);
        else if (alive === 1) finishMatch(true, 1);
        if (now - g.lastHud > 140) { setHud({ hp: Math.ceil(p.hp), alive, kills: g.kills, time: Math.floor((now - g.started) / 1000) }); g.lastHud = now; }
      }
      const g2 = gameRef.current;
      const p = g2?.player;
      const zoom = Math.min(width / 820, height / 560, 1);
      const cx = p && modeRef.current === "playing" ? p.x : WORLD.width / 2;
      const cy = p && modeRef.current === "playing" ? p.y : WORLD.height / 2;
      const ox = width / 2 - cx * zoom, oy = height / 2 - cy * zoom;
      ctx.fillStyle = color("--arena-ground"); ctx.fillRect(0, 0, width, height);
      ctx.save(); ctx.translate(ox, oy); ctx.scale(zoom, zoom);
      ctx.fillStyle = color("--arena-floor"); ctx.fillRect(0, 0, WORLD.width, WORLD.height);
      ctx.strokeStyle = color("--arena-grid"); ctx.lineWidth = 1;
      for (let x = 0; x <= WORLD.width; x += 80) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD.height); ctx.stroke(); }
      for (let y = 0; y <= WORLD.height; y += 80) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD.width, y); ctx.stroke(); }
      ctx.setLineDash([12, 12]); ctx.lineWidth = 3; ctx.strokeStyle = color("--arena-road");
      for (const y of [500, 1010]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD.width, y); ctx.stroke(); }
      ctx.setLineDash([]);
      for (const [x, y, w, h] of blocks) {
        ctx.fillStyle = color("--arena-shadow"); ctx.fillRect(x + 9, y + 11, w, h);
        ctx.fillStyle = color("--arena-building"); ctx.fillRect(x, y, w, h);
        ctx.fillStyle = color("--arena-roof"); ctx.fillRect(x + 8, y + 8, w - 16, h - 16);
        ctx.fillStyle = color("--arena-window");
        for (let wx = x + 22; wx < x + w - 18; wx += 34) for (let wy = y + 21; wy < y + h - 15; wy += 30) ctx.fillRect(wx, wy, 9, 9);
        ctx.fillStyle = color("--arena-trim"); ctx.fillRect(x + 13, y + 12, Math.min(34, w - 26), 3);
      }
      const game = g2;
      if (game) {
        for (const b of game.bullets) { ctx.fillStyle = b.owner.bot ? color("--bullet-hostile") : color("--bullet-friendly"); ctx.shadowBlur = 10; ctx.shadowColor = ctx.fillStyle; ctx.beginPath(); ctx.arc(b.x, b.y, 5, 0, Math.PI * 2); ctx.fill(); }
        ctx.shadowBlur = 0;
        for (const vehicle of game.cars) {
          if (!vehicle.alive) continue;
          const image = game.images[vehicle.carId]; const vw = vehicle.carId === 3 ? 43 : 48; const vh = vehicle.carId === 3 ? 72 : 77;
          ctx.save(); ctx.translate(vehicle.x, vehicle.y); ctx.rotate(vehicle.angle);
          ctx.fillStyle = color("--car-shadow"); ctx.beginPath(); ctx.ellipse(4, 8, 23, 33, 0, 0, Math.PI * 2); ctx.fill();
          if (image?.complete && image.naturalWidth) ctx.drawImage(image, -vw / 2, -vh / 2, vw, vh);
          else { ctx.fillStyle = color("--arena-window"); ctx.fillRect(-15, -25, 30, 50); }
          if (vehicle === game.player) { ctx.strokeStyle = color("--player-outline"); ctx.lineWidth = 2.4; ctx.beginPath(); ctx.ellipse(0, 0, 23, 37, 0, 0, Math.PI * 2); ctx.stroke(); }
          ctx.restore();
          if (vehicle === game.player || vehicle.hp < cars[vehicle.carId].hp * 0.63) {
            ctx.fillStyle = color("--health-track"); ctx.fillRect(vehicle.x - 23, vehicle.y - 45, 46, 4);
            ctx.fillStyle = vehicle === game.player ? color("--health-player") : color("--health-bot");
            ctx.fillRect(vehicle.x - 23, vehicle.y - 45, 46 * Math.max(0, vehicle.hp / cars[vehicle.carId].hp), 4);
          }
        }
      }
      ctx.strokeStyle = color("--arena-boundary"); ctx.lineWidth = 8; ctx.strokeRect(0, 0, WORLD.width, WORLD.height);
      ctx.restore();
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); resizeObserver?.disconnect(); };
  }, [finishMatch]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent, down: boolean) => {
      const key = e.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", "5", " ", "escape"].includes(key)) e.preventDefault();
      if (key === "escape" && down && modeRef.current === "playing") setPaused(v => !v);
      const g = gameRef.current;
      if (g) down ? g.keys.add(key) : g.keys.delete(key);
    };
    const onDown = (e: KeyboardEvent) => onKey(e, true); const onUp = (e: KeyboardEvent) => onKey(e, false);
    window.addEventListener("keydown", onDown); window.addEventListener("keyup", onUp);
    return () => { window.removeEventListener("keydown", onDown); window.removeEventListener("keyup", onUp); };
  }, []);

  const touchKey = (key: string, down: boolean) => { const g = gameRef.current; if (g) down ? g.keys.add(key) : g.keys.delete(key); };
  const current = cars[selected];
  const elapsed = `${Math.floor(hud.time / 60).toString().padStart(2, "0")}:${(hud.time % 60).toString().padStart(2, "0")}`;

  return (
    <main className="game-shell">
      <section className={`arena-stage ${mode === "playing" ? "is-playing" : ""}`} aria-label="Car combat arena">
        <canvas ref={canvasRef} className="arena-canvas" aria-label="Live top-down car combat arena" />
        {mode !== "playing" && <div className="arena-brand"><span className="brand-mark"><Crosshair size={17} /></span><span>LAST CAR <b>STANDING</b></span><span className="brand-divider" /> <span className="brand-sub">COMBAT ARENA</span></div>}
        {mode !== "playing" && <div className="arena-corner"><span className="live-dot" /> ARENA 01 <span className="corner-divider">/</span> NO RULES</div>}

        {mode === "select" && <div className="selection-layout">
          <header className="selection-intro"><span className="eyebrow"><span className="eyebrow-line" /> SELECT YOUR VEHICLE</span><h1>PICK YOUR<br /><em>FIGHTER.</em></h1><div className="intro-foot"><span>01 — 08</span><span className="intro-stroke" /><span>EVERY CAR HAS ITS PRICE.</span></div></header>
          <div className="car-browser"><div className="browser-heading"><span>VEHICLE ROSTER</span><span className="roster-live">● &nbsp;8 COMBATANTS</span></div>
            <div className="vehicle-grid">{cars.map((car, i) => <button key={car.name} type="button" className={`vehicle-tile ${selected === i ? "vehicle-active" : ""}`} onClick={() => setSelected(i)} aria-label={`Select ${car.name}`} aria-pressed={selected === i}>
              <span className="tile-index">0{i + 1}</span><img src={car.asset.url} alt={car.name} /><span className="tile-name">{car.name}</span><span className="tile-class">{car.model}</span>{selected === i && <span className="selected-marker"><Crosshair size={11} /> SELECTED</span>}
            </button>)}</div>
            <div className="vehicle-detail"><div className="detail-identity"><span className="detail-overline">CURRENT LOADOUT</span><h2>{current.name}<span className="detail-period">.</span></h2><span className="detail-model">{current.model}</span></div>
              <div className="stat-list">{([["HP", current.hp, Heart], ["SPEED", current.speed, MoveUpRight], ["FIRE RATE", current.fireRate, Zap], ["DAMAGE", current.damage, Crosshair], ["ARMOR", current.armor, Shield]] as const).map(([label, value, Icon]) => <div className="stat-line" key={label}><span className="stat-label"><Icon size={12} />{label}</span><span className="stat-meter"><span style={{ width: `${value}%` }} /></span><span className="stat-number">{String(value).padStart(3, "0")}</span></div>)}</div>
            </div>
            <div className="launch-row"><span className="entry-count"><span>12</span> CARS ENTER THE ARENA</span><Button className="launch-button" onClick={startMatch}>ENTER THE ARENA <ArrowRight size={17} /></Button></div>
          </div>
        </div>}

        {mode === "playing" && <>
          <div className="combat-top"><div className="combat-brand"><Crosshair size={15} /> LAST CAR <b>STANDING</b><span>ARENA 01</span></div><div className="combat-timer">{elapsed}</div><Button variant="ghost" size="sm" className="pause-button" onClick={() => setPaused(v => !v)}>{paused ? "RESUME" : "Ⅱ"}</Button></div>
          <div className="combat-hud"><div className="hud-survivors"><span className="hud-eyebrow">STILL IN THE FIGHT</span><div><b>{String(hud.alive).padStart(2,"0")}</b><span className="hud-slash">/</span><span>12</span></div><span className="hud-kills">{String(hud.kills).padStart(2,"0")} ELIMINATIONS</span></div><div className="hud-vitals"><div className="vital-head"><span><Heart size={14}/> HULL INTEGRITY</span><b>{hud.hp}<small> HP</small></b></div><div className="vital-track"><span style={{ width: `${Math.min(100, hud.hp / cars[selected].hp * 100)}%` }} /></div><div className="vital-car">{current.name.toUpperCase()} <span>ARMOR {current.armor}</span></div></div><div className="hud-map"><span>SECTOR 01</span><div className="map-frame"><i className="map-dot" style={{ left: "50%", top: "50%" }} /><i className="map-player" style={{ left: `${15 + (Math.sin(hud.time * .2) + 1) * 35}%`, top: `${17 + (Math.cos(hud.time * .17) + 1) * 33}%` }} /></div></div></div>
          <div className="combat-bottom"><div className="key-hints"><span className="key-hint"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> DRIVE</span><span className="key-hint"><kbd>5</kbd> FIRE</span></div><div className="mobile-controls"><div className="dpad"><Button variant="ghost" className="pad-key pad-up" onPointerDown={() => touchKey("w", true)} onPointerUp={() => touchKey("w", false)} onPointerLeave={() => touchKey("w", false)}><ArrowUp /></Button><Button variant="ghost" className="pad-key pad-left" onPointerDown={() => touchKey("a", true)} onPointerUp={() => touchKey("a", false)} onPointerLeave={() => touchKey("a", false)}><ArrowLeft /></Button><Button variant="ghost" className="pad-key pad-down" onPointerDown={() => touchKey("s", true)} onPointerUp={() => touchKey("s", false)} onPointerLeave={() => touchKey("s", false)}><ArrowDown /></Button><Button variant="ghost" className="pad-key pad-right" onPointerDown={() => touchKey("d", true)} onPointerUp={() => touchKey("d", false)} onPointerLeave={() => touchKey("d", false)}><ArrowRight /></Button></div><Button className="mobile-fire" onPointerDown={() => touchKey("5", true)} onPointerUp={() => touchKey("5", false)} onPointerLeave={() => touchKey("5", false)}><Crosshair size={18} /> FIRE</Button></div><span className="combat-warning"><span className="live-dot" /> LIVE COMBAT</span></div>
          {paused && <div className="pause-overlay"><div className="pause-box"><span className="eyebrow">TAKE A BREATH</span><h2>MATCH<br /><em>PAUSED.</em></h2><Button className="launch-button" onClick={() => setPaused(false)}>BACK TO THE FIGHT <ArrowRight size={16}/></Button><Button variant="ghost" onClick={() => setMode("select")}>ABANDON MATCH</Button></div></div>}
        </>}

        {mode === "result" && <div className="result-overlay"><div className="result-box"><span className="eyebrow"><Trophy size={14}/> MATCH COMPLETE</span><h1>{result.won ? <>LAST CAR<br/><em>STANDING.</em></> : <>OUT OF THE<br/><em>FIGHT.</em></>}</h1><p className="result-sub">{result.won ? "THE ARENA IS YOURS." : "THE ARENA CLAIMS ANOTHER."}</p><div className="result-stats"><div><span>FINAL POSITION</span><b>#{result.position.toString().padStart(2,"0")}</b></div><div><span>EXPERIENCE EARNED</span><b className="xp-number">+{result.xp}<small> XP</small></b></div><div><span>ELIMINATIONS</span><b>{hud.kills.toString().padStart(2,"0")}</b></div></div><Button className="launch-button" onClick={startMatch}>{result.won ? "PLAY AGAIN" : "RUN IT BACK"} <ArrowRight size={17}/></Button><Button variant="ghost" className="garage-button" onClick={() => setMode("select")}>BACK TO THE GARAGE</Button></div></div>}
      </section>
      <footer className="game-footer"><span>LAST CAR STANDING <span className="footer-slash">/</span> SURVIVE THE SCRAP</span><span className="footer-right"><i/> NO RESPAWNS. NO MERCY.</span></footer>
    </main>
  );
}