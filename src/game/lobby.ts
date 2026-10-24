/* ───────── online lobby (room codes over WebRTC) ─────────
   One player HOSTS a room and gets a short code like "K7QD". Friends type the code to join.
   Everybody connects to the host (star topology, no host migration): the host keeps the player
   list and tells everyone about it. Gameplay syncing is not part of this file yet.
   Connection brokering uses PeerJS (free public broker + free STUN); the room code is the peer id. */

import type { DataConnection, Peer, PeerOptions } from "peerjs";

export const MAX_PLAYERS = 4;
/** a room nobody joined closes after this long */
export const EXPIRE_MS =
  Number(
    (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.[
      "VITE_LOBBY_EXPIRE_MS"
    ],
  ) || 5 * 60 * 1000;
const JOIN_TIMEOUT_MS = 10_000;
const HELLO_TIMEOUT_MS = 6_000;
const ID_PREFIX = "lcs-";
/** no 0/O/1/I/L so codes are easy to read out loud */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LEN = 4;

export type LobbyPlayer = { car: number; host: boolean };
export type LobbyState = {
  status: "open" | "closed";
  role: "host" | "guest";
  code: string;
  players: LobbyPlayer[];
  /** index of this player in `players` (0 = host) */
  you: number;
  /** host only: when an empty room expires (ms timestamp), null once a friend is in */
  expiresAt: number | null;
  /** why the lobby closed (status "closed") */
  reason?: "left" | "host-left" | "expired" | "network";
};
export type LobbyErrorCode = "bad-code" | "not-found" | "full" | "started" | "timeout" | "network";
export class LobbyError extends Error {
  code: LobbyErrorCode;
  constructor(code: LobbyErrorCode) {
    super(code);
    this.code = code;
  }
}
export type LobbyController = {
  readonly state: LobbyState;
  setCar: (car: number) => void;
  leave: () => void;
  /** guest: send a gameplay message to the host */
  send: (msg: unknown) => void;
  /** host: send a gameplay message to every guest */
  broadcast: (msg: unknown) => void;
  /** host: send a gameplay message to one guest (pid from `pids()`) */
  sendTo: (pid: number, msg: unknown) => void;
  /** host: stable id of every player in `state.players` order (0 = the host); guests get [] */
  pids: () => number[];
  /** host: while a match runs nobody new can join (and an empty room does not expire) */
  setLocked: (locked: boolean) => void;
};
export type LobbyOptions = {
  car: number;
  /** highest valid car index + 1 (messages from other players are checked against it) */
  carCount: number;
  onChange: (s: LobbyState) => void;
  /** gameplay messages (their `t` starts with "g"): host gets them from a guest's pid, a guest from the host (pid 0) */
  onMessage?: (msg: Record<string, unknown>, from: number) => void;
  /** host: a guest's connection dropped (their pid) */
  onPeerLeft?: (pid: number) => void;
  /** test hook: a Peer constructor (the real one is loaded on demand) */
  PeerCtor?: new (id?: string, opts?: PeerOptions) => Peer;
};

/* ── helpers ── */
export function normalizeCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, CODE_LEN);
}
export function isValidCode(code: string): boolean {
  return code.length === CODE_LEN && [...code].every((c) => ALPHABET.includes(c));
}
export function makeCode(rand: () => number = Math.random): string {
  let c = "";
  for (let i = 0; i < CODE_LEN; i++) c += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  return c;
}
/** broker settings: the free public PeerJS broker unless a build points elsewhere */
function peerOptions(): PeerOptions {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  const o: PeerOptions = { debug: 0 };
  if (env["VITE_PEER_HOST"]) {
    o.host = env["VITE_PEER_HOST"];
    if (env["VITE_PEER_PORT"]) o.port = Number(env["VITE_PEER_PORT"]);
    if (env["VITE_PEER_PATH"]) o.path = env["VITE_PEER_PATH"];
    o.secure = env["VITE_PEER_SECURE"] === "true";
  }
  return o;
}
async function loadPeer(opts: LobbyOptions): Promise<new (id?: string, o?: PeerOptions) => Peer> {
  if (opts.PeerCtor) return opts.PeerCtor;
  const mod = await import("peerjs");
  return (mod.Peer ?? (mod as unknown as { default: typeof Peer }).default) as never;
}
type Msg = { t?: unknown; car?: unknown; list?: unknown; you?: unknown; reason?: unknown };
const isObj = (v: unknown): v is Msg => typeof v === "object" && v !== null;
const cleanCar = (v: unknown, count: number) =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v < count ? v : 0;

/* ───────────────────────────── host ───────────────────────────── */

export async function createRoom(opts: LobbyOptions): Promise<LobbyController> {
  const PeerC = await loadPeer(opts);
  let attempts = 0;
  for (;;) {
    const code = makeCode();
    try {
      return await openHost(PeerC, code, opts);
    } catch (e) {
      if (e instanceof LobbyError && e.code === "bad-code" && ++attempts < 6) continue; // id taken
      throw e;
    }
  }
}

function openHost(
  PeerC: new (id?: string, o?: PeerOptions) => Peer,
  code: string,
  opts: LobbyOptions,
): Promise<LobbyController> {
  return new Promise((resolve, reject) => {
    const peer = new PeerC(ID_PREFIX + code, peerOptions());
    /** index 0 is the host itself (conn = null) */
    const players: { conn: DataConnection | null; car: number; pid: number }[] = [
      { conn: null, car: cleanCar(opts.car, opts.carCount), pid: 0 },
    ];
    let nextPid = 1;
    let locked = false;
    let expiresAt: number | null = null;
    let expireTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    let ready = false;

    const snapshot = (): LobbyState => ({
      status: closed ? "closed" : "open",
      role: "host",
      code,
      players: players.map((p, i) => ({ car: p.car, host: i === 0 })),
      you: 0,
      expiresAt,
      ...(closeReason ? { reason: closeReason } : null),
    });
    let closeReason: LobbyState["reason"];
    const ctrl: { state: LobbyState } & Omit<LobbyController, "state"> = {
      state: snapshot(),
      setCar(car) {
        if (closed) return;
        players[0]!.car = cleanCar(car, opts.carCount);
        publish();
      },
      leave() {
        shutdown("left", "host-left");
      },
      send() {
        /* the host does not send to itself */
      },
      broadcast(msg) {
        if (closed) return;
        for (const p of players) if (p.conn) send(p.conn, msg);
      },
      sendTo(pid, msg) {
        const p = players.find((x) => x.pid === pid);
        if (p?.conn && !closed) send(p.conn, msg);
      },
      pids() {
        return players.map((p) => p.pid);
      },
      setLocked(v) {
        locked = v;
        if (!v && !closed && players.length === 1) armExpiry();
        if (v) disarmExpiry();
        ctrl.state = snapshot();
        opts.onChange(ctrl.state);
      },
    };
    const send = (c: DataConnection, msg: unknown) => {
      try {
        if (c.open) c.send(msg);
      } catch {
        /* connection already gone */
      }
    };
    const publish = () => {
      ctrl.state = snapshot();
      opts.onChange(ctrl.state);
      players.forEach((p, i) => {
        if (p.conn)
          send(p.conn, {
            t: "players",
            you: i,
            list: players.map((q, j) => ({ car: q.car, host: j === 0 })),
          });
      });
    };
    const armExpiry = () => {
      if (expireTimer) clearTimeout(expireTimer);
      expiresAt = Date.now() + EXPIRE_MS;
      expireTimer = setTimeout(() => {
        if (players.length === 1) shutdown("expired", "expired");
      }, EXPIRE_MS);
    };
    const disarmExpiry = () => {
      if (expireTimer) clearTimeout(expireTimer);
      expireTimer = null;
      expiresAt = null;
    };
    /** tell the guests why, then tear everything down shortly after so the message gets out */
    const shutdown = (hostReason: "left" | "expired", guestReason: "host-left" | "expired") => {
      if (closed) return;
      closed = true;
      closeReason = hostReason;
      disarmExpiry();
      for (const p of players) if (p.conn) send(p.conn, { t: "closed", reason: guestReason });
      ctrl.state = snapshot();
      opts.onChange(ctrl.state);
      setTimeout(() => {
        try {
          peer.destroy();
        } catch {
          /* already destroyed */
        }
      }, 250);
    };

    peer.on("open", () => {
      ready = true;
      armExpiry();
      ctrl.state = snapshot();
      resolve(ctrl as LobbyController);
    });
    peer.on("error", (err: { type?: string }) => {
      if (!ready) {
        try {
          peer.destroy();
        } catch {
          /* ignore */
        }
        reject(new LobbyError(err.type === "unavailable-id" ? "bad-code" : "network"));
      } else if (!closed) {
        if (err.type === "network" || err.type === "server-error" || err.type === "socket-error")
          return; // the broker hiccuped; existing player connections keep working
      }
    });
    peer.on("disconnected", () => {
      // lost the broker (not the players): try to get back so new friends can still join
      if (!closed && ready) {
        try {
          peer.reconnect();
        } catch {
          /* ignore */
        }
      }
    });
    peer.on("connection", (conn) => {
      let joined = false;
      const timer = setTimeout(() => {
        if (!joined) conn.close();
      }, HELLO_TIMEOUT_MS);
      conn.on("data", (raw) => {
        if (!isObj(raw)) return;
        if (raw.t === "hello" && !joined) {
          if (closed) return;
          if (locked) {
            send(conn, { t: "started" });
            setTimeout(() => conn.close(), 300);
            return;
          }
          if (players.length >= MAX_PLAYERS) {
            send(conn, { t: "full" });
            setTimeout(() => conn.close(), 300);
            return;
          }
          joined = true;
          clearTimeout(timer);
          players.push({ conn, car: cleanCar(raw.car, opts.carCount), pid: nextPid++ });
          disarmExpiry();
          publish();
        } else if (raw.t === "car" && joined) {
          const p = players.find((x) => x.conn === conn);
          if (p && !locked) {
            p.car = cleanCar(raw.car, opts.carCount);
            publish();
          }
        } else if (joined && typeof raw.t === "string" && raw.t.startsWith("g")) {
          const p = players.find((x) => x.conn === conn);
          if (p) opts.onMessage?.(raw as Record<string, unknown>, p.pid);
        }
      });
      conn.on("close", () => {
        clearTimeout(timer);
        const i = players.findIndex((x) => x.conn === conn);
        if (i > 0 && !closed) {
          const gone = players[i]!.pid;
          players.splice(i, 1);
          if (players.length === 1 && !locked) armExpiry();
          opts.onPeerLeft?.(gone);
          publish();
        }
      });
      conn.on("error", () => conn.close());
    });
  });
}

/* ───────────────────────────── guest ───────────────────────────── */

export async function joinRoom(rawCode: string, opts: LobbyOptions): Promise<LobbyController> {
  const code = normalizeCode(rawCode);
  if (!isValidCode(code)) throw new LobbyError("bad-code");
  const PeerC = await loadPeer(opts);

  return new Promise((resolve, reject) => {
    const peer = new PeerC(undefined, peerOptions());
    let conn: DataConnection | null = null;
    let settled = false;
    let left = false;
    let closed = false;
    let closeReason: LobbyState["reason"];
    let players: LobbyPlayer[] = [];
    let you = 0;
    const snapshot = (): LobbyState => ({
      status: closed ? "closed" : "open",
      role: "guest",
      code,
      players,
      you,
      expiresAt: null,
      ...(closeReason ? { reason: closeReason } : null),
    });
    const ctrl: { state: LobbyState } & Omit<LobbyController, "state"> = {
      state: snapshot(),
      setCar(car) {
        if (conn?.open && !closed) conn.send({ t: "car", car: cleanCar(car, opts.carCount) });
      },
      leave() {
        left = true;
        finish("left");
      },
      send(msg) {
        try {
          if (conn?.open && !closed) conn.send(msg);
        } catch {
          /* connection already gone */
        }
      },
      broadcast() {},
      sendTo() {},
      pids: () => [],
      setLocked() {},
    };
    const destroy = () => {
      try {
        conn?.close();
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        try {
          peer.destroy();
        } catch {
          /* ignore */
        }
      }, 150);
    };
    const fail = (c: LobbyErrorCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      destroy();
      reject(new LobbyError(c));
    };
    const finish = (reason: NonNullable<LobbyState["reason"]>) => {
      if (closed) return;
      closed = true;
      closeReason = reason;
      ctrl.state = snapshot();
      opts.onChange(ctrl.state);
      destroy();
    };
    const timeout = setTimeout(() => fail("timeout"), JOIN_TIMEOUT_MS);

    peer.on("open", () => {
      conn = peer.connect(ID_PREFIX + code, { reliable: true });
      conn.on("open", () => conn?.send({ t: "hello", car: cleanCar(opts.car, opts.carCount) }));
      conn.on("data", (raw) => {
        if (!isObj(raw)) return;
        if (raw.t === "full") return fail("full");
        if (raw.t === "started") return fail("started");
        if (raw.t === "players" && Array.isArray(raw.list)) {
          players = raw.list
            .filter(isObj)
            .slice(0, MAX_PLAYERS)
            .map((p, i) => ({ car: cleanCar(p.car, opts.carCount), host: i === 0 }));
          you =
            typeof raw.you === "number" && raw.you >= 0 && raw.you < players.length ? raw.you : 0;
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            ctrl.state = snapshot();
            resolve(ctrl as LobbyController);
          } else {
            ctrl.state = snapshot();
            opts.onChange(ctrl.state);
          }
        } else if (raw.t === "closed") {
          finish(raw.reason === "expired" ? "expired" : "host-left");
        } else if (typeof raw.t === "string" && raw.t.startsWith("g")) {
          opts.onMessage?.(raw as Record<string, unknown>, 0);
        }
      });
      conn.on("close", () => {
        if (!settled) fail("not-found");
        else if (!left) finish("host-left");
      });
      conn.on("error", () => {
        if (!settled) fail("network");
      });
    });
    peer.on("error", (err: { type?: string }) => {
      if (!settled) fail(err.type === "peer-unavailable" ? "not-found" : "network");
      else if (!closed && !left && err.type !== "network" && err.type !== "server-error")
        finish("network");
    });
  });
}
