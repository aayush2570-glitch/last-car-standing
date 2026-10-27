import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronLeft, ChevronRight, PawPrint, X } from "lucide-react";
import {
  CAT_BLINK_ROWS,
  CAT_CELL_H,
  CAT_CELL_W,
  CAT_COLS,
  CAT_DOWN,
  CAT_SHEET,
  PETS,
  buyPet,
  petCost,
  catBlink,
  catFacing,
  equipPet,
  petOf,
  usePets,
  type PetKind,
} from "./pets";
import { allCars, carAt } from "./cars";
import { useWallet } from "./xp";
/** Catnya in the preview is drawn this many times bigger than one sheet cell */
const CAT_PREVIEW = 0.45;

const fmt = (n: number) => n.toLocaleString("en-US");

/** PETS button (between MISSIONS and ADD FRIENDS) + the full-screen pet shop / preview */
export function PetsButton({ carId }: { carId: number }) {
  const [open, setOpen] = useState(false);
  const [car, setCar] = useState(carId);
  const [view, setView] = useState<PetKind>("redfly");
  const flyRef = useRef<HTMLDivElement>(null);
  const catRef = useRef<HTMLDivElement>(null);
  const { xp } = useWallet();
  const { sel, has, pending } = usePets();
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
  /* the pet circles the car. Flying pets turn their face along the path (sprite faces down); Catnya walks it with her 4-way walk cycle */
  useEffect(() => {
    if (!open) return;
    let raf = 0,
      last = performance.now(),
      t = 0,
      ang = 0,
      dir = CAT_DOWN,
      ph = 0;
    const cc = carAt(car);
    // Catnya walks a true circle around the car (outside its body); flying pets keep the looping path
    const rx = (cc.h * 1.7) / 2 + 28,
      ry = (cc.w * 1.7) / 2 + (CAT_CELL_H * CAT_PREVIEW) / 2 - 6;
    const pos = (u: number): [number, number] =>
      view === "catnya"
        ? [Math.cos(u) * rx, Math.sin(u) * ry]
        : [Math.cos(u) * 95, Math.sin(u * 1.3) * 62];
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt * (view === "catnya" ? 0.8 : 1);
      const [x, y] = pos(t);
      const [x2, y2] = pos(t + 0.05);
      if (view === "catnya") {
        dir = catFacing(x2 - x, y2 - y, dir);
        ph = (ph + dt * 9) % CAT_COLS;
        const el = catRef.current;
        if (el) {
          const dw = CAT_CELL_W * CAT_PREVIEW,
            dh = CAT_CELL_H * CAT_PREVIEW;
          el.style.transform = `translate(${x - dw / 2}px,${y - dh / 2}px)`;
          el.style.backgroundPosition = `${-Math.floor(ph) * dw}px ${-(dir + (catBlink(t, 0) ? CAT_BLINK_ROWS : 0)) * dh}px`;
        }
      } else {
        const aim = Math.atan2(y2 - y, x2 - x);
        let d = aim - ang;
        d -= Math.PI * 2 * Math.floor((d + Math.PI) / (Math.PI * 2));
        ang += d * Math.min(1, dt * 8);
        const el = flyRef.current;
        if (el) el.style.transform = `translate(${x}px,${y}px) rotate(${ang - Math.PI / 2}rad)`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [open, view, car]);
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
              <div className="pet-scene">
                <div className="pet-rig">
                  <img
                    className="pet-car"
                    src={c.url}
                    alt={c.name}
                    style={{ width: c.w * 1.7, height: c.h * 1.7 }}
                  />
                  {pet.kind === "catnya" ? (
                    <div
                      className="pet-cat"
                      ref={catRef}
                      role="img"
                      aria-label={pet.name}
                      style={{
                        width: CAT_CELL_W * CAT_PREVIEW,
                        height: CAT_CELL_H * CAT_PREVIEW,
                        backgroundImage: `url(${CAT_SHEET})`,
                        backgroundSize: `${CAT_COLS * CAT_CELL_W * CAT_PREVIEW}px ${2 * CAT_BLINK_ROWS * CAT_CELL_H * CAT_PREVIEW}px`,
                      }}
                    />
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
                        disabled={xp < petCost(p.kind)}
                        onClick={(e) => {
                          e.stopPropagation();
                          buyPet(p.kind);
                        }}
                      >
                        {pending.includes(p.kind)
                          ? `PAY ${fmt(petCost(p.kind))} XP MORE`
                          : `BUY · ${fmt(p.price)} XP`}
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
