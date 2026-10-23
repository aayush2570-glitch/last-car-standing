import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { ChevronLeft, ChevronRight, Play, Trophy, Volume2, VolumeX, Zap } from "lucide-react";
import { RaceView, type RaceResult } from "./race";
import type { Sfx } from "./fx";
import { addXp } from "./xp";
import { mEnd, mStart } from "./missions";
import { useControlPrefs, useDevice } from "./device";
import { ControlSettings, RotateOverlay } from "./TouchControls";

type Props = {
  carIndex: number;
  keys: MutableRefObject<Set<string>>;
  sfx: Sfx;
  muted: boolean;
  onToggleMute: () => void;
  onExit: () => void;
};

const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, "0")}`;

/** SPEED mode screen: canvas race + steering buttons for touch + result card. */
export function RaceMode({ carIndex, keys, sfx, muted, onToggleMute, onExit }: Props) {
  const dev = useDevice();
  const ctl = useControlPrefs();
  const touchUi = dev.input === "touch";
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const touch = useRef({ l: false, r: false, n: false });
  const pausedRef = useRef(false);
  const [run, setRun] = useState(0);
  const [paused, setPaused] = useState(false);
  const [res, setRes] = useState<RaceResult | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const view = new RaceView(carIndex);
    mStart("race", carIndex);
    let frame = 0,
      prev = performance.now(),
      shown = false;
    const size = { w: 1, h: 1 };
    pausedRef.current = false;
    setPaused(false);
    setRes(null);
    sfx.unlock();
    sfx.startMusic();
    const fit = (c: HTMLCanvasElement, g: CanvasRenderingContext2D) => {
      const r = c.getBoundingClientRect();
      const k = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, r.width),
        h = Math.max(1, r.height);
      c.width = Math.round(w * k);
      c.height = Math.round(h * k);
      g.setTransform(k, 0, 0, k, 0, 0);
      return [w, h] as const;
    };
    const resize = () => {
      [size.w, size.h] = fit(canvas, ctx);
    };
    resize();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    ro?.observe(canvas);
    window.addEventListener("resize", resize);
    const loop = (now: number) => {
      const dt = Math.min((now - prev) / 1000, 0.04);
      prev = now;
      const k = keys.current;
      // arrows (or A D / W) steer, SPACE (or up / W / shift) = nitro
      const steer =
        (k.has("arrowright") || k.has("d") || touch.current.r ? 1 : 0) -
        (k.has("arrowleft") || k.has("a") || touch.current.l ? 1 : 0);
      const nitro =
        k.has(" ") || k.has("shift") || k.has("arrowup") || k.has("w") || touch.current.n;
      if (!pausedRef.current) view.update(dt, steer, nitro, sfx);
      view.draw(ctx, size.w, size.h, now);
      if (view.result && !shown) {
        shown = true;
        setRes(view.result);
        addXp(view.result.xp);
        mEnd({
          mode: "race",
          won: view.result.pos === 1,
          top3: view.result.pos <= 3,
          race: { nitros: view.result.nitros, near: view.result.near, blasts: view.result.blasts },
        });
      }
      if (shown) sfx.stopMusic();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "Escape" || e.key.toLowerCase() === "p") && !shown) togglePause();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      ro?.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKey);
      sfx.stopMusic();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carIndex, run, sfx, keys]);

  const togglePause = () => {
    const v = !pausedRef.current;
    pausedRef.current = v;
    setPaused(v);
    if (v) sfx.stopMusic();
    else sfx.startMusic();
  };

  // a pause / result pop-up is up: the centre line, key hints and top buttons get out of its way
  const modalOpen = paused || !!res;

  // a touch device held upright: pause the race and ask for landscape
  const needRotate = touchUi && !dev.landscape && !res;
  useEffect(() => {
    if (needRotate && !pausedRef.current) {
      pausedRef.current = true;
      setPaused(true);
      sfx.stopMusic();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needRotate]);

  const hold = (side: "l" | "r" | "n") => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      sfx.unlock();
      touch.current[side] = true;
    },
    onPointerUp: () => (touch.current[side] = false),
    onPointerLeave: () => (touch.current[side] = false),
    onPointerCancel: () => (touch.current[side] = false),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  return (
    <div
      className={`race-root input-${dev.input} ${ctl.lefty ? "lefty" : ""} ${dev.short ? "short" : ""} ${modalOpen ? "modal-open" : ""}`}
      style={{ "--tc": ctl.size } as React.CSSProperties}
    >
      <canvas ref={canvasRef} className="arena-canvas race-c1" aria-label="Speed race" />
      <div className="crt" aria-hidden="true" />
      <div className="race-top">
        <button
          type="button"
          className="icon-btn"
          onClick={onToggleMute}
          aria-label={muted ? "Unmute" : "Mute"}
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
      {!res && (
        <>
          <button type="button" className="steer-btn left" aria-label="Steer left" {...hold("l")}>
            <ChevronLeft size={38} />
          </button>
          <button type="button" className="steer-btn right" aria-label="Steer right" {...hold("r")}>
            <ChevronRight size={38} />
          </button>
          <button type="button" className="steer-btn nitro-btn" aria-label="Nitro" {...hold("n")}>
            <Zap size={34} />
          </button>
          <p className="race-tip" hidden={touchUi}>
            ← → / A D STEER · HOLD SPACE FOR NITRO · GRAB BLUE CANISTERS · MINES & TRUCKS BLOW YOU
            UP
          </p>
        </>
      )}
      {paused && !res && (
        <div className="overlay">
          <div className="win overlay-box">
            <div className="win-title">
              <span>PAUSED</span>
            </div>
            <div className="win-body center">
              {touchUi && <ControlSettings prefs={ctl} />}
              <button type="button" className="arcade-btn start-btn" onClick={togglePause}>
                <Play size={16} /> RESUME
              </button>
              <button type="button" className="arcade-btn alt-btn" onClick={onExit}>
                QUIT TO GARAGE
              </button>
            </div>
          </div>
        </div>
      )}
      {res && (
        <div className="overlay">
          <div className="win overlay-box">
            <div className="win-title">
              <span>
                <Trophy size={13} /> RACE COMPLETE
              </span>
            </div>
            <div className="win-body center">
              <h1 className="big-title">
                {res.pos === 1 ? (
                  <>
                    YOU
                    <br />
                    <em>WIN!</em>
                  </>
                ) : (
                  <>
                    FINISHED
                    <br />
                    <em>#{res.pos}</em>
                  </>
                )}
              </h1>
              <p className="result-sub">
                {res.pos === 1
                  ? "FASTEST CAR ON THE ROAD."
                  : res.pos <= 3
                    ? "PODIUM! ONE MORE RUN?"
                    : "FLOOR IT NEXT TIME."}
              </p>
              <div className="result-stats">
                <div>
                  <span>TIME</span>
                  <b style={{ fontSize: 11 }}>{fmt(res.time)}</b>
                </div>
                <div>
                  <span>TOP KM/H</span>
                  <b>{res.top}</b>
                </div>
                <div>
                  <span>XP</span>
                  <b>+{res.xp}</b>
                </div>
              </div>
              <p className="result-sub">
                {res.near} NEAR MISSES · {res.hits} CRASHES · {res.blasts} WRECKS · {res.nitros}{" "}
                NITRO
              </p>
              <button
                type="button"
                className="arcade-btn start-btn"
                onClick={() => setRun((n) => n + 1)}
              >
                <Play size={16} /> RACE AGAIN
              </button>
              <button type="button" className="arcade-btn alt-btn" onClick={onExit}>
                BACK TO GARAGE
              </button>
            </div>
          </div>
        </div>
      )}
      {needRotate && <RotateOverlay />}
    </div>
  );
}
