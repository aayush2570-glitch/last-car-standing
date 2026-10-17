import blackTruck from "@/assets/cars/black_gatling_pickup.webp";
import blueTruck from "@/assets/cars/blue_turret_truck.webp";
import greenJeep from "@/assets/cars/green_military_jeep.webp";
import orangeSportsCar from "@/assets/cars/orange_sports_car.webp";
import policeCar from "@/assets/cars/police_car.webp";
import purpleCar from "@/assets/cars/purple_futuristic_car.webp";
import redMuscleCar from "@/assets/cars/red_muscle_car.webp";
import yellowTruck from "@/assets/cars/yellow_turret_truck.webp";
import redlineV2 from "@/assets/cars/redline_v2.webp";
import phantomV2 from "@/assets/cars/phantom_v2.webp";
import blueTurretV2 from "@/assets/cars/blue_turret_v2.webp";

/**
 * NOTE (Chrome 109): every colour used by the canvas or by inline styles is a plain
 * hex string. `oklch()` / `color-mix()` need Chrome 111+, and canvas silently ignores
 * colours it cannot parse, which would paint everything black.
 */
export const PAL = {
  void: "#0b0620",
  ground: "#100829",
  floor: "#1a0e3d",
  floorAlt: "#21134d",
  grid: "#3a2478",
  road: "#5b3fb0",
  building: "#2b1a63",
  roof: "#3a2385",
  window: "#ff2bd6",
  windowCyan: "#2ef2ff",
  shadow: "#070312",
  trim: "#2ef2ff",
  boundary: "#ff2bd6",
  magenta: "#ff2bd6",
  cyan: "#2ef2ff",
  yellow: "#ffe23d",
  lime: "#9dff3b",
  red: "#ff3b5c",
  white: "#ffffff",
  friendly: "#2ef2ff",
  hostile: "#ff4d6d",
} as const;

export type Car = {
  name: string;
  model: string;
  url: string;
  hp: number;
  speed: number;
  fireRate: number;
  damage: number;
  armor: number;
  color: string;
  /** sprite size used in the arena (px); width follows the artwork's real aspect ratio */
  w: number;
  h: number;
  /** v2 forms only: index (in `cars`) of the car this is the upgraded form of */
  base?: number;
  /** v2 forms only: XP price in the garage */
  price?: number;
  /** v2 forms only: special power */
  ability?: AbilityKind;
};

export type AbilityKind = "freeze" | "ghost" | "shield";

export type AbilityInfo = {
  kind: AbilityKind;
  label: string;
  /** correct hits needed to charge it */
  need: number;
  /** seconds the power lasts */
  dur: number;
  color: string;
  blurb: string;
};

export const ABILITIES: Record<AbilityKind, AbilityInfo> = {
  freeze: {
    kind: "freeze",
    label: "TIME FREEZE",
    need: 10,
    dur: 5,
    color: "#7df3ff",
    blurb: "10 hits: freezes nearby cars and bullets for 5s",
  },
  ghost: {
    kind: "ghost",
    label: "PHANTOM CLOAK",
    need: 20,
    dur: 30,
    color: "#d08cff",
    blurb: "20 hits: invisible to others for 30s, still hittable",
  },
  shield: {
    kind: "shield",
    label: "AEGIS SHIELD",
    need: 20,
    dur: 30,
    color: "#ff5a5a",
    blurb: "20 hits: shield for 30s, blocks 75% of hits",
  },
};

/** radius (px) of the Time Freeze field around the car */
export const FREEZE_RADIUS = 380;
/** chance a shielded car still takes a hit */
export const SHIELD_LEAK = 0.25;
/** chance a bot rolls the v2 form of a car that has one */
export const BOT_V2_CHANCE = 0.05;

export const cars: Car[] = [
  {
    name: "Gatling",
    model: "BLACK GATLING PICKUP",
    url: blackTruck,
    hp: 112,
    speed: 72,
    fireRate: 81,
    damage: 81,
    armor: 56,
    color: "#b9c4e8",
    w: 47,
    h: 80,
  },
  {
    name: "Blue Turret",
    model: "ARMORED SUPPORT",
    url: blueTruck,
    hp: 148,
    speed: 49,
    fireRate: 54,
    damage: 70,
    armor: 93,
    color: "#4da3ff",
    w: 46,
    h: 80,
  },
  {
    name: "Military Jeep",
    model: "FIELD COMMANDER",
    url: greenJeep,
    hp: 125,
    speed: 65,
    fireRate: 66,
    damage: 64,
    armor: 76,
    color: "#7dff5a",
    w: 68,
    h: 80,
  },
  {
    name: "Street Runner",
    model: "ORANGE SPORTS CAR",
    url: orangeSportsCar,
    hp: 86,
    speed: 96,
    fireRate: 61,
    damage: 55,
    armor: 41,
    color: "#ff9a2e",
    w: 48,
    h: 80,
  },
  {
    name: "Interceptor",
    model: "POLICE PURSUIT",
    url: policeCar,
    hp: 115,
    speed: 72,
    fireRate: 91,
    damage: 59,
    armor: 68,
    color: "#39d0ff",
    w: 62,
    h: 80,
  },
  {
    name: "Phantom",
    model: "FUTURE DIVISION",
    url: purpleCar,
    hp: 96,
    speed: 91,
    fireRate: 86,
    damage: 63,
    armor: 49,
    color: "#c26bff",
    w: 56,
    h: 80,
  },
  {
    name: "Redline",
    model: "RED MUSCLE CAR",
    url: redMuscleCar,
    hp: 139,
    speed: 70,
    fireRate: 62,
    damage: 87,
    armor: 78,
    color: "#ff4b5c",
    w: 67,
    h: 80,
  },
  {
    name: "Heavy Metal",
    model: "YELLOW TURRET TRUCK",
    url: yellowTruck,
    hp: 158,
    speed: 45,
    fireRate: 53,
    damage: 97,
    armor: 95,
    color: "#ffe23d",
    w: 46,
    h: 80,
  },
];

/** Upgraded "v2" forms. Ids continue after the base cars (8, 9, 10). */
export const v2Cars: Car[] = [
  {
    name: "Redline v2",
    model: "AEGIS PROTOCOL",
    url: redlineV2,
    hp: 150,
    speed: 76,
    fireRate: 68,
    damage: 92,
    armor: 84,
    color: "#ff4b5c",
    w: 46,
    h: 80,
    base: 6,
    price: 40000,
    ability: "shield",
  },
  {
    name: "Phantom v2",
    model: "GHOST CLOAK",
    url: phantomV2,
    hp: 104,
    speed: 96,
    fireRate: 90,
    damage: 68,
    armor: 55,
    color: "#c26bff",
    w: 50,
    h: 80,
    base: 5,
    price: 50000,
    ability: "ghost",
  },
  {
    name: "Blue Turret v2",
    model: "CHRONO SUPPORT",
    url: blueTurretV2,
    hp: 160,
    speed: 54,
    fireRate: 60,
    damage: 76,
    armor: 96,
    color: "#4dd8ff",
    w: 45,
    h: 80,
    base: 1,
    price: 70000,
    ability: "freeze",
  },
];

/** every drivable car: base forms first, then the v2 forms */
export const allCars: Car[] = [...cars, ...v2Cars];

/** id of the v2 form of a base car, or -1 when it has none */
export const v2Of = (base: number): number => {
  const i = v2Cars.findIndex((c) => c.base === base);
  return i < 0 ? -1 : cars.length + i;
};
export const isV2 = (id: number): boolean => id >= cars.length;
/** base car index for any car id (v1 ids map to themselves) */
export const baseOf = (id: number): number =>
  isV2(id) ? ((v2Cars[id - cars.length] as Car).base as number) : id;
/** v1 → maybe v2 (used for bots, which now and then show up with an upgraded car) */
export const rollV2 = (id: number): number => {
  const v = v2Of(id);
  return v >= 0 && Math.random() < BOT_V2_CHANCE ? v : id;
};
export const abilityOf = (id: number): AbilityInfo | null => {
  const a = allCars[id]?.ability;
  return a ? ABILITIES[a] : null;
};

export const carAt = (i: number): Car =>
  allCars[((i % allCars.length) + allCars.length) % allCars.length] as Car;

/** Lazily created, client-only sprite cache. */
let sprites: HTMLImageElement[] | null = null;
export function getSprites(): HTMLImageElement[] {
  if (sprites) return sprites;
  sprites = allCars.map((c) => {
    const img = new Image();
    img.src = c.url;
    return img;
  });
  return sprites;
}

export const spriteReady = (img: HTMLImageElement | undefined): img is HTMLImageElement =>
  !!img && img.complete && img.naturalWidth > 0;

/**
 * Vector stand-in used when a sprite has not loaded (or failed to load), so the game
 * never shows an empty hole where a car should be. Drawn facing up, centred on 0,0.
 */
export function drawFallbackCar(ctx: CanvasRenderingContext2D, car: Car, w: number, h: number) {
  const x = -w / 2,
    y = -h / 2;
  ctx.fillStyle = car.color;
  ctx.fillRect(x + w * 0.06, y, w * 0.88, h);
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fillRect(x + w * 0.06, y + h * 0.5, w * 0.88, h * 0.5);
  ctx.fillStyle = "#120a2c";
  ctx.fillRect(x + w * 0.16, y + h * 0.2, w * 0.68, h * 0.2);
  ctx.fillRect(x + w * 0.2, y + h * 0.66, w * 0.6, h * 0.14);
  ctx.fillStyle = "#fff6b0";
  ctx.fillRect(x + w * 0.1, y + 1, w * 0.2, h * 0.05);
  ctx.fillRect(x + w * 0.7, y + 1, w * 0.2, h * 0.05);
  ctx.fillStyle = "#ff2b4d";
  ctx.fillRect(x + w * 0.1, y + h - h * 0.05 - 1, w * 0.2, h * 0.05);
  ctx.fillRect(x + w * 0.7, y + h - h * 0.05 - 1, w * 0.2, h * 0.05);
  ctx.fillStyle = "#120a2c";
  ctx.fillRect(-w * 0.09, -h * 0.05, w * 0.18, h * 0.32);
}
