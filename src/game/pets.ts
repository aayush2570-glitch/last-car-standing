import { useCallback, useEffect, useState } from "react";
import redfly from "@/assets/pets/redfly.webp";
import blutle from "@/assets/pets/blutle.webp";
import whown from "@/assets/pets/whown.webp";
import { spendXp } from "@/game/xp";
import { spriteReady } from "@/game/cars";

export type PetKind = "redfly" | "blutle" | "whown";
export type PetInfo = {
  kind: PetKind;
  name: string;
  price: number;
  url: string;
  blurb: string;
  color: string;
};

export const PETS: PetInfo[] = [
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

export const randomPet = (): PetKind => PETS[Math.floor(Math.random() * PETS.length)]!.kind;

/** where the pet hovers, in the car's own frame (x right, y down). `moving` 0..1 swaps the lazy bob for a fast flutter */
export function petLocal(carW: number, t: number, moving: number, phase = 0) {
  const slow = Math.sin(t * 2.4 + phase) * 5;
  const fast = Math.sin(t * 11 + phase) * 2.5;
  return {
    x: carW * 0.85 + Math.sin(t * 1.3 + phase) * 3,
    y: -4 + slow * (1 - moving) + fast * moving,
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
