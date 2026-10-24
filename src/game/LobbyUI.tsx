import { useEffect, useRef, useState } from "react";
import { Copy, LogOut, Users } from "lucide-react";
import { carAt } from "./cars";
import { MAX_PLAYERS, normalizeCode, type LobbyState } from "./lobby";

/** green "ADD FRIENDS" button, turns into a red "LEAVE LOBBY" once you are in a room */
export function FriendsButton({
  inLobby,
  onOpen,
  onLeave,
}: {
  inLobby: boolean;
  onOpen: () => void;
  onLeave: () => void;
}) {
  return inLobby ? (
    <button type="button" className="friends-btn leave" onClick={onLeave}>
      <LogOut size={13} /> LEAVE LOBBY
    </button>
  ) : (
    <button type="button" className="friends-btn" onClick={onOpen}>
      <Users size={13} /> ADD FRIENDS
    </button>
  );
}

/** pop-up with the two choices: make a new room code, or type a friend's code */
export function FriendsModal({
  busy,
  error,
  onGenerate,
  onJoin,
  onClose,
}: {
  busy: boolean;
  error: string;
  onGenerate: () => void;
  onJoin: (code: string) => void;
  onClose: () => void;
}) {
  const [code, setCode] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const ready = code.length === 4 && !busy;
  return (
    <div className="overlay" onClick={() => !busy && onClose()}>
      <div
        className="win overlay-box friends-box"
        role="dialog"
        aria-label="Add friends"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="win-title">
          <span>
            <Users size={13} /> ADD FRIENDS
          </span>
        </div>
        <div className="win-body center">
          <button
            type="button"
            className="arcade-btn friends-go"
            disabled={busy}
            onClick={onGenerate}
          >
            {busy ? "WORKING…" : "GENERATE NEW CODE"}
            <small>HOST A ROOM · UP TO 4 PLAYERS</small>
          </button>
          <div className="friends-or" aria-hidden="true">
            — OR —
          </div>
          <label className="friends-label" htmlFor="room-code">
            ENTER A FRIEND'S CODE
          </label>
          <input
            id="room-code"
            ref={ref}
            className="friends-input"
            value={code}
            maxLength={4}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="K7QD"
            aria-label="Room code"
            onChange={(e) => setCode(normalizeCode(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && ready) onJoin(code);
            }}
          />
          <button
            type="button"
            className="arcade-btn alt-btn"
            disabled={!ready}
            onClick={() => onJoin(code)}
          >
            JOIN ROOM
          </button>
          {error && (
            <p className="friends-err" role="alert">
              {error}
            </p>
          )}
          <button type="button" className="friends-close" disabled={busy} onClick={onClose}>
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** the room on the home screen: its code and Player 1 (host), Player 2 ... */
export function LobbyCard({
  lobby,
  map = "yard",
  onMap,
  onStart,
}: {
  lobby: LobbyState;
  map?: "yard" | "garage";
  onMap?: (m: "yard" | "garage") => void;
  onStart?: (kind: "ffa" | "tdm") => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (lobby.expiresAt == null) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [lobby.expiresAt]);
  const copy = () => {
    try {
      void navigator.clipboard?.writeText(lobby.code).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      });
    } catch {
      /* clipboard not available: the code is on screen anyway */
    }
  };
  return (
    <aside className="win lobby-card" aria-label="Lobby" aria-live="polite">
      <div className="win-title">
        <span>
          <Users size={12} /> LOBBY · {lobby.players.length}/{MAX_PLAYERS}
        </span>
      </div>
      <div className="lobby-body">
        <div className="lobby-code-row">
          <span className="lobby-code" aria-label={`Room code ${lobby.code.split("").join(" ")}`}>
            {lobby.code}
          </span>
          <button type="button" className="icon-btn" onClick={copy} aria-label="Copy room code">
            {copied ? "OK" : <Copy size={13} />}
          </button>
        </div>
        <ol className="lobby-list">
          {Array.from({ length: MAX_PLAYERS }, (_, i) => {
            const p = lobby.players[i];
            return (
              <li key={i} className={`${p ? "" : "empty"} ${i === lobby.you && p ? "me" : ""}`}>
                <b>PLAYER {i + 1}</b>
                {p ? (
                  <>
                    <span className="lobby-car">{carAt(p.car).name}</span>
                    {p.host && <em>HOST</em>}
                    {i === lobby.you && <em className="you">YOU</em>}
                  </>
                ) : (
                  <span className="lobby-wait">WAITING…</span>
                )}
              </li>
            );
          })}
        </ol>
        {lobby.role === "host" && onStart && (
          <div className="lobby-host">
            <div className="lobby-maps" role="group" aria-label="Map">
              <button
                type="button"
                className={map === "yard" ? "on" : ""}
                aria-pressed={map === "yard"}
                onClick={() => onMap?.("yard")}
              >
                NEON YARD
              </button>
              <button
                type="button"
                className={map === "garage" ? "on" : ""}
                aria-pressed={map === "garage"}
                onClick={() => onMap?.("garage")}
              >
                WRECK GARAGE
              </button>
            </div>
            <button
              type="button"
              className="arcade-btn start-btn"
              disabled={lobby.players.length < 2}
              onClick={() => onStart("ffa")}
            >
              START FFA
            </button>
            <button
              type="button"
              className="arcade-btn alt-btn"
              disabled={lobby.players.length < 2}
              onClick={() => onStart("tdm")}
            >
              START TDM
            </button>
          </div>
        )}
        <p className="lobby-hint">
          {lobby.role === "host"
            ? lobby.players.length < 2
              ? lobby.expiresAt != null
                ? `CODE EXPIRES IN ${mmss(lobby.expiresAt - now)} IF NOBODY JOINS`
                : "FRIENDS TYPE THIS CODE UNDER ADD FRIENDS"
              : "PICK A MAP, THEN START. BOTS FILL UP TO 12 CARS"
            : "WAITING FOR THE HOST TO START THE MATCH"}
        </p>
      </div>
    </aside>
  );
}

/** "are you sure?" before leaving a lobby */
export function LeaveConfirm({
  host,
  onYes,
  onNo,
}: {
  host: boolean;
  onYes: () => void;
  onNo: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onNo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNo]);
  return (
    <div className="overlay" onClick={onNo}>
      <div
        className="win overlay-box"
        role="alertdialog"
        aria-label="Leave lobby"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="win-title">
          <span>
            <LogOut size={13} /> LEAVE LOBBY?
          </span>
        </div>
        <div className="win-body center">
          <p className="friends-ask">
            ARE YOU SURE?
            <br />
            {host
              ? "YOU ARE THE HOST. LEAVING CLOSES THE LOBBY FOR EVERYONE."
              : "YOU WILL LEAVE THIS LOBBY."}
          </p>
          <button type="button" className="arcade-btn leave-yes" onClick={onYes}>
            YES, LEAVE
          </button>
          <button type="button" className="arcade-btn alt-btn" onClick={onNo}>
            NO, STAY
          </button>
        </div>
      </div>
    </div>
  );
}
