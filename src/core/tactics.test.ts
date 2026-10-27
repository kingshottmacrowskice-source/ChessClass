import { it, expect } from "vitest";
import { Chess } from "chess.js";
import { tactics } from "./tactics";
import { playUci, facts } from "./game";
it.each(tactics)("$name: 保存局面与预期事实", (t) => {
  const c = new Chess(t.fen);
  if ("illegal" in t && t.illegal)
    expect(() => playUci(c, t.illegal!)).toThrow();
  const played = t.proof.map((m) => playUci(c, m));
  if (
    [
      "mate-in-one",
      "missed-mate",
      "legal-sacrifice",
      "best-without-drawback",
    ].includes(t.id)
  )
    expect(c.isCheckmate()).toBe(true);
  if (t.id === "queen-loss")
    expect(played.map((m) => m.captured)).toEqual(["p", "q"]);
  if (t.id === "quiet-move") {
    const f = facts(t.fen, t.proof[0]);
    expect(f.capture).toBeNull();
    expect(f.check).toBe(false);
  }
});
