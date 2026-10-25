import { useEffect, useState } from "react";
import { Check, Target, X } from "lucide-react";
import { DONE_EVT, defOf, useMissions } from "./missions";

const fmt = (n: number) => n.toLocaleString("en-US");
const clock = (ms: number) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(t / 3600))}:${p(Math.floor((t % 3600) / 60))}:${p(t % 60)}`;
};

/** MISSIONS button (top centre of the home screen) + the 3-mission panel with the 24h countdown */
export function MissionsButton() {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const { state, refresh } = useMissions();
  useEffect(() => {
    if (!open) return;
    const tick = setInterval(() => {
      setNow(Date.now());
      refresh(); // rolls a new set once the timer is over
    }, 1000);
    // while the panel is open the garage keys must not drive the game behind it
    const keys = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      else e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", keys, true);
    return () => {
      clearInterval(tick);
      window.removeEventListener("keydown", keys, true);
    };
  }, [open, refresh]);
  return (
    <>
      <button type="button" className="msn-btn" onClick={() => setOpen(true)}>
        <Target size={14} /> MISSIONS
      </button>
      {open && state && (
        <div
          className="msn-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Missions"
          onClick={() => setOpen(false)}
        >
          <div className="msn-panel" onClick={(e) => e.stopPropagation()}>
            <div className="msn-head">
              <h2>MISSIONS</h2>
              <button
                type="button"
                className="msn-x"
                onClick={() => setOpen(false)}
                aria-label="Close missions"
              >
                <X size={16} />
              </button>
            </div>
            <p className="msn-timer">
              NEW MISSIONS IN <b>{clock(state.exp - now)}</b>
            </p>
            {state.list.map((m) => {
              const d = defOf(m.id);
              if (!d) return null;
              const pct = Math.min(100, Math.round((m.p / d.target) * 100));
              return (
                <div className={`msn-row ${m.done ? "msn-done" : ""}`} key={m.id}>
                  <div className="msn-top">
                    <b>{d.name}</b>
                    <em>+{fmt(d.xp)} XP</em>
                  </div>
                  <span className="msn-desc">{d.desc}</span>
                  <div
                    className="msn-bar"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={d.target}
                    aria-valuenow={m.p}
                  >
                    <i style={{ width: `${pct}%` }} />
                  </div>
                  <span className="msn-prog">
                    {m.done ? "COMPLETED" : `${m.p}/${d.target}${d.unit ? ` ${d.unit}` : ""}`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

/** "mission complete" pop-ups: a tick, the mission name and its XP, then they fade away (works in-match too) */
export function MissionToasts() {
  const [list, setList] = useState<{ k: number; name: string; xp: number }[]>([]);
  useEffect(() => {
    let k = 0;
    const on = (e: Event) => {
      const { name, xp } = (e as CustomEvent).detail as { name: string; xp: number };
      const id = ++k;
      setList((l) => [...l, { k: id, name, xp }]);
      setTimeout(() => setList((l) => l.filter((x) => x.k !== id)), 3800);
    };
    window.addEventListener(DONE_EVT, on);
    return () => window.removeEventListener(DONE_EVT, on);
  }, []);
  return (
    <div className="msn-toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div className="msn-toast" key={t.k}>
          <span className="msn-tick">
            <Check size={18} strokeWidth={4} />
          </span>
          <span>
            <b>{t.name}</b>
            <small>MISSION COMPLETE +{fmt(t.xp)} XP</small>
          </span>
        </div>
      ))}
    </div>
  );
}
