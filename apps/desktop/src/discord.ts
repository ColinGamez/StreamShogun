// ── Discord Rich Presence (F6) ────────────────────────────────────────
//
// Lightweight Discord IPC client using Node.js `net` module — no
// external dependencies.  Connects to Discord's local RPC socket and
// sets the "Playing" activity to show the current channel.
//
// Fail-silent: if Discord isn't running or connection fails, all
// methods gracefully no-op.

import * as net from "net";

// ── Discord Application ID ────────────────────────────────────────────
// Replace with your own Discord application ID from
// https://discord.com/developers/applications
const CLIENT_ID = "1234567890123456789";

// ── IPC protocol types ────────────────────────────────────────────────

const enum OpCode {
  HANDSHAKE = 0,
  FRAME = 1,
  CLOSE = 2,
  PING = 3,
  PONG = 4,
}

interface DiscordActivity {
  state?: string;
  details?: string;
  timestamps?: { start?: number; end?: number };
  assets?: {
    large_image?: string;
    large_text?: string;
    small_image?: string;
    small_text?: string;
  };
}

// ── State ─────────────────────────────────────────────────────────────

let socket: net.Socket | null = null;
let connected = false;
let enabled = false;
let nonce = 0;
/** Timestamp of the last failed connection attempt (backoff). */
let lastConnectAttempt = 0;
/** Minimum ms between connection attempts. */
const CONNECT_COOLDOWN_MS = 15_000;

// ── Public API ────────────────────────────────────────────────────────

/** Enable/disable Discord RPC. Connects lazily on first activity set. */
export function setDiscordEnabled(value: boolean): void {
  enabled = value;
  if (!value) {
    disconnect();
  }
}

/** Update the Rich Presence activity (shown as "Playing StreamShōgun"). */
export async function setActivity(activity: DiscordActivity): Promise<void> {
  if (!enabled) return;

  if (!connected) {
    // Backoff: don't spam connection attempts
    if (Date.now() - lastConnectAttempt < CONNECT_COOLDOWN_MS) return;
    const ok = await tryConnect();
    if (!ok) return;
  }

  sendFrame({
    cmd: "SET_ACTIVITY",
    args: {
      pid: process.pid,
      activity,
    },
    nonce: String(++nonce),
  });
}

/** Clear the current activity. */
export async function clearActivity(): Promise<void> {
  if (!enabled || !connected) return;

  sendFrame({
    cmd: "SET_ACTIVITY",
    args: {
      pid: process.pid,
      activity: null,
    },
    nonce: String(++nonce),
  });
}

/** Disconnect from Discord (call on app quit). */
export function disconnect(): void {
  if (socket) {
    try {
      socket.end();
      socket.destroy();
    } catch {
      /* ignore */
    }
    socket = null;
    connected = false;
  }
}

// ── Internal ──────────────────────────────────────────────────────────

function getSocketPath(): string {
  if (process.platform === "win32") {
    return "\\\\?\\pipe\\discord-ipc-0";
  }

  const prefix =
    process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || process.env.TMP || "/tmp";
  return `${prefix}/discord-ipc-0`;
}

async function tryConnect(): Promise<boolean> {
  lastConnectAttempt = Date.now();
  return new Promise((resolve) => {
    try {
      const sockPath = getSocketPath();
      const sock = net.createConnection(sockPath);

      const timeout = setTimeout(() => {
        sock.destroy();
        resolve(false);
      }, 3000);

      sock.once("connect", () => {
        clearTimeout(timeout);
        socket = sock;

        // Send handshake
        sendPacket(OpCode.HANDSHAKE, { v: 1, client_id: CLIENT_ID });

        // Wait for DISPATCH READY
        sock.once("data", (data) => {
          try {
            // Read op code from header (first 4 bytes LE)
            const op = data.readUInt32LE(0);
            if (op === OpCode.FRAME) {
              connected = true;
              resolve(true);
            } else {
              sock.destroy();
              socket = null;
              resolve(false);
            }
          } catch {
            sock.destroy();
            socket = null;
            resolve(false);
          }
        });

        sock.on("close", () => {
          connected = false;
          socket = null;
        });

        sock.on("error", () => {
          connected = false;
          socket = null;
        });
      });

      sock.once("error", () => {
        clearTimeout(timeout);
        resolve(false);
      });
    } catch {
      resolve(false);
    }
  });
}

function sendFrame(payload: Record<string, unknown>): void {
  sendPacket(OpCode.FRAME, payload);
}

function sendPacket(opCode: OpCode, payload: Record<string, unknown>): void {
  if (!socket || socket.destroyed) return;

  try {
    const data = JSON.stringify(payload);
    const len = Buffer.byteLength(data);
    const header = Buffer.alloc(8);
    header.writeUInt32LE(opCode, 0);
    header.writeUInt32LE(len, 4);
    socket.write(header);
    socket.write(data);
  } catch {
    // Socket may have been destroyed between the check and the write —
    // fail silently and let the next setActivity reconnect.
    connected = false;
    socket = null;
  }
}
