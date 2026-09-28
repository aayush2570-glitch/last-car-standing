import blackTruck from "@/assets/black_gatling_pickup.png.asset.json";
import blueTruck from "@/assets/blue_turret_truck.png.asset.json";
import greenJeep from "@/assets/green_military_jeep.png.asset.json";
import orangeSportsCar from "@/assets/orange_sports_car.png.asset.json";
import policeCar from "@/assets/police_car.png.asset.json";
import purpleCar from "@/assets/purple_futuristic_car.png.asset.json";
import redMuscleCar from "@/assets/red_muscle_car.png.asset.json";
import yellowTruck from "@/assets/yellow_turret_truck.png.asset.json";

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
  /** sprite size used in the arena (px) */
  w: number;
  h: number;
};

export const cars: Car[] = [
  {
    name: "Gatling",
    model: "BLACK GATLING PICKUP",
    url: blackTruck.url,
    hp: 112,
    speed: 72,
    fireRate: 81,
    damage: 81,
    armor: 56,
    color: "#b9c4e8",
    w: 48,
    h: 77,
  },
  {
    name: "Blue Turret",
    model: "ARMORED SUPPORT",
    url: blueTruck.url,
    hp: 148,
    speed: 49,
    fireRate: 54,
    damage: 70,
    armor: 93,
    color: "#4da3ff",
    w: 48,
    h: 77,
  },
  {
    name: "Military Jeep",
    model: "FIELD COMMANDER",
    url: greenJeep.url,
    hp: 125,
    speed: 65,
    fireRate: 66,
    damage: 64,
    armor: 76,
    color: "#7dff5a",
    w: 48,
    h: 77,
  },
  {
    name: "Street Runner",
    model: "ORANGE SPORTS CAR",
    url: orangeSportsCar.url,
    hp: 86,
    speed: 96,
    fireRate: 61,
    damage: 55,
    armor: 41,
    color: "#ff9a2e",
    w: 43,
    h: 72,
  },
  {
    name: "Interceptor",
    model: "POLICE PURSUIT",
    url: policeCar.url,
    hp: 115,
    speed: 72,
    fireRate: 91,
    damage: 59,
    armor: 68,
    color: "#39d0ff",
    w: 48,
    h: 77,
  },
  {
    name: "Phantom",
    model: "FUTURE DIVISION",
    url: purpleCar.url,
    hp: 96,
    speed: 91,
    fireRate: 86,
    damage: 63,
    armor: 49,
    color: "#c26bff",
    w: 48,
    h: 77,
  },
  {
    name: "Redline",
    model: "RED MUSCLE CAR",
    url: redMuscleCar.url,
    hp: 139,
    speed: 70,
    fireRate: 62,
    damage: 87,
    armor: 78,
    color: "#ff4b5c",
    w: 48,
    h: 77,
  },
  {
    name: "Heavy Metal",
    model: "YELLOW TURRET TRUCK",
    url: yellowTruck.url,
    hp: 158,
    speed: 45,
    fireRate: 53,
    damage: 97,
    armor: 95,
    color: "#ffe23d",
    w: 48,
    h: 77,
  },
];

export const carAt = (i: number): Car =>
  cars[((i % cars.length) + cars.length) % cars.length] as Car;

/** Lazily created, client-only sprite cache. */
let sprites: HTMLImageElement[] | null = null;
export function getSprites(): HTMLImageElement[] {
  if (sprites) return sprites;
  sprites = cars.map((c) => {
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
