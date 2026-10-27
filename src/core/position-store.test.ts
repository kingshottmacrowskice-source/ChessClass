import { describe, it, expect, vi, afterEach } from "vitest";
import { Chess } from "chess.js";
import { positionIdentity, PositionStore } from "./position-store";
import { chess } from "./game";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("position identity", () => {
  it("shares transpositions after a pawn move without requiring earlier games to match", () => {
    const start = new Chess().fen();
    expect(
      positionIdentity({
        start,
        moves: ["e2e4", "e7e5", "g1f3", "b8c6", "d2d3"],
      }),
    ).toEqual(
      positionIdentity({
        start,
        moves: ["g1f3", "b8c6", "e2e4", "e7e5", "d2d3"],
      }),
    );
  });
  it("ignores fullmove numbering but retains rule fifty and castling rights", () => {
    const fen = new Chess().fen();
    const key = (start: string) => positionIdentity({ start, moves: [] });
    expect(key(fen)).toEqual(key(fen.replace("0 1", "0 45")));
    expect(key(fen)).not.toEqual(key(fen.replace("0 1", "99 1")));
    expect(key(fen)).not.toEqual(key(fen.replace("KQkq", "-")));
  });
  it("separates legal en passant and reversible/repetition history", () => {
    const start = "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 3";
    expect(positionIdentity({ start, moves: [] })).not.toEqual(
      positionIdentity({ start: start.replace("d6", "-"), moves: [] }),
    );
    const p = {
      start: new Chess().fen(),
      moves: ["g1f3", "g8f6", "f3g1", "f6g8"],
    };
    expect(positionIdentity(p)).not.toEqual(
      positionIdentity({ start: chess(p).fen(), moves: [] }),
    );
  });
  it("unavailable storage degrades without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    const store = new PositionStore();
    expect(await store.get("missing")).toBeUndefined();
    expect(await store.count()).toBe(0);
    await store.clear();
    expect(store.available).toBe(false);
  });
  it("retries after a service outage and shares the server result", async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(
        Response.json({ result: { source: "disk", savedAt: 123 } }),
      );
    vi.stubGlobal("fetch", fetcher);
    const store = new PositionStore();
    expect(await store.get("position")).toBeUndefined();
    expect(await store.get("position")).toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5001);
    expect(await store.get("position")).toEqual({
      source: "disk",
      savedAt: 123,
    });
    expect(store.available).toBe(true);
  });
});
