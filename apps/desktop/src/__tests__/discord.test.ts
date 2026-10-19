import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";

// ── Fakes ─────────────────────────────────────────────────────────────
// discord.ts speaks to Discord's local IPC socket via node:net. The net
// module is mocked with an EventEmitter-driven fake socket so tests can
// drive connect/READY/error flows. The module is re-imported fresh per
// test (its state — socket, connected, backoff — is module-level), and
// DISCORD_CLIENT_ID is stubbed before each import because it is read at
// module load.

const fakes = vi.hoisted(() => ({ createConnection: vi.fn() }));

vi.mock("net", () => ({ createConnection: fakes.createConnection }));

class FakeSocket extends EventEmitter {
  destroyed = false;
  written: Buffer[] = [];
  write(b: Buffer | string): boolean {
    this.written.push(Buffer.isBuffer(b) ? b : Buffer.from(b));
    return true;
  }
  end(): this {
    this.destroyed = true;
    return this;
  }
  destroy(): this {
    this.destroyed = true;
    return this;
  }
}

/** Socket that connects and answers the handshake with a FRAME (READY). */
function makeReadySocket(): FakeSocket {
  const sock = new FakeSocket();
  setImmediate(() => sock.emit("connect"));
  setImmediate(() => {
    const header = Buffer.alloc(8);
    header.writeUInt32LE(1, 0); // OpCode.FRAME
    sock.emit("data", header);
  });
  return sock;
}

/** Socket that fails to connect (Discord not running). */
function makeDeadSocket(): FakeSocket {
  const sock = new FakeSocket();
  setImmediate(() => sock.emit("error", new Error("ENOENT")));
  return sock;
}

function writtenJson(sock: FakeSocket): Record<string, unknown>[] {
  // Writes come in header/payload pairs; payloads are the odd entries.
  return sock.written.filter((_, i) => i % 2 === 1).map((b) => JSON.parse(b.toString("utf8")));
}

type DiscordModule = typeof import("../discord");

async function freshDiscord(): Promise<DiscordModule> {
  vi.resetModules();
  return import("../discord");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DISCORD_CLIENT_ID", "test-client-id");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("discord RPC gating", () => {
  it("does nothing until enabled", async () => {
    const discord = await freshDiscord();
    await discord.setActivity({ details: "Watching TV" });
    expect(fakes.createConnection).not.toHaveBeenCalled();
  });

  it("fails closed without a client ID — no socket attempts", async () => {
    vi.stubEnv("DISCORD_CLIENT_ID", "");
    const discord = await freshDiscord();
    discord.setDiscordEnabled(true);
    await discord.setActivity({ details: "Watching TV" });
    expect(fakes.createConnection).not.toHaveBeenCalled();
  });

  it("stops emitting activity after being disabled", async () => {
    const discord = await freshDiscord();
    fakes.createConnection.mockImplementation(() => makeReadySocket());
    discord.setDiscordEnabled(true);
    await discord.setActivity({ details: "One" });
    const callsAfterConnect = fakes.createConnection.mock.calls.length;

    discord.setDiscordEnabled(false);
    await discord.setActivity({ details: "Two" });
    expect(fakes.createConnection.mock.calls.length).toBe(callsAfterConnect);
  });
});

describe("discord RPC connection lifecycle", () => {
  it("handshakes with the client ID, then sends SET_ACTIVITY frames", async () => {
    const discord = await freshDiscord();
    const sock = makeReadySocket();
    fakes.createConnection.mockImplementation(() => sock);

    discord.setDiscordEnabled(true);
    await discord.setActivity({ details: "Watching Alpha", state: "Live" });
    await discord.clearActivity();

    const frames = writtenJson(sock);
    expect(frames[0]).toEqual({ v: 1, client_id: "test-client-id" });
    expect(frames[1]).toMatchObject({
      cmd: "SET_ACTIVITY",
      nonce: "1",
      args: { activity: { details: "Watching Alpha", state: "Live" } },
    });
    expect(frames[2]).toMatchObject({ cmd: "SET_ACTIVITY", nonce: "2", args: { activity: null } });
  });

  it("tries socket indices 0–9 and backs off for 15 s after a full failure", async () => {
    let now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const discord = await freshDiscord();
    fakes.createConnection.mockImplementation(() => makeDeadSocket());

    discord.setDiscordEnabled(true);
    await discord.setActivity({ details: "One" });
    expect(fakes.createConnection).toHaveBeenCalledTimes(10); // indices 0..9

    // Within the cooldown: no new attempts.
    await discord.setActivity({ details: "Two" });
    expect(fakes.createConnection).toHaveBeenCalledTimes(10);

    // After the cooldown: a fresh round of attempts.
    now += 15_001;
    await discord.setActivity({ details: "Three" });
    expect(fakes.createConnection).toHaveBeenCalledTimes(20);
  });

  it("reconnects on the next activity after a socket dies", async () => {
    const discord = await freshDiscord();
    const sockets: FakeSocket[] = [];
    fakes.createConnection.mockImplementation(() => {
      const sock = makeReadySocket();
      sockets.push(sock);
      return sock;
    });

    discord.setDiscordEnabled(true);
    await discord.setActivity({ details: "One" });
    expect(fakes.createConnection).toHaveBeenCalledTimes(1);

    sockets[0].emit("close"); // Discord quit / socket dropped
    await discord.setActivity({ details: "Two" });
    expect(fakes.createConnection).toHaveBeenCalledTimes(2);
    expect(writtenJson(sockets[1]).at(-1)).toMatchObject({
      cmd: "SET_ACTIVITY",
      args: { activity: { details: "Two" } },
    });
  });
});
