import { expect, it } from "vitest";
import { Chess } from "chess.js";
import { DemonRules } from "./rules";
import { footprint } from "./obelisk";
import { defenseRules, type DefenseContext } from "./defenses";
it("a later listener protects an earlier giant's shields from a mushroom", () => {
  const g = new Chess("7k/8/1B6/8/8/8/8/K7 b - - 0 1"),
    r = new DemonRules();
  footprint("d5").forEach((s) => g.put({ type: "r", color: "w" }, s));
  r.giants.set("d5", { color: "w", shields: 2, origin: "summon-item" });
  // d5 is visited before b6, so this listener only helps in a global defense phase.
  r.listening.set("b6", { color: "w", cooldown: 0 });
  const a = r
    .specialActions(g)
    .find((a) => a.item === "doom-shroom" && a.target === "c5")!;
  r.commitSpecial(g, a);
  expect(r.giants.get("d5")!.shields).toBe(2);
  expect(g.get("b6")?.type).toBe("b");
  expect(r.combatEvents.some((e) => e.kind === "shield")).toBe(false);
  expect(r.craters.has("c5")).toBe(false);
});
it("a listener appearing after a doomed target still prevents all damage", () => {
  const g = new Chess("7k/8/8/1R1B4/8/8/8/K7 b - - 0 1"),
    r = new DemonRules();
  // b5 is visited before d5, so per-target damage would already have broken it.
  r.listening.set("d5", { color: "w", cooldown: 0 });
  const a = r
    .specialActions(g)
    .find((a) => a.item === "doom-shroom" && a.target === "c5")!;
  r.commitSpecial(g, a);
  expect(g.get("b5")?.type).toBe("r");
  expect(g.get("d5")?.type).toBe("b");
  expect(r.craters.has("c5")).toBe(false);
});
it("a listener in the front row saves the second row before any damage", () => {
  const g = new Chess("7k/1pn5/8/P7/6P1/8/8/K7 b - - 0 1"),
    r = new DemonRules();
  footprint("d5").forEach((s) => g.put({ type: "r", color: "b" }, s));
  r.giants.set("d5", { color: "b", shields: 2, origin: "summon-item" });
  // a5 comes after g4, so only a global defense phase can save g4.
  r.listening.set("a5", { color: "w", cooldown: 0 });
  const template = r.specialActions(g).find((a) => a.skill === "obelisk-fury")!;
  r.commitSpecial(
    g,
    r.prepareSpecial(g, template, () => 0),
  );
  expect(g.get("a5")?.type).toBe("p");
  expect(g.get("g4")?.type).toBe("p");
  expect(r.lost.w).toEqual([]);
  expect(r.giants.size).toBe(0);
  expect(r.lost.b).toHaveLength(3); // two paid tributes plus the counter-broken source
});
it("source-less artillery is not countered by listening", () => {
  const g = new Chess("7k/8/8/8/3n4/8/P7/K7 w - - 0 1"),
    r = new DemonRules();
  r.listening.set("d4", { color: "b", cooldown: 0 });
  r.bombardments.push({
    target: "d4",
    color: "b",
    tracking: true,
    remaining: 1,
  });
  r.play(g, "a2a3");
  expect(r.passiveEvents).toEqual([]);
  expect(g.get("d4")).toBeUndefined();
  expect(r.lost.b).toEqual(["n"]);
  expect(r.combatEvents.some((e) => e.reason === "听桥反击")).toBe(false);
});
it("friendly fire with a source is not countered by listening", () => {
  const g = new Chess("7k/3r4/8/8/3n4/8/8/K7 b - - 0 1"),
    r = new DemonRules();
  r.listening.set("d4", { color: "b", cooldown: 0 });
  // A future group attack may hit allies; only enemy sources trigger listening.
  expect(r.attack(g, "d4", "d7", "友军误伤")).toBe(true);
  expect(r.passiveEvents).toEqual([]);
  expect(g.get("d4")).toBeUndefined();
  expect(g.get("d7")?.color).toBe("b");
  expect(r.lost.b).toEqual(["n"]);
});
it("defenses are skipped for friendly fire unless allowFriendly is set", () => {
  const g = new Chess("7k/3r4/8/8/3n4/8/8/K7 b - - 0 1"),
    r = new DemonRules();
  const calls: string[] = [];
  const hook = {
    id: "enemy-only-ward",
    resolve({ target }: DefenseContext) {
      calls.push(target);
      return { preventDamage: true };
    },
  };
  defenseRules.push(hook);
  try {
    expect(r.attack(g, "d4", "d7", "友军误伤")).toBe(true);
    expect(calls).toEqual([]);
    expect(g.get("d4")).toBeUndefined();
  } finally {
    defenseRules.splice(defenseRules.indexOf(hook), 1);
  }
});
it("an allowFriendly defense can shield an ally from friendly fire", () => {
  const g = new Chess("7k/3r4/8/8/3n4/8/8/K7 b - - 0 1"),
    r = new DemonRules();
  const seen: { target: string; friendly: boolean }[] = [];
  const hook = {
    id: "friendly-ward",
    allowFriendly: true,
    resolve({ target, friendly }: DefenseContext) {
      seen.push({ target, friendly });
      return { preventDamage: true };
    },
  };
  defenseRules.push(hook);
  try {
    expect(r.attack(g, "d4", "d7", "友军误伤")).toBe(false);
    expect(seen).toEqual([{ target: "d4", friendly: true }]);
    expect(g.get("d4")?.type).toBe("n");
    expect(g.get("d7")?.color).toBe("b");
  } finally {
    defenseRules.splice(defenseRules.indexOf(hook), 1);
  }
});
it("source-less artillery invokes extensible defenses for every target before damage", () => {
  const g = new Chess("7k/8/2b5/1r6/8/8/P7/K7 w - - 0 1"),
    r = new DemonRules();
  const observed: string[] = [];
  const hook = {
    id: "test-ward",
    resolve: ({
      game,
      target,
      source,
    }: Parameters<(typeof defenseRules)[number]["resolve"]>[0]) => {
      observed.push(target);
      expect(source).toBeUndefined();
      expect(game.get("c6")).toBeTruthy();
      // b5 is visited first; if damage were applied per target it would be gone.
      expect(game.get("b5")).toBeTruthy();
      return target === "c6" ? { preventDamage: true } : undefined;
    },
  };
  defenseRules.push(hook);
  try {
    r.bombardments.push({
      target: "c5",
      color: "b",
      tracking: false,
      remaining: 1,
    });
    r.play(g, "a2a3");
    expect(observed).toContain("b5");
    expect(observed).toContain("c6");
    expect(g.get("b5")).toBeUndefined();
    expect(g.get("c6")?.type).toBe("b");
  } finally {
    defenseRules.splice(defenseRules.indexOf(hook), 1);
  }
});
