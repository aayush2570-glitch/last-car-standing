import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { ChevronLeft, ChevronRight, Play, Trophy, Volume2, VolumeX } from "lucide-react";
import { RaceView, type RaceResult } from "./race";
import type { Sfx } from "./fx";

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const touch = useRef({ l: false, r: false });
  const pausedRef = useRef(false);
  const [run, setRun] = useState(0);
  const [paused, setPaused] = useState(false);
  const [res, setRes] = useState<RaceResult | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const view = new RaceView(carIndex);
    let w = 1,
      h = 1,
      frame = 0,
      prev = performance.now(),
      shown = false;
    pausedRef.current = false;
    setPaused(false);
    setRes(null);
    sfx.unlock();
    sfx.startMusic();
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const k = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, r.width);
      h = Math.max(1, r.height);
      canvas.width = Math.round(w * k);
      canvas.height = Math.round(h * k);
      ctx.setTransform(k, 0, 0, k, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);
    const loop = (now: number) => {
      const dt = Math.min((now - prev) / 1000, 0.04);
      prev = now;
      const k = keys.current;
      const steer =
        (k.has("arrowright") || k.has("d") || touch.current.r ? 1 : 0) -
        (k.has("arrowleft") || k.has("a") || touch.current.l ? 1 : 0);
      if (!pausedRef.current) view.update(dt, steer, sfx);
      view.draw(ctx, w, h, now);
      if (view.result && !shown) {
        shown = true;
        sfx.stopMusic();
        setRes(view.result);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "Escape" || e.key.toLowerCase() === "p") && !shown) togglePause();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
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

  const hold = (side: "l" | "r") => ({
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
    <div className="race-root">
      <canvas ref={canvasRef} className="arena-canvas" aria-label="Speed race" />
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
          <p className="race-tip">← → / A D TO STEER · HIT TOP SPEED FOR FIRE · DODGE EVERYTHING</p>
        </>
      )}
      {paused && !res && (
        <div className="overlay">
          <div className="win overlay-box">
            <div className="win-title">
              <span>PAUSED</span>
            </div>
            <div className="win-body center">
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
                {res.near} NEAR MISSES · {res.hits} CRASHES
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
    </div>
  );
}
