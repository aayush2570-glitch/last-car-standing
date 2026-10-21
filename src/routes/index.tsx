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
  Users,
  Lock,
  ShoppingCart,
} from "lucide-react";
import {
  PAL,
  cars,
  carAt,
  drawFallbackCar,
  getSprites,
  spriteReady,
  type Car,
  CLONE_COUNT,
  CLONE_DAMAGE,
  CLONE_SPAWN_R,
  MINE_RADIUS,
  MINE_ARM,
  MINE_DAMAGE,
  MINE_MAX,
  MINE_BLUNDER,
  TURRET_MOUNT,
  TURRET_W,
  TURRET_PIVOT_Y,
  TURRET_MUZZLE,
  TURRET_TURN,
  TURRET_RANGE,
  getTurretSprite,
  abilityOf,
  baseOf,
  isV2,
  rollV2,
  v2Of,
} from "@/game/cars";
import { addXp, buyCar, useWallet } from "@/game/xp";
import { MissionToasts, MissionsButton } from "@/game/MissionsUI";
import {
  mAlive,
  mBehind,
  mMine,
  mBuy,
  mDamage,
  mEnd,
  mHit,
  mKill,
  mPickup,
  mPower,
  mStart,
} from "@/game/missions";
import { Fx, Sfx, drawTracer } from "@/game/fx";
import { RaceMode } from "@/game/RaceMode";
import { enterLandscape, useControlPrefs, useDevice } from "@/game/device";
import { ControlSettings, RotateOverlay, TouchControls, type Joy } from "@/game/TouchControls";

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
  strafeAng: number;
  trail: number;
  /* runtime extras (all optional so every spawn site keeps working) */
  px?: number;
  py?: number;
  vx?: number;
  vy?: number;
  foe?: Vehicle | null;
  steerSide?: number;
  stuckT?: number;
  unstick?: number;
  unstickAng?: number;
  smoke?: number;
  brake?: number;
  /* TDM */
  team?: number; // 0 = blue, 1 = red
  respawn?: number;
  inv?: number;
  /* 2-player split screen: 0 = player 1, 1 = player 2 (undefined for bots) */
  pi?: number;
  deadPos?: number;
  /* v2 abilities: hits landed toward the next charge, seconds the power has left, shield-block flash */
  charge?: number;
  abT?: number;
  blk?: number;
  /* Military Jeep v2 turret: world angle it points at, shot cooldown */
  tur?: number;
  tcd?: number;
  /* Blue Turret v2 Virtual Clone: set on a clone = the real car it fights for (its kills count for that car) */
  cloneOf?: Vehicle;
  /* last enemy that shot this car (or one of its clones) and how long that memory lasts: clones hunt it first */
  atk?: Vehicle;
  atkT?: number;
};
/** Redline v2 Magnetic Splash landmine: lies on the ground until an enemy touches it (one kill, then it is spent) */
type Mine = {
  x: number;
  y: number;
  owner: Vehicle;
  age: number;
  used: boolean;
  /** per-bot "did it notice this mine?" roll, so a bot can (rarely) blunder onto one */
  seen: Map<Vehicle, boolean>;
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
type Dot = { x: number; y: number; me: boolean; team?: number | undefined };
type Tdm = {
  score: [number, number];
  time: number;
  limit: number;
  team: number;
  team2?: number;
  draw?: boolean;
};
type TdmHud = {
  blue: number;
  red: number;
  left: number;
  respawn: number;
  team: number;
  respawn2?: number;
  team2?: number;
};
/** per-player outcome shown on the result card in 2-player mode */
type TwoRes = {
  p1: { won: boolean; pos: number; kills: number };
  p2: { won: boolean; pos: number; kills: number };
  /** 1 / 2 = that player won outright, 0 = shared result (draw, same team, or a bot won) */
  winner: number;
};
type Game = {
  player: Vehicle;
  cars: Vehicle[];
  bullets: Projectile[];
  mines: Mine[];
  started: number;
  lastHud: number;
  kills: number;
  over: { won: boolean; position: number; t: number } | null;
  trail: number;
  /* 2-player split screen */
  player2?: Vehicle;
  kills2?: number;
  cam2?: { x: number; y: number };
  powerups: Powerup[];
  spawnT: number;
  cam?: { x: number; y: number };
  camT?: number;
  tdm?: Tdm;
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
/* ───────────── TDM (6v6) world: the FFA map, extended sideways with a base circle at each end ───────────── */
const FFA_WORLD = { width: WORLD.width, height: WORLD.height };
const FFA_BLOCKS = blocks.map((b) => [...b] as [number, number, number, number]);
const TDM_WORLD = { width: 3600, height: 1720 };
const TDM_SHIFT = (TDM_WORLD.width - FFA_WORLD.width) / 2;
const TDM_FLANK: [number, number, number, number][] = [
  [700, 330, 120, 190],
  [700, 1200, 120, 190],
  [640, 760, 90, 200],
  [1000, 40, 150, 90],
  [1000, 1590, 150, 90],
];
const TDM_BLOCKS: [number, number, number, number][] = [
  ...FFA_BLOCKS.map(([x, y, w, h]) => [x + TDM_SHIFT, y, w, h] as [number, number, number, number]),
  ...TDM_FLANK,
  ...TDM_FLANK.map(
    ([x, y, w, h]) => [TDM_WORLD.width - x - w, y, w, h] as [number, number, number, number],
  ),
];
const TDM_SPAWN = [
  { x: 330, y: 860 },
  { x: TDM_WORLD.width - 330, y: 860 },
];
const SPAWN_R = 190;
const TDM_TIME = 600;
const TDM_RESPAWN = 5;
const TEAM_COL = ["#38a0ff", "#ff4040"];
const TEAM_RGB = ["56,160,255", "255,64,64"];
let worldKind: "ffa" | "tdm" = "ffa";
function setWorld(kind: "ffa" | "tdm") {
  if (kind === worldKind) return;
  const w = kind === "tdm" ? TDM_WORLD : FFA_WORLD;
  WORLD.width = w.width;
  WORLD.height = w.height;
  blocks.length = 0;
  for (const b of kind === "tdm" ? TDM_BLOCKS : FFA_BLOCKS) blocks.push([...b]);
  floorCanvas = null; // floor is rebuilt for the new map size
  worldKind = kind;
}
const bulletCol = (tdm: boolean, o: Vehicle) =>
  tdm ? (TEAM_COL[o.team === 1 ? 1 : 0] as string) : o.bot ? PAL.hostile : PAL.friendly;
const TARGETS = 7;
const CAR_RADIUS = 27;
/** bots drive with the same physics as the player; this scales their top speed (1 = same as player) */
const BOT_SPEED = 0.988;
const POWER_KINDS: PowerKind[] = ["health", "speed", "double"];
const POWER_COLOR: Record<PowerKind, string> = {
  health: "#3dff7a",
  speed: "#2ef2ff",
  double: "#ffe23d",
};
const POWER_LABEL: Record<PowerKind, string> = { health: "+", speed: "»", double: "II" };

/* ───────── 2-player split-screen controls ─────────
   Player 1: arrow keys (WASD also works) · fire = SPACE
   Player 2: numpad / number row  8 = up · 2 = down · 4 = left · 6 = right · 0 = fire
   (change the digits here if you want a different layout) */
type Ctl = { up: string[]; down: string[]; left: string[]; right: string[]; fire: string[] };
const P1_CTL: Ctl = {
  up: ["arrowup", "w"],
  down: ["arrowdown", "s"],
  left: ["arrowleft", "a"],
  right: ["arrowright", "d"],
  fire: [" "],
};
const P2_CTL: Ctl = { up: ["8"], down: ["2"], left: ["4"], right: ["6"], fire: ["0"] };
const NUMPAD: Record<string, string> = {
  Numpad0: "0",
  Numpad1: "1",
  Numpad2: "2",
  Numpad3: "3",
  Numpad4: "4",
  Numpad5: "5",
  Numpad6: "6",
  Numpad7: "7",
  Numpad8: "8",
  Numpad9: "9",
};
const anyKey = (keys: Set<string>, list: string[]) => list.some((k) => keys.has(k));
/** is this car's v2 power (of the given kind) running right now? */
const powerOn = (v: Vehicle, kind: "clone" | "ghost" | "mine" | "turret") =>
  (v.abT ?? 0) > 0 && abilityOf(v.carId)?.kind === kind;
/** the real car behind a vehicle: a Virtual Clone belongs to the car that made it, everything else is its own owner */
const ownerOf = (v: Vehicle): Vehicle => v.cloneOf ?? v;
const fmtXp = (n: number) => n.toLocaleString("en-US");
const P1_COLOR = "56,160,255";
const P2_COLOR = "61,255,122";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** wrap any angle into [-PI, PI) */
const wrapAng = (a: number) => a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2));
/** segment vs rectangle (slab test) */
function segHitsRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
) {
  let t0 = 0,
    t1 = 1;
  const dx = x2 - x1,
    dy = y2 - y1;
  const checks: [number, number][] = [
    [-dx, x1 - rx],
    [dx, rx + rw - x1],
    [-dy, y1 - ry],
    [dy, ry + rh - y1],
  ];
  for (const [pp, q] of checks) {
    if (pp === 0) {
      if (q < 0) return false;
    } else {
      const r = q / pp;
      if (pp < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }
  return true;
}
/** true if a straight line between two points is blocked by a crate / container */
const lineBlocked = (x1: number, y1: number, x2: number, y2: number, pad = 0) =>
  blocks.some(([x, y, w, h]) =>
    segHitsRect(x1, y1, x2, y2, x - pad, y - pad, w + pad * 2, h + pad * 2),
  );
const shotInterval = (c: Car) => (1 - c.fireRate / 140) * 0.53 + 0.14;
const rating = (c: Car) =>
  Math.round(((c.hp / 200) * 100 + c.speed + c.fireRate + c.damage + c.armor) / 5);
const rank = (r: number) => (r >= 76 ? "S" : r >= 70 ? "A" : r >= 64 ? "B" : "C");
const fmtTime = (s: number) =>
  `${Math.floor(s / 60)
    .toString()
    .padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

/** who won, for the 2-player result card (called once the match is over) */
function twoResult(g: Game): TwoRes {
  const p1 = g.player,
    p2 = g.player2 as Vehicle;
  const k1 = g.kills,
    k2 = g.kills2 ?? 0;
  const tdm = g.tdm;
  if (tdm) {
    const t1 = tdm.team === 1 ? 1 : 0,
      t2 = (tdm.team2 ?? tdm.team) === 1 ? 1 : 0;
    const w1 = !tdm.draw && (tdm.score[t1] as number) > (tdm.score[1 - t1] as number);
    const w2 = !tdm.draw && (tdm.score[t2] as number) > (tdm.score[1 - t2] as number);
    return {
      p1: { won: w1, pos: 1, kills: k1 },
      p2: { won: w2, pos: 1, kills: k2 },
      winner: t1 === t2 || tdm.draw ? 0 : w1 ? 1 : 2,
    };
  }
  const pos1 = p1.alive ? 1 : (p1.deadPos ?? 2),
    pos2 = p2.alive ? 1 : (p2.deadPos ?? 2);
  return {
    p1: { won: p1.alive && pos1 < pos2, pos: pos1, kills: k1 },
    p2: { won: p2.alive && pos2 < pos1, pos: pos2, kills: k2 },
    winner: pos1 < pos2 ? 1 : pos2 < pos1 ? 2 : 0,
  };
}

/* ───────────────────────────── component ───────────────────────────── */

function ArenaGame() {
  const [selected, setSelected] = useState(0);
  const wallet = useWallet();
  const dev = useDevice();
  const ctl = useControlPrefs();
  const joyRef = useRef<Joy>({ x: 0, y: 0, on: false });
  const devRef = useRef(dev);
  devRef.current = dev;
  const touchUi = dev.input === "touch";
  const [notice, setNotice] = useState("");
  const noticeT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = useCallback((m: string) => {
    setNotice(m);
    if (noticeT.current) clearTimeout(noticeT.current);
    noticeT.current = setTimeout(() => setNotice(""), 2600);
  }, []);
  /** v1 cars with a price (Redline, Heavy Metal) start locked; owning their v2 counts too (old saves) */
  const ownsV1 = (b: number) =>
    (cars[b] as Car).price == null || wallet.has(b) || wallet.has(v2Of(b));
  const lockedId = (id: number) => (isV2(id) ? !wallet.has(id) : !ownsV1(id));
  /** a v2 can only be bought once its v1 is owned */
  const needsV1 = (id: number) => isV2(id) && !ownsV1(baseOf(id));
  const [mode, setMode] = useState<"select" | "playing" | "result" | "race">("select");
  const [hud, setHud] = useState<{
    hp: number;
    alive: number;
    kills: number;
    time: number;
    dots: Dot[];
    tdm?: TdmHud | undefined;
    hp2?: number;
    kills2?: number;
  }>({ hp: 100, alive: TOTAL, kills: 0, time: 0, dots: [] });
  const [result, setResult] = useState<{
    won: boolean;
    position: number;
    xp: number;
    tdm?: { blue: number; red: number; team: number; draw: boolean; team2?: number } | undefined;
    two?: TwoRes | undefined;
  }>({ won: false, position: TOTAL, xp: 0 });
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
  const [picking, setPicking] = useState(false);
  const pickingRef = useRef(false);
  const askRef = useRef<() => void>(() => {});
  const raceRef = useRef<() => void>(() => {});
  const startTdmRef = useRef<(team: number, team2?: number) => void>(() => {});
  const [teamPick, setTeamPick] = useState(false);
  const teamPickRef = useRef(false);
  /* ── 2-player split screen (always OFF when the page loads) ── */
  const [twoP, setTwoPState] = useState(false);
  const twoPRef = useRef(false);
  const [selected2, setSelected2] = useState(0);
  const selected2Ref = useRef(0);
  selected2Ref.current = selected2;
  /** TDM team choice of each player while the (2-player) team picker is open; -1 = not chosen yet */
  const [teams, setTeams] = useState<[number, number]>([-1, -1]);
  const teamsRef = useRef<[number, number]>([-1, -1]);
  const anchor2Ref = useRef<HTMLDivElement>(null);
  const show2Ref = useRef<Show>({
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

  const setModeSync = useCallback((m: "select" | "playing" | "result" | "race") => {
    modeRef.current = m;
    if (m === "select") fxRef.current = new Fx(); // drop arena particles so they don't leak into the garage
    setMode(m);
  }, []);

  const startMatch = useCallback(() => {
    setWorld("ffa");
    const idx = selectedRef.current;
    mStart("ffa", idx);
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
      strafeAng: 0,
      trail: 0,
    };
    /* 2-player: the second human parks next to the first and takes one bot's place */
    const two = twoPRef.current;
    let player2: Vehicle | undefined;
    if (two) {
      const idx2 = selected2Ref.current;
      player.x = 1080;
      player.pi = 0;
      player2 = { ...player, x: 1320, carId: idx2, hp: carAt(idx2).hp, pi: 1 };
    }
    const rivals: Vehicle[] = [];
    for (let i = 0; i < TOTAL - 1 - (two ? 1 : 0); i++) {
      let x = 170 + Math.random() * 2060,
        y = 160 + Math.random() * 1400;
      if (
        Math.hypot(x - player.x, y - player.y) < 390 ||
        (player2 && Math.hypot(x - player2.x, y - player2.y) < 390)
      ) {
        x = 220 + i * 175;
        y = i % 2 ? 340 : 1370;
      }
      const id = rollV2((i + baseOf(idx) + 1) % cars.length);
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
        strafeAng: 0,
        trail: 0,
      });
    }
    fxRef.current = new Fx();
    gameRef.current = {
      player,
      cars: player2 ? [player, player2, ...rivals] : [player, ...rivals],
      bullets: [],
      mines: [],
      started: performance.now(),
      lastHud: 0,
      kills: 0,
      over: null,
      trail: 0,
      powerups: [],
      spawnT: 1.5,
      ...(player2 ? { player2, kills2: 0 } : null),
    };
    keysRef.current.clear();
    pausedRef.current = false;
    setHud({
      hp: playerCar.hp,
      alive: TOTAL,
      kills: 0,
      time: 0,
      dots: [],
      ...(player2 ? { hp2: player2.hp, kills2: 0 } : null),
    });
    setPaused(false);
    if (devRef.current.input === "touch") void enterLandscape();
    setModeSync("playing");
    sfxRef.current.blip();
  }, [setModeSync]);
  startRef.current = startMatch;

  /* TDM: 6v6, team = 0 (blue) or 1 (red); the player drives in slot 0 of their team */
  const startTdm = useCallback(
    (team: number, team2?: number) => {
      setWorld("tdm");
      const idx = selectedRef.current;
      mStart("tdm", idx);
      const idx2 = selected2Ref.current;
      const two = twoPRef.current && team2 !== undefined;
      let k = 0;
      const make = (
        tm: number,
        slot: number,
        isPlayer: boolean,
        carId = idx,
        pi?: number,
      ): Vehicle => {
        const sp = TDM_SPAWN[tm] as { x: number; y: number };
        const a = ((slot - 1) / 5) * Math.PI * 2;
        const id = isPlayer ? carId : rollV2((k++ + baseOf(idx) + 1) % cars.length);
        return {
          x: sp.x + (slot ? Math.cos(a) * 105 : 0),
          y: sp.y + (slot ? Math.sin(a) * 105 : 0),
          angle: tm === 0 ? Math.PI / 2 : -Math.PI / 2,
          hp: carAt(id).hp,
          alive: true,
          cooldown: isPlayer ? 0 : Math.random() * 1.8,
          bot: !isPlayer,
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
          strafeAng: 0,
          trail: 0,
          team: tm,
          respawn: 0,
          inv: 1.5,
          ...(pi !== undefined ? { pi } : null),
        };
      };
      /* humans take the first free slot of their team (two humans on one team sit side by side) */
      const player = make(team, 0, true, idx, 0);
      const list: Vehicle[] = [player];
      let player2: Vehicle | undefined;
      const t2 = team2 ?? team;
      if (two) {
        player2 = make(t2, t2 === team ? 1 : 0, true, idx2, 1);
        list.push(player2);
      }
      const taken = (tm: number, slot: number) =>
        (tm === team && slot === 0) || (player2 && tm === t2 && slot === (t2 === team ? 1 : 0));
      for (const tm of [team, 1 - team])
        for (let i = 0; i < 6; i++) if (!taken(tm, i)) list.push(make(tm, i, false));
      fxRef.current = new Fx();
      gameRef.current = {
        player,
        cars: list,
        bullets: [],
        mines: [],
        started: performance.now(),
        lastHud: 0,
        kills: 0,
        over: null,
        trail: 0,
        powerups: [],
        spawnT: 1.5,
        tdm: { score: [0, 0], time: 0, limit: TDM_TIME, team, ...(two ? { team2: t2 } : null) },
        ...(player2 ? { player2, kills2: 0 } : null),
      };
      keysRef.current.clear();
      pausedRef.current = false;
      setHud({
        hp: carAt(idx).hp,
        alive: TOTAL,
        kills: 0,
        time: 0,
        dots: [],
        tdm: {
          blue: 0,
          red: 0,
          left: TDM_TIME,
          respawn: 0,
          team,
          ...(two ? { team2: t2, respawn2: 0 } : null),
        },
        ...(two ? { hp2: carAt(idx2).hp, kills2: 0 } : null),
      });
      setPaused(false);
      setModeSync("playing");
      sfxRef.current.blip();
    },
    [setModeSync],
  );
  startTdmRef.current = startTdm;

  /* START asks which mode to play: FFA (classic combat) or SPEED (race) */
  const setAsk = useCallback((v: boolean) => {
    pickingRef.current = v;
    setPicking(v);
    teamPickRef.current = false;
    setTeamPick(false);
  }, []);
  const openTeamPick = useCallback((v: boolean) => {
    teamPickRef.current = v;
    setTeamPick(v);
    teamsRef.current = [-1, -1];
    setTeams([-1, -1]);
  }, []);
  /** TDM team choice. Single player starts at once; in 2-player each player picks separately. */
  const chooseTeam = useCallback(
    (pi: number, team: number) => {
      if (!twoPRef.current) {
        setAsk(false);
        startTdmRef.current(team);
        return;
      }
      const next: [number, number] = [...teamsRef.current];
      next[pi] = team;
      teamsRef.current = next;
      setTeams(next);
      sfxRef.current.blip();
      if (next[0] >= 0 && next[1] >= 0) {
        setAsk(false);
        startTdmRef.current(next[0], next[1]);
      }
    },
    [setAsk],
  );
  /** 2 PLAYER switch. OFF (from anywhere, by either player) drops back to the normal single-player screen. */
  const setTwoP = useCallback(
    (on: boolean) => {
      if (on === twoPRef.current) return;
      twoPRef.current = on;
      setTwoPState(on);
      keysRef.current.clear();
      sfxRef.current.blip();
      if (on) {
        const next = (baseOf(selectedRef.current) + 1) % cars.length;
        selected2Ref.current = next;
        setSelected2(next);
        return;
      }
      teamsRef.current = [-1, -1];
      setTeams([-1, -1]);
      const g = gameRef.current;
      if (g?.player2 && modeRef.current === "playing") {
        // the match carries on for player 1 alone, full screen
        const gone = g.player2;
        g.cars = g.cars.filter((c) => c !== gone);
        g.bullets = g.bullets.filter((b) => b.owner !== gone);
        delete g.player2;
        delete g.cam2;
        if (g.tdm) delete g.tdm.team2;
        setHud((h) => {
          const { hp2: _a, kills2: _b, ...rest } = h;
          return rest;
        });
      }
    },
    [setHud],
  );
  askRef.current = () => {
    const bad = lockedId(selectedRef.current)
      ? 1
      : twoPRef.current && lockedId(selected2Ref.current)
        ? 2
        : 0;
    if (bad) {
      const c = carAt(bad === 2 ? selected2Ref.current : selectedRef.current);
      say(
        `${twoPRef.current ? `PLAYER ${bad}: ` : ""}BUY ${c.name.toUpperCase()} FIRST (${fmtXp(c.price ?? 0)} XP)`,
      );
      return;
    }
    setAsk(true);
    sfxRef.current.blip();
  };
  raceRef.current = () => {
    if (devRef.current.input === "touch") void enterLandscape();
    setAsk(false);
    keysRef.current.clear();
    sfxRef.current.blip();
    setModeSync("race");
  };

  const finishMatch = useCallback(
    (won: boolean, position: number, tdm?: Tdm, kills = 0, two?: TwoRes) => {
      let xp = 100 + kills * 100; // FFA: 100 per match + 100 per kill
      let res:
        { blue: number; red: number; team: number; draw: boolean; team2?: number } | undefined;
      if (tdm) {
        res = {
          blue: tdm.score[0],
          red: tdm.score[1],
          team: tdm.team,
          draw: !!tdm.draw,
          ...(tdm.team2 !== undefined ? { team2: tdm.team2 } : null),
        };
        xp = (tdm.draw ? 300 : won ? 750 : 200) + kills * 30;
      }
      const pl = gameRef.current?.player;
      mEnd({
        mode: tdm ? "tdm" : "ffa",
        won,
        position,
        hpFrac: pl && pl.alive ? pl.hp / carAt(pl.carId).hp : 1,
      });
      addXp(xp);
      setResult({ won, position, xp, tdm: res, two });
      setModeSync("result");
    },
    [setModeSync],
  );

  const pick = useCallback((i: number) => {
    setSelected(((i % cars.length) + cars.length) % cars.length);
    sfxRef.current.blip();
  }, []);
  const pick2 = useCallback((i: number) => {
    setSelected2(((i % cars.length) + cars.length) % cars.length);
    sfxRef.current.blip();
  }, []);
  /** V1 / V2 switch of the highlighted car (previewing V2 is free, driving it needs to be bought) */
  const setVer = useCallback((pi: number, v2: boolean) => {
    const cur = pi ? selected2Ref.current : selectedRef.current;
    const b = baseOf(cur);
    const id = v2 && v2Of(b) >= 0 ? v2Of(b) : b;
    if (pi) setSelected2(id);
    else setSelected(id);
    sfxRef.current.blip();
  }, []);
  const setVerRef = useRef(setVer);
  setVerRef.current = setVer;
  const buy = (id: number) => {
    const c = carAt(id);
    const price = c.price ?? 0;
    if (wallet.has(id)) return;
    if (needsV1(id)) {
      const b = cars[baseOf(id)] as Car;
      say(`BUY ${b.name.toUpperCase()} V1 FIRST (${fmtXp(b.price ?? 0)} XP)`);
      return;
    }
    if (buyCar(id, price)) {
      mBuy();
      sfxRef.current.blip();
      say(`${c.name.toUpperCase()} UNLOCKED!`);
    } else say(`NEED ${fmtXp(Math.max(0, price - wallet.xp))} MORE XP`);
  };
  const pick2Ref = useRef(pick2);
  pick2Ref.current = pick2;
  const chooseTeamRef = useRef(chooseTeam);
  chooseTeamRef.current = chooseTeam;

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
  useEffect(() => {
    const s = show2Ref.current;
    s.carId = selected2;
    s.enter = 0;
    s.bullets = [];
    s.burstLeft = 0;
    s.burstTimer = 1.4;
    s.score = 0;
  }, [selected2]);

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
    const stepShow = (s: Show, a: HTMLDivElement | null, holding: boolean, dt: number) => {
      const fx = fxRef.current;
      const car = carAt(s.carId);
      s.t += dt;
      s.enter = Math.min(1, s.enter + dt / 0.55);
      s.recoil = Math.max(0, s.recoil - dt * 7);
      s.heading = Math.sin(s.t * 0.75) * 0.5;
      for (let i = 0; i < s.hits.length; i++) s.hits[i] = Math.max(0, (s.hits[i] as number) - dt);
      s.burstTimer -= dt;
      if (s.burstTimer <= 0 && s.burstLeft <= 0 && !holding) {
        s.burstLeft = 9;
        s.burstTimer = 2.6;
      }
      s.cooldown -= dt;
      if ((holding || s.burstLeft > 0) && s.cooldown <= 0 && s.enter >= 1) {
        if (!holding) s.burstLeft--;
        s.cooldown = shotInterval(car) * 0.8;
        const g = showGeometry(s, a);
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
      const g = showGeometry(s, a);
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

    const showGeometry = (sh: Show, a: HTMLDivElement | null) => {
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
      const car = carAt(sh.carId);
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

    const renderBackdrop = (t: number) => {
      const bg = ctx.createLinearGradient(0, 0, 0, height);
      bg.addColorStop(0, "#0b0620");
      bg.addColorStop(0.55, "#1a0d40");
      bg.addColorStop(1, "#2a0f52");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);
      drawGrid(t, 14, 0.55);
    };
    const renderShowroom = (s: Show, a: HTMLDivElement | null) => {
      const car = carAt(s.carId);
      const g = showGeometry(s, a);
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
      if (car.ability === "turret") {
        const ts = getTurretSprite();
        if (spriteReady(ts)) {
          const k = g.carH / car.h,
            tw = TURRET_W * k,
            th = (tw * ts.naturalHeight) / ts.naturalWidth;
          ctx.drawImage(ts, -tw / 2, g.carH * TURRET_MOUNT - th * TURRET_PIVOT_Y, tw, th);
        }
      }
      ctx.restore();

      // bullets
      for (const b of s.bullets) drawTracer(ctx, b.x, b.y, b.vx, b.vy, car.color);
    };

    /* ---------- arena (gameplay) ---------- */
    const step = (dt: number, now: number) => {
      const g = gameRef.current;
      if (!g) return;
      const fx = fxRef.current,
        sfx = sfxRef.current,
        keys = keysRef.current;
      const p = g.player;
      const humans = g.player2 ? [p, g.player2] : [p];
      const tdm = g.tdm;
      if (!g.over) {
        if (!tdm && p.alive) mAlive(dt);
        if (tdm) mBehind((tdm.score[1 - tdm.team] as number) - (tdm.score[tdm.team] as number));
      }
      /* Virtual Clone: CLONE_COUNT exact copies appear around the car. They are one-hit bots that fight for it */
      const spawnClones = (o: Vehicle) => {
        const stats = carAt(o.carId);
        for (let i = 0; i < CLONE_COUNT; i++) {
          const a = o.angle + Math.PI / 4 + (i * Math.PI * 2) / CLONE_COUNT;
          const c: Vehicle = {
            x: o.x + Math.sin(a) * CLONE_SPAWN_R,
            y: o.y - Math.cos(a) * CLONE_SPAWN_R,
            angle: o.angle,
            hp: stats.hp,
            alive: true,
            cooldown: 0.25 + i * 0.12,
            bot: true,
            drift: 0,
            strafe: 0,
            carId: o.carId,
            hit: 0,
            speedT: 0,
            dblT: 0,
            dodgeT: 0,
            dodgeDir: 0,
            dodgeAng: 0,
            react: 0,
            strafeAng: 0,
            trail: 0,
            cloneOf: o,
            ...(o.team !== undefined ? { team: o.team } : null),
          };
          collide(c);
          c.px = c.x;
          c.py = c.y;
          g.cars.push(c);
          fx.impact(c.x, c.y, 0, "#4dd8ff", 14);
        }
      };
      /* every bullet that lands on an enemy charges the shooter's v2 power; a full charge fires it at once */
      const chargeUp = (o: Vehicle) => {
        const ab = abilityOf(o.carId);
        if (!ab || !o.alive || (o.abT ?? 0) > 0) return;
        // Virtual Clone has no timer: it can't recharge while any of its clones is still alive
        if (ab.kind === "clone" && g.cars.some((c) => c.cloneOf === o && c.alive)) return;
        o.charge = (o.charge ?? 0) + 1;
        if (o.charge >= ab.need) {
          o.charge = 0;
          if (ab.kind === "mine") {
            /* Magnetic Splash: a magnetic burst, then a landmine is left on the ground under the car */
            g.mines.push({ x: o.x, y: o.y, owner: o, age: 0, used: false, seen: new Map() });
            const own = g.mines.filter((m) => m.owner === o && !m.used);
            for (let i = 0; i < own.length - MINE_MAX; i++) (own[i] as Mine).used = true; // oldest fizzles out
            fx.impact(o.x, o.y, 0, ab.color, 30);
          } else if (ab.kind === "clone") spawnClones(o);
          else o.abT = ab.dur;
          if (o === p) mPower(ab.kind);
          fx.impact(o.x, o.y, 0, ab.color, 26);
          if (!o.bot) {
            sfx.blip();
            fx.shake = Math.max(fx.shake, 5);
          }
        }
      };
      /* TDM: match clock, team respawns (5-4-3-2-1 on your own base) and the final whistle */
      if (tdm && !g.over) {
        tdm.time += dt;
        for (const v of g.cars) {
          if (v.inv) v.inv = Math.max(0, v.inv - dt);
          if (v.alive || v.cloneOf) continue;
          v.respawn = (v.respawn ?? 0) - dt;
          if (v.respawn > 0) continue;
          const sp = TDM_SPAWN[v.team === 1 ? 1 : 0] as { x: number; y: number };
          let x = sp.x,
            y = sp.y;
          for (let tries = 0; tries < 14; tries++) {
            const a = Math.random() * Math.PI * 2,
              r = Math.sqrt(Math.random()) * (SPAWN_R - 70);
            x = sp.x + Math.cos(a) * r;
            y = sp.y + Math.sin(a) * r;
            if (
              !g.cars.some(
                (o) => o !== v && o.alive && Math.hypot(o.x - x, o.y - y) < CAR_RADIUS * 2.3,
              )
            )
              break;
          }
          v.x = x;
          v.y = y;
          v.px = x;
          v.py = y;
          v.vx = 0;
          v.vy = 0;
          v.angle = v.team === 1 ? -Math.PI / 2 : Math.PI / 2;
          v.hp = carAt(v.carId).hp;
          v.alive = true;
          v.cooldown = 0.5;
          v.speedT = 0;
          v.dblT = 0;
          v.hit = 0;
          v.foe = null;
          v.stuckT = 0;
          v.unstick = 0;
          v.inv = 2;
          v.charge = 0;
          v.abT = 0;
          fx.impact(x, y, 0, TEAM_COL[v.team === 1 ? 1 : 0] as string, 14);
          if (v === p) {
            g.cam = { x, y };
            sfx.blip();
          } else if (v === g.player2) g.cam2 = { x, y };
        }
        if (tdm.time >= tdm.limit) {
          const mine = tdm.score[tdm.team] as number,
            theirs = tdm.score[1 - tdm.team] as number;
          tdm.draw = mine === theirs;
          g.over = { won: mine > theirs, position: 1, t: 1.6 };
        }
      }
      // track every car's velocity (bots use it to lead their shots, the camera to look ahead)
      for (const v of g.cars) {
        if (v.px !== undefined && v.py !== undefined && dt > 0) {
          v.vx = (v.vx ?? 0) * 0.65 + ((v.x - v.px) / dt) * 0.35;
          v.vy = (v.vy ?? 0) * 0.65 + ((v.y - v.py) / dt) * 0.35;
        }
        v.px = v.x;
        v.py = v.y;
        // damaged cars trail smoke
        const hpf = v.hp / carAt(v.carId).hp;
        if (v.alive && hpf < 0.4) {
          v.smoke = (v.smoke ?? 0) - dt;
          if (v.smoke <= 0) {
            v.smoke = hpf < 0.2 ? 0.05 : 0.12;
            fx.puff(v.x - Math.sin(v.angle) * 14, v.y + Math.cos(v.angle) * 14);
          }
        }
      }
      /* human drivers: player 1 on the arrow keys, player 2 on 8 / 2 / 4 / 6 and 0 to fire */
      const drive = (h: Vehicle, ctl: Ctl) => {
        if (!h.alive || g.over) return;
        const stats = carAt(h.carId);
        let forward = Number(anyKey(keys, ctl.up)) - Number(anyKey(keys, ctl.down));
        let side = Number(anyKey(keys, ctl.right)) - Number(anyKey(keys, ctl.left));
        // touch joystick (single player): the stick points where the car should go, a light push = slower
        let push = 1;
        const joy = joyRef.current;
        if (h === p && !g.player2 && joy.on) {
          const mag = Math.hypot(joy.x, joy.y);
          if (mag > 0.16) {
            forward = -joy.y;
            side = joy.x;
            push = 0.45 + 0.55 * Math.min(1, mag);
          }
        }
        if (forward || side) {
          const target = Math.atan2(side, forward); // up = 0 (the car faces up when angle is 0)
          const delta = ((target - h.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
          h.angle += delta * Math.min(1, dt * 4.2);
          const pSpeed = stats.speed * 2.15 * (h.speedT > 0 ? 1.6 : 1) * push;
          h.x += Math.sin(h.angle) * pSpeed * dt;
          h.y -= Math.cos(h.angle) * pSpeed * dt;
          h.trail -= dt;
          if (h.trail <= 0) {
            h.trail = 0.05;
            fx.dust(h.x - Math.sin(h.angle) * 32, h.y + Math.cos(h.angle) * 32);
          }
        }
        collide(h);
        if (anyKey(keys, ctl.fire) && h.cooldown <= 0) {
          const tx = h.x + Math.sin(h.angle) * (stats.h * 0.57),
            ty = h.y - Math.cos(h.angle) * (stats.h * 0.57);
          for (const off of h.dblT > 0 ? [-9, 9] : [0]) {
            g.bullets.push({
              x: tx + Math.cos(h.angle) * off,
              y: ty + Math.sin(h.angle) * off,
              vx: Math.sin(h.angle) * 570,
              vy: -Math.cos(h.angle) * 570,
              owner: h,
              life: 2.2,
              damage: stats.damage * 0.16,
            });
          }
          h.cooldown = shotInterval(stats);
          fx.muzzle(tx, ty, h.angle, h === p ? PAL.friendly : "#3dff7a");
          fx.shell(h.x + Math.sin(h.angle) * 14, h.y - Math.cos(h.angle) * 14, h.angle);
          sfx.shot(0.8 + stats.fireRate / 200);
        }
      };
      // single player keeps the old extra fire key (5); with two players it belongs to nobody
      drive(p, g.player2 ? P1_CTL : { ...P1_CTL, fire: [" ", "5"] });
      if (g.player2) drive(g.player2, P2_CTL);
      /* steering: probe ahead and slide around crates / walls */
      const steer = (v: Vehicle, want: number) => {
        const look = 150;
        const free = (a: number) => {
          const ex = v.x + Math.sin(a) * look,
            ey = v.y - Math.cos(a) * look;
          if (ex < 90 || ex > WORLD.width - 90 || ey < 90 || ey > WORLD.height - 90) return false;
          return !lineBlocked(v.x, v.y, ex, ey, 20);
        };
        if (free(want)) return want;
        const first = v.steerSide ?? 1;
        for (const off of [0.45, 0.9, 1.4, 1.9, 2.5]) {
          for (const sd of [first, -first]) {
            if (free(want + off * sd)) {
              v.steerSide = sd;
              return want + off * sd;
            }
          }
        }
        return want + Math.PI;
      };
      const clearDir = (v: Vehicle, a: number, len = 110) =>
        !lineBlocked(v.x, v.y, v.x + Math.sin(a) * len, v.y - Math.cos(a) * len, 28) &&
        v.x + Math.sin(a) * len > 80 &&
        v.x + Math.sin(a) * len < WORLD.width - 80 &&
        v.y - Math.cos(a) * len > 80 &&
        v.y - Math.cos(a) * len < WORLD.height - 80;

      for (const bot of g.cars) {
        if (!bot.bot || !bot.alive) continue;
        bot.cooldown -= dt;
        const me = carAt(bot.carId);
        const hpFrac = bot.hp / me.hp;
        /* TDM rubber-band: the team that is behind plays a bit sharper, the leaders a bit sloppier,
           so matches stay close instead of snowballing. aid > 0 = trailing, < 0 = leading */
        let aid = 0;
        if (tdm) {
          const bt = bot.team === 1 ? 1 : 0;
          aid = clamp(((tdm.score[1 - bt] as number) - (tdm.score[bt] as number)) / 8, -1, 1);
        }
        const targets = g.cars.filter(
          (x) =>
            x.alive &&
            ownerOf(x) !== ownerOf(bot) && // never the owner, nor a clone of the same car
            !(g.over && !x.bot && !x.alive) &&
            !powerOn(x, "ghost") && // a cloaked car can't be seen, so bots never aim at it
            (!tdm || x.team !== bot.team),
        );
        if (!targets.length) continue;
        // pick a foe: close + wounded + visible ones first, and stick with the current one a bit
        let foe = targets[0] as Vehicle;
        let best = Infinity;
        for (const c of targets) {
          const d = Math.hypot(c.x - bot.x, c.y - bot.y);
          let score = d * (0.6 + 0.4 * (c.hp / carAt(c.carId).hp));
          if (lineBlocked(bot.x, bot.y, c.x, c.y, 8)) score += 220;
          if (c === bot.foe) score -= 120;
          // clones go after whoever has been shooting their master
          const master = ownerOf(bot);
          if (bot.cloneOf && (master.atkT ?? 0) > 0 && ownerOf(c) === master.atk) score -= 320;
          if (score < best) {
            best = score;
            foe = c;
          }
        }
        bot.foe = foe;
        const foeDist = Math.hypot(foe.x - bot.x, foe.y - bot.y);
        // power-ups: hurt bots hunt health, healthy bots grab boosts when the coast is clear
        let pu: Powerup | null = null;
        let puD = Infinity;
        for (const q of bot.cloneOf ? [] : g.powerups) {
          const d = Math.hypot(q.x - bot.x, q.y - bot.y);
          let reach = 0;
          if (q.kind === "health") reach = hpFrac < 0.45 ? 1200 : hpFrac < 0.8 ? 450 : 0;
          else reach = foeDist > 650 ? 900 : foeDist > 300 ? 380 : 0;
          if (d < reach && d < puD && q.life > d / 200) {
            pu = q;
            puD = d;
          }
        }
        // lead the shot: aim where the target will be when the bullet arrives
        const leadT = Math.min(1.1, foeDist / 400);
        const aimX = foe.x + (foe.vx ?? 0) * leadT * 1,
          aimY = foe.y + (foe.vy ?? 0) * leadT * 1;
        const aimAng = Math.atan2(aimX - bot.x, -(aimY - bot.y));
        const distance = pu ? puD : foeDist;
        const desired = pu ? Math.atan2(pu.x - bot.x, -(pu.y - bot.y)) : aimAng;
        const flee = hpFrac < 0.25 && foe.hp > bot.hp && !pu && foeDist < 520;
        // dodge: spot incoming enemy bullets on a collision course and sidestep across their path
        bot.dodgeT -= dt;
        bot.react -= dt;
        if (bot.dodgeT <= 0 && bot.react <= 0) {
          let urgent = 99;
          for (const b of g.bullets) {
            if (
              ownerOf(b.owner) === ownerOf(bot) ||
              b.life <= 0 ||
              (tdm && b.owner.team === bot.team)
            )
              continue;
            const rx = bot.x - b.x,
              ry = bot.y - b.y;
            const sp2 = b.vx * b.vx + b.vy * b.vy;
            const tc = (rx * b.vx + ry * b.vy) / sp2; // time to closest approach
            if (tc <= 0 || tc > 0.9 || tc >= urgent) continue;
            const cx = rx - b.vx * tc,
              cy = ry - b.vy * tc;
            if (Math.hypot(cx, cy) > 48) continue;
            urgent = tc;
            const side = b.vx * ry - b.vy * rx >= 0 ? 1 : -1;
            const shotAng = Math.atan2(b.vx, -b.vy);
            const snap = (sd: number) =>
              Math.round((shotAng + (sd * Math.PI) / 2) / (Math.PI / 2)) * (Math.PI / 2);
            // sidestep to whichever side is actually open (not into a crate or wall)
            let ang = snap(side);
            if (!clearDir(bot, ang) && clearDir(bot, snap(-side))) ang = snap(-side);
            bot.dodgeDir = side;
            bot.dodgeAng = ang;
          }
          if (urgent < 99) {
            // not perfect: ~12% of the time a bot reacts too late
            if (Math.random() < 0.93) bot.dodgeT = 0.5;
            else bot.react = 0.35;
          }
        }
        // strafe bursts: circle the enemy, favouring the open side
        bot.drift -= dt;
        if (bot.drift <= 0) {
          bot.drift = (hpFrac < 0.5 ? 0.9 : 1.3) + Math.random() * 2;
          bot.strafe = 0.7 + Math.random() * 0.5;
          const dirSign = Math.random() < 0.5 ? -1 : 1;
          const snapA = (sd: number) =>
            Math.round((aimAng + (sd * Math.PI) / 2) / (Math.PI / 2)) * (Math.PI / 2);
          bot.strafeAng = clearDir(bot, snapA(dirSign)) ? snapA(dirSign) : snapA(-dirSign);
        }
        bot.strafe = Math.max(0, bot.strafe - dt);
        bot.unstick = (bot.unstick ?? 0) - dt;
        // pick the "key" the bot presses: it then turns and drives forward exactly like the player
        let heading = desired;
        let speedMul = 1;
        if ((bot.unstick ?? 0) > 0) heading = bot.unstickAng ?? desired;
        else if (bot.dodgeT > 0) heading = bot.dodgeAng;
        else if (flee) heading = steer(bot, aimAng + Math.PI + (bot.steerSide ?? 1) * 0.5);
        else if (!pu && bot.strafe > 0 && foeDist < 560) heading = steer(bot, bot.strafeAng);
        else {
          heading = steer(bot, desired);
          if (!pu && foeDist < 300) speedMul = 0.3; // close in: tap forward while lining up the shot
        }
        /* landmines: bots know where enemy mines are and steer around them (not perfectly: a few miss one) */
        const foeMines = g.mines.filter(
          (m) => !m.used && m.owner !== ownerOf(bot) && !(tdm && m.owner.team === bot.team),
        );
        if (foeMines.length) {
          const MINE_LOOK = 130,
            MINE_SAFE = MINE_RADIUS + 26;
          const nearMine = (a: number) => {
            const dx = Math.sin(a) * MINE_LOOK,
              dy = -Math.cos(a) * MINE_LOOK;
            for (const m of foeMines) {
              if (m.seen.get(bot) === undefined) {
                if (Math.hypot(m.x - bot.x, m.y - bot.y) > 340) continue;
                m.seen.set(bot, Math.random() >= MINE_BLUNDER); // false = this bot never notices it
              }
              if (!m.seen.get(bot)) continue;
              const t = clamp(
                ((m.x - bot.x) * dx + (m.y - bot.y) * dy) / (dx * dx + dy * dy),
                0,
                1,
              );
              if (Math.hypot(bot.x + dx * t - m.x, bot.y + dy * t - m.y) < MINE_SAFE) return m;
            }
            return null;
          };
          const hot = nearMine(heading);
          if (hot) {
            // swing to whichever side of the mine we are already on, widening until the path is clear
            const side =
              Math.sign(
                Math.sin(heading) * (hot.y - bot.y) * -1 + Math.cos(heading) * (hot.x - bot.x) * -1,
              ) || 1;
            for (const off of [0.5, 0.95, 1.4, 1.9, 2.5]) {
              const a1 = heading + off * side,
                a2 = heading - off * side;
              if (!nearMine(a1) && clearDir(bot, a1, 90)) {
                heading = a1;
                break;
              }
              if (!nearMine(a2) && clearDir(bot, a2, 90)) {
                heading = a2;
                break;
              }
            }
          }
        }
        const turn = wrapAng(heading - bot.angle);
        bot.angle += turn * Math.min(1, dt * 5);
        const bSpeed =
          me.speed * 2.15 * BOT_SPEED * (1 + 0.08 * aid) * speedMul * (bot.speedT > 0 ? 1.6 : 1);
        bot.x += Math.sin(bot.angle) * bSpeed * dt;
        bot.y -= Math.cos(bot.angle) * bSpeed * dt;
        bot.trail -= dt;
        if (bot.trail <= 0 && speedMul > 0.5) {
          bot.trail = 0.05;
          fx.dust(bot.x - Math.sin(bot.angle) * 32, bot.y + Math.cos(bot.angle) * 32);
        }
        collide(bot);
        // anti-stuck: if the bot is pushing but not moving, back out sideways for a moment
        const moved = Math.hypot(bot.x - (bot.px ?? bot.x), bot.y - (bot.py ?? bot.y));
        if (moved < bSpeed * dt * 0.3 && speedMul > 0.5) bot.stuckT = (bot.stuckT ?? 0) + dt;
        else bot.stuckT = Math.max(0, (bot.stuckT ?? 0) - dt * 2);
        if ((bot.stuckT ?? 0) > 0.6) {
          bot.stuckT = 0;
          bot.unstick = 0.7;
          bot.unstickAng = heading + (Math.random() < 0.5 ? -1 : 1) * (Math.PI / 2 + Math.random());
        }
        // fire: needs line of sight, a lined-up barrel and a target in range
        const los = !lineBlocked(bot.x, bot.y, foe.x, foe.y, 6);
        const tol = 0.1 + Math.max(0, 1 - foeDist / 500) * 0.12;
        if (
          los &&
          !flee &&
          foeDist < 640 &&
          bot.cooldown <= 0 &&
          Math.abs(wrapAng(aimAng - bot.angle)) < tol
        ) {
          // like the player, bots fire in the direction the car is facing
          const aim = bot.angle + (Math.random() - 0.5) * (0.035 + 0.1 * Math.max(0, -aid));
          const mx = bot.x + Math.sin(aim) * (me.h * 0.57),
            my = bot.y - Math.cos(aim) * (me.h * 0.57);
          for (const off of bot.dblT > 0 ? [-9, 9] : [0]) {
            g.bullets.push({
              x: mx + Math.cos(aim) * off,
              y: my + Math.sin(aim) * off,
              vx: Math.sin(aim) * 400,
              vy: -Math.cos(aim) * 400,
              owner: bot,
              life: 2.5,
              damage: bot.cloneOf ? CLONE_DAMAGE : 5.6 * (1 + 0.15 * aid),
            });
          }
          bot.cooldown =
            (Math.max(0.36, shotInterval(me) * 1.4) + Math.random() * 0.3) *
            (1 - 0.22 * aid) *
            (bot.cloneOf ? 0.75 : 1); // clones keep the pressure on
          fx.muzzle(mx, my, aim, tdm ? bulletCol(true, bot) : PAL.hostile);
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
              if (!a.bot || !b.bot) fx.shake = Math.max(fx.shake, 2);
            }
          }
        }
        for (const v of g.cars) if (v.alive) collide(v);
      }
      // power-up bubbles: spawn, expire, pick up
      g.spawnT -= dt;
      if (g.spawnT <= 0 && g.powerups.length < (tdm ? 6 : 4) && !g.over) {
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
          if (!v.alive || v.cloneOf || q.life <= 0 || Math.hypot(q.x - v.x, q.y - v.y) > 42)
            continue;
          q.life = 0;
          if (q.kind === "health")
            v.hp = Math.min(carAt(v.carId).hp, v.hp + carAt(v.carId).hp * 0.35);
          else if (q.kind === "speed") v.speedT = 10 + Math.random() * 2;
          else v.dblT = 10;
          fx.impact(q.x, q.y, 0, POWER_COLOR[q.kind], 12);
          if (!v.bot) sfx.blip();
          if (v === p) mPickup();
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
          if (
            !v.alive ||
            ownerOf(v) === ownerOf(b.owner) ||
            b.life <= 0 ||
            Math.hypot(b.x - v.x, b.y - v.y) >= 32
          )
            continue;
          if (tdm && (v.team === b.owner.team || (v.inv ?? 0) > 0)) continue; // no friendly fire, spawn shield
          const target = carAt(v.carId);
          const shooter = ownerOf(b.owner); // a clone's shots count for the car that made it
          if (shooter === p) mHit();
          chargeUp(shooter); // every clean hit charges the shooter's v2 power
          if (v === p) mDamage();
          // the hit car (or the master of a hit clone) remembers who is shooting at it: its clones hunt that car
          ownerOf(v).atk = shooter;
          ownerOf(v).atkT = 5;
          if (v.cloneOf)
            v.hp = 0; // a Virtual Clone dies to a single bullet
          else v.hp -= b.damage * (1 - target.armor / 250);
          b.life = 0;
          v.hit = 0.14;
          fx.impact(b.x, b.y, dir, bulletCol(!!tdm, b.owner), 10);
          if (!v.bot) {
            fx.shake = Math.max(fx.shake, 4);
            sfx.hit();
          }
          if (v.hp <= 0) {
            v.hp = 0;
            v.alive = false;
            fx.explode(v.x, v.y, v.cloneOf ? "#4dd8ff" : target.color);
            sfx.boom();
            if (!v.cloneOf) {
              // destroying a clone is only a blast: no kill, no score, no respawn
              if (shooter === p) {
                g.kills++;
                mKill({
                  victimV2: isV2(v.carId),
                  byClone: !!b.owner.cloneOf,
                  ghost: powerOn(p, "ghost"),
                });
              } else if (g.player2 && shooter === g.player2) g.kills2 = (g.kills2 ?? 0) + 1;
              if (tdm) {
                v.respawn = TDM_RESPAWN;
                if (!g.over) tdm.score[shooter.team === 1 ? 1 : 0]++;
              }
            }
          }
        }
      }
      /* Magnetic Splash landmines: the first enemy to roll over one is blown up (same blast as the race mines).
         The owner (and, in TDM, the owner's team) is immune. Each mine hits exactly one car for MINE_DAMAGE HP, then it is spent. */
      for (const m of g.mines) {
        if (m.used) continue;
        m.age += dt;
        if (g.over || m.age < MINE_ARM) continue;
        for (const v of g.cars) {
          if (!v.alive || ownerOf(v) === m.owner || Math.hypot(v.x - m.x, v.y - m.y) > MINE_RADIUS)
            continue;
          if (tdm && (v.team === m.owner.team || (v.inv ?? 0) > 0)) continue;
          m.used = true;
          // the blast takes a fixed chunk of HP (armor doesn't help); a Virtual Clone still dies to it
          v.hp = v.cloneOf ? 0 : Math.max(0, v.hp - MINE_DAMAGE);
          v.hit = 0.14;
          ownerOf(v).atk = m.owner;
          ownerOf(v).atkT = 5;
          const target = carAt(v.carId);
          fx.explode(m.x, m.y, target.color);
          fx.explode(m.x, m.y - 20, "#ff7a1a");
          sfx.boom();
          if (v === p) mDamage();
          if (!v.bot) fx.shake = Math.max(fx.shake, 6);
          if (v.hp <= 0) {
            v.alive = false;
            if (!v.cloneOf) {
              if (m.owner === p) {
                g.kills++;
                mKill({ victimV2: isV2(v.carId), byClone: false, ghost: false });
                mMine();
              } else if (g.player2 && m.owner === g.player2) g.kills2 = (g.kills2 ?? 0) + 1;
              if (tdm) {
                v.respawn = TDM_RESPAWN;
                if (!g.over) tdm.score[m.owner.team === 1 ? 1 : 0]++;
              }
            }
          }
          break;
        }
      }
      g.mines = g.mines.filter((m) => !m.used);
      g.bullets = g.bullets.filter(
        (b) => b.life > 0 && b.x > 0 && b.x < WORLD.width && b.y > 0 && b.y < WORLD.height,
      );
      for (const h of humans) h.cooldown = Math.max(0, h.cooldown - dt);
      /* Military Jeep v2 rear turret: idles along the car; while AUTO TURRET is on it swings 360° to the
         nearest enemy and keeps firing at it (FFA + TDM only — the race has no abilities) */
      for (const v of g.cars) {
        if (!v.alive || abilityOf(v.carId)?.kind !== "turret") continue;
        const stats = carAt(v.carId);
        if (v.tur === undefined) v.tur = v.angle;
        v.tcd = Math.max(0, (v.tcd ?? 0) - dt);
        const mount = stats.h * TURRET_MOUNT;
        const mx = v.x - Math.sin(v.angle) * -mount,
          my = v.y + Math.cos(v.angle) * mount;
        let want = v.angle;
        let canFire = false;
        let tgt: Vehicle | null = null;
        if (powerOn(v, "turret")) {
          // nearest enemy: closest one with a clear line of fire wins, otherwise just track the closest
          let bestVis = Infinity,
            bestAny = Infinity,
            visT: Vehicle | null = null,
            anyT: Vehicle | null = null;
          for (const o of g.cars) {
            if (o === v || !o.alive || (o.inv ?? 0) > 0 || powerOn(o, "ghost")) continue;
            if (tdm && o.team === v.team) continue;
            const d = Math.hypot(o.x - mx, o.y - my);
            if (d < bestAny) {
              bestAny = d;
              anyT = o;
            }
            if (d < bestVis && d < TURRET_RANGE && !lineBlocked(mx, my, o.x, o.y, 6)) {
              bestVis = d;
              visT = o;
            }
          }
          tgt = visT ?? anyT;
          canFire = !!visT;
        }
        if (tgt) {
          // lead the shot a little
          const dist = Math.hypot(tgt.x - mx, tgt.y - my);
          const lead = Math.min(0.5, dist / 570) * 0.7;
          const ax = tgt.x + (tgt.vx ?? 0) * lead - mx,
            ay = tgt.y + (tgt.vy ?? 0) * lead - my;
          want = Math.atan2(ax, -ay);
        }
        // smooth 360° swing along the shortest way round
        const diff = ((want - v.tur + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        const step2 = TURRET_TURN * dt;
        v.tur += Math.abs(diff) <= step2 ? diff : Math.sign(diff) * step2;
        if (canFire && Math.abs(diff) < 0.12 && v.tcd <= 0) {
          const bx = mx + Math.sin(v.tur) * TURRET_MUZZLE,
            by = my - Math.cos(v.tur) * TURRET_MUZZLE;
          g.bullets.push({
            x: bx,
            y: by,
            vx: Math.sin(v.tur) * 570,
            vy: -Math.cos(v.tur) * 570,
            owner: v,
            life: 2.2,
            damage: stats.damage * 0.16,
          });
          v.tcd = shotInterval(stats) * 1.1;
          fx.muzzle(bx, by, v.tur, abilityOf(v.carId)?.color ?? "#b6ff3d");
          if (!v.bot && Math.hypot(v.x - (g.cam?.x ?? v.x), v.y - (g.cam?.y ?? v.y)) < 1100)
            sfx.shot(0.6 + stats.fireRate / 200);
        }
      }
      for (const v of g.cars) {
        v.hit = Math.max(0, v.hit - dt);
        v.blk = Math.max(0, (v.blk ?? 0) - dt);
        if (v.abT) v.abT = Math.max(0, v.abT - dt);
        if (v.atkT) v.atkT = Math.max(0, v.atkT - dt);
        v.speedT = Math.max(0, v.speedT - dt);
        v.dblT = Math.max(0, v.dblT - dt);
        if (v.alive && v.hp < carAt(v.carId).hp * 0.4 && Math.random() < dt * 9) fx.puff(v.x, v.y);
      }
      /* Virtual Clones have no timer: they stay until shot. Destroyed ones leave the match */
      g.cars = g.cars.filter((c) => !(c.cloneOf && !c.alive));
      /* clones are not cars in the standings: they never count towards "cars left" */
      const alive = g.cars.filter((x) => x.alive && !x.cloneOf).length;
      /* a car whose clones are still fighting is not out yet: the camera follows a clone until the last one falls */
      const cloneLive = (h: Vehicle) => g.cars.some((c) => c.cloneOf === h && c.alive);
      const p2 = g.player2;
      if (!g.over) {
        if (!tdm) {
          if (!p2) {
            if (!p.alive && (!cloneLive(p) || alive === 0))
              g.over = { won: false, position: Math.max(2, alive + 1), t: 1.6 };
            else if (p.alive && alive === 1) g.over = { won: true, position: 1, t: 1.1 };
          } else {
            // 2 players: a wrecked player spectates; the match ends when one car is left or both are out
            for (const h of humans)
              if (!h.alive && !cloneLive(h) && h.deadPos === undefined) h.deadPos = alive + 1;
            if (!p.alive && !p2.alive && !cloneLive(p) && !cloneLive(p2))
              g.over = { won: false, position: Math.min(p.deadPos ?? 2, p2.deadPos ?? 2), t: 1.6 };
            else if (alive === 1) g.over = { won: p.alive, position: 1, t: 1.1 };
          }
        }
      } else {
        g.over.t -= dt;
        if (g.over.t <= 0) {
          finishMatch(g.over.won, g.over.position, tdm, g.kills, p2 ? twoResult(g) : undefined);
          return;
        }
      }
      if (now - g.lastHud > 140) {
        const dots: Dot[] = g.cars
          .filter((v) => v.alive && !v.cloneOf && (v === p || !powerOn(v, "ghost")))
          .map((v) => ({
            x: (v.x / WORLD.width) * 100,
            y: (v.y / WORLD.height) * 100,
            me: v === p,
            team: v.team,
          }));
        setHud({
          hp: Math.ceil(p.hp),
          alive,
          kills: g.kills,
          time: Math.floor((now - g.started) / 1000),
          dots,
          tdm: tdm
            ? {
                blue: tdm.score[0],
                red: tdm.score[1],
                left: Math.max(0, Math.ceil(tdm.limit - tdm.time)),
                respawn: p.alive ? 0 : Math.max(1, Math.ceil(p.respawn ?? 0)),
                team: tdm.team,
                ...(p2
                  ? {
                      team2: tdm.team2 ?? tdm.team,
                      respawn2: p2.alive ? 0 : Math.max(1, Math.ceil(p2.respawn ?? 0)),
                    }
                  : null),
              }
            : undefined,
          ...(p2 ? { hp2: Math.ceil(p2.hp), kills2: g.kills2 ?? 0 } : null),
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

    /** draws the world once, from one player's camera, into a (width x height) viewport */
    const drawView = (width: number, height: number, t: number, dtc: number, pi: number) => {
      const g = gameRef.current,
        fx = fxRef.current;
      const me0 = pi === 1 ? g?.player2 : g?.player;
      /* Virtual Clone: when your car is wrecked but a clone is still fighting, the camera follows that clone
         (instead of the wrecked car) until the last clone falls */
      const clone =
        me0 && g && !me0.alive ? g.cars.find((c) => c.cloneOf === me0 && c.alive) : undefined;
      const p = clone ?? me0;
      const zoom = Math.min(width / 820, height / 560, 1);
      let cx = p ? p.x : WORLD.width / 2,
        cy = p ? p.y : WORLD.height / 2;
      if (g && p) {
        // smooth camera that looks a little ahead of where the player is driving
        const tx = p.x + (p.vx ?? 0) * 0.22,
          ty = p.y + (p.vy ?? 0) * 0.22;
        const camKey = pi === 1 ? "cam2" : "cam";
        const cam = (g[camKey] ??= { x: p.x, y: p.y });
        const k = 1 - Math.exp(-dtc * 9);
        cam.x += (tx - cam.x) * k;
        cam.y += (ty - cam.y) * k;
        cx = cam.x;
        cy = cam.y;
      }
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
      if (g?.tdm) {
        // the two team bases: glowing spawn circles
        for (let tm = 0; tm < 2; tm++) {
          const sp = TDM_SPAWN[tm] as { x: number; y: number };
          const col = TEAM_COL[tm] as string;
          const pl = 0.6 + 0.4 * Math.sin(t * 2.5 + tm);
          const gl = ctx.createRadialGradient(sp.x, sp.y, 20, sp.x, sp.y, SPAWN_R + 40);
          gl.addColorStop(0, hexA(col, 0.32));
          gl.addColorStop(0.8, hexA(col, 0.16));
          gl.addColorStop(1, hexA(col, 0));
          ctx.fillStyle = gl;
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, SPAWN_R + 40, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = hexA(col, 0.5 + 0.35 * pl);
          ctx.lineWidth = 8;
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, SPAWN_R, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([22, 16]);
          ctx.lineDashOffset = -t * 30;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, SPAWN_R * 0.68, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = hexA(col, 0.85);
          ctx.font = '16px "Press Start 2P", monospace';
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(tm === 0 ? "BLUE BASE" : "RED BASE", sp.x, sp.y - SPAWN_R - 26);
        }
      }
      // shipping containers + crates (solid obstacles)
      blocks.forEach(([x, y, w, h], i) => drawBox(ctx, x, y, w, h, i));
      // tyre dust, sparks, smoke sit under the cars
      if (g) {
        /* Magnetic Splash landmines */
        for (const m of g.mines) {
          const armed = m.age >= MINE_ARM;
          const mineCol = "#ffb02e";
          const blink = armed ? 0.5 + 0.5 * Math.sin(t * 6 + m.x) : Math.floor(t * 14) % 2;
          // magnetic splash ring when it is first laid
          if (m.age < 0.7) {
            ctx.strokeStyle = hexA(mineCol, 1 - m.age / 0.7);
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(m.x, m.y, 14 + m.age * 150, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.globalCompositeOperation = "lighter";
          const gl = ctx.createRadialGradient(m.x, m.y, 2, m.x, m.y, 44);
          gl.addColorStop(0, hexA(mineCol, 0.3 + 0.2 * blink));
          gl.addColorStop(1, hexA(mineCol, 0));
          ctx.fillStyle = gl;
          ctx.fillRect(m.x - 46, m.y - 46, 92, 92);
          ctx.globalCompositeOperation = "source-over";
          ctx.fillStyle = "#1b1030";
          ctx.beginPath();
          ctx.arc(m.x, m.y, 15, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = mineCol;
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.fillStyle = hexA("#ff3b3b", 0.35 + 0.65 * blink);
          ctx.beginPath();
          ctx.arc(m.x, m.y, 5, 0, Math.PI * 2);
          ctx.fill();
          for (let i = 0; i < 6; i++) {
            const a = (i * Math.PI) / 3;
            ctx.fillStyle = mineCol;
            ctx.fillRect(m.x + Math.cos(a) * 15 - 2, m.y + Math.sin(a) * 15 - 2, 4, 4);
          }
          /* label the viewer's own mines "YOURS" so two Redline v2s in a match can't be confused */
          const viewer = pi === 1 ? g.player2 : g.player;
          if (viewer && m.owner === viewer && !m.used) {
            ctx.font = '10px "Press Start 2P", monospace';
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.lineWidth = 3;
            ctx.strokeStyle = "#1b1030";
            ctx.strokeText("YOURS", m.x, m.y - 28);
            ctx.fillStyle = "#3bff9d";
            ctx.fillText("YOURS", m.x, m.y - 28);
          }
        }
        for (const q of g.powerups) {
          const col = POWER_COLOR[q.kind];
          const bob = 1 + 0.1 * Math.sin(t * 5 + q.x);
          const blink = q.life < 5 && Math.floor(t * 6) % 2 === 0 ? 0.35 : 1;
          ctx.globalAlpha = blink;
          // soft ground glow
          ctx.globalCompositeOperation = "lighter";
          const glow = ctx.createRadialGradient(q.x, q.y, 4, q.x, q.y, 70 * bob);
          glow.addColorStop(0, hexA(col, 0.5));
          glow.addColorStop(1, hexA(col, 0));
          ctx.fillStyle = glow;
          ctx.fillRect(q.x - 75, q.y - 75, 150, 150);
          ctx.globalCompositeOperation = "source-over";
          // spinning dashed ring + bubble
          ctx.fillStyle = hexA(col, 0.2);
          ctx.beginPath();
          ctx.arc(q.x, q.y, 28 * bob, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = col;
          ctx.lineWidth = 3;
          ctx.setLineDash([14, 10]);
          ctx.lineDashOffset = -t * 40;
          ctx.beginPath();
          ctx.arc(q.x, q.y, 32 * bob, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.arc(q.x, q.y, 22 * bob, 0, Math.PI * 2);
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
          const cloaked = powerOn(v, "ghost");
          if (cloaked && v !== me0) continue; // invisible to everyone but its driver
          const car = carAt(v.carId);
          const img = sprites[v.carId];
          if (cloaked) ctx.globalAlpha = 0.38 + 0.08 * Math.sin(t * 6); // driver sees a faint ghost
          const nearCam = Math.hypot(v.x - cx, v.y - cy) < 1100;
          if (nearCam) {
            // soft drop shadow, offset away from the "light"
            ctx.save();
            ctx.translate(v.x + 10, v.y + 14);
            ctx.rotate(v.angle);
            ctx.fillStyle = "rgba(0,0,0,0.18)";
            ctx.beginPath();
            ctx.ellipse(0, 0, car.w * 0.62, car.h * 0.58, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "rgba(0,0,0,0.22)";
            ctx.beginPath();
            ctx.ellipse(0, 0, car.w * 0.5, car.h * 0.48, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
          ctx.save();
          ctx.translate(v.x, v.y);
          ctx.rotate(v.angle);
          if (nearCam) {
            // headlight cone
            ctx.globalCompositeOperation = "lighter";
            const fy = -car.h * 0.42;
            const hl = ctx.createLinearGradient(0, fy, 0, fy - 210);
            hl.addColorStop(0, "rgba(255,246,205,0.26)");
            hl.addColorStop(1, "rgba(255,246,205,0)");
            ctx.fillStyle = hl;
            ctx.beginPath();
            ctx.moveTo(-car.w * 0.3, fy);
            ctx.lineTo(car.w * 0.3, fy);
            ctx.lineTo(car.w * 0.3 + 75, fy - 210);
            ctx.lineTo(-car.w * 0.3 - 75, fy - 210);
            ctx.closePath();
            ctx.fill();
            // tail lights
            ctx.fillStyle = "rgba(255,40,40,0.5)";
            for (const sx2 of [-1, 1]) {
              ctx.beginPath();
              ctx.arc(sx2 * car.w * 0.3, car.h * 0.46, 5, 0, Math.PI * 2);
              ctx.fill();
            }
            // boost flame
            if (v.speedT > 0) {
              const fl = 22 + Math.random() * 16;
              const fg = ctx.createLinearGradient(0, car.h * 0.48, 0, car.h * 0.48 + fl);
              fg.addColorStop(0, "rgba(120,240,255,0.9)");
              fg.addColorStop(0.5, "rgba(255,170,60,0.55)");
              fg.addColorStop(1, "rgba(255,80,20,0)");
              ctx.fillStyle = fg;
              ctx.beginPath();
              ctx.moveTo(-9, car.h * 0.48);
              ctx.lineTo(9, car.h * 0.48);
              ctx.lineTo(0, car.h * 0.48 + fl);
              ctx.closePath();
              ctx.fill();
            }
            ctx.globalCompositeOperation = "source-over";
          }
          // One simple circle under every car: blue = you, red = everyone else.
          const r = Math.max(car.w, car.h) * 0.62;
          const own = ownerOf(v); // a clone is painted exactly like the car it copies
          const rgb = g.tdm
            ? (TEAM_RGB[v.team === 1 ? 1 : 0] as string)
            : g.player2 && own === g.player2
              ? P2_COLOR
              : !own.bot
                ? P1_COLOR
                : "255,64,64";
          ctx.fillStyle = `rgba(${rgb},${v.hit > 0 ? 0.55 : 0.28})`;
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = `rgba(${rgb},0.6)`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          if (spriteReady(img)) ctx.drawImage(img, -car.w / 2, -car.h / 2, car.w, car.h);
          else drawFallbackCar(ctx, car, car.w, car.h);
          if (abilityOf(v.carId)?.kind === "turret") {
            // separate rear gun: always sits in the truck bed, swings on its own while the power runs
            const ts = getTurretSprite();
            if (spriteReady(ts)) {
              const tw = TURRET_W,
                th = (tw * ts.naturalHeight) / ts.naturalWidth;
              ctx.save();
              ctx.translate(0, car.h * TURRET_MOUNT);
              if (powerOn(v, "turret")) {
                ctx.fillStyle = hexA(
                  abilityOf(v.carId)?.color ?? "#b6ff3d",
                  0.22 + 0.08 * Math.sin(t * 8),
                );
                ctx.beginPath();
                ctx.arc(0, 0, tw * 0.62, 0, Math.PI * 2);
                ctx.fill();
              }
              ctx.rotate((v.tur ?? v.angle) - v.angle);
              ctx.drawImage(ts, -tw / 2, -th * TURRET_PIVOT_Y, tw, th);
              ctx.restore();
            }
          }
          if ((v.inv ?? 0) > 0) {
            // fresh-spawn shield
            ctx.strokeStyle = `rgba(255,255,255,${0.4 + 0.4 * Math.sin(t * 18)})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, r + 14, 0, Math.PI * 2);
            ctx.stroke();
          }
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
          if (v.cloneOf && v.cloneOf === me0) {
            // only the clones' own driver sees this faint ring (to tell them apart from enemy lookalikes)
            ctx.strokeStyle = hexA("#4dd8ff", 0.5 + 0.2 * Math.sin(t * 6));
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 6]);
            ctx.beginPath();
            ctx.arc(0, 0, r + 6, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
          }
          ctx.restore();
          ctx.globalAlpha = 1;
          if (!v.cloneOf && (!v.bot || v.hp < car.hp * 0.85)) {
            const pct = Math.max(0, v.hp / car.hp);
            ctx.fillStyle = "#000";
            ctx.fillRect(v.x - 26, v.y - 50, 52, 9);
            ctx.fillStyle = "#2a1a63";
            ctx.fillRect(v.x - 24, v.y - 48, 48, 5);
            ctx.fillStyle = !v.bot
              ? PAL.lime
              : pct > 0.6
                ? "#7dff5a"
                : pct > 0.3
                  ? "#ffc83d"
                  : PAL.red;
            ctx.fillRect(v.x - 24, v.y - 48, 48 * pct, 5);
            ctx.fillStyle = "rgba(255,255,255,0.35)";
            ctx.fillRect(v.x - 24, v.y - 48, 48 * pct, 2);
          }
          if (!v.bot || v === clone) {
            // yellow "YOU" tag above the player's car (P1 / P2 in split screen)
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
            ctx.fillText(g.player2 ? (ownerOf(v) === g.player2 ? "P2" : "P1") : "YOU", tx, ty + 1);
          }
        }
        for (const b of g.bullets)
          drawTracer(ctx, b.x, b.y, b.vx, b.vy, bulletCol(!!g.tdm, ownerOf(b.owner)));
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
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.12 + 0.08 * pulse;
      ctx.strokeStyle = PAL.cyan;
      ctx.lineWidth = 26;
      ctx.strokeRect(4, 4, WORLD.width - 8, WORLD.height - 8);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.restore();
      // screen-space vignette for depth, plus a red heartbeat when the player is nearly dead
      const vg = ctx.createRadialGradient(
        width / 2,
        height / 2,
        Math.min(width, height) * 0.38,
        width / 2,
        height / 2,
        Math.max(width, height) * 0.78,
      );
      vg.addColorStop(0, "rgba(0,0,10,0)");
      vg.addColorStop(1, "rgba(4,0,18,0.55)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, width, height);
      if (me0 && me0.alive && me0.hp / carAt(me0.carId).hp < 0.3) {
        const beat = 0.18 + 0.14 * Math.sin(t * 7);
        const rg = ctx.createRadialGradient(
          width / 2,
          height / 2,
          Math.min(width, height) * 0.3,
          width / 2,
          height / 2,
          Math.max(width, height) * 0.7,
        );
        rg.addColorStop(0, "rgba(255,0,40,0)");
        rg.addColorStop(1, `rgba(255,0,40,${beat})`);
        ctx.fillStyle = rg;
        ctx.fillRect(0, 0, width, height);
      }
      /* v2 power meter (bottom centre) and the clone-camera banner */
      const ab = me0 && me0.alive ? abilityOf(me0.carId) : null;
      if (me0 && ab) {
        const liveClones =
          ab.kind === "clone"
            ? (g?.cars ?? []).filter((c) => c.cloneOf === me0 && c.alive).length
            : 0;
        const on = ab.kind === "clone" ? liveClones > 0 : (me0.abT ?? 0) > 0;
        const frac =
          ab.kind === "clone" && on
            ? liveClones / CLONE_COUNT
            : on
              ? (me0.abT as number) / ab.dur
              : (me0.charge ?? 0) / ab.need;
        const bw = Math.min(190, width * 0.5),
          bx = width / 2 - bw / 2,
          by = height - 44;
        ctx.fillStyle = "rgba(8,3,26,0.78)";
        ctx.fillRect(bx - 4, by - 18, bw + 8, 36);
        ctx.strokeStyle = ab.color;
        ctx.lineWidth = 2;
        ctx.strokeRect(bx - 4, by - 18, bw + 8, 36);
        ctx.fillStyle = on || frac >= 1 ? ab.color : hexA(ab.color, 0.55);
        ctx.fillRect(bx, by + 2, bw * clamp(frac, 0, 1), 8);
        ctx.strokeStyle = "rgba(255,255,255,0.25)";
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, by + 2, bw, 8);
        ctx.font = '9px "Press Start 2P", monospace';
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#fff";
        ctx.fillText(ab.label, bx, by - 6);
        ctx.textAlign = "right";
        ctx.fillStyle = on ? ab.color : "#ffe23d";
        const liveMines =
          ab.kind === "mine" ? (g?.mines ?? []).filter((m) => m.owner === me0).length : 0;
        ctx.fillText(
          on
            ? ab.kind === "clone"
              ? `${liveClones} CLONE${liveClones > 1 ? "S" : ""}`
              : `${Math.ceil(me0.abT as number)}s`
            : `${me0.charge ?? 0}/${ab.need}${liveMines ? ` · ${liveMines} MINE${liveMines > 1 ? "S" : ""}` : ""}`,
          bx + bw,
          by - 6,
        );
      }
      if (clone) {
        ctx.font = '12px "Press Start 2P", monospace';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "rgba(8,3,26,0.78)";
        ctx.fillRect(width / 2 - 170, height * 0.12 - 16, 340, 32);
        ctx.fillStyle = "#4dd8ff";
        ctx.fillText("CLONE CAM · YOUR CAR IS DOWN", width / 2, height * 0.12);
      }
    };

    /** the arena: one full-screen view, or two side-by-side views in 2-player split screen */
    const renderArena = (t: number) => {
      const g = gameRef.current;
      const dtc = g ? Math.min(0.05, Math.max(0, t - (g.camT ?? t))) : 0;
      if (g) g.camT = t;
      if (!g?.player2) {
        drawView(width, height, t, dtc, 0);
        return;
      }
      const half = Math.floor(width / 2);
      for (let i = 0; i < 2; i++) {
        const w = i === 0 ? half : width - half;
        ctx.save();
        ctx.beginPath();
        ctx.rect(i * half, 0, w, height);
        ctx.clip();
        ctx.translate(i * half, 0);
        drawView(w, height, t, dtc, i);
        ctx.restore();
      }
      // neon divider between the two screens
      ctx.fillStyle = "#0b0620";
      ctx.fillRect(half - 4, 0, 8, height);
      ctx.fillStyle = PAL.cyan;
      ctx.fillRect(half - 1, 0, 2, height);
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
      } else if (m === "race") {
        /* SPEED mode renders on its own canvas */
      } else if (m === "result" && gameRef.current) renderArena(t);
      else {
        const two = twoPRef.current,
          keys = keysRef.current;
        stepShow(
          showRef.current,
          anchorRef.current,
          anyKey(keys, two ? [" ", "testfire"] : [" ", "5", "testfire"]),
          dt,
        );
        if (two)
          stepShow(show2Ref.current, anchor2Ref.current, anyKey(keys, ["0", "testfire2"]), dt);
        renderBackdrop(showRef.current.t);
        renderShowroom(showRef.current, anchorRef.current);
        if (two) renderShowroom(show2Ref.current, anchor2Ref.current);
        fxRef.current.draw(ctx); // particles + bullets' sparks, once for both turntables
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
    const p2Keys = [...P2_CTL.up, ...P2_CTL.down, ...P2_CTL.left, ...P2_CTL.right, ...P2_CTL.fire];
    const onKey = (e: KeyboardEvent, down: boolean) => {
      let key = e.key.toLowerCase();
      const two = twoPRef.current;
      // 2 players: the numpad always means its digits, whether or not NumLock is on
      if (two && NUMPAD[e.code]) key = NUMPAD[e.code] as string;
      if (drive.includes(key) || (two && p2Keys.includes(key))) e.preventDefault();
      if (down) sfxRef.current.unlock();
      if (down && !e.repeat) {
        const m = modeRef.current;
        if (key === "escape" && m === "playing") {
          const v = !pausedRef.current;
          pausedRef.current = v;
          setPaused(v);
        }
        if (m === "select" && pickingRef.current && teamPickRef.current) {
          if (two) {
            // each player picks their own team: P1 ← / → , P2 4 / 6
            if (key === "arrowleft" || key === "a") chooseTeamRef.current(0, 0);
            else if (key === "arrowright" || key === "d") chooseTeamRef.current(0, 1);
            else if (key === "4") chooseTeamRef.current(1, 0);
            else if (key === "6") chooseTeamRef.current(1, 1);
            else if (key === "escape") openTeamPick(false);
          } else if (key === "b" || key === "1") chooseTeamRef.current(0, 0);
          else if (key === "r" || key === "2") chooseTeamRef.current(0, 1);
          else if (key === "escape") openTeamPick(false);
        } else if (m === "select" && pickingRef.current) {
          // number shortcuts are P2's keys in 2-player mode, so only letters pick a mode there
          if (key === "t" || (!two && key === "3")) openTeamPick(true);
          else if (key === "enter" || key === "f" || (!two && key === "1")) {
            setAsk(false);
            startRef.current();
          } else if (key === "s" || (!two && key === "2")) raceRef.current();
          else if (key === "escape") setAsk(false);
        } else if (m === "select") {
          if (key === "arrowleft" || key === "a") pick(baseOf(selectedRef.current) - 1);
          else if (key === "arrowright" || key === "d") pick(baseOf(selectedRef.current) + 1);
          else if (key === "v") setVerRef.current(0, !isV2(selectedRef.current));
          else if (two && key === "5") setVerRef.current(1, !isV2(selected2Ref.current));
          else if (two && key === "4") pick2Ref.current(baseOf(selected2Ref.current) - 1);
          else if (two && key === "6") pick2Ref.current(baseOf(selected2Ref.current) + 1);
          else if (key === "enter" || (two && key === "0")) askRef.current();
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
  }, [pick, setAsk, openTeamPick]);

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

  /** V1 / V2 buttons shown beside a car that has an upgraded form */
  const verToggle = (pi: number, idx: number) => {
    const v2 = v2Of(baseOf(idx));
    if (v2 < 0) return null;
    const on = isV2(idx);
    return (
      <div className="ver-toggle" role="group" aria-label={`Player ${pi + 1} car version`}>
        <button
          type="button"
          className={on ? "" : "on"}
          aria-pressed={!on}
          onClick={() => setVer(pi, false)}
        >
          V1
        </button>
        <button
          type="button"
          className={on ? "on" : ""}
          aria-pressed={on}
          onClick={() => setVer(pi, true)}
        >
          V2 {!wallet.has(v2) && <Lock size={11} />}
        </button>
      </div>
    );
  };
  /** power description + price/owned line for a V2 car */
  const abilityLine = (idx: number) => {
    const car = carAt(idx);
    const ab = abilityOf(idx);
    if (!isV2(idx) && car.price != null)
      return (
        <div className="ability-line" style={{ "--a": "#ffe23d" } as CSSProperties}>
          <b>{ownsV1(idx) ? "UNLOCKED" : "LOCKED CAR"}</b>
          <span>
            {ownsV1(idx) ? "V1 bought — V2 is available" : "buy V1 to drive it & unlock V2"}
          </span>
          <em>{ownsV1(idx) ? "OWNED" : `${fmtXp(car.price)} XP`}</em>
        </div>
      );
    if (!isV2(idx) || !ab) return null;
    return (
      <div className="ability-line" style={{ "--a": ab.color } as CSSProperties}>
        <b>{ab.label}</b>
        <span>{ab.blurb}</span>
        <em>
          {wallet.has(idx)
            ? "OWNED"
            : needsV1(idx)
              ? "BUY V1 FIRST"
              : `${fmtXp(car.price ?? 0)} XP`}
        </em>
      </div>
    );
  };
  const buyBtn = (idx: number, small = false) => (
    <button
      type="button"
      className="arcade-btn buy-btn"
      onClick={() => buy(needsV1(idx) ? baseOf(idx) : idx)}
      aria-label={`Buy ${carAt(needsV1(idx) ? baseOf(idx) : idx).name} for ${carAt(needsV1(idx) ? baseOf(idx) : idx).price} XP`}
    >
      <ShoppingCart size={small ? 14 : 16} /> BUY{needsV1(idx) ? " V1 FIRST" : ""}{" "}
      <small>
        {needsV1(idx)
          ? `${fmtXp((cars[baseOf(idx)] as Car).price ?? 0)} XP`
          : `${fmtXp(carAt(idx).price ?? 0)} XP`}
      </small>
    </button>
  );
  const current = carAt(selected);
  const ovr = rating(current);
  const vars = { "--c": current.color } as CSSProperties;
  const statRows: [string, number, number, typeof Heart][] = [
    ["HP", current.hp, (current.hp / 200) * 100, Heart],
    ["SPEED", current.speed, current.speed, Gauge],
    ["FIRE RATE", current.fireRate, current.fireRate, Zap],
    ["DAMAGE", current.damage, current.damage, Crosshair],
    ["ARMOR", current.armor, current.armor, Shield],
  ];
  const toggleMute = () => setMuted((v) => !v);
  /** small "2 PLAYER  ON/OFF" switch (top-right of the home screen and of each player's half) */
  const twoToggle = () => (
    <button
      type="button"
      className={`twop-toggle ${twoP ? "on" : ""}`}
      role="switch"
      aria-checked={twoP}
      aria-label="2 player split screen"
      onClick={() => setTwoP(!twoP)}
    >
      <Users size={12} /> 2 PLAYER <b>{twoP ? "ON" : "OFF"}</b>
    </button>
  );
  const keyHint = (pi: number) =>
    pi === 0 ? (
      <>
        <kbd>←</kbd>
        <kbd>↑</kbd>
        <kbd>↓</kbd>
        <kbd>→</kbd> DRIVE · <kbd>SPACE</kbd> FIRE
      </>
    ) : (
      <>
        <kbd>8</kbd> UP · <kbd>2</kbd> DOWN · <kbd>4</kbd> LEFT · <kbd>6</kbd> RIGHT · <kbd>0</kbd>{" "}
        FIRE
      </>
    );
  const togglePause = () => {
    const v = !pausedRef.current;
    pausedRef.current = v;
    setPaused(v);
  };
  // a touch device held upright: pause the match and ask for landscape
  const needRotate = mode === "playing" && touchUi && !dev.landscape;
  useEffect(() => {
    if (needRotate && !pausedRef.current) {
      pausedRef.current = true;
      setPaused(true);
    }
  }, [needRotate]);

  return (
    <main
      className="game-shell"
      data-input={dev.input}
      data-orient={dev.landscape ? "landscape" : "portrait"}
      data-short={dev.short ? "1" : "0"}
    >
      <section className={`arena-stage mode-${mode}`} aria-label="Car combat arena" style={vars}>
        <canvas ref={canvasRef} className="arena-canvas" aria-label="Live car combat arena" />
        <div className="crt" aria-hidden="true" />

        <MissionToasts />
        {mode === "select" && <MissionsButton />}
        {mode !== "playing" && mode !== "race" && (
          <header className="top-bar">
            <div className="logo" aria-label="Last Car Standing">
              <span className="logo-a">LAST CAR</span>
              <span className="logo-b">STANDING</span>
            </div>
            <div className="top-right">
              {mode === "select" && !twoP && twoToggle()}
              <span className="credit" title="Your XP, saved on this device">
                XP <b>{fmtXp(wallet.xp)}</b>
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

        {mode === "select" && twoP && (
          <div className="garage two">
            {[0, 1].map((pi) => {
              const idx = pi ? selected2 : selected;
              const car = carAt(idx);
              const o = rating(car);
              const choose = pi ? pick2 : pick;
              return (
                <section
                  className={`garage-half half-${pi}`}
                  key={pi}
                  style={{ "--c": car.color } as CSSProperties}
                  aria-label={`Player ${pi + 1} garage`}
                >
                  <div className="half-head">
                    <span className="half-tag">PLAYER {pi + 1}</span>
                    {twoToggle()}
                  </div>
                  <div
                    className="win spec-panel compact"
                    style={{ "--c": car.color } as CSSProperties}
                  >
                    <div className="win-body">
                      <div className="name-row">
                        <h2 className="car-name">{car.name}</h2>
                        <span className="rank-badge">{rank(o)}</span>
                      </div>
                      {abilityLine(idx)}
                      <div className="stat-list">
                        {(
                          [
                            ["HP", car.hp, (car.hp / 200) * 100],
                            ["SPD", car.speed, car.speed],
                            ["FIRE", car.fireRate, car.fireRate],
                            ["DMG", car.damage, car.damage],
                            ["ARM", car.armor, car.armor],
                          ] as [string, number, number][]
                        ).map(([label, value, pct]) => (
                          <div className="stat-row" key={label}>
                            <span className="stat-label">{label}</span>
                            <span className="segs" aria-hidden="true">
                              {Array.from({ length: 10 }, (_, n) => (
                                <i key={n} className={n < Math.round(pct / 10) ? "on" : ""} />
                              ))}
                            </span>
                            <span className="stat-num">{String(value).padStart(3, "0")}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="showcase" ref={pi ? anchor2Ref : anchorRef}>
                    <button
                      type="button"
                      className="nav-arrow nav-left"
                      onClick={() => choose(baseOf(idx) - 1)}
                      aria-label={`Player ${pi + 1} previous car`}
                    >
                      <ChevronLeft size={26} />
                    </button>
                    <button
                      type="button"
                      className="nav-arrow nav-right"
                      onClick={() => choose(baseOf(idx) + 1)}
                      aria-label={`Player ${pi + 1} next car`}
                    >
                      <ChevronRight size={26} />
                    </button>
                    <span className="showcase-count">
                      {String(baseOf(idx) + 1).padStart(2, "0")} /{" "}
                      {String(cars.length).padStart(2, "0")}
                    </span>
                    {verToggle(pi, idx)}
                  </div>
                  <div className="half-actions">
                    {lockedId(idx) ? (
                      buyBtn(idx, true)
                    ) : (
                      <button
                        type="button"
                        className="arcade-btn start-btn"
                        onClick={() => askRef.current()}
                      >
                        <Play size={16} /> START <small>{pi ? "0" : "ENTER"}</small>
                      </button>
                    )}
                    <button
                      type="button"
                      className="arcade-btn alt-btn"
                      {...hold(pi ? "testfire2" : "testfire")}
                    >
                      <Crosshair size={14} /> TEST FIRE
                    </button>
                  </div>
                  <p className="half-keys">
                    {pi === 0 ? (
                      <>
                        <kbd>←</kbd>
                        <kbd>→</kbd> CHANGE CAR · <kbd>SPACE</kbd> TEST FIRE
                      </>
                    ) : (
                      <>
                        <kbd>4</kbd>
                        <kbd>6</kbd> CHANGE CAR · <kbd>0</kbd> TEST FIRE
                      </>
                    )}
                  </p>
                  <div className="win garage-strip" aria-label={`Player ${pi + 1} car list`}>
                    <div className="tiles" role="listbox">
                      {cars.map((c, i) => (
                        <button
                          key={c.name}
                          type="button"
                          role="option"
                          aria-selected={baseOf(idx) === i}
                          className={`tile ${baseOf(idx) === i ? "tile-active" : ""}`}
                          style={{ "--c": c.color } as CSSProperties}
                          onClick={() => choose(i)}
                          aria-label={`Player ${pi + 1} select ${c.name}`}
                        >
                          <span className="tile-index">{String(i + 1).padStart(2, "0")}</span>
                          {!ownsV1(i) && <Lock size={11} className="tile-lock" />}
                          {baseOf(idx) === i && <span className="tile-flag">P{pi + 1}</span>}
                          <span className="tile-art">
                            {broken[i] ? (
                              <span className="tile-swatch" />
                            ) : (
                              <img
                                src={c.shopUrl ?? c.url}
                                alt=""
                                loading="eager"
                                onError={() => setBroken((b) => ({ ...b, [i]: true }))}
                              />
                            )}
                          </span>
                          <span className="tile-name">{c.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {mode === "select" && !twoP && (
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
                  {abilityLine(selected)}
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
                  onClick={() => pick(baseOf(selected) - 1)}
                  aria-label="Previous car"
                >
                  <ChevronLeft size={26} />
                </button>
                <button
                  type="button"
                  className="nav-arrow nav-right"
                  onClick={() => pick(baseOf(selected) + 1)}
                  aria-label="Next car"
                >
                  <ChevronRight size={26} />
                </button>
                <span className="showcase-count">
                  {String(baseOf(selected) + 1).padStart(2, "0")} /{" "}
                  {String(cars.length).padStart(2, "0")}
                </span>
                {verToggle(0, selected)}
              </div>

              <aside className="action-panel">
                {lockedId(selected) ? (
                  buyBtn(selected)
                ) : (
                  <button
                    type="button"
                    className="arcade-btn start-btn"
                    onClick={() => askRef.current()}
                  >
                    <Play size={18} /> START <small>ENTER</small>
                  </button>
                )}
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
                    aria-selected={baseOf(selected) === i}
                    className={`tile ${baseOf(selected) === i ? "tile-active" : ""}`}
                    style={{ "--c": car.color } as CSSProperties}
                    onClick={() => pick(i)}
                    aria-label={`Select ${car.name}`}
                  >
                    <span className="tile-index">{String(i + 1).padStart(2, "0")}</span>
                    {!ownsV1(i) && <Lock size={11} className="tile-lock" />}
                    {baseOf(selected) === i && <span className="tile-flag">P1</span>}
                    <span className="tile-art">
                      {broken[i] ? (
                        <span className="tile-swatch" />
                      ) : (
                        <img
                          src={car.shopUrl ?? car.url}
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

        {mode === "select" && notice && (
          <div className="lock-notice" role="status" aria-live="polite">
            {notice}
          </div>
        )}

        {mode === "select" && picking && teamPick && twoP && (
          <div className="overlay" onClick={() => setAsk(false)}>
            <div
              className="win overlay-box mode-pick two-pick"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="win-title">
                <span>TDM · EACH PLAYER PICKS A TEAM</span>
              </div>
              <div className="win-body center">
                <div className="team-cols">
                  {[0, 1].map((pi) => (
                    <div className="team-col" key={pi}>
                      <b className="team-who">PLAYER {pi + 1}</b>
                      <button
                        type="button"
                        className={`arcade-btn start-btn team-blue-btn ${teams[pi] === 0 ? "picked" : ""}`}
                        onClick={() => chooseTeam(pi, 0)}
                      >
                        <Shield size={16} /> BLUE <small>{pi ? "4" : "←"}</small>
                      </button>
                      <button
                        type="button"
                        className={`arcade-btn start-btn team-red-btn ${teams[pi] === 1 ? "picked" : ""}`}
                        onClick={() => chooseTeam(pi, 1)}
                      >
                        <Shield size={16} /> RED <small>{pi ? "6" : "→"}</small>
                      </button>
                      <span className="team-state">
                        {(teams[pi] ?? -1) < 0 ? "WAITING…" : teams[pi] === 0 ? "BLUE ✓" : "RED ✓"}
                      </span>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="arcade-btn alt-btn"
                  onClick={() => openTeamPick(false)}
                >
                  BACK
                </button>
              </div>
            </div>
          </div>
        )}

        {mode === "select" && picking && teamPick && !twoP && (
          <div className="overlay" onClick={() => setAsk(false)}>
            <div className="win overlay-box mode-pick" onClick={(e) => e.stopPropagation()}>
              <div className="win-title">
                <span>TDM · CHOOSE YOUR TEAM</span>
              </div>
              <div className="win-body center">
                <button
                  type="button"
                  className="arcade-btn start-btn team-blue-btn"
                  onClick={() => chooseTeam(0, 0)}
                >
                  <Shield size={18} /> BLUE TEAM <small>SPAWN ON THE LEFT · B</small>
                </button>
                <button
                  type="button"
                  className="arcade-btn start-btn team-red-btn"
                  onClick={() => chooseTeam(0, 1)}
                >
                  <Shield size={18} /> RED TEAM <small>SPAWN ON THE RIGHT · R</small>
                </button>
                <button
                  type="button"
                  className="arcade-btn alt-btn"
                  onClick={() => openTeamPick(false)}
                >
                  BACK
                </button>
              </div>
            </div>
          </div>
        )}

        {mode === "select" && picking && !teamPick && (
          <div className="overlay" onClick={() => setAsk(false)}>
            <div className="win overlay-box mode-pick" onClick={(e) => e.stopPropagation()}>
              <div className="win-title">
                <span>SELECT MODE{twoP ? " · BOTH PLAYERS JOIN" : ""}</span>
              </div>
              <div className="win-body center">
                <button
                  type="button"
                  className="arcade-btn start-btn"
                  onClick={() => {
                    setAsk(false);
                    startRef.current();
                  }}
                >
                  <Swords size={18} /> FFA <small>COMBAT · LAST CAR STANDING · F</small>
                </button>
                <button
                  type="button"
                  className="arcade-btn start-btn speed-btn"
                  onClick={() => raceRef.current()}
                >
                  <Gauge size={18} /> SPEED <small>RACE · DODGE · FIRE SPEED · S</small>
                </button>
                <button
                  type="button"
                  className="arcade-btn start-btn tdm-btn"
                  onClick={() => openTeamPick(true)}
                >
                  <Shield size={18} /> TDM <small>TEAM DEATHMATCH · 6 vs 6 · T</small>
                </button>
                <button type="button" className="arcade-btn alt-btn" onClick={() => setAsk(false)}>
                  BACK
                </button>
              </div>
            </div>
          </div>
        )}

        {mode === "race" && (
          <RaceMode
            carIndex={selected}
            carIndex2={selected2}
            twoP={twoP}
            onSetTwoP={setTwoP}
            keys={keysRef}
            sfx={sfxRef.current}
            muted={muted}
            onToggleMute={toggleMute}
            onExit={() => setModeSync("select")}
          />
        )}

        {mode === "playing" && twoP && (
          <>
            <div className="tp-top">
              <button
                type="button"
                className="icon-btn"
                onClick={toggleMute}
                aria-label={muted ? "Unmute sound" : "Mute sound"}
              >
                {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
              {hud.tdm ? (
                <div className="tp-score" aria-label="Team score">
                  <b className="tdm-score tdm-blue">{hud.tdm.blue}</b>
                  <span className="tdm-time">{fmtTime(hud.tdm.left)}</span>
                  <b className="tdm-score tdm-red">{hud.tdm.red}</b>
                </div>
              ) : (
                <div className="hud-timer tp-timer">{fmtTime(hud.time)}</div>
              )}
              <button
                type="button"
                className="icon-btn"
                onClick={togglePause}
                aria-label={paused ? "Resume" : "Pause"}
              >
                {paused ? <Play size={14} /> : "II"}
              </button>
            </div>
            {[0, 1].map((pi) => {
              const idx = pi ? selected2 : selected;
              const car = carAt(idx);
              const hp = pi ? (hud.hp2 ?? 0) : hud.hp;
              const kills = pi ? (hud.kills2 ?? 0) : hud.kills;
              const team = hud.tdm ? (pi ? (hud.tdm.team2 ?? hud.tdm.team) : hud.tdm.team) : -1;
              const resp = hud.tdm ? (pi ? (hud.tdm.respawn2 ?? 0) : hud.tdm.respawn) : 0;
              return (
                <div className={`tp-pane pane-${pi}`} key={pi}>
                  <div className="tp-head">
                    <span className="tp-who">
                      PLAYER {pi + 1}
                      {team >= 0 && (
                        <em style={{ color: TEAM_COL[team] }}> · {team === 0 ? "BLUE" : "RED"}</em>
                      )}
                    </span>
                    {twoToggle()}
                  </div>
                  {resp > 0 && !paused && (
                    <div className="tp-respawn" role="status">
                      <span>ELIMINATED · RESPAWNING</span>
                      <b key={resp}>{resp}</b>
                    </div>
                  )}
                  {!hud.tdm && hp <= 0 && !paused && (
                    <div className="tp-respawn" role="status">
                      <span>WRECKED · WATCHING</span>
                    </div>
                  )}
                  <div className="tp-foot">
                    <div className="win tp-vitals">
                      <div className="vital-head">
                        <span>
                          <Heart size={12} /> {car.name.toUpperCase()}
                        </span>
                        <b>
                          {hp}
                          <small> HP</small>
                        </b>
                      </div>
                      <div className="vital-track">
                        <span style={{ width: `${clamp((hp / car.hp) * 100, 0, 100)}%` }} />
                      </div>
                      <div className="tp-meta">
                        {String(kills).padStart(2, "0")} KILLS
                        {!hud.tdm && ` · ${String(hud.alive).padStart(2, "0")}/${TOTAL} ALIVE`}
                      </div>
                    </div>
                    <p className="tp-keys">{keyHint(pi)}</p>
                  </div>
                </div>
              );
            })}
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

        {mode === "playing" && !twoP && (
          <>
            <div className="hud-top">
              <div className="hud-brand">
                <Crosshair size={14} /> LAST CAR <b>STANDING</b>
              </div>
              {hud.tdm ? (
                <div className="hud-tdm" aria-label="Team score">
                  <b className="tdm-score tdm-blue">{hud.tdm.blue}</b>
                  <span className="tdm-time">{fmtTime(hud.tdm.left)}</span>
                  <b className="tdm-score tdm-red">{hud.tdm.red}</b>
                </div>
              ) : (
                <div className="hud-timer">{fmtTime(hud.time)}</div>
              )}
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
              {hud.tdm ? (
                <>
                  <span className="hud-eyebrow">
                    YOU ARE {hud.tdm.team === 0 ? "BLUE" : "RED"} · 6v6
                  </span>
                  <div className="hud-count">
                    <b>{String(hud.kills).padStart(2, "0")}</b>
                    <span>KILLS</span>
                  </div>
                </>
              ) : (
                <>
                  <span className="hud-eyebrow">STILL IN THE FIGHT</span>
                  <div className="hud-count">
                    <b>{String(hud.alive).padStart(2, "0")}</b>
                    <span>/{TOTAL}</span>
                  </div>
                  <span className="hud-kills">
                    {String(hud.kills).padStart(2, "0")} ELIMINATIONS
                  </span>
                </>
              )}
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
              <div
                className="map-frame"
                style={
                  hud.tdm
                    ? { height: "auto", aspectRatio: `${WORLD.width} / ${WORLD.height}` }
                    : undefined
                }
              >
                {hud.tdm &&
                  TDM_SPAWN.map((sp, i) => (
                    <i
                      key={`b${i}`}
                      className="map-base"
                      style={{
                        left: `${(sp.x / WORLD.width) * 100}%`,
                        top: `${(sp.y / WORLD.height) * 100}%`,
                        borderColor: TEAM_COL[i],
                      }}
                    />
                  ))}
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
                    style={{
                      left: `${d.x}%`,
                      top: `${d.y}%`,
                      ...(hud.tdm && !d.me ? { background: TEAM_COL[d.team === 1 ? 1 : 0] } : null),
                    }}
                  />
                ))}
              </div>
            </div>
            <div className="hud-bottom">
              {!touchUi && (
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
              )}
            </div>
            {touchUi && !paused && <TouchControls joy={joyRef} keys={keysRef} prefs={ctl} />}
            {needRotate && <RotateOverlay />}
            {hud.tdm && hud.tdm.respawn > 0 && !paused && (
              <div className="respawn-banner" role="status">
                <span>ELIMINATED · RESPAWNING ON YOUR BASE</span>
                <b key={hud.tdm.respawn}>{hud.tdm.respawn}</b>
              </div>
            )}
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
                    {touchUi && <ControlSettings prefs={ctl} />}
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

        {mode === "result" && result.two && (
          <div className="overlay">
            <div className="win overlay-box two-result">
              <div className="win-title">
                <span>
                  <Trophy size={13} /> MATCH COMPLETE
                </span>
              </div>
              <div className="win-body center">
                <h1 className="big-title">
                  {result.two.winner === 1 || result.two.winner === 2 ? (
                    <>
                      PLAYER {result.two.winner}
                      <br />
                      <em>WINS!</em>
                    </>
                  ) : result.tdm ? (
                    result.tdm.draw ? (
                      <>
                        MATCH
                        <br />
                        <em>DRAW!</em>
                      </>
                    ) : result.two.p1.won ? (
                      <>
                        TEAM
                        <br />
                        <em>VICTORY!</em>
                      </>
                    ) : (
                      <>
                        TEAM
                        <br />
                        <em>DEFEAT</em>
                      </>
                    )
                  ) : (
                    <>
                      GAME
                      <br />
                      <em>OVER</em>
                    </>
                  )}
                </h1>
                {result.tdm && (
                  <p className="result-sub">{`BLUE ${result.tdm.blue} - ${result.tdm.red} RED`}</p>
                )}
                <div className="two-cols">
                  {([result.two.p1, result.two.p2] as const).map((r, i) => (
                    <div className={`two-col ${r.won ? "won" : ""}`} key={i}>
                      <b className="team-who">PLAYER {i + 1}</b>
                      <div className="result-stats one">
                        <div>
                          <span>{result.tdm ? "TEAM" : "POSITION"}</span>
                          <b>
                            {result.tdm
                              ? (i ? (result.tdm.team2 ?? result.tdm.team) : result.tdm.team) === 0
                                ? "BLUE"
                                : "RED"
                              : `#${String(r.pos).padStart(2, "0")}`}
                          </b>
                        </div>
                        <div>
                          <span>KILLS</span>
                          <b>{String(r.kills).padStart(2, "0")}</b>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="arcade-btn start-btn"
                  onClick={() =>
                    result.tdm
                      ? startTdmRef.current(result.tdm.team, result.tdm.team2)
                      : startRef.current()
                  }
                >
                  <Play size={16} /> PLAY AGAIN
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

        {mode === "result" && !result.two && (
          <div className="overlay">
            <div className="win overlay-box">
              <div className="win-title">
                <span>
                  <Trophy size={13} /> MATCH COMPLETE
                </span>
              </div>
              <div className="win-body center">
                <h1 className="big-title">
                  {result.tdm ? (
                    result.tdm.draw ? (
                      <>
                        MATCH
                        <br />
                        <em>DRAW!</em>
                      </>
                    ) : result.won ? (
                      <>
                        TEAM
                        <br />
                        <em>VICTORY!</em>
                      </>
                    ) : (
                      <>
                        TEAM
                        <br />
                        <em>DEFEAT</em>
                      </>
                    )
                  ) : result.won ? (
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
                  {result.tdm
                    ? `BLUE ${result.tdm.blue} - ${result.tdm.red} RED`
                    : result.won
                      ? "THE ARENA IS YOURS."
                      : "THE ARENA CLAIMS ANOTHER."}
                </p>
                <div className="result-stats">
                  <div>
                    <span>{result.tdm ? "TEAM" : "POSITION"}</span>
                    <b>
                      {result.tdm
                        ? result.tdm.team === 0
                          ? "BLUE"
                          : "RED"
                        : `#${String(result.position).padStart(2, "0")}`}
                    </b>
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
                  onClick={() =>
                    result.tdm ? startTdmRef.current(result.tdm.team) : startRef.current()
                  }
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
  ctx.fillStyle = "rgba(0,0,0,0.16)";
  ctx.fillRect(x + 6, y + 8, w + 14, h + 14);
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fillRect(x + 10, y + 12, w, h);
  if (w <= 110 && h <= 110) {
    // wooden crate
    ctx.fillStyle = "#6b4823";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#b07d45";
    ctx.fillRect(x, y, w, h - lip);
    ctx.fillStyle = "rgba(255,235,190,0.25)";
    ctx.fillRect(x, y, w, 2);
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
  const sheen = ctx.createLinearGradient(x, y, x + w, y + h);
  sheen.addColorStop(0, "rgba(255,255,255,0.14)");
  sheen.addColorStop(1, "rgba(0,0,0,0.12)");
  ctx.fillStyle = sheen;
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
  // hazard-stripe border along the walls
  const band = 22;
  const bands: [number, number, number, number][] = [
    [0, 0, c.width, band],
    [0, c.height - band, c.width, band],
    [0, 0, band, c.height],
    [c.width - band, 0, band, c.height],
  ];
  for (const [bx, by, bw, bh] of bands) {
    f.save();
    f.beginPath();
    f.rect(bx, by, bw, bh);
    f.clip();
    f.fillStyle = "rgba(20,20,24,0.85)";
    f.fillRect(bx, by, bw, bh);
    f.fillStyle = "rgba(240,200,50,0.8)";
    const len = Math.max(bw, bh) + 60;
    for (let k = -40; k < len; k += 44) {
      f.beginPath();
      if (bw > bh) {
        f.moveTo(bx + k, by + bh);
        f.lineTo(bx + k + 22, by + bh);
        f.lineTo(bx + k + 22 + bh, by);
        f.lineTo(bx + k + bh, by);
      } else {
        f.moveTo(bx, by + k);
        f.lineTo(bx, by + k + 22);
        f.lineTo(bx + bw, by + k + 22 - bw);
        f.lineTo(bx + bw, by + k - bw);
      }
      f.closePath();
      f.fill();
    }
    f.restore();
  }
  // painted centre ring (player spawn)
  f.strokeStyle = "rgba(240,205,90,0.35)";
  f.lineWidth = 6;
  f.setLineDash([18, 14]);
  f.beginPath();
  f.arc(WORLD.width / 2, WORLD.height / 2, 120, 0, Math.PI * 2);
  f.stroke();
  f.setLineDash([]);
  // overhead light pools (additive)
  f.globalCompositeOperation = "lighter";
  for (let ly = 330; ly < c.height; ly += 520) {
    for (let lx = 300; lx < c.width; lx += 600) {
      const jx = lx + (rnd() - 0.5) * 120,
        jy = ly + (rnd() - 0.5) * 120;
      const lg = f.createRadialGradient(jx, jy, 10, jx, jy, 340);
      lg.addColorStop(0, "rgba(130,175,255,0.13)");
      lg.addColorStop(1, "rgba(130,175,255,0)");
      f.fillStyle = lg;
      f.fillRect(jx - 340, jy - 340, 680, 680);
    }
  }
  f.globalCompositeOperation = "source-over";
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
