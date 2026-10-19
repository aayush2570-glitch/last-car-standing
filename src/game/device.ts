import { useCallback, useEffect, useState } from "react";

/**
 * Screen + input detector.
 *  - input: what the player is using RIGHT NOW. "touch" until a mouse/pen/keyboard is used, then "mouse";
 *    it flips back the moment a finger touches the screen (laptops with a touch screen, tablets with a keyboard).
 *  - landscape / w / h / short: the live screen shape, so the UI can adapt and ask for landscape.
 */
export type InputKind = "touch" | "mouse";
export type Device = {
  input: InputKind;
  /** the device has a touch screen at all */
  touchCapable: boolean;
  landscape: boolean;
  w: number;
  h: number;
  /** a short screen (phone in landscape): HUD and controls shrink */
  short: boolean;
  fullscreen: boolean;
};

const mq = (q: string) => {
  try {
    return typeof matchMedia === "function" && matchMedia(q).matches;
  } catch {
    return false;
  }
};
const detectTouch = () =>
  typeof navigator !== "undefined" &&
  ((navigator.maxTouchPoints ?? 0) > 0 || mq("(any-pointer: coarse)") || mq("(pointer: coarse)"));

/** starts as a desktop (server and first client render match), then fills in on mount */
const initial: Device = {
  input: "mouse",
  touchCapable: false,
  landscape: true,
  w: 1280,
  h: 720,
  short: false,
  fullscreen: false,
};

export function useDevice(): Device {
  const [d, setD] = useState<Device>(initial);
  useEffect(() => {
    const touchCapable = detectTouch();
    const read = (input?: InputKind): Device => {
      const vv = window.visualViewport;
      const w = Math.round(vv?.width ?? window.innerWidth),
        h = Math.round(vv?.height ?? window.innerHeight);
      return {
        input: input ?? (mq("(pointer: coarse)") ? "touch" : "mouse"),
        touchCapable,
        landscape: w >= h,
        w,
        h,
        short: Math.min(w, h) < 500,
        fullscreen: !!document.fullscreenElement,
      };
    };
    setD(read());
    const update = () => setD((p) => ({ ...read(p.input) }));
    const setInput = (input: InputKind) => setD((p) => (p.input === input ? p : { ...p, input }));
    const onPointer = (e: PointerEvent) => setInput(e.pointerType === "touch" ? "touch" : "mouse");
    const onKey = () => setInput("mouse");
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    window.visualViewport?.addEventListener("resize", update);
    document.addEventListener("fullscreenchange", update);
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("pointermove", onPointer, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      window.visualViewport?.removeEventListener("resize", update);
      document.removeEventListener("fullscreenchange", update);
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("pointermove", onPointer, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, []);
  return d;
}

/** Fullscreen + landscape lock (needs a tap/click to be allowed; every part is best effort). */
export async function enterLandscape() {
  try {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) await el.requestFullscreen();
  } catch {
    /* not allowed here (iPhone Safari, iframes...) */
  }
  try {
    const o = screen.orientation as unknown as { lock?: (o: string) => Promise<void> };
    await o?.lock?.("landscape");
  } catch {
    /* orientation lock is only allowed in fullscreen / installed apps */
  }
}

/* ── control layout the player can adjust (size + left/right hand), kept on this device ── */
const CTL_KEY = "lcs.ctl";
const CTL_EVT = "lcs-ctl";
export type CtlPrefs = { size: number; lefty: boolean };
const SIZES = [0.8, 1, 1.25] as const;
const readPrefs = (): CtlPrefs => {
  try {
    const o = JSON.parse(localStorage.getItem(CTL_KEY) ?? "{}");
    const size = SIZES.includes(o.size) ? (o.size as number) : 1;
    return { size, lefty: !!o.lefty };
  } catch {
    return { size: 1, lefty: false };
  }
};

export function useControlPrefs() {
  const [p, setP] = useState<CtlPrefs>({ size: 1, lefty: false });
  useEffect(() => {
    const sync = () => setP(readPrefs());
    sync();
    window.addEventListener(CTL_EVT, sync);
    return () => window.removeEventListener(CTL_EVT, sync);
  }, []);
  const save = useCallback((n: CtlPrefs) => {
    try {
      localStorage.setItem(CTL_KEY, JSON.stringify(n));
    } catch {
      /* storage unavailable: the setting just won't persist */
    }
    setP(n);
    try {
      window.dispatchEvent(new Event(CTL_EVT));
    } catch {
      /* ignore */
    }
  }, []);
  const bigger = useCallback(() => {
    const i = SIZES.indexOf(p.size as (typeof SIZES)[number]);
    save({ ...p, size: SIZES[Math.min(SIZES.length - 1, i + 1)] as number });
  }, [p, save]);
  const smaller = useCallback(() => {
    const i = SIZES.indexOf(p.size as (typeof SIZES)[number]);
    save({ ...p, size: SIZES[Math.max(0, i - 1)] as number });
  }, [p, save]);
  const swapHands = useCallback(() => save({ ...p, lefty: !p.lefty }), [p, save]);
  const sizeLabel = p.size < 1 ? "S" : p.size > 1 ? "L" : "M";
  return { ...p, bigger, smaller, swapHands, sizeLabel };
}
