import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, PawPrint, X } from "lucide-react";
import { PETS, buyPet, equipPet, petOf, usePets, type PetKind } from "./pets";
import { carAt, cars } from "./cars";
import { useWallet } from "./xp";

const fmt = (n: number) => n.toLocaleString("en-US");

/** PETS button (between MISSIONS and ADD FRIENDS) + the full-screen pet shop / preview */
export function PetsButton({ carId }: { carId: number }) {
  const [open, setOpen] = useState(false);
  const [car, setCar] = useState(carId);
  const [view, setView] = useState<PetKind>("redfly");
  const [driving, setDriving] = useState(false);
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
  const c = carAt(car);
  const pet = petOf(view)!;
  const step = (d: number) => setCar((i) => (i + d + cars.length) % cars.length);
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
                <div className="pet-ground" />
                <img
                  className="pet-car"
                  src={c.url}
                  alt={c.name}
                  style={{ width: c.w * 1.7, height: c.h * 1.7 }}
                />
                <img className="pet-fly" src={pet.url} alt={pet.name} />
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
            <p className="pet-carname">{c.name}</p>
            <button type="button" className="pet-drive" onClick={() => setDriving((d) => !d)}>
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
