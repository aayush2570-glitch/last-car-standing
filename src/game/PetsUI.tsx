import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronLeft, ChevronRight, Gauge, PawPrint, Square, X } from "lucide-react";
import { PETS, buyPet, catHood, equipPet, petOf, usePets, type PetKind } from "./pets";
import { allCars, carAt } from "./cars";
import { useWallet } from "./xp";
import tiresImg from "@/assets/race/tires.webp";
import drumImg from "@/assets/race/drum.webp";
import cratesImg from "@/assets/race/crates.webp";

/* roadside race props that scroll past behind the car while it drives (two lanes, different order/speed) */
const TRACK_TOP = [tiresImg, drumImg, cratesImg, drumImg, tiresImg];
const TRACK_BOT = [cratesImg, tiresImg, drumImg, cratesImg, tiresImg];
const Lane = ({ items, cls }: { items: string[]; cls: string }) => (
  <div className={`pet-lane ${cls}`}>
    {[0, 1].map((k) => (
      <div className="pet-lane-set" key={k} aria-hidden="true">
        {items.map((u, i) => (
          <img key={i} src={u} alt="" />
        ))}
      </div>
    ))}
  </div>
);

const fmt = (n: number) => n.toLocaleString("en-US");

/** PETS button (between MISSIONS and ADD FRIENDS) + the full-screen pet shop / preview */
export function PetsButton({ carId }: { carId: number }) {
  const [open, setOpen] = useState(false);
  const [car, setCar] = useState(carId);
  const [view, setView] = useState<PetKind>("redfly");
  const [driving, setDriving] = useState(false);
  const flyRef = useRef<HTMLDivElement>(null);
  const { xp } = useWallet();
  const { sel, has } = usePets();
  useEffect(() => {
    if (!open) return;
    setCar(carId);
    setView(sel ?? "redfly");
    const keys = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      else e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", keys, true);
    return () => window.removeEventListener("keydown", keys, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  /* the pet circles the car and turns its face along where it flies (sprite faces down) */
  useEffect(() => {
    if (!open) return;
    let raf = 0,
      last = performance.now(),
      t = 0,
      ang = 0;
    const pos = (u: number): [number, number] => [Math.cos(u) * 95, Math.sin(u * 1.3) * 62];
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt * (driving ? 1.5 : 1);
      const [x, y] = pos(t);
      const [x2, y2] = pos(t + 0.05);
      const aim = Math.atan2(y2 - y, x2 - x);
      let d = aim - ang;
      d -= Math.PI * 2 * Math.floor((d + Math.PI) / (Math.PI * 2));
      ang += d * Math.min(1, dt * 8);
      const el = flyRef.current;
      if (el) el.style.transform = `translate(${x}px,${y}px) rotate(${ang - Math.PI / 2}rad)`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [open, driving]);
  const c = carAt(car);
  const pet = petOf(view)!;
  const step = (d: number) => setCar((i) => (i + d + allCars.length) % allCars.length);
  return (
    <>
      <button type="button" className="pet-btn" onClick={() => setOpen(true)}>
        <PawPrint size={14} /> PETS
      </button>
      {open &&
        createPortal(
          <div className="pet-screen" role="dialog" aria-modal="true" aria-label="Pets">
            <div className="pet-head">
              <h2>PETS</h2>
              <span className="credit">
                XP <b>{fmt(xp)}</b>
              </span>
              <button
                type="button"
                className="msn-x"
                onClick={() => setOpen(false)}
                aria-label="Close pets"
              >
                <X size={16} />
              </button>
            </div>
            <div className="pet-stage">
              <button
                type="button"
                className="pet-arrow"
                onClick={() => step(-1)}
                aria-label="Previous car"
              >
                <ChevronLeft size={20} />
              </button>
              <div className={`pet-scene ${driving ? "drive" : ""}`}>
                <div className="pet-track" aria-hidden="true">
                  <Lane items={TRACK_TOP} cls="top" />
                  <div className="pet-dashes" />
                  <Lane items={TRACK_BOT} cls="bot" />
                </div>
                <div className="pet-rig">
                  <img
                    className="pet-car"
                    src={c.url}
                    alt={c.name}
                    style={{ width: c.w * 1.7, height: c.h * 1.7 }}
                  />
                  {pet.kind === "catnya" ? (
                    <div
                      className="pet-hood"
                      style={{
                        width: (c.h * 1.7 * catHood(car, c.h).ch) / 1.37,
                        left: `${c.h * 1.7 * (0.5 - catHood(car, c.h).y)}px`,
                      }}
                    >
                      <img src={pet.url} alt={pet.name} />
                      <i className="eye l" />
                      <i className="eye r" />
                    </div>
                  ) : (
                    <div className="pet-fly" ref={flyRef}>
                      <img src={pet.url} alt={pet.name} />
                    </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                className="pet-arrow"
                onClick={() => step(1)}
                aria-label="Next car"
              >
                <ChevronRight size={20} />
              </button>
            </div>
            <div className="pet-info" style={{ borderColor: pet.color }}>
              <img src={pet.url} alt="" />
              <div>
                <b style={{ color: pet.color }}>{pet.name}</b>
                <small>{pet.blurb}</small>
              </div>
            </div>
            <div className="pet-carbar">
              <span className="pet-carname">{c.name}</span>
              <span className="pet-count">
                {car + 1} / {allCars.length}
              </span>
            </div>
            <button
              type="button"
              className={`pet-drive ${driving ? "on" : ""}`}
              onClick={() => setDriving((d) => !d)}
            >
              {driving ? <Square size={12} /> : <Gauge size={14} />}
              {driving ? "STOP CAR" : "DRIVE CAR"}
            </button>
            <div className="pet-list">
              {PETS.map((p) => {
                const owned = has(p.kind);
                const on = sel === p.kind;
                return (
                  <div
                    key={p.kind}
                    className={`pet-card ${view === p.kind ? "active" : ""}`}
                    onClick={() => setView(p.kind)}
                    style={{ borderColor: view === p.kind ? p.color : "#000" }}
                  >
                    <img src={p.url} alt="" />
                    {p.limited && <em className="pet-limited">{p.limited}</em>}
                    {owned && (
                      <i className="pet-own">
                        <Check size={11} /> OWNED
                      </i>
                    )}
                    <b style={{ color: p.color }}>{p.name}</b>
                    <span>{p.blurb}</span>
                    {owned ? (
                      <button
                        type="button"
                        className={`pet-act ${on ? "on" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          equipPet(on ? null : p.kind);
                        }}
                      >
                        {on ? "EQUIPPED" : "EQUIP"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="pet-act buy"
                        disabled={xp < p.price}
                        onClick={(e) => {
                          e.stopPropagation();
                          buyPet(p.kind);
                        }}
                      >
                        BUY · {fmt(p.price)} XP
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
