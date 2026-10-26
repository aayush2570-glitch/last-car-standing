import { useCallback, useEffect, useState } from "react";
import redfly from "@/assets/pets/redfly.webp";
import blutle from "@/assets/pets/blutle.webp";
import whown from "@/assets/pets/whown.webp";
import catnya from "@/assets/pets/catnya.webp";
import { spendXp } from "@/game/xp";
import { spriteReady, isV2 } from "@/game/cars";

export type PetKind = "redfly" | "blutle" | "whown" | "catnya";

/** LIMITED HALLOWEEN OFFER: set to false to take Catnya out of the shop and the game (owners keep it saved for when it returns) */
export const HALLOWEEN_OFFER = true;
export type PetInfo = {
  kind: PetKind;
  name: string;
  price: number;
  url: string;
  blurb: string;
  color: string;
  /** shop badge for limited-time pets */
  limited?: string;
};

const BASE_PETS: PetInfo[] = [
  {
    kind: "redfly",
    name: "REDFLY",
    price: 35000,
    url: redfly,
    color: "#ff4d6d",
    blurb: "Flies beside you and shoots weak bullets at the nearest enemy",
  },
  {
    kind: "blutle",
    name: "BLUTLE",
    price: 50000,
    url: blutle,
    color: "#4dd8ff",
    blurb: "Wraps your car in an armour shield for 30s when your HP hits the red zone (one time)",
  },
  {
    kind: "whown",
    name: "WHOWN",
    price: 65000,
    url: whown,
    color: "#3dff7a",
    blurb: "Gives you +50 HP when your HP hits the red zone (one time)",
  },
];
const HALLOWEEN_PETS: PetInfo[] = [
  {
    kind: "catnya",
    name: "CATNYA",
    price: 25000,
    url: catnya,
    color: "#b44dff",
    limited: "LIMITED HALLOWEEN OFFER",
    blurb:
      "Sits on your hood. When your HP is in the red zone, curses the enemy who hits you: their bullets do less damage and their car is slower for 30s (one time, respawn to reuse)",
  },
];
export const PETS: PetInfo[] = HALLOWEEN_OFFER ? [...BASE_PETS, ...HALLOWEEN_PETS] : BASE_PETS;
export const petOf = (k?: PetKind | null) => PETS.find((p) => p.kind === k);

/** a bot has this chance to spawn with a random pet */
export const PET_BOT_CHANCE = 0.2;
export const PET_RED_ZONE = 0.3; // same "red" as the HP bar
export const PET_SHIELD_TIME = 30; // seconds the Blutle armour lasts
export const PET_SHIELD_TAKE = 0.2; // damage that still gets through the armour
export const PET_HEAL = 50;
export const PET_FLY_DAMAGE = 1.2; // RedFly bullet damage (a normal bullet does ~3-6)
export const PET_FLY_RATE = 0.55; // seconds between RedFly shots
export const PET_FLY_RANGE = 620;
export const PET_SIZE = 46;
export const CURSE_TIME = 30; // seconds a cursed car's bullets stay weak
export const CURSE_DAMAGE = 0.4; // cursed bullets do 40% damage
export const CURSE_SPEED = 0.6; // cursed cars drive at 60% speed
/** blink: eyes shut for a moment every few seconds (per-car phase) */
export const catBlink = (t: number, phase: number) => (t + phase) % 4.3 < 0.17;

export const randomPet = (): PetKind => PETS[Math.floor(Math.random() * PETS.length)]!.kind;

/** where the pet hovers, in the car's own frame (x right, y down). `moving` 0..1 swaps the lazy bob for a fast flutter */
export function petLocal(carW: number, t: number, moving: number, phase = 0) {
  // wanders in a slow loop around the host car (faster while the car is moving)
  const sp = 1 + moving * 0.8;
  const R = carW * 0.95;
  const a = t * 0.9 * sp + phase;
  return {
    x: Math.sin(a) * R + Math.sin(t * 2.3 + phase) * 4,
    y:
      -4 +
      Math.cos(a * 0.8 + 1) * R * 1.25 +
      Math.sin(t * 2.4 + phase) * 4 * (1 - moving) +
      Math.sin(t * 11 + phase) * 2.5 * moving,
    flap: 1 + 0.07 * Math.sin(t * (6 + moving * 14)),
  };
}

const imgs: Partial<Record<PetKind, HTMLImageElement>> = {};
export function petImg(k: PetKind): HTMLImageElement | undefined {
  if (typeof Image === "undefined") return undefined;
  let i = imgs[k];
  if (!i) {
    i = new Image();
    i.src = petOf(k)!.url;
    imgs[k] = i;
  }
  return spriteReady(i) ? i : undefined;
}

/* ── ownership + equipped pet, saved on this device ── */
const OWN = "lcs.pets",
  SEL = "lcs.pet",
  EVT = "lcs-pets";
function readOwned(): PetKind[] {
  try {
    const a = JSON.parse(localStorage.getItem(OWN) ?? "[]");
    return Array.isArray(a) ? a.filter((k) => PETS.some((p) => p.kind === k)) : [];
  } catch {
    return [];
  }
}
function readSel(): PetKind | null {
  try {
    const k = localStorage.getItem(SEL);
    return readOwned().includes(k as PetKind) ? (k as PetKind) : null;
  } catch {
    return null;
  }
}
function write(owned: PetKind[], sel: PetKind | null) {
  try {
    localStorage.setItem(OWN, JSON.stringify(owned));
    if (sel) localStorage.setItem(SEL, sel);
    else localStorage.removeItem(SEL);
    window.dispatchEvent(new Event(EVT));
  } catch {
    /* storage unavailable */
  }
}
export const equippedPet = (): PetKind | null => readSel();
export function buyPet(k: PetKind): boolean {
  const owned = readOwned();
  const info = petOf(k);
  if (!info || owned.includes(k) || !spendXp(info.price)) return false;
  write([...owned, k], k); // a new pet is equipped right away
  return true;
}
export function equipPet(k: PetKind | null) {
  const owned = readOwned();
  if (k === null || owned.includes(k)) write(owned, k);
}
export function usePets() {
  const [s, setS] = useState<{ owned: PetKind[]; sel: PetKind | null }>({ owned: [], sel: null });
  useEffect(() => {
    const sync = () => setS({ owned: readOwned(), sel: readSel() });
    sync();
    window.addEventListener(EVT, sync);
    window.addEventListener("lcs-wallet", sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("lcs-wallet", sync);
    };
  }, []);
  const has = useCallback((k: PetKind) => s.owned.includes(k), [s.owned]);
  return { ...s, has };
}

/** Catnya's seat on the hood: centre (fraction of car height from the nose) and height. The pointed v2 noses are narrower, so she sits a bit further back and smaller there */
export const catHood = (carId: number, h: number) =>
  isV2(carId) && h === 80 ? { y: 0.25, ch: 0.27 } : { y: 0.16, ch: 0.3 };
