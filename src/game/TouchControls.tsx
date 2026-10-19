import { useEffect, useRef, useState, type CSSProperties, type MutableRefObject } from "react";
import { Crosshair, Maximize2, RotateCw } from "lucide-react";
import { enterLandscape, type useControlPrefs } from "./device";

export type Joy = { x: number; y: number; on: boolean };
type Prefs = ReturnType<typeof useControlPrefs>;

type Props = {
  joy: MutableRefObject<Joy>;
  keys: MutableRefObject<Set<string>>;
  prefs: Prefs;
  /** key that the FIRE button holds down (the game's own fire key) */
  fireKey?: string;
};

/**
 * Landscape-phone controls for FFA / TDM: a floating joystick (drag anywhere in the left zone) and a big
 * FIRE button. Both work at the same time (multi-touch). Size and hand side come from the control prefs.
 */
export function TouchControls({ joy, keys, prefs, fireKey = " " }: Props) {
  const zoneRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const id = useRef<number | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null); // null = resting spot
  const [firing, setFiring] = useState(false);

  const release = () => {
    id.current = null;
    joy.current = { x: 0, y: 0, on: false };
    if (knobRef.current) knobRef.current.style.transform = "translate(0px, 0px)";
    setPos(null);
  };
  useEffect(
    () => () => {
      joy.current = { x: 0, y: 0, on: false };
      keys.current.delete(fireKey);
    },
    [joy, keys, fireKey],
  );

  const radius = () => (baseRef.current?.offsetWidth ?? 120) / 2;
  const down = (e: React.PointerEvent) => {
    if (id.current !== null) return;
    e.preventDefault();
    const z = zoneRef.current;
    if (!z) return;
    z.setPointerCapture(e.pointerId);
    id.current = e.pointerId;
    const r = z.getBoundingClientRect(),
      R = radius();
    // the stick appears under the thumb (kept fully inside the zone)
    const ox = Math.min(Math.max(e.clientX, r.left + R), r.right - R),
      oy = Math.min(Math.max(e.clientY, r.top + R), r.bottom - R);
    origin.current = { x: ox, y: oy };
    setPos({ x: ox - r.left, y: oy - r.top });
    move(e);
  };
  const move = (e: React.PointerEvent) => {
    if (id.current !== e.pointerId) return;
    const R = radius();
    let dx = e.clientX - origin.current.x,
      dy = e.clientY - origin.current.y;
    const m = Math.hypot(dx, dy);
    if (m > R) {
      dx = (dx / m) * R;
      dy = (dy / m) * R;
    }
    if (knobRef.current) knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
    joy.current = { x: dx / R, y: dy / R, on: true };
  };
  const up = (e: React.PointerEvent) => {
    if (id.current === e.pointerId) release();
  };

  const fire = {
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      keys.current.add(fireKey);
      setFiring(true);
      try {
        navigator.vibrate?.(10);
      } catch {
        /* no haptics */
      }
    },
    onPointerUp: () => {
      keys.current.delete(fireKey);
      setFiring(false);
    },
    onPointerCancel: () => {
      keys.current.delete(fireKey);
      setFiring(false);
    },
    onLostPointerCapture: () => {
      keys.current.delete(fireKey);
      setFiring(false);
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };

  return (
    <div
      className={`tc ${prefs.lefty ? "lefty" : ""}`}
      style={{ "--tc": prefs.size } as CSSProperties}
      aria-label="Touch controls"
    >
      <div
        ref={zoneRef}
        className="tc-zone"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div
          ref={baseRef}
          className={`tc-base ${pos ? "live" : ""}`}
          style={pos ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" } : undefined}
        >
          <div ref={knobRef} className="tc-knob" />
        </div>
      </div>
      <button type="button" className={`tc-fire ${firing ? "on" : ""}`} aria-label="Fire" {...fire}>
        <Crosshair size={26} />
        <span>FIRE</span>
      </button>
    </div>
  );
}

/** "turn your phone sideways" screen, shown (and the match paused) while a touch device is in portrait */
export function RotateOverlay() {
  return (
    <div className="rotate-overlay" role="alertdialog" aria-label="Rotate your device">
      <div className="win overlay-box">
        <div className="win-title">
          <span>LANDSCAPE ONLY</span>
        </div>
        <div className="win-body center">
          <RotateCw size={44} className="rotate-icon" />
          <h2 className="big-title">
            TURN YOUR
            <br />
            <em>PHONE SIDEWAYS</em>
          </h2>
          <p className="result-sub">THE MATCH IS PAUSED</p>
          <button
            type="button"
            className="arcade-btn alt-btn"
            onClick={() => void enterLandscape()}
          >
            <Maximize2 size={14} /> FULLSCREEN
          </button>
        </div>
      </div>
    </div>
  );
}

/** control size + left/right hand choice (shown in the pause menu on touch devices) */
export function ControlSettings({ prefs }: { prefs: Prefs }) {
  return (
    <div className="ctl-settings" aria-label="Control layout">
      <span className="ctl-title">CONTROLS</span>
      <div className="ctl-row">
        <span>SIZE</span>
        <button
          type="button"
          className="icon-btn"
          onClick={prefs.smaller}
          aria-label="Smaller controls"
        >
          −
        </button>
        <b>{prefs.sizeLabel}</b>
        <button
          type="button"
          className="icon-btn"
          onClick={prefs.bigger}
          aria-label="Bigger controls"
        >
          +
        </button>
      </div>
      <div className="ctl-row">
        <span>HAND</span>
        <button type="button" className="icon-btn wide" onClick={prefs.swapHands}>
          {prefs.lefty ? "LEFT-HANDED" : "RIGHT-HANDED"}
        </button>
      </div>
    </div>
  );
}
