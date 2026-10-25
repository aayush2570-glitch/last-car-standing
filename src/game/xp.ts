import { useCallback, useEffect, useState } from "react";

/**
 * XP wallet + owned v2 cars, kept in this device's localStorage.
 * Every access is wrapped in try/catch (private mode / blocked storage must never break the game).
 */
const XP_KEY = "lcs.xp";
const OWN_KEY = "lcs.owned";
const EVT = "lcs-wallet";

export type Wallet = { xp: number; owned: number[] };

function readXp(): number {
  try {
    const n = Number(localStorage.getItem(XP_KEY));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}
function readOwned(): number[] {
  try {
    const a = JSON.parse(localStorage.getItem(OWN_KEY) ?? "[]");
    return Array.isArray(a) ? a.filter((n) => Number.isInteger(n)) : [];
  } catch {
    return [];
  }
}
function save(xp: number, owned: number[]) {
  try {
    localStorage.setItem(XP_KEY, String(Math.max(0, Math.floor(xp))));
    localStorage.setItem(OWN_KEY, JSON.stringify(owned));
  } catch {
    /* storage unavailable: the wallet just won't persist */
  }
  try {
    window.dispatchEvent(new Event(EVT));
  } catch {
    /* ignore */
  }
}

export const loadWallet = (): Wallet => ({ xp: readXp(), owned: readOwned() });

/** add XP earned in a match (call exactly once per finished match) */
export function addXp(n: number) {
  if (!(n > 0)) return;
  save(readXp() + n, readOwned());
}

/** spend XP on a v2 car; false if it is already owned or the player can't afford it */
export function buyCar(id: number, price: number): boolean {
  const owned = readOwned();
  if (owned.includes(id)) return false;
  const xp = readXp();
  if (xp < price) return false;
  save(xp - price, [...owned, id]);
  return true;
}

/** live wallet for components; starts empty so server and first client render match */
export function useWallet() {
  const [w, setW] = useState<Wallet>({ xp: 0, owned: [] });
  useEffect(() => {
    const sync = () => setW(loadWallet());
    sync();
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const has = useCallback((id: number) => w.owned.includes(id), [w.owned]);
  return { ...w, has };
}

/** spend XP on something that isn't a car (pets); false if the player can't afford it */
export function spendXp(price: number): boolean {
  const xp = readXp();
  if (xp < price) return false;
  save(xp - price, readOwned());
  return true;
}
