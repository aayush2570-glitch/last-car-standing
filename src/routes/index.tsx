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
  Lock,
  ShoppingCart,
} from "lucide-react";
import {
  PAL,
  cars,
  allCars,
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
  MINE_LIFE,
  FREEZE_R,
  FREEZE_RAMP,
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
import { PetsButton } from "@/game/PetsUI";
import {
  PET_BOT_CHANCE,
  CURSE_DAMAGE,
  CURSE_SPEED,
  CURSE_TIME,
  CAT_BLINK_ROWS,
  CAT_CELL_H,
  CAT_CELL_W,
  CAT_COLS,
  CAT_DOWN,
  catBlink,
  catFacing,
  catSheetImg,
  PET_FLY_DAMAGE,
  PET_FLY_RANGE,
  PET_FLY_RATE,
  PET_HEAL,
  PET_RED_ZONE,
  PET_SHIELD_TAKE,
  PET_SHIELD_TIME,
  PET_SIZE,
  PETS,
  equippedPet,
  petImg,
  petLocal,
  petOf,
  randomPet,
  type PetKind,
} from "@/game/pets";
import {
  createRoom,
  joinRoom,
  LobbyError,
  type LobbyController,
  type LobbyState,
} from "@/game/lobby";
import { FriendsButton, FriendsModal, LeaveConfirm, LobbyCard } from "@/game/LobbyUI";
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
import {
  WRECK_BLAST_DMG,
  WRECK_BLAST_R,
  WRECK_HITS,
  drawWreck,
  garageLayout,
  makeWreck,
  stepWrecks,
  wreckContains,
  wreckHeat,
  type Wreck,
} from "@/game/wrecks";
import { drawNight, newStorm, stepStorm, type Storm } from "@/game/night";
import garageThumb from "@/assets/wrecks/map_garage.webp";
import yardThumb from "@/assets/wrecks/map_yard.webp";
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
  /* Time Freeze: how frozen this car is (0..1), and the blue screen tint that fades in and out */
  frz?: number;
  tint?: number;
  pa?: number;
  /* pets: kind it spawned with, spawn done, one-time power spent, RedFly shot timer, Blutle armour seconds left */
  pet?: PetKind | undefined;
  petInit?: boolean;
  /* bots: the pet rolled once at match start (null = rolled, no pet); kept across TDM respawns */
  botPet?: PetKind | null;
  petUsed?: boolean;
  petCd?: number;
  /* pet's own body in the world: position, velocity, facing, last update time, trail timer */
  pp?: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    a: number;
    t: number;
    tr: number;
    /* Catnya: which way she faces (sheet row) and her walk-cycle phase */
    d?: number;
    ph?: number;
  };
  shd?: number;
  /* Catnya curse: seconds left on this car (its bullets do less damage) */
  crs?: number;
  /* online match: stable id used in snapshots, the guest (pid) who drives this car, kills, finishing place */
  id?: number;
  net?: number;
  k?: number;
  epos?: number;
  /* guest side: where the host says this car is (the drawn car glides towards it) */
  nx?: number;
  ny?: number;
  na?: number;
  /* guest: last raw snapshot pose, estimated speed from the last two, seconds since the last snapshot */
  sx?: number;
  sy?: number;
  sa?: number;
  tvx?: number;
  tvy?: number;
  tva?: number;
  ext?: number;
  /* guest: recent poses stamped with the host clock; the car is drawn slightly in the past, between two of them */
  buf?: { t: number; x: number; y: number; a: number }[];
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
  /** Time Freeze: held in the air at the edge of a zone / inside it; sc = how fast it moved this frame (0..1) */
  fz?: boolean;
  sc?: number;
};
type Freeze = { x: number; y: number; r: number; t: number; age: number; owner: Vehicle };
type Dot = { x: number; y: number; me: boolean; team?: number | undefined };
type Tdm = {
  score: [number, number];
  time: number;
  limit: number;
  team: number;
  draw?: boolean;
};
type TdmHud = {
  blue: number;
  red: number;
  left: number;
  respawn: number;
  team: number;
};
type Game = {
  player: Vehicle;
  cars: Vehicle[];
  bullets: Projectile[];
  mines: Mine[];
  /** Time Freeze zones (Blue Turret v2) */
  freezes?: Freeze[];
  started: number;
  lastHud: number;
  kills: number;
  over: { won: boolean; position: number; t: number } | null;
  trail: number;
  powerups: Powerup[];
  spawnT: number;
  cam?: { x: number; y: number };
  camT?: number;
  tdm?: Tdm;
  /* Wreck Garage (night map): pushable car wrecks, lightning, brief blast lights */
  wrecks?: Wreck[];
  storm?: Storm;
  blasts?: { x: number; y: number; t: number }[];
  /* online match (host simulates, guests only draw snapshots) */
  online?: boolean;
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
/** team colours + names per map: the yard is Blue vs Red, the Wreck Garage is Green vs Yellow */
const TEAM_LOOK = {
  yard: { col: ["#38a0ff", "#ff4040"], rgb: ["56,160,255", "255,64,64"], name: ["BLUE", "RED"] },
  garage: {
    col: ["#34d058", "#ffd21f"],
    rgb: ["52,208,88", "255,210,31"],
    name: ["GREEN", "YELLOW"],
  },
};
let teamLook: keyof typeof TEAM_LOOK = "yard";
function applyTeamLook(kind: keyof typeof TEAM_LOOK) {
  teamLook = kind;
  const l = TEAM_LOOK[kind];
  TEAM_COL[0] = l.col[0] as string;
  TEAM_COL[1] = l.col[1] as string;
  TEAM_RGB[0] = l.rgb[0] as string;
  TEAM_RGB[1] = l.rgb[1] as string;
}
const teamName = (i: number) => TEAM_LOOK[teamLook].name[i === 1 ? 1 : 0] as string;
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
  mapKind = "yard"; // switching worlds always restores the yard's blocks
}
/** FFA maps: the neon yard (containers) or the night Wreck Garage (no walls, only pushable wrecks) */
type MapKind = "yard" | "garage";
let mapKind: MapKind = "yard";
/** TDM maps: same garage, stretched to the 3600-wide TDM world */
function setTdmMap(kind: MapKind) {
  setWorld("tdm");
  if (kind === mapKind) return;
  blocks.length = 0;
  if (kind === "yard") for (const b of TDM_BLOCKS) blocks.push([...b]);
  floorCanvas = null;
  mapKind = kind;
}
function setMap(kind: MapKind) {
  setWorld("ffa");
  if (kind === mapKind) return;
  blocks.length = 0;
  if (kind === "yard") for (const b of FFA_BLOCKS) blocks.push([...b]);
  floorCanvas = null;
  mapKind = kind;
}
/** the car this screen belongs to (online: other humans' shots look hostile too) */
let viewerCar: Vehicle | null = null;
const bulletCol = (tdm: boolean, o: Vehicle) =>
  tdm
    ? (TEAM_COL[o.team === 1 ? 1 : 0] as string)
    : o.bot || (viewerCar !== null && o !== viewerCar)
      ? PAL.hostile
      : PAL.friendly;
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

/* ───────── driving controls ─────────
   Arrow keys (WASD also works) · fire = SPACE */
type Ctl = { up: string[]; down: string[]; left: string[]; right: string[]; fire: string[] };
const P1_CTL: Ctl = {
  up: ["arrowup", "w"],
  down: ["arrowdown", "s"],
  left: ["arrowleft", "a"],
  right: ["arrowright", "d"],
  fire: [" "],
};
const anyKey = (keys: Set<string>, list: string[]) => list.some((k) => keys.has(k));
/** is this car's v2 power (of the given kind) running right now? */
const powerOn = (v: Vehicle, kind: "clone" | "ghost" | "mine" | "turret" | "freeze") =>
  (v.abT ?? 0) > 0 && abilityOf(v.carId)?.kind === kind;
/** Time Freeze: the caster, their clones and (TDM) their team ignore their own zone */
const freezeImmune = (v: Vehicle, owner: Vehicle, tdm: boolean) =>
  ownerOf(v) === owner || (tdm && v.team !== undefined && v.team === owner.team);
/** the real car behind a vehicle: a Virtual Clone belongs to the car that made it, everything else is its own owner */
const ownerOf = (v: Vehicle): Vehicle => v.cloneOf ?? v;
const fmtXp = (n: number) => n.toLocaleString("en-US");
const P1_COLOR = "56,160,255";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** wrap any angle into [-PI, PI) */
const wrapAng = (a: number) => a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2));

/* ───────── online match: the host simulates everything, guests send their steering and draw snapshots ───────── */
type NetIn = { x: number; y: number; f: number; at: number };
const NO_IN: NetIn = { x: 0, y: 0, f: 0, at: 0 };
/** who is in the match when the host presses START (index 0 = the host) */
type OnlineSetup = { players: { pid: number; car: number }[] };
type GuestNet = {
  byId: Map<number, Vehicle>;
  me: number;
  got: boolean;
  last: number;
  /** smallest (local clock - host clock) seen, how bumpy the arrival times are, and how far behind we draw (ms) */
  off?: number;
  jit: number;
  delay: number;
};
/** online host: the pet each friend (by pid) brought along */
const guestPets = new Map<number, PetKind>();
let vidCounter = 0;
const vid = (v: Vehicle): number => (v.id ??= ++vidCounter);
const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;
const rows = (v: unknown): unknown[][] =>
  Array.isArray(v) ? (v.filter((x) => Array.isArray(x)) as unknown[][]) : [];
const nm = (r: unknown[], i: number) => Number(r[i]) || 0;

/** everything a guest needs to draw the match, as plain numbers (sent ~20 times a second) */
function encodeSnap(g: Game, withWrecks = true, ht = 0): Record<string, unknown> {
  const snap: Record<string, unknown> = {
    t: "gsnap",
    ht: Math.round(ht * 10) / 10,
    c: g.cars.map((v) => [
      vid(v),
      r1(v.x),
      r1(v.y),
      r2(v.angle),
      Math.round(v.hp),
      v.alive ? 1 : 0,
      v.carId,
      v.team ?? -1,
      v.hit > 0 ? 1 : 0,
      v.speedT > 0 ? 1 : 0,
      v.dblT > 0 ? 1 : 0,
      r1(v.abT ?? 0),
      r1(v.blk ?? 0),
      v.tur === undefined ? null : r2(v.tur),
      v.bot ? 1 : 0,
      v.cloneOf ? vid(v.cloneOf) : -1,
      r1(v.inv ?? 0),
      Math.ceil(v.respawn ?? 0),
      r2(v.cooldown),
      v.k ?? 0,
      r2(v.tint ?? 0),
      r2(v.frz ?? 0),
      PETS.findIndex((x) => x.kind === v.pet) + 1,
      r1(v.shd ?? 0),
      r1(v.crs ?? 0),
    ]),
    b: g.bullets.map((b) => {
      const sc = b.sc ?? 1; // held / slowed bullets are sent with the speed they really have
      return [r1(b.x), r1(b.y), r1(b.vx * sc), r1(b.vy * sc), vid(b.owner), r2(b.life)];
    }),
    m: g.mines.map((m) => [r1(m.x), r1(m.y), vid(m.owner), r2(m.age), m.used ? 1 : 0]),
    p: g.powerups.map((q) => [r1(q.x), r1(q.y), POWER_KINDS.indexOf(q.kind), r1(q.life)]),
  };
  if (g.wrecks && withWrecks)
    snap["w"] = g.wrecks.map((w) => [r1(w.x), r1(w.y), r2(w.angle), w.sprite, w.hits, r2(w.flash)]);
  if (g.freezes?.length)
    snap["fz"] = g.freezes.map((f) => [r1(f.x), r1(f.y), r1(f.r), r2(f.t), r2(f.age)]);
  if (g.storm) snap["s"] = r2(g.storm.flash);
  if (g.blasts) snap["bl"] = g.blasts.map((b) => [r1(b.x), r1(b.y), r2(b.t)]);
  if (g.tdm) snap["td"] = [g.tdm.score[0], g.tdm.score[1], r1(g.tdm.time), g.tdm.limit];
  return snap;
}

/** guest: fold a snapshot from the host into the local game (cars are reused, so they glide instead of jumping) */
function applySnap(g: Game, m: Record<string, unknown>, gn: GuestNet, fx: Fx, sfx: Sfx) {
  const first = !gn.got;
  gn.got = true;
  /* line the host's clock up with ours: packets that arrive early set the offset, late ones show up as jitter */
  const nowMs = performance.now();
  const ht = Number(m["ht"]) || nowMs;
  const o = nowMs - ht;
  if (gn.off === undefined) gn.off = o;
  else {
    gn.jit += (Math.abs(o - gn.off) - gn.jit) * 0.1;
    gn.off = Math.min(o, gn.off + 0.05);
  }
  gn.delay = clamp(90 + 2 * gn.jit, 90, 260);
  const seen = new Set<number>();
  const cars: Vehicle[] = [];
  const links: [Vehicle, number][] = [];
  const events: { v: Vehicle; died: boolean; shot: boolean }[] = [];
  for (const r of rows(m["c"])) {
    const id = nm(r, 0);
    let v = gn.byId.get(id);
    const fresh = !v || first;
    if (!v) {
      v = {
        x: nm(r, 1),
        y: nm(r, 2),
        angle: nm(r, 3),
        hp: 1,
        alive: true,
        cooldown: 0,
        bot: false,
        drift: 0,
        strafe: 0,
        carId: 0,
        hit: 0,
        speedT: 0,
        dblT: 0,
        dodgeT: 0,
        dodgeDir: 1,
        dodgeAng: 0,
        react: 0,
        strafeAng: 0,
        trail: 0,
        id,
      };
      gn.byId.set(id, v);
    }
    seen.add(id);
    const wasAlive = v.alive,
      lastCd = v.cooldown;
    const px = nm(r, 1),
      py = nm(r, 2),
      pa = nm(r, 3);
    const buf = (v.buf ??= []);
    const lastPose = buf[buf.length - 1];
    if (fresh || (lastPose && Math.hypot(px - lastPose.x, py - lastPose.y) > 320)) {
      buf.length = 0; // respawn / teleport: don't glide across the map
      v.x = px;
      v.y = py;
      v.angle = pa;
    }
    buf.push({ t: ht, x: px, y: py, a: pa });
    if (buf.length > 12) buf.shift();
    v.nx = px;
    v.ny = py;
    v.na = pa;
    if (fresh) {
      v.x = v.nx;
      v.y = v.ny;
      v.angle = v.na;
    }
    v.hp = nm(r, 4);
    v.alive = nm(r, 5) === 1;
    v.carId = Math.max(0, Math.min(allCars.length - 1, Math.floor(nm(r, 6))));
    const tm = nm(r, 7);
    if (tm < 0) delete v.team;
    else v.team = tm === 1 ? 1 : 0;
    v.hit = nm(r, 8) ? 0.14 : 0;
    v.speedT = nm(r, 9) ? 1 : 0;
    v.dblT = nm(r, 10) ? 1 : 0;
    v.abT = nm(r, 11);
    v.blk = nm(r, 12);
    if (r[13] === null || r[13] === undefined) delete v.tur;
    else v.tur = nm(r, 13);
    v.bot = nm(r, 14) === 1;
    const co = nm(r, 15);
    if (co >= 0 && r[15] !== undefined) links.push([v, co]);
    else delete v.cloneOf;
    v.inv = nm(r, 16);
    v.respawn = nm(r, 17);
    v.cooldown = nm(r, 18);
    v.k = nm(r, 19);
    v.tint = nm(r, 20);
    v.frz = nm(r, 21);
    const pk = PETS[nm(r, 22) - 1];
    if (pk) v.pet = pk.kind;
    else delete v.pet;
    v.shd = nm(r, 23);
    v.crs = nm(r, 24);
    if (!fresh)
      events.push({
        v,
        died: wasAlive && !v.alive,
        shot: v.alive && v.cooldown > lastCd + 0.04,
      });
    cars.push(v);
  }
  for (const id of [...gn.byId.keys()]) if (!seen.has(id)) gn.byId.delete(id);
  for (const [v, co] of links) {
    const o = gn.byId.get(co);
    if (o) v.cloneOf = o;
    else delete v.cloneOf;
  }
  g.cars = cars;
  g.player = gn.byId.get(gn.me) ?? g.player;
  /* sounds and sparks the host only made on its own screen */
  const cx = g.cam?.x ?? g.player.x,
    cy = g.cam?.y ?? g.player.y;
  for (const e of events) {
    const near = Math.hypot(e.v.x - cx, e.v.y - cy) < 1100;
    const st = carAt(e.v.carId);
    if (e.died) {
      fx.explode(e.v.x, e.v.y, e.v.cloneOf ? "#4dd8ff" : st.color);
      if (near) sfx.boom();
    } else if (e.shot) {
      const a = e.v.angle;
      fx.muzzle(e.v.x + Math.sin(a) * st.h * 0.57, e.v.y - Math.cos(a) * st.h * 0.57, a, "#3dff7a");
      if (near) sfx.shot(0.8 + st.fireRate / 200);
    }
  }
  const byOwner = (id: number) => gn.byId.get(id) ?? g.player;
  const back = gn.delay / 1000; // bullets are drawn as far in the past as the cars
  g.bullets = rows(m["b"]).map((r) => ({
    x: nm(r, 0) - nm(r, 2) * back,
    y: nm(r, 1) - nm(r, 3) * back,
    vx: nm(r, 2),
    vy: nm(r, 3),
    owner: byOwner(nm(r, 4)),
    life: nm(r, 5),
    damage: 0,
  }));
  g.mines = rows(m["m"])
    .filter((r) => nm(r, 4) !== 1)
    .map((r) => ({
      x: nm(r, 0),
      y: nm(r, 1),
      owner: byOwner(nm(r, 2)),
      age: nm(r, 3),
      used: false,
      seen: new Map(),
    }));
  g.powerups = rows(m["p"]).map((r) => ({
    x: nm(r, 0),
    y: nm(r, 1),
    kind: POWER_KINDS[nm(r, 2)] ?? "health",
    life: nm(r, 3),
  }));
  if (Array.isArray(m["w"])) {
    g.wrecks = rows(m["w"]).map((r) => {
      const w = makeWreck(
        nm(r, 0),
        nm(r, 1),
        nm(r, 2),
        Math.max(0, Math.min(13, Math.floor(nm(r, 3)))),
      );
      w.hits = nm(r, 4);
      w.flash = nm(r, 5);
      return w;
    });
  }
  g.freezes = rows(m["fz"]).map((r) => ({
    x: nm(r, 0),
    y: nm(r, 1),
    r: nm(r, 2),
    t: nm(r, 3),
    age: nm(r, 4),
    owner: g.player,
  }));
  if (g.storm && typeof m["s"] === "number") g.storm.flash = m["s"];
  if (Array.isArray(m["bl"]))
    g.blasts = rows(m["bl"]).map((r) => ({ x: nm(r, 0), y: nm(r, 1), t: nm(r, 2) }));
  const td = m["td"];
  if (g.tdm && Array.isArray(td)) {
    g.tdm.score = [Number(td[0]) || 0, Number(td[1]) || 0];
    g.tdm.time = Number(td[2]) || 0;
    g.tdm.limit = Number(td[3]) || TDM_TIME;
  }
}
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
  }>({ hp: 100, alive: TOTAL, kills: 0, time: 0, dots: [] });
  const [result, setResult] = useState<{
    won: boolean;
    position: number;
    xp: number;
    tdm?: { blue: number; red: number; team: number; draw: boolean } | undefined;
  }>({ won: false, position: TOTAL, xp: 0 });
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [broken, setBroken] = useState<Record<number, boolean>>({});

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  /* online match state: is this screen in a shared match, inputs from guests (host), snapshot bookkeeping (guest) */
  const onlineRef = useRef(false);
  const netRef = useRef<{
    inputs: Map<number, NetIn>;
    lastSnap: number;
    gn: GuestNet | null;
    lastIn: number;
    lastInKey: string;
    snapN?: number;
  }>({ inputs: new Map(), lastSnap: 0, gn: null, lastIn: 0, lastInKey: "" });
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
  const startRef = useRef<(online?: OnlineSetup) => void>(() => {});
  const [mapSel, setMapSel] = useState<MapKind>("yard");
  /* load both map pictures as soon as the game page opens, so the map cards never show up blank */
  useEffect(() => {
    const pre = [yardThumb, garageThumb].map((src) => {
      const im = new Image();
      im.src = src;
      return im;
    });
    return () => void pre.length;
  }, []);
  const mapSelRef = useRef<MapKind>("yard");
  mapSelRef.current = mapSel;
  applyTeamLook(mapSel);
  const [picking, setPicking] = useState(false);
  const pickingRef = useRef(false);
  const askRef = useRef<() => void>(() => {});
  const raceRef = useRef<() => void>(() => {});
  const startTdmRef = useRef<(team: number, online?: OnlineSetup) => void>(() => {});
  const [teamPick, setTeamPick] = useState(false);
  const teamPickRef = useRef(false);
  const setModeSync = useCallback((m: "select" | "playing" | "result" | "race") => {
    modeRef.current = m;
    if (m === "select") {
      fxRef.current = new Fx(); // drop arena particles so they don't leak into the garage
      if (onlineRef.current) {
        onlineRef.current = false;
        lobbyRef.current?.setLocked(false); // the room takes new friends again
      }
      netRef.current.inputs.clear();
      netRef.current.gn = null;
    }
    setMode(m);
  }, []);

  const startMatch = useCallback(
    (online?: OnlineSetup) => {
      netRef.current.gn = null;
      netRef.current.inputs.clear();
      onlineRef.current = !!online;
      setMap(mapSelRef.current);
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
      vid(player);
      /* online: every friend gets a car in a ring around the host's start spot */
      const extra: Vehicle[] = (online?.players.slice(1) ?? []).map((pl, k) => {
        const a = ((k + 1) / 4) * Math.PI * 2 + 0.6;
        return {
          x: 1200 + Math.cos(a) * 130,
          y: 860 + Math.sin(a) * 130,
          angle: a,
          hp: carAt(pl.car).hp,
          alive: true,
          cooldown: 0,
          bot: false,
          drift: 0,
          strafe: 0,
          carId: pl.car,
          hit: 0,
          speedT: 0,
          dblT: 0,
          dodgeT: 0,
          dodgeDir: 1,
          dodgeAng: 0,
          react: 0,
          strafeAng: 0,
          trail: 0,
          net: pl.pid,
          id: ++vidCounter,
        };
      });
      const rivals: Vehicle[] = [];
      for (let i = 0; i < TOTAL - 1 - extra.length; i++) {
        let x = 170 + Math.random() * 2060,
          y = 160 + Math.random() * 1400;
        if (Math.hypot(x - player.x, y - player.y) < 390) {
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
        cars: [player, ...extra, ...rivals],
        bullets: [],
        mines: [],
        started: performance.now(),
        lastHud: 0,
        kills: 0,
        over: null,
        trail: 0,
        powerups: [],
        spawnT: 1.5,
        ...(online ? { online: true } : null),
      };
      if (mapKind === "garage") {
        const g0 = gameRef.current;
        g0.wrecks = garageLayout(
          WORLD,
          g0.cars.map((c) => [c.x, c.y] as [number, number]),
        );
        g0.storm = newStorm();
        g0.blasts = [];
      }
      keysRef.current.clear();
      pausedRef.current = false;
      setHud({
        hp: playerCar.hp,
        alive: TOTAL,
        kills: 0,
        time: 0,
        dots: [],
      });
      setPaused(false);
      if (devRef.current.input === "touch") void enterLandscape();
      setModeSync("playing");
      sfxRef.current.blip();
    },
    [setModeSync],
  );
  startRef.current = startMatch;

  /* TDM: 6v6, team = 0 (blue) or 1 (red); the player drives in slot 0 of their team */
  const startTdm = useCallback(
    (team: number, online?: OnlineSetup) => {
      netRef.current.gn = null;
      netRef.current.inputs.clear();
      onlineRef.current = !!online;
      setTdmMap(mapSelRef.current);
      applyTeamLook(mapSelRef.current);
      const idx = selectedRef.current;
      mStart("tdm", idx);
      let k = 0;
      const make = (tm: number, slot: number, isPlayer: boolean, carId = idx): Vehicle => {
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
        };
      };
      /* humans take the first slots of their team (online: friends are split evenly, the host keeps their pick) */
      const slotUsed = [0, 0];
      const counts = [0, 0];
      const humans: Vehicle[] = (online?.players ?? [{ pid: -1, car: idx }]).map((pl, i) => {
        const tm =
          i === 0
            ? team
            : counts[0] === counts[1]
              ? team
              : (counts[0] as number) < (counts[1] as number)
                ? 0
                : 1;
        counts[tm] = (counts[tm] as number) + 1;
        const hv = make(tm, slotUsed[tm] as number, true, i === 0 ? idx : pl.car);
        slotUsed[tm] = (slotUsed[tm] as number) + 1;
        if (i > 0) hv.net = pl.pid;
        vid(hv);
        return hv;
      });
      const player = humans[0] as Vehicle;
      const list: Vehicle[] = [...humans];
      for (const tm of [team, 1 - team])
        for (let i = slotUsed[tm] as number; i < 6; i++) list.push(make(tm, i, false));
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
        tdm: { score: [0, 0], time: 0, limit: TDM_TIME, team },
        ...(online ? { online: true } : null),
      };
      if (mapKind === "garage") {
        const g0 = gameRef.current;
        g0.wrecks = garageLayout(WORLD, [
          ...TDM_SPAWN.map((sp) => [sp.x, sp.y, SPAWN_R + 90] as [number, number, number]),
          ...g0.cars.map((c) => [c.x, c.y] as [number, number]),
        ]);
        g0.storm = newStorm();
        g0.blasts = [];
      }
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
        },
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
  }, []);
  /** TDM team choice: starts the match at once */
  const chooseTeam = useCallback(
    (_pi: number, team: number) => {
      setAsk(false);
      startTdmRef.current(team);
    },
    [setAsk],
  );
  askRef.current = () => {
    if (lockedId(selectedRef.current)) {
      const c = carAt(selectedRef.current);
      say(`BUY ${c.name.toUpperCase()} FIRST (${fmtXp(c.price ?? 0)} XP)`);
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
    (won: boolean, position: number, tdm?: Tdm, kills = 0) => {
      let xp = 100 + kills * 100; // FFA: 100 per match + 100 per kill
      let res: { blue: number; red: number; team: number; draw: boolean } | undefined;
      if (tdm) {
        res = {
          blue: tdm.score[0],
          red: tdm.score[1],
          team: tdm.team,
          draw: !!tdm.draw,
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
      setResult({ won, position, xp, tdm: res });
      setModeSync("result");
    },
    [setModeSync],
  );

  const pick = useCallback((i: number) => {
    setSelected(((i % cars.length) + cars.length) % cars.length);
    sfxRef.current.blip();
  }, []);
  /** V1 / V2 switch of the highlighted car (previewing V2 is free, driving it needs to be bought) */
  const setVer = useCallback((v2: boolean) => {
    const b = baseOf(selectedRef.current);
    const id = v2 && v2Of(b) >= 0 ? v2Of(b) : b;
    setSelected(id);
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
  const chooseTeamRef = useRef(chooseTeam);
  chooseTeamRef.current = chooseTeam;

  /* ── online lobby: ADD FRIENDS → generate a code / enter a code; everybody connects to the host ── */
  const [friendsUi, setFriendsUi] = useState<"closed" | "menu" | "leave">("closed");
  const friendsUiRef = useRef(friendsUi);
  friendsUiRef.current = friendsUi;
  const [lobby, setLobby] = useState<LobbyState | null>(null);
  const lobbyRef = useRef<LobbyController | null>(null);
  const [friendsBusy, setFriendsBusy] = useState(false);
  const [friendsErr, setFriendsErr] = useState("");
  const onLobbyChange = useCallback(
    (st: LobbyState) => {
      if (st.status !== "closed") {
        setLobby(st);
        return;
      }
      lobbyRef.current = null;
      setLobby(null);
      setFriendsUi((u) => (u === "leave" ? "closed" : u));
      if (onlineRef.current && modeRef.current === "playing") {
        // the host is gone: the shared match is over
        pausedRef.current = false;
        setPaused(false);
        setModeSync("select");
      }
      const msg =
        st.reason === "host-left"
          ? "THE HOST CLOSED THE LOBBY"
          : st.reason === "expired"
            ? "LOBBY EXPIRED · NOBODY JOINED"
            : st.reason === "network"
              ? "LOBBY CONNECTION LOST"
              : "";
      if (msg) say(msg);
    },
    [say, setModeSync],
  );
  const openRoom = async (make: () => Promise<LobbyController>) => {
    if (friendsBusy || lobbyRef.current) return;
    setFriendsBusy(true);
    setFriendsErr("");
    try {
      const c = await make();
      lobbyRef.current = c;
      setLobby(c.state);
      setFriendsUi("closed");
      sfxRef.current.blip();
    } catch (e) {
      const code = e instanceof LobbyError ? e.code : "network";
      setFriendsErr(
        {
          "bad-code": "THAT CODE LOOKS WRONG",
          "not-found": "NO ROOM WITH THAT CODE (IT MAY HAVE EXPIRED)",
          full: "THAT ROOM IS FULL (4/4)",
          started: "THAT MATCH ALREADY STARTED",
          timeout: "COULD NOT REACH THE ROOM. TRY AGAIN",
          network: "CONNECTION PROBLEM. CHECK YOUR INTERNET",
        }[code],
      );
    } finally {
      setFriendsBusy(false);
    }
  };
  const lobbyOpts = () => ({
    car: lockedId(selectedRef.current) ? 0 : selectedRef.current,
    carCount: allCars.length,
    onChange: onLobbyChange,
    onMessage: (m: Record<string, unknown>, from: number) => netMsgRef.current(m, from),
    onPeerLeft: (pid: number) => dropPlayerRef.current(pid),
  });
  const generateRoom = () => void openRoom(() => createRoom(lobbyOpts()));
  const joinRoomCode = (code: string) => void openRoom(() => joinRoom(code, lobbyOpts()));
  const leaveLobby = () => {
    lobbyRef.current?.leave();
    setFriendsUi("closed");
  };

  /* ── online match plumbing ── */
  /** host: a friend left or quit mid-match, so their car (and its clones) leave the arena */
  const dropPlayerRef = useRef<(pid: number) => void>(() => {});
  dropPlayerRef.current = (pid) => {
    netRef.current.inputs.delete(pid);
    const g = gameRef.current;
    if (!g || !g.online) return;
    g.cars = g.cars.filter((c) => c.net !== pid && c.cloneOf?.net !== pid);
  };
  /** guest: the host started a match, build an empty arena that the snapshots will fill */
  const startGuest = (m: Record<string, unknown>) => {
    const kind = m["mode"] === "tdm" ? "tdm" : "ffa";
    lobbyRef.current?.send({ t: "gpet", pet: equippedPet() }); // tell the host which pet rides with this car
    const map: MapKind = m["map"] === "garage" ? "garage" : "yard";
    mapSelRef.current = map;
    setMapSel(map);
    applyTeamLook(map);
    const idx = Math.max(0, Math.min(allCars.length - 1, Math.floor(Number(m["car"]) || 0)));
    if (kind === "tdm") setTdmMap(map);
    else setMap(map);
    mStart(kind, idx);
    const team = Number(m["team"]) === 1 ? 1 : 0;
    const myId = Math.floor(Number(m["you"]) || 0);
    const me: Vehicle = {
      x: WORLD.width / 2,
      y: WORLD.height / 2,
      angle: 0,
      hp: carAt(idx).hp,
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
      id: myId,
      ...(kind === "tdm" ? { team } : null),
    };
    const g: Game = {
      player: me,
      cars: [me],
      bullets: [],
      mines: [],
      started: performance.now(),
      lastHud: 0,
      kills: 0,
      over: null,
      trail: 0,
      powerups: [],
      spawnT: 0,
      online: true,
      ...(kind === "tdm"
        ? { tdm: { score: [0, 0] as [number, number], time: 0, limit: TDM_TIME, team } }
        : null),
    };
    if (map === "garage") {
      g.wrecks = [];
      g.storm = newStorm();
      g.blasts = [];
    }
    fxRef.current = new Fx();
    gameRef.current = g;
    netRef.current.inputs.clear();
    netRef.current.gn = {
      byId: new Map([[myId, me]]),
      me: myId,
      got: false,
      last: 0,
      jit: 0,
      delay: 100,
    };
    onlineRef.current = true;
    keysRef.current.clear();
    pausedRef.current = false;
    setPaused(false);
    setHud({
      hp: me.hp,
      alive: TOTAL,
      kills: 0,
      time: 0,
      dots: [],
      ...(kind === "tdm" ? { tdm: { blue: 0, red: 0, left: TDM_TIME, respawn: 0, team } } : null),
    });
    setAsk(false);
    setFriendsUi("closed");
    if (devRef.current.input === "touch") void enterLandscape();
    setModeSync("playing");
    sfxRef.current.blip();
  };
  const netMsgRef = useRef<(m: Record<string, unknown>, from: number) => void>(() => {});
  netMsgRef.current = (m, from) => {
    const role = lobbyRef.current?.state.role;
    if (role === "host") {
      if (m["t"] === "gin")
        netRef.current.inputs.set(from, {
          x: clamp(Number(m["x"]) || 0, -1, 1),
          y: clamp(Number(m["y"]) || 0, -1, 1),
          f: m["f"] ? 1 : 0,
          at: performance.now(),
        });
      else if (m["t"] === "gquit") dropPlayerRef.current(from);
      else if (m["t"] === "gpet") {
        // a friend's equipped pet: remembered for respawns, applied now if their car is already in the match
        const k = petOf(m["pet"] as PetKind)?.kind;
        if (k) guestPets.set(from, k);
        else guestPets.delete(from);
        const hv = gameRef.current?.cars.find((c) => c.net === from);
        if (hv?.alive && !hv.petUsed) hv.pet = k;
      }
    } else if (role === "guest") {
      if (m["t"] === "gstart") startGuest(m);
      else if (m["t"] === "gsnap") {
        const g = gameRef.current,
          gn = netRef.current.gn;
        if (g && gn && modeRef.current === "playing")
          applySnap(g, m, gn, fxRef.current, sfxRef.current);
      } else if (m["t"] === "gend" && modeRef.current === "playing") {
        const td = m["tdm"] as
          { s0?: unknown; s1?: unknown; team?: unknown; draw?: unknown } | undefined;
        const kills = Math.max(0, Math.floor(Number(m["kills"]) || 0));
        const tdm: Tdm | undefined = td
          ? {
              score: [Number(td.s0) || 0, Number(td.s1) || 0],
              time: 0,
              limit: TDM_TIME,
              team: Number(td.team) === 1 ? 1 : 0,
              draw: !!td.draw,
            }
          : undefined;
        setHud((h) => ({ ...h, kills }));
        finishMatch(!!m["won"], Math.floor(Number(m["position"]) || TOTAL), tdm, kills);
      } else if (
        m["t"] === "gabort" &&
        (modeRef.current === "playing" || modeRef.current === "result")
      ) {
        pausedRef.current = false;
        setPaused(false);
        setModeSync("select");
        say("THE HOST ENDED THE MATCH");
      }
    }
  };
  /** host: START MATCH from the lobby card (FFA or TDM, on the map picked there) */
  const hostStart = (kind: "ffa" | "tdm") => {
    const L = lobbyRef.current;
    if (!L || L.state.role !== "host" || modeRef.current !== "select") return;
    if (L.state.players.length < 2) {
      say("WAIT FOR A FRIEND TO JOIN");
      return;
    }
    if (lockedId(selectedRef.current)) {
      const c = carAt(selectedRef.current);
      say(`BUY ${c.name.toUpperCase()} FIRST (${fmtXp(c.price ?? 0)} XP)`);
      return;
    }
    const pids = L.pids();
    const setup: OnlineSetup = {
      players: L.state.players.map((pl, i) => ({
        pid: pids[i] ?? -1,
        car: i === 0 ? selectedRef.current : pl.car,
      })),
    };
    L.setLocked(true); // nobody new joins while the match runs
    if (kind === "tdm") startTdmRef.current(0, setup);
    else startRef.current(setup);
    const g = gameRef.current;
    if (!g) return;
    for (const v of g.cars)
      if (v.net !== undefined)
        L.sendTo(v.net, {
          t: "gstart",
          mode: kind,
          map: mapSelRef.current,
          you: v.id,
          car: v.carId,
          team: v.team ?? 0,
        });
  };
  /** leave a running match: the host ends it for everyone, a guest just drops out */
  const abandonMatch = () => {
    pausedRef.current = false;
    setPaused(false);
    const L = lobbyRef.current;
    if (onlineRef.current && L) {
      if (L.state.role === "host") L.broadcast({ t: "gabort" });
      else L.send({ t: "gquit" });
    }
    setModeSync("select");
  };
  const selectedLocked = lockedId(selected);
  useEffect(() => {
    // locked cars are never offered to the room (friends see only cars you own)
    if (!selectedLocked) lobbyRef.current?.setCar(selected);
  }, [selected, selectedLocked]);
  useEffect(() => () => lobbyRef.current?.leave(), []);

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
    /* slow device? the canvas drops to a lower resolution step by step (2 → 1 → 0.75 → 0.6) until it keeps up */
    let ratioCap = 2;
    let slowFor = 0;
    let gapAvg = 16;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, ratioCap);
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
    /** host: tell every friend how their match went */
    const netEnd = (g: Game, alive: number) => {
      const L = lobbyRef.current;
      if (!L) return;
      const tdm = g.tdm;
      for (const h of g.cars) {
        if (h.net === undefined) continue;
        const msg: Record<string, unknown> = { t: "gend", kills: h.k ?? 0 };
        if (tdm) {
          const tm = h.team === 1 ? 1 : 0;
          msg["won"] = (tdm.score[tm] as number) > (tdm.score[1 - tm] as number);
          msg["position"] = 1;
          msg["tdm"] = { s0: tdm.score[0], s1: tdm.score[1], team: tm, draw: !!tdm.draw };
        } else {
          msg["won"] = h.epos === undefined && alive <= 1;
          msg["position"] = h.epos ?? 1;
        }
        L.sendTo(h.net, msg);
      }
    };

    /** guest: no simulation here, only smoothing what the host sent, sending our steering, and the HUD */
    const guestStep = (dt: number, now: number) => {
      const g = gameRef.current,
        gn = netRef.current.gn;
      if (!g || !gn) return;
      const fx = fxRef.current;
      // draw every car at the host time "now minus a short delay", between the two snapshots around it
      const rt = now - (gn.off ?? 0) - gn.delay;
      for (const v of g.cars) {
        const bf = v.buf;
        if (!bf || !bf.length) continue;
        const ox = v.x,
          oy = v.y;
        const first = bf[0] as NonNullable<Vehicle["buf"]>[number];
        const last = bf[bf.length - 1] as NonNullable<Vehicle["buf"]>[number];
        if (rt <= first.t) {
          v.x = first.x;
          v.y = first.y;
          v.angle = first.a;
        } else if (rt >= last.t) {
          // ran out of snapshots (late packet): keep going at the last speed for a moment, never longer than 150 ms
          const prev = bf.length > 1 ? (bf[bf.length - 2] as typeof last) : last;
          const span = Math.max(1, last.t - prev.t);
          const ex = Math.min(rt - last.t, 150);
          v.x = last.x + ((last.x - prev.x) / span) * ex;
          v.y = last.y + ((last.y - prev.y) / span) * ex;
          v.angle = last.a + (wrapAng(last.a - prev.a) / span) * ex;
        } else {
          let j = bf.length - 2;
          while (j > 0 && (bf[j] as typeof last).t > rt) j--;
          const p0 = bf[j] as typeof last,
            p1 = bf[j + 1] as typeof last;
          const f = clamp((rt - p0.t) / Math.max(1, p1.t - p0.t), 0, 1);
          v.x = p0.x + (p1.x - p0.x) * f;
          v.y = p0.y + (p1.y - p0.y) * f;
          v.angle = p0.a + wrapAng(p1.a - p0.a) * f;
        }
        if (dt > 0) {
          v.vx = (v.vx ?? 0) * 0.65 + ((v.x - ox) / dt) * 0.35;
          v.vy = (v.vy ?? 0) * 0.65 + ((v.y - oy) / dt) * 0.35;
        }
        v.hit = Math.max(0, v.hit - dt);
        if (v.alive && Math.hypot(v.x - ox, v.y - oy) > 0.5) {
          v.trail -= dt;
          if (v.trail <= 0) {
            v.trail = 0.05;
            fx.dust(v.x - Math.sin(v.angle) * 32, v.y + Math.cos(v.angle) * 32);
          }
        }
      }
      for (const b of g.bullets) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.life -= dt;
      }
      g.bullets = g.bullets.filter((b) => b.life > 0);
      for (const m of g.mines) m.age += dt;
      for (const f of g.freezes ?? []) {
        f.t -= dt;
        f.age += dt;
      }
      if (g.blasts) for (const bl of g.blasts) bl.t += dt;
      // our steering goes to the host (right away when it changes, otherwise a few times a second)
      const keys = keysRef.current,
        joy = joyRef.current;
      let fwd = Number(anyKey(keys, P1_CTL.up)) - Number(anyKey(keys, P1_CTL.down));
      let side = Number(anyKey(keys, P1_CTL.right)) - Number(anyKey(keys, P1_CTL.left));
      if (joy.on && Math.hypot(joy.x, joy.y) > 0.16) {
        fwd = -joy.y;
        side = joy.x;
      }
      const fire = anyKey(keys, [" ", "5"]) ? 1 : 0;
      const key = `${r2(side)},${r2(fwd)},${fire}`;
      const nr = netRef.current;
      if (key !== nr.lastInKey || now - nr.lastIn > 120) {
        nr.lastInKey = key;
        nr.lastIn = now;
        lobbyRef.current?.send({ t: "gin", x: r2(side), y: r2(fwd), f: fire });
      }
      if (now - g.lastHud > 140) {
        const me = g.player;
        const alive = g.cars.filter((v) => v.alive && !v.cloneOf).length;
        const tdm = g.tdm;
        setHud({
          hp: Math.ceil(me.hp),
          alive,
          kills: me.k ?? 0,
          time: Math.floor((now - g.started) / 1000),
          dots: g.cars
            .filter((v) => v.alive && !v.cloneOf && (v === me || !powerOn(v, "ghost")))
            .map((v) => ({
              x: (v.x / WORLD.width) * 100,
              y: (v.y / WORLD.height) * 100,
              me: v === me,
              team: v.team,
            })),
          tdm: tdm
            ? {
                blue: tdm.score[0],
                red: tdm.score[1],
                left: Math.max(0, Math.ceil(tdm.limit - tdm.time)),
                respawn: me.alive ? 0 : Math.max(1, Math.ceil(me.respawn ?? 0)),
                team: tdm.team,
              }
            : undefined,
        });
        g.lastHud = now;
      }
    };

    const step = (dt: number, now: number) => {
      const g = gameRef.current;
      if (!g) return;
      const fx = fxRef.current,
        sfx = sfxRef.current,
        keys = keysRef.current;
      const p = g.player;
      const humans = g.cars.filter((c) => c === p || c.net !== undefined);
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
          else if (ab.kind === "freeze") {
            (g.freezes ??= []).push({ x: o.x, y: o.y, r: FREEZE_R, t: ab.dur, age: 0, owner: o });
            o.abT = ab.dur;
          } else o.abT = ab.dur;
          if (o === p) mPower(ab.kind);
          fx.impact(o.x, o.y, 0, ab.color, 26);
          if (o === p) {
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
          }
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
        v.pa = v.angle;
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
      /* human drivers: arrow keys (or WASD) to drive */
      const drive = (h: Vehicle, ctl: Ctl, ri?: NetIn) => {
        if (!h.alive || g.over) return;
        const stats = carAt(h.carId);
        let forward = ri ? ri.y : Number(anyKey(keys, ctl.up)) - Number(anyKey(keys, ctl.down));
        let side = ri ? ri.x : Number(anyKey(keys, ctl.right)) - Number(anyKey(keys, ctl.left));
        // touch joystick: the stick points where the car should go, a light push = slower
        let push = 1;
        const joy = joyRef.current;
        if (ri) {
          // a friend's steering arrives as numbers: a light push = slower
          const mag = Math.hypot(side, forward);
          if (mag < 0.16) {
            forward = 0;
            side = 0;
          } else if (mag < 1) push = 0.45 + 0.55 * mag;
        } else if (h === p && joy.on) {
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
          const pSpeed =
            stats.speed *
            2.15 *
            (h.speedT > 0 ? 1.6 : 1) *
            ((h.crs ?? 0) > 0 ? CURSE_SPEED : 1) *
            push;
          h.x += Math.sin(h.angle) * pSpeed * dt;
          h.y -= Math.cos(h.angle) * pSpeed * dt;
          h.trail -= dt;
          if (h.trail <= 0) {
            h.trail = 0.05;
            fx.dust(h.x - Math.sin(h.angle) * 32, h.y + Math.cos(h.angle) * 32);
          }
        }
        collide(h);
        if ((ri ? ri.f > 0 : anyKey(keys, ctl.fire)) && h.cooldown <= 0) {
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
      drive(p, { ...P1_CTL, fire: [" ", "5"] });
      /* friends in an online match: drive their cars from the steering they sent (stale = hands off the wheel) */
      if (g.online) {
        const tNow = performance.now();
        for (const h of g.cars) {
          if (h.net === undefined) continue;
          const inp = netRef.current.inputs.get(h.net);
          drive(h, P1_CTL, inp && tNow - inp.at < 500 ? inp : NO_IN);
        }
      }
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
          me.speed *
          2.15 *
          BOT_SPEED *
          (1 + 0.08 * aid) *
          speedMul *
          (bot.speedT > 0 ? 1.6 : 1) *
          ((bot.crs ?? 0) > 0 ? CURSE_SPEED : 1);
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
              if (a === p || b === p) fx.shake = Math.max(fx.shake, 2);
            }
          }
        }
        for (const v of g.cars) if (v.alive) collide(v);
      }
      /* Wreck Garage: lightning, pushable wrecks, burning ones, chain-reaction fuses */
      const blastWreck = (w: Wreck) => {
        if (w.hits < 0) return;
        w.hits = -1;
        fx.explode(w.x, w.y, "#ff7a1a");
        fx.explode(w.x, w.y - 18, "#ffd23d");
        sfx.boom();
        g.blasts?.push({ x: w.x, y: w.y, t: 0 });
        if (Math.hypot(w.x - p.x, w.y - p.y) < 900) fx.shake = Math.max(fx.shake, 8);
        const shooter = w.by as Vehicle | undefined;
        const reach = WRECK_BLAST_R + 20;
        for (const v of g.cars) {
          if (!v.alive || (v.inv ?? 0) > 0) continue;
          const d = Math.hypot(v.x - w.x, v.y - w.y);
          if (d > reach) continue;
          v.hp = v.cloneOf ? 0 : Math.max(0, v.hp - WRECK_BLAST_DMG * (1 - (d / reach) * 0.6));
          v.hit = 0.14;
          const nx = (v.x - w.x) / (d || 1),
            ny = (v.y - w.y) / (d || 1);
          v.x += nx * 26;
          v.y += ny * 26;
          if (shooter && ownerOf(v) !== shooter) {
            ownerOf(v).atk = shooter;
            ownerOf(v).atkT = 5;
          }
          if (v === p) mDamage();
          if (v === p) fx.shake = Math.max(fx.shake, 6);
          if (v.hp <= 0) {
            v.alive = false;
            fx.explode(v.x, v.y, v.cloneOf ? "#4dd8ff" : carAt(v.carId).color);
            if (!v.cloneOf && shooter && shooter !== v) {
              if (shooter === p) {
                g.kills++;
                mKill({ victimV2: isV2(v.carId), byClone: false, ghost: false });
              } else if (shooter.net !== undefined) shooter.k = (shooter.k ?? 0) + 1;
            }
          }
        }
        for (const o of g.wrecks ?? []) {
          if (o === w || o.hits < 0) continue;
          const d = Math.hypot(o.x - w.x, o.y - w.y);
          if (d > WRECK_BLAST_R + 70) continue;
          o.by = w.by;
          o.hits += 4;
          o.flash = 1;
          o.vx += ((o.x - w.x) / (d || 1)) * 380;
          o.vy += ((o.y - w.y) / (d || 1)) * 380;
          o.av += (Math.random() - 0.5) * 4;
          if (o.hits >= WRECK_HITS && o.fuse === undefined) o.fuse = 0.15 + Math.random() * 0.3;
        }
      };
      if (g.wrecks) {
        if (g.storm) stepStorm(g.storm, dt);
        stepWrecks(g.wrecks, g.cars, dt, WORLD, blocks, (x, y, hard) => {
          fx.impact(x, y, 0, "#cdbf9f", hard ? 6 : 3);
          if (hard && Math.hypot(x - p.x, y - p.y) < 700) sfx.bump();
        });
        for (const v of g.cars) if (v.alive) collide(v);
        for (const w of g.wrecks) {
          const heat = wreckHeat(w);
          if (heat > 0.5 && Math.random() < dt * 7 * heat)
            fx.puff(w.x + (Math.random() - 0.5) * 30, w.y + (Math.random() - 0.5) * 30);
          if (w.fuse !== undefined) {
            w.fuse -= dt;
            if (w.fuse <= 0) blastWreck(w);
          }
        }
        if (g.blasts) {
          for (const bl of g.blasts) bl.t += dt;
          g.blasts = g.blasts.filter((bl) => bl.t < 0.7);
        }
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
          if (v === p) sfx.blip();
          if (v === p) mPickup();
        }
      }
      g.powerups = g.powerups.filter((q) => q.life > 0);
      /* TIME FREEZE (Blue Turret v2): inside the zone everything slows to a stop, nothing new can enter, the caster is free.
         Cars are rolled back towards where they started this frame; bullets are slowed in the bullet loop below. */
      if (g.freezes?.length) {
        for (const f of g.freezes) {
          f.t -= dt;
          f.age += dt;
        }
        const before = g.freezes.length;
        g.freezes = g.freezes.filter((f) => f.t > 0);
        if (g.freezes.length < before) for (const b of g.bullets) b.fz = false; // time resumes: held bullets fly on
      }
      for (const v of g.cars) {
        let level = 0;
        if (v.alive && g.freezes?.length && v.px !== undefined && v.py !== undefined) {
          for (const f of g.freezes) {
            if (freezeImmune(v, f.owner, !!tdm)) continue;
            const d = Math.hypot(v.x - f.x, v.y - f.y);
            if (d > f.r) continue;
            if (Math.hypot(v.px - f.x, v.py - f.y) > f.r + 2) {
              v.x = v.px; // tried to drive in: the edge is a wall
              v.y = v.py;
              continue;
            }
            level = Math.max(level, Math.min(1, f.age / FREEZE_RAMP));
          }
          if (level > 0) {
            v.x = v.px + (v.x - v.px) * (1 - level);
            v.y = v.py + (v.y - v.py) * (1 - level);
            if (v.pa !== undefined) v.angle = v.pa + wrapAng(v.angle - v.pa) * (1 - level);
            if (level > 0.25) v.cooldown = Math.max(v.cooldown, 0.1); // frozen cars can't shoot
          }
        }
        v.frz = level;
        const tn = v.tint ?? 0;
        v.tint = level > tn ? level : Math.max(0, tn - dt * 0.45); // blue tint creeps in with the freeze, then slowly clears
      }
      for (const b of g.bullets) {
        let bdt = dt;
        b.sc = 1;
        if (g.freezes?.length) {
          const bo = ownerOf(b.owner);
          for (const f of g.freezes) {
            if (freezeImmune(bo, f.owner, !!tdm)) continue;
            if (b.fz) {
              bdt = 0;
              break;
            }
            const d = Math.hypot(b.x - f.x, b.y - f.y);
            if (d <= f.r) {
              const lv = Math.min(1, f.age / FREEZE_RAMP);
              bdt = Math.min(bdt, dt * (1 - lv));
              if (lv >= 1) b.fz = true;
            } else if (Math.hypot(b.x + b.vx * dt - f.x, b.y + b.vy * dt - f.y) <= f.r) {
              b.fz = true; // would fly in: it stops at the edge
              bdt = 0;
            }
          }
        }
        b.sc = dt > 0 ? bdt / dt : 1;
        b.x += b.vx * bdt;
        b.y += b.vy * bdt;
        b.life -= bdt;
        const dir = Math.atan2(b.vx, -b.vy);
        if (blocks.some(([x, y, w, h]) => b.x > x && b.x < x + w && b.y > y && b.y < y + h)) {
          b.life = 0;
          fx.impact(b.x, b.y, dir, PAL.yellow, 6);
        }
        if (g.wrecks && b.life > 0) {
          for (const w of g.wrecks) {
            if (w.hits < 0 || !wreckContains(w, b.x, b.y)) continue;
            b.life = 0;
            w.hits++;
            w.flash = 1;
            w.by = ownerOf(b.owner);
            w.vx += b.vx * 0.04;
            w.vy += b.vy * 0.04;
            fx.impact(b.x, b.y, dir, PAL.yellow, 5);
            if (w.hits >= WRECK_HITS) blastWreck(w);
            break;
          }
        }
        for (const v of g.cars) {
          if (
            !v.alive ||
            ownerOf(v) === ownerOf(b.owner) ||
            b.fz ||
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
          else
            v.hp -=
              b.damage *
              (1 - target.armor / 250) *
              ((v.shd ?? 0) > 0 ? PET_SHIELD_TAKE : 1) *
              ((shooter.crs ?? 0) > 0 ? CURSE_DAMAGE : 1);
          // Catnya: first hit taken in the red zone curses whoever shot (one time per life)
          if (
            !v.cloneOf &&
            v.pet === "catnya" &&
            !v.petUsed &&
            v.hp > 0 &&
            shooter !== v &&
            v.hp / target.hp < PET_RED_ZONE
          ) {
            v.petUsed = true;
            shooter.crs = CURSE_TIME;
            fx.explode(shooter.x, shooter.y, "#b44dff");
          }
          b.life = 0;
          v.hit = 0.14;
          fx.impact(b.x, b.y, dir, bulletCol(!!tdm, b.owner), 10);
          if (v === p) {
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
              } else if (shooter.net !== undefined) shooter.k = (shooter.k ?? 0) + 1;
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
        if (m.age >= MINE_LIFE) {
          m.used = true; // never touched: it fizzles out
          fx.impact(m.x, m.y, 0, "#ffb02e", 10);
          continue;
        }
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
          if (v === p) fx.shake = Math.max(fx.shake, 6);
          if (v.hp <= 0) {
            v.alive = false;
            if (!v.cloneOf) {
              if (m.owner === p) {
                g.kills++;
                mKill({ victimV2: isV2(v.carId), byClone: false, ghost: false });
                mMine();
              } else if (m.owner.net !== undefined) m.owner.k = (m.owner.k ?? 0) + 1;
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
      if (g.wrecks) g.wrecks = g.wrecks.filter((w) => w.hits >= 0);
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
          if (v === p && Math.hypot(v.x - (g.cam?.x ?? v.x), v.y - (g.cam?.y ?? v.y)) < 1100)
            sfx.shot(0.6 + stats.fireRate / 200);
        }
      }
      /* pets spawn with their car (player: the equipped pet, bots: 20% random), die with it, and never race */
      for (const v of g.cars) {
        if (!v.alive || v.cloneOf) {
          v.crs = 0;
          v.pet = undefined;
          v.petInit = false;
          continue;
        }
        if (!v.petInit) {
          v.petInit = true;
          v.petUsed = false;
          v.petCd = 1;
          v.shd = 0;
          if (v === p) v.pet = equippedPet() ?? undefined;
          else if (v.net !== undefined) v.pet = guestPets.get(v.net);
          else if (v.bot) {
            // roll the 20% chance only once per bot: respawning in TDM keeps the same pet (or lack of one)
            if (v.botPet === undefined)
              v.botPet = Math.random() < PET_BOT_CHANCE ? randomPet() : null;
            v.pet = v.botPet ?? undefined;
          } else v.pet = undefined;
        }
        if (!v.pet) continue;
        const pc = carAt(v.carId);
        v.shd = Math.max(0, (v.shd ?? 0) - dt);
        const red = v.hp / pc.hp < PET_RED_ZONE;
        if (red && !v.petUsed && v.pet === "whown") {
          v.petUsed = true;
          v.hp = Math.min(pc.hp, v.hp + PET_HEAL);
          fx.explode(v.x, v.y, "#3dff7a");
        } else if (red && !v.petUsed && v.pet === "blutle") {
          v.petUsed = true;
          v.shd = PET_SHIELD_TIME;
        } else if (v.pet === "redfly") {
          v.petCd = (v.petCd ?? 0) - dt;
          if (v.petCd <= 0) {
            const l = petLocal(pc.w, 0, 0);
            const px = v.pp ? v.pp.x : v.x + Math.cos(v.angle) * l.x - Math.sin(v.angle) * l.y,
              py = v.pp ? v.pp.y : v.y + Math.sin(v.angle) * l.x + Math.cos(v.angle) * l.y;
            let foe: Vehicle | undefined,
              fd = PET_FLY_RANGE;
            for (const e of g.cars) {
              if (!e.alive || ownerOf(e) === v || (tdm && e.team === v.team)) continue;
              const d = Math.hypot(e.x - px, e.y - py);
              if (d < fd) {
                fd = d;
                foe = e;
              }
            }
            if (foe) {
              const a = Math.atan2(foe.y - py, foe.x - px);
              g.bullets.push({
                x: px,
                y: py,
                vx: Math.cos(a) * 520,
                vy: Math.sin(a) * 520,
                owner: v,
                life: 1.4,
                damage: PET_FLY_DAMAGE,
              });
              v.petCd = PET_FLY_RATE;
            } else v.petCd = 0.2;
          }
        }
      }
      for (const v of g.cars) {
        v.hit = Math.max(0, v.hit - dt);
        v.blk = Math.max(0, (v.blk ?? 0) - dt);
        if (v.abT) v.abT = Math.max(0, v.abT - dt);
        if (v.atkT) v.atkT = Math.max(0, v.atkT - dt);
        if (v.crs) v.crs = Math.max(0, v.crs - dt);
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
      if (!g.over) {
        if (!tdm && g.online) {
          /* online FFA: everybody drives until one car is left (or every human is out); dead friends keep watching */
          for (const h of humans)
            if (!h.alive && !cloneLive(h) && h.epos === undefined) h.epos = Math.max(2, alive + 1);
          const anyHuman = humans.some((h) => h.alive || cloneLive(h));
          if (!anyHuman || alive <= 1) {
            const won = p.alive && alive === 1;
            g.over = { won, position: p.epos ?? 1, t: won ? 1.1 : 1.6 };
          }
        } else if (!tdm) {
          if (!p.alive && (!cloneLive(p) || alive === 0))
            g.over = { won: false, position: Math.max(2, alive + 1), t: 1.6 };
          else if (p.alive && alive === 1) g.over = { won: true, position: 1, t: 1.1 };
        }
      } else {
        g.over.t -= dt;
        if (g.over.t <= 0) {
          if (g.online) netEnd(g, alive);
          finishMatch(g.over.won, g.over.position, tdm, g.kills);
          return;
        }
      }
      if (g.online && now - netRef.current.lastSnap >= 50) {
        netRef.current.lastSnap = now;
        // wrecks move slowly: every other snapshot is enough (halves the bytes in the garage map)
        netRef.current.snapN = (netRef.current.snapN ?? 0) + 1;
        lobbyRef.current?.broadcast(encodeSnap(g, netRef.current.snapN % 2 === 0, now));
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
              }
            : undefined,
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

    /** draws the world once, from the player's camera, into a (width x height) viewport */
    const drawView = (width: number, height: number, t: number, dtc: number) => {
      const g = gameRef.current,
        fx = fxRef.current;
      const me0 = g?.player;
      /* Virtual Clone: when your car is wrecked but a clone is still fighting, the camera follows that clone
         (instead of the wrecked car) until the last clone falls */
      const clone =
        me0 && g && !me0.alive ? g.cars.find((c) => c.cloneOf === me0 && c.alive) : undefined;
      /* online FFA: once you are out, watch a friend who is still driving */
      const spec =
        me0 && g && g.online && !g.tdm && !me0.alive && !clone
          ? (g.cars.find((c) => c.alive && !c.cloneOf && c.net !== undefined) ??
            g.cars.find((c) => c.alive && !c.cloneOf))
          : undefined;
      const p = clone ?? spec ?? me0;
      viewerCar = me0 ?? null;
      const zoom = Math.min(width / 820, height / 560, 1);
      let cx = p ? p.x : WORLD.width / 2,
        cy = p ? p.y : WORLD.height / 2;
      if (g && p) {
        // smooth camera that looks a little ahead of where the player is driving
        const tx = p.x + (p.vx ?? 0) * 0.22,
          ty = p.y + (p.vy ?? 0) * 0.22;
        const cam = (g.cam ??= { x: p.x, y: p.y });
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
          ctx.fillText(`${teamName(tm)} BASE`, sp.x, sp.y - SPAWN_R - 26);
        }
      }
      // shipping containers + crates (solid obstacles)
      blocks.forEach(([x, y, w, h], i) => drawBox(ctx, x, y, w, h, i));
      if (g?.wrecks) for (const w of g.wrecks) drawWreck(ctx, w, t);
      // tyre dust, sparks, smoke sit under the cars
      if (g) {
        /* Magnetic Splash landmines */
        for (const m of g.mines) {
          const armed = m.age >= MINE_ARM;
          const mineCol = "#ffb02e";
          const dying = MINE_LIFE - m.age < 5; // the last 5 seconds: it flickers before it disappears
          const blink = dying
            ? Math.floor(t * 12) % 2
            : armed
              ? 0.5 + 0.5 * Math.sin(t * 6 + m.x)
              : Math.floor(t * 14) % 2;
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
          const viewer = g.player;
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
        /* Time Freeze zones: an icy dome that grows out of the caster, and a glow on every frozen car */
        for (const f of g.freezes ?? []) {
          const grow = 1 - Math.pow(1 - Math.min(1, f.age / 0.35), 3);
          const fade = Math.min(1, f.t / 0.8);
          const rr = f.r * grow;
          const gr = ctx.createRadialGradient(f.x, f.y, rr * 0.2, f.x, f.y, rr);
          gr.addColorStop(0, hexA("#4dd8ff", 0.05 * fade));
          gr.addColorStop(1, hexA("#4dd8ff", 0.22 * fade));
          ctx.fillStyle = gr;
          ctx.beginPath();
          ctx.arc(f.x, f.y, rr, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = hexA("#9fefff", 0.85 * fade);
          ctx.lineWidth = 4;
          ctx.setLineDash([22, 14]);
          ctx.lineDashOffset = -t * 40;
          ctx.beginPath();
          ctx.arc(f.x, f.y, rr, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.strokeStyle = hexA("#4dd8ff", (0.25 + 0.15 * Math.sin(t * 5)) * fade);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(f.x, f.y, rr * 0.55, 0, Math.PI * 2);
          ctx.stroke();
        }
        for (const v of g.cars) {
          if (!v.alive || (v.frz ?? 0) < 0.05) continue;
          ctx.globalCompositeOperation = "lighter";
          const gl = ctx.createRadialGradient(v.x, v.y, 6, v.x, v.y, 54);
          gl.addColorStop(0, hexA("#9fefff", 0.45 * (v.frz as number)));
          gl.addColorStop(1, hexA("#4dd8ff", 0));
          ctx.fillStyle = gl;
          ctx.fillRect(v.x - 56, v.y - 56, 112, 112);
          ctx.globalCompositeOperation = "source-over";
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
          if ((v.shd ?? 0) > 0) {
            // Blutle armour bubble
            ctx.fillStyle = `rgba(77,216,255,${0.12 + 0.06 * Math.sin(t * 9)})`;
            ctx.strokeStyle = "rgba(160,240,255,0.9)";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, r + 18, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
          if (v.pet === "catnya") {
            // Catnya walks beside her car on the ground: she follows a spot at its side and plays the walk cycle for the way she is heading
            const sheet = catSheetImg();
            if (sheet) {
              let q = v.pp;
              const ox = car.w * 0.95 + 14,
                oy = car.h * 0.12;
              const tx = v.x + Math.cos(v.angle) * ox - Math.sin(v.angle) * oy,
                ty = v.y + Math.sin(v.angle) * ox + Math.cos(v.angle) * oy;
              if (!q) q = v.pp = { x: tx, y: ty, vx: 0, vy: 0, a: 0, t, tr: 0, d: CAT_DOWN, ph: 0 };
              const pdt = Math.min(0.05, Math.max(0, t - q.t));
              q.t = t;
              if (Math.hypot(tx - q.x, ty - q.y) > 350) {
                q.x = tx;
                q.y = ty;
                q.vx = q.vy = 0;
              }
              q.vx += ((tx - q.x) * 26 - q.vx * 10) * pdt;
              q.vy += ((ty - q.y) * 26 - q.vy * 10) * pdt;
              q.x += q.vx * pdt;
              q.y += q.vy * pdt;
              // she can't walk through cars: push her out of every car's body (her own too)
              for (const e of g.cars) {
                if (!e.alive) continue;
                const ec = carAt(e.carId);
                const rr = (e === v ? ec.w * 0.55 : ec.h * 0.5) + 8;
                const dx = q.x - e.x,
                  dy = q.y - e.y,
                  dd = Math.hypot(dx, dy);
                if (dd < rr) {
                  const nx = dd > 0.01 ? dx / dd : 1,
                    ny = dd > 0.01 ? dy / dd : 0;
                  q.x = e.x + nx * rr;
                  q.y = e.y + ny * rr;
                  const vn = q.vx * nx + q.vy * ny;
                  if (vn < 0) {
                    q.vx -= vn * nx;
                    q.vy -= vn * ny;
                  }
                }
              }
              const sp = Math.hypot(q.vx, q.vy);
              const walking = sp > 14;
              if (walking) {
                q.d = catFacing(q.vx, q.vy, q.d ?? CAT_DOWN);
                q.ph = ((q.ph ?? 0) + pdt * Math.min(12, 3 + sp * 0.07)) % CAT_COLS;
              } else q.ph = 0; // standing: first frame of the way she faces
              const fr = Math.floor(q.ph ?? 0) % CAT_COLS;
              // sprite scale: her body is about 30% of the car length
              const sc = (car.h * 0.3) / CAT_CELL_H;
              const dw = CAT_CELL_W * sc,
                dh = CAT_CELL_H * sc;
              const wx = q.x - v.x,
                wy = q.y - v.y;
              ctx.save();
              ctx.rotate(-v.angle); // back to world axes: the sheet is drawn for a fixed screen view
              ctx.fillStyle = "rgba(0,0,0,0.22)";
              ctx.beginPath();
              ctx.ellipse(wx, wy + dh * 0.28, dw * 0.34, dh * 0.12, 0, 0, Math.PI * 2);
              ctx.fill();
              ctx.drawImage(
                sheet,
                fr * CAT_CELL_W,
                ((q.d ?? CAT_DOWN) + (catBlink(t, (v.carId % 7) * 0.6) ? CAT_BLINK_ROWS : 0)) *
                  CAT_CELL_H,
                CAT_CELL_W,
                CAT_CELL_H,
                wx - dw / 2,
                wy - dh / 2,
                dw,
                dh,
              );
              ctx.restore();
            }
          } else if (v.pet) {
            // floating pet: lazy bob when stopped, fast flutter when moving, travels with the car
            const pim = petImg(v.pet);
            if (pim) {
              // the pet has its own body: it springs after a spot beside the car, so it trails and catches up like a real pet
              const cw = car.w;
              let q = v.pp;
              if (!q) q = v.pp = { x: v.x + cw, y: v.y, vx: 0, vy: 0, a: v.angle, t, tr: 0 };
              const pdt = Math.min(0.05, Math.max(0, t - q.t));
              q.t = t;
              const l = petLocal(cw, t, 0, v.x * 0.01);
              const orb = t * 1.1 + v.x * 0.01; // circles its car, so it turns to face every direction
              const ox = Math.cos(orb) * cw * 0.95,
                oy = Math.sin(orb) * cw * 1.15 - cw * 0.1;
              const tx = v.x + Math.cos(v.angle) * ox - Math.sin(v.angle) * oy,
                ty = v.y + Math.sin(v.angle) * ox + Math.cos(v.angle) * oy;
              if (Math.hypot(tx - q.x, ty - q.y) > 350) {
                q.x = tx;
                q.y = ty;
                q.vx = q.vy = 0;
              }
              q.vx += ((tx - q.x) * 40 - q.vx * 11) * pdt;
              q.vy += ((ty - q.y) * 40 - q.vy * 11) * pdt;
              q.x += q.vx * pdt;
              q.y += q.vy * pdt;
              const sp = Math.hypot(q.vx, q.vy);
              // look where it is flying; when it hovers, look where the car looks
              const aim = sp > 12 ? Math.atan2(q.vx, -q.vy) : v.angle;
              q.a += wrapAng(aim - q.a) * Math.min(1, pdt * 8); // eases to the new heading and stops there
              const wx = q.x - v.x,
                wy = q.y - v.y;
              ctx.save();
              ctx.rotate(-v.angle); // back to world axes
              ctx.fillStyle = "rgba(0,0,0,0.22)";
              ctx.beginPath();
              ctx.ellipse(wx + 4, wy + 24, PET_SIZE * 0.32, PET_SIZE * 0.12, 0, 0, Math.PI * 2);
              ctx.fill();
              const ph = (PET_SIZE * pim.naturalHeight) / pim.naturalWidth;
              ctx.translate(wx, wy - 10 + Math.sin(t * 5 + v.x) * 2);
              ctx.rotate(q.a + Math.PI); // sprites face down, +180° = nose along its flight direction
              ctx.scale(1, l.flap);
              ctx.drawImage(pim, -PET_SIZE / 2, -ph / 2, PET_SIZE, ph);
              ctx.restore();
            }
          }
          if ((v.crs ?? 0) > 0) {
            // cursed: purple sparkles drift up around the car
            ctx.save();
            ctx.rotate(-v.angle);
            for (let i = 0; i < 9; i++) {
              const k = (t * 0.7 + i / 9) % 1,
                a = i * 2.4 + t * 1.5;
              ctx.fillStyle = hexA(i % 2 ? "#b44dff" : "#e0a8ff", 0.85 * (1 - k));
              ctx.beginPath();
              ctx.arc(
                Math.cos(a) * r * 0.9,
                Math.sin(a) * r * 0.9 - k * 34,
                3.2 * (1 - k * 0.6),
                0,
                Math.PI * 2,
              );
              ctx.fill();
            }
            ctx.restore();
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
          if (v === me0 || v === clone) {
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
          drawTracer(
            ctx,
            b.x,
            b.y,
            b.vx,
            b.vy,
            bulletCol(!!g.tdm, ownerOf(b.owner)),
            b.damage === PET_FLY_DAMAGE ? 0.45 : 1,
          );
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
      if (g?.storm) {
        /* night: a dark veil with holes for headlights, bullets, pickups, mines and blasts */
        const lamps = g.cars
          .filter((c) => c.alive && !(powerOn(c, "ghost") && c !== me0))
          .map((c) => {
            const k = carAt(c.carId);
            return { x: c.x, y: c.y, angle: c.angle, h: k.h, w: k.w };
          });
        const glows = [
          ...g.bullets.map((b) => ({ x: b.x, y: b.y, r: 48, a: 0.6 })),
          ...g.powerups.map((q) => ({ x: q.x, y: q.y, r: 80, a: 0.55 })),
          ...g.mines.map((m) => ({ x: m.x, y: m.y, r: 70, a: 0.5 })),
          ...(g.tdm ? TDM_SPAWN.map((sp) => ({ x: sp.x, y: sp.y, r: SPAWN_R + 70, a: 0.7 })) : []),
          ...(g.blasts ?? []).map((bl) => ({
            x: bl.x,
            y: bl.y,
            r: 300,
            a: 0.95 * (1 - bl.t / 0.7),
          })),
          ...g
            .wrecks!.filter((w) => wreckHeat(w) > 0.6)
            .map((w) => ({ x: w.x, y: w.y, r: 110, a: 0.35 * wreckHeat(w) })),
        ];
        drawNight(ctx, width, height, ox, oy, zoom, lamps, glows, g.storm.flash);
      }
      /* frozen by an enemy Time Freeze: a faint blue wash that fades in with the freeze and slowly clears */
      if (me0 && (me0.tint ?? 0) > 0.01) {
        ctx.fillStyle = `rgba(77,216,255,${(me0.tint as number) * 0.22})`;
        ctx.fillRect(0, 0, width, height);
      }
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

    /** the arena: one full-screen view */
    const renderArena = (t: number) => {
      const g = gameRef.current;
      const dtc = g ? Math.min(0.05, Math.max(0, t - (g.camT ?? t))) : 0;
      if (g) g.camT = t;
      drawView(width, height, t, dtc);
    };

    const draw = (now: number) => {
      const gap = now - previous;
      const dt = Math.min(gap / 1000, 0.04);
      previous = now;
      if (modeRef.current === "playing" && gap < 250) {
        gapAvg += (gap - gapAvg) * 0.08;
        slowFor = gapAvg > 26 ? slowFor + gap : 0; // under ~38 fps
        if (slowFor > 1500 && ratioCap > 1.5) {
          ratioCap = 1.5; // never drop below this: lower resolutions make the game look blurry
          slowFor = 0;
          gapAvg = 16;
          resize();
        }
      }
      const m = modeRef.current,
        t = now / 1000;
      const running = !(m === "playing" && pausedRef.current && !onlineRef.current);
      if (running) fxRef.current.update(dt);
      if (m === "playing") {
        if (!pausedRef.current || onlineRef.current) {
          // online: the world never waits for one player's menu
          if (netRef.current.gn) guestStep(dt, now);
          else step(dt, now);
        }
        renderArena(t);
      } else if (m === "race") {
        /* SPEED mode renders on its own canvas */
      } else if (m === "result" && gameRef.current) renderArena(t);
      else {
        const keys = keysRef.current;
        stepShow(showRef.current, anchorRef.current, anyKey(keys, [" ", "5", "testfire"]), dt);
        renderBackdrop(showRef.current.t);
        renderShowroom(showRef.current, anchorRef.current);
        fxRef.current.draw(ctx); // particles + bullets' sparks
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
      // typing a room code (or a lobby pop-up being open) must not drive the garage
      if (
        friendsUiRef.current !== "closed" ||
        (e.target as HTMLElement | null)?.tagName === "INPUT"
      )
        return;
      const key = e.key.toLowerCase();
      if (drive.includes(key)) e.preventDefault();
      if (down) sfxRef.current.unlock();
      if (down && !e.repeat) {
        const m = modeRef.current;
        if (key === "escape" && m === "playing") {
          const v = !pausedRef.current;
          pausedRef.current = v;
          setPaused(v);
        }
        if (m === "select" && pickingRef.current && teamPickRef.current) {
          if (key === "b" || key === "1") chooseTeamRef.current(0, 0);
          else if (key === "r" || key === "2") chooseTeamRef.current(0, 1);
          else if (key === "escape") openTeamPick(false);
        } else if (m === "select" && pickingRef.current) {
          if (key === "t" || key === "3") openTeamPick(true);
          else if (key === "enter" || key === "f" || key === "1") {
            setAsk(false);
            startRef.current();
          } else if (key === "s" || key === "2") raceRef.current();
          else if (key === "escape") setAsk(false);
        } else if (m === "select") {
          if (key === "arrowleft" || key === "a") pick(baseOf(selectedRef.current) - 1);
          else if (key === "arrowright" || key === "d") pick(baseOf(selectedRef.current) + 1);
          else if (key === "v") setVerRef.current(!isV2(selectedRef.current));
          else if (key === "enter") askRef.current();
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
  const verToggle = (idx: number) => {
    const v2 = v2Of(baseOf(idx));
    if (v2 < 0) return null;
    const on = isV2(idx);
    return (
      <div className="ver-toggle" role="group" aria-label="Car version">
        <button
          type="button"
          className={on ? "" : "on"}
          aria-pressed={!on}
          onClick={() => setVer(false)}
        >
          V1
        </button>
        <button
          type="button"
          className={on ? "on" : ""}
          aria-pressed={on}
          onClick={() => setVer(true)}
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
      <section
        className={`arena-stage mode-${mode}${mapSel === "garage" ? " tdm-garage" : ""}`}
        aria-label="Car combat arena"
        style={vars}
      >
        <canvas ref={canvasRef} className="arena-canvas" aria-label="Live car combat arena" />
        <div className="crt" aria-hidden="true" />

        <MissionToasts />
        {mode !== "playing" && mode !== "race" && (
          <header className="top-bar">
            <div className="logo" aria-label="Last Car Standing">
              <span className="logo-a">LAST CAR</span>
              <span className="logo-b">STANDING</span>
            </div>
            <div className="top-right">
              {mode === "select" && <MissionsButton />}
              {mode === "select" && <PetsButton carId={selected} />}
              {mode === "select" && (
                <FriendsButton
                  inLobby={!!lobby}
                  onOpen={() => {
                    setFriendsErr("");
                    setFriendsUi("menu");
                  }}
                  onLeave={() => setFriendsUi("leave")}
                />
              )}
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
                {verToggle(selected)}
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

        {mode === "select" && lobby && (
          <LobbyCard
            lobby={lobby}
            map={mapSel}
            onMap={(mp) => {
              setMapSel(mp);
              sfxRef.current.blip();
            }}
            onStart={hostStart}
          />
        )}
        {mode === "select" && friendsUi === "menu" && !lobby && (
          <FriendsModal
            busy={friendsBusy}
            error={friendsErr}
            onGenerate={generateRoom}
            onJoin={joinRoomCode}
            onClose={() => setFriendsUi("closed")}
          />
        )}
        {mode === "select" && friendsUi === "leave" && lobby && (
          <LeaveConfirm
            host={lobby.role === "host"}
            onYes={leaveLobby}
            onNo={() => setFriendsUi("closed")}
          />
        )}

        {mode === "select" && notice && (
          <div className="lock-notice" role="status" aria-live="polite">
            {notice}
          </div>
        )}

        {mode === "select" && picking && teamPick && (
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
                  <Shield size={18} /> {teamName(0)} TEAM <small>SPAWN ON THE LEFT · B</small>
                </button>
                <button
                  type="button"
                  className="arcade-btn start-btn team-red-btn"
                  onClick={() => chooseTeam(0, 1)}
                >
                  <Shield size={18} /> {teamName(1)} TEAM <small>SPAWN ON THE RIGHT · R</small>
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
                <span>SELECT MODE</span>
              </div>
              <div className="win-body center">
                <div className="map-pick" role="radiogroup" aria-label="Map">
                  {(
                    [
                      ["yard", "NEON YARD", yardThumb],
                      ["garage", "WRECK GARAGE", garageThumb],
                    ] as [MapKind, string, string][]
                  ).map(([id, name, img]) => (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={mapSel === id}
                      className={`map-card${mapSel === id ? " on" : ""}`}
                      onClick={() => setMapSel(id)}
                    >
                      <img className="map-thumb" src={img} alt={name} width={518} height={292} />
                      <span className="map-name">{name}</span>
                    </button>
                  ))}
                </div>
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
            keys={keysRef}
            sfx={sfxRef.current}
            muted={muted}
            onToggleMute={toggleMute}
            onExit={() => setModeSync("select")}
          />
        )}

        {mode === "playing" && (
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
                    YOU ARE {hud.tdm.team === 0 ? teamName(0) : teamName(1)} · 6v6
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
                      <em>{onlineRef.current ? "MENU" : "PAUSED"}</em>
                    </h2>
                    {touchUi && <ControlSettings prefs={ctl} />}
                    <button type="button" className="arcade-btn start-btn" onClick={togglePause}>
                      <Play size={16} /> RESUME
                    </button>
                    <button type="button" className="arcade-btn alt-btn" onClick={abandonMatch}>
                      {onlineRef.current ? "LEAVE MATCH" : "ABANDON MATCH"}
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
                    ? `${teamName(0)} ${result.tdm.blue} - ${result.tdm.red} ${teamName(1)}`
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
                          ? teamName(0)
                          : teamName(1)
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
                {!onlineRef.current && (
                  <button
                    type="button"
                    className="arcade-btn start-btn"
                    onClick={() =>
                      result.tdm ? startTdmRef.current(result.tdm.team) : startRef.current()
                    }
                  >
                    <Play size={16} /> {result.won ? "PLAY AGAIN" : "CONTINUE?"}
                  </button>
                )}
                <button
                  type="button"
                  className="arcade-btn alt-btn"
                  onClick={() => setModeSync("select")}
                >
                  {onlineRef.current ? "BACK TO LOBBY" : "BACK TO GARAGE"}
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
  if (mapKind === "garage") {
    buildGarageFloor(f, c, rnd);
    floorCanvas = c;
    return c;
  }
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

/** Wreck Garage floor: cracked, oil-stained concrete slabs with faded parking-bay paint and hazard-striped walls. */
function buildGarageFloor(f: CanvasRenderingContext2D, c: HTMLCanvasElement, rnd: () => number) {
  const T = 120;
  f.fillStyle = "#23262d";
  f.fillRect(0, 0, c.width, c.height);
  for (let y = 0; y < c.height; y += T) {
    for (let x = 0; x < c.width; x += T) {
      const d = Math.round((rnd() - 0.5) * 12);
      f.fillStyle = `rgb(${44 + d},${47 + d},${54 + d})`;
      f.fillRect(x, y, T, T);
      for (let i = 0; i < 26; i++) {
        f.fillStyle = rnd() > 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.16)";
        f.fillRect(x + rnd() * T, y + rnd() * T, 1 + rnd() * 2, 1 + rnd() * 2);
      }
      f.fillStyle = "rgba(0,0,0,0.45)";
      f.fillRect(x, y + T - 2, T, 2);
      f.fillRect(x + T - 2, y, 2, T);
    }
  }
  // faded parking-bay paint
  f.strokeStyle = "rgba(225,225,215,0.22)";
  f.lineWidth = 4;
  const sx = (c.width - 2400) / 2;
  for (const [x0, y0, n, vertical] of [
    [285 + sx, 340, 8, true],
    [1335 + sx, 1210, 7, true],
  ] as [number, number, number, boolean][]) {
    for (let i = 0; i <= n; i++) {
      f.beginPath();
      if (vertical) {
        f.moveTo(x0 + i * 92, y0);
        f.lineTo(x0 + i * 92, y0 + 160);
      }
      f.stroke();
    }
  }
  // cracks
  f.strokeStyle = "rgba(0,0,0,0.5)";
  f.lineWidth = 2;
  for (let i = 0; i < 46; i++) {
    let cx = rnd() * c.width,
      cy = rnd() * c.height,
      a = rnd() * Math.PI * 2;
    f.beginPath();
    f.moveTo(cx, cy);
    for (let k = 0; k < 7; k++) {
      a += (rnd() - 0.5) * 1.2;
      cx += Math.cos(a) * (14 + rnd() * 22);
      cy += Math.sin(a) * (14 + rnd() * 22);
      f.lineTo(cx, cy);
    }
    f.stroke();
  }
  // oil stains and a few wet patches
  for (let i = 0; i < 60; i++) {
    const sx = rnd() * c.width,
      sy = rnd() * c.height,
      r = 24 + rnd() * 80;
    const g = f.createRadialGradient(sx, sy, 0, sx, sy, r);
    g.addColorStop(0, i % 5 === 0 ? "rgba(60,90,130,0.22)" : "rgba(4,5,8,0.4)");
    g.addColorStop(1, "rgba(4,5,8,0)");
    f.fillStyle = g;
    f.fillRect(sx - r, sy - r, r * 2, r * 2);
  }
  // hazard-stripe border
  const band = 22;
  for (const [bx, by, bw, bh] of [
    [0, 0, c.width, band],
    [0, c.height - band, c.width, band],
    [0, 0, band, c.height],
    [c.width - band, 0, band, c.height],
  ] as [number, number, number, number][]) {
    f.save();
    f.beginPath();
    f.rect(bx, by, bw, bh);
    f.clip();
    f.fillStyle = "rgba(14,14,18,0.9)";
    f.fillRect(bx, by, bw, bh);
    f.fillStyle = "rgba(200,160,40,0.7)";
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
}

/** "#rrggbb" + alpha → "rgba(r,g,b,a)". Plain rgba() keeps canvas and CSS happy on old Chrome. */
function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
