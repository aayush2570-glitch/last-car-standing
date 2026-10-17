import { useEffect, useRef, useState, type MutableRefObject } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Play,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import { Race, RaceView, type RaceResult } from "./race";
import type { Sfx } from "./fx";
import { addXp } from "./xp";

type Props = {
  carIndex: number;
  /** player 2's car (2-player split screen) */
  carIndex2?: number;
  twoP?: boolean;
  onSetTwoP?: (on: boolean) => void;
  keys: MutableRefObject<Set<string>>;
  sfx: Sfx;
  muted: boolean;
  onToggleMute: () => void;
  onExit: () => void;
};

const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, "0")}`;

/** SPEED mode screen: canvas race + steering buttons for touch + result card. */
/** a Sfx stand-in that makes no sound, so player 2's race doesn't double every effect */
const silent = new Proxy({}, { get: () => () => {} }) as unknown as Sfx;

export function RaceMode({
  carIndex,
  carIndex2 = 0,
  twoP = false,
  onSetTwoP,
  keys,
  sfx,
  muted,
  onToggleMute,
  onExit,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvas2Ref = useRef<HTMLCanvasElement>(null);
  const twoRef = useRef(twoP);
  twoRef.current = twoP;
  const [res2, setRes2] = useState<RaceResult | null>(null);
  const touch = useRef({ l: false, r: false, n: false });
  const pausedRef = useRef(false);
  const [run, setRun] = useState(0);
  const [paused, setPaused] = useState(false);
  const [res, setRes] = useState<RaceResult | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const canvas2 = canvas2Ref.current;
    const ctx2 = canvas2?.getContext("2d") ?? null;
    // 2 players = ONE shared race: same road, same bots, both humans on the grid together.
    // Each player just gets their own camera (view) on it.
    const startedTwo = twoRef.current && !!canvas2 && !!ctx2;
    const shared = startedTwo ? new Race(carIndex, carIndex2) : null;
    const view = new RaceView(carIndex, shared ? { race: shared, who: 0 } : undefined);
    const view2 = shared ? new RaceView(carIndex2, { race: shared, who: 1 }) : null;
    if (view2) {
      view.tag = "P1";
      view2.tag = "P2";
    }
    let frame = 0,
      prev = performance.now(),
      shown = false,
      shown2 = false;
    const size = { w: 1, h: 1, w2: 1, h2: 1 };
    pausedRef.current = false;
    setPaused(false);
    setRes(null);
    setRes2(null);
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
      if (canvas2 && ctx2) [size.w2, size.h2] = fit(canvas2, ctx2);
    };
    resize();
    // the canvases change width when 2 PLAYER is switched OFF mid-race
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    ro?.observe(canvas);
    window.addEventListener("resize", resize);
    const loop = (now: number) => {
      const dt = Math.min((now - prev) / 1000, 0.04);
      prev = now;
      const k = keys.current;
      const two = twoRef.current;
      // player 1: arrows (or A D / W), SPACE = nitro · player 2: 4 / 6 steer, 8 or 0 = nitro
      const steer =
        (k.has("arrowright") || k.has("d") || touch.current.r ? 1 : 0) -
        (k.has("arrowleft") || k.has("a") || touch.current.l ? 1 : 0);
      const nitro =
        k.has(" ") || k.has("shift") || k.has("arrowup") || k.has("w") || touch.current.n;
      // 2 PLAYER switched off mid-race: player 2's car is handed over to the bot brain
      if (shared && !two && shared.me2) shared.me2 = undefined;
      if (shared) {
        shared.in2.steer = (k.has("6") ? 1 : 0) - (k.has("4") ? 1 : 0);
        shared.in2.nitro = k.has("8") || k.has("0");
      }
      if (!pausedRef.current) {
        view.update(dt, steer, nitro, sfx);
        // the race was just advanced by view 1; view 2 only reacts to what happened
        if (view2) view2.update(dt, 0, false, silent, false);
      }
      view.draw(ctx, size.w, size.h, now);
      if (view2 && ctx2 && two) view2.draw(ctx2, size.w2, size.h2, now);
      if (view.result && !shown) {
        shown = true;
        setRes(view.result);
        addXp(view.result.xp);
      }
      if (view2?.result && !shown2) {
        shown2 = true;
        setRes2(view2.result);
      }
      if (shown && (!view2 || !twoRef.current || shown2)) sfx.stopMusic();
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
  }, [carIndex, carIndex2, run, sfx, keys]);

  const togglePause = () => {
    const v = !pausedRef.current;
    pausedRef.current = v;
    setPaused(v);
    if (v) sfx.stopMusic();
    else sfx.startMusic();
  };

  // a pause / result pop-up is up: the centre line, key hints and top buttons get out of its way
  const modalOpen =
    (paused && !(res && (!twoP || res2))) || (twoP && !!res && !!res2) || (!twoP && !!res);

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
    <div className={`race-root ${twoP ? "two" : ""} ${modalOpen ? "modal-open" : ""}`}>
      <canvas ref={canvasRef} className="arena-canvas race-c1" aria-label="Speed race" />
      {twoP && (
        <canvas
          ref={canvas2Ref}
          className="arena-canvas race-c2"
          aria-label="Speed race player 2"
        />
      )}
      {twoP && <div className="race-divider" aria-hidden="true" />}
      <div className="crt" aria-hidden="true" />
      {twoP &&
        [0, 1].map((pi) => {
          const r = pi ? res2 : res;
          return (
            <div className={`tp-pane pane-${pi}`} key={pi}>
              <div className="tp-head">
                <span className="tp-who">PLAYER {pi + 1}</span>
                <button
                  type="button"
                  className="twop-toggle on"
                  role="switch"
                  aria-checked={true}
                  aria-label="2 player split screen"
                  onClick={() => onSetTwoP?.(false)}
                >
                  <Users size={12} /> 2 PLAYER <b>ON</b>
                </button>
              </div>
              {r && !(res && res2) && (
                <div className="tp-respawn" role="status">
                  <span>
                    FINISHED #{r.pos} · {fmt(r.time)}
                  </span>
                  <small>WAITING FOR PLAYER {pi ? 1 : 2}…</small>
                </div>
              )}
              <div className="tp-foot">
                <p className="tp-keys">
                  {pi === 0 ? (
                    <>
                      <kbd>←</kbd>
                      <kbd>→</kbd> STEER · <kbd>↑</kbd>/<kbd>SPACE</kbd> NITRO
                    </>
                  ) : (
                    <>
                      <kbd>4</kbd> LEFT · <kbd>6</kbd> RIGHT · <kbd>8</kbd>/<kbd>0</kbd> NITRO
                    </>
                  )}
                </p>
              </div>
            </div>
          );
        })}
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
      {!res && !twoP && (
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
          <p className="race-tip">
            ← → / A D STEER · HOLD SPACE FOR NITRO · GRAB BLUE CANISTERS · MINES & TRUCKS BLOW YOU
            UP
          </p>
        </>
      )}
      {paused && !(res && (!twoP || res2)) && (
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
      {twoP && res && res2 && (
        <div className="overlay">
          <div className="win overlay-box two-result">
            <div className="win-title">
              <span>
                <Trophy size={13} /> RACE COMPLETE
              </span>
            </div>
            <div className="win-body center">
              {(() => {
                // same road for both, so the faster clock wins
                const w =
                  res.time !== res2.time
                    ? res.time < res2.time
                      ? 1
                      : 2
                    : res.pos <= res2.pos
                      ? 1
                      : 2;
                return (
                  <h1 className="big-title">
                    PLAYER {w}
                    <br />
                    <em>WINS!</em>
                  </h1>
                );
              })()}
              <div className="two-cols">
                {[res, res2].map((r, i) => (
                  <div className="two-col" key={i}>
                    <b className="team-who">PLAYER {i + 1}</b>
                    <div className="result-stats one">
                      <div>
                        <span>PLACE</span>
                        <b>#{r.pos}</b>
                      </div>
                      <div>
                        <span>TIME</span>
                        <b style={{ fontSize: 11 }}>{fmt(r.time)}</b>
                      </div>
                      <div>
                        <span>TOP KM/H</span>
                        <b>{r.top}</b>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
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
      {res && !twoP && (
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
    </div>
  );
}
