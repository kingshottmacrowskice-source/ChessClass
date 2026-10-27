import { Chess } from "chess.js";
import { playUci, type Position } from "./game";
import type { Analysis } from "./engine";

// Fullmove number does not affect legal moves or draw claims. Retain the
// reversible history after the last pawn move/capture, not the entire game.
export function positionIdentity(p: Position) {
  const c = new Chess(p.start);
  const board = () => c.fen().split(" ").slice(0, 4).join(" ");
  let history = [board()];
  for (const u of p.moves) {
    playUci(c, u);
    if (c.fen().split(" ")[4] === "0") history = [];
    history.push(board());
  }
  return [c.fen().split(" ").slice(0, 5).join(" "), history];
}
export class ServerStore<T> {
  constructor(
    private kind: "analysis" | "explanation" | "translation" = "analysis",
  ) {}
  available = true;
  private retryAt = 0;
  private async request(body: object) {
    if (Date.now() < this.retryAt) return;
    try {
      const response = await fetch("/api/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, kind: this.kind }),
        signal: AbortSignal.timeout(2500),
      });
      if (!response.ok) throw new Error("Position database unavailable");
      const data = await response.json();
      this.available = true;
      return data;
    } catch {
      this.available = false;
      this.retryAt = Date.now() + 5000;
    }
  }
  async get(key: string): Promise<T | undefined> {
    return (await this.request({ action: "get", key }))?.result ?? undefined;
  }
  async put(key: string, result: T) {
    await this.request({ action: "put", key, result });
  }
  async count(): Promise<number> {
    return (await this.request({ action: "count" }))?.count ?? 0;
  }
  async clear() {
    this.retryAt = 0;
    await this.request({ action: "clear" });
  }
}

export class PositionStore extends ServerStore<Analysis> {}
