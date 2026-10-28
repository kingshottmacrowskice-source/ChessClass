import { describe, it, expect } from "vitest";
import {
  attackSpot,
  liftPath,
  knockPath,
  pickStyle,
  squarePoint,
  throwPath,
  throwSpot,
} from "./choreography";
import { ChatMemory, isNoise } from "./chatMemory";
import { explainSan } from "./lines";
import { clipMs, frameAt, impactMs, rowOf } from "./actions";

describe("thrown pieces", () => {
  const from = { x: 20, y: 30 },
    to = squarePoint("e4");
  for (const landing of ["bounce", "slide", "slam"] as const)
    it(`${landing} ends exactly on the target square, on the floor`, () => {
      const p = throwPath(landing, from, to);
      const end = p.sample(1);
      expect(end.x).toBeCloseTo(to.x, 6);
      expect(end.y).toBeCloseTo(to.y, 6);
      expect(end.h).toBeCloseTo(0, 6);
      expect(p.contacts.at(-1)! <= 1).toBe(true);
      for (let i = 0; i <= 100; i++)
        expect(p.sample(i / 100).h).toBeGreaterThanOrEqual(0);
    });
  it("keeps the same size when lifting, carrying, throwing and landing", () => {
    const lift = liftPath(to, from);
    expect(lift.sample(0).scale).toBe(1);
    const carried = lift.sample(1);
    expect(carried.scale).toBe(1);
    for (const landing of ["bounce", "slide", "slam"] as const) {
      const path = throwPath(landing, from, to);
      expect(path.sample(0)).toMatchObject({
        x: carried.x,
        y: carried.y,
        h: carried.h,
        scale: carried.scale,
      });
      expect(path.sample(1).scale).toBeCloseTo(1);
    }
  });
  it("bounces twice after the first landing, each hop lower", () => {
    const p = throwPath("bounce", from, to);
    expect(p.contacts).toHaveLength(3);
    const peak = (a: number, b: number) =>
      Math.max(
        ...Array.from(
          { length: 50 },
          (_, i) => p.sample(a + ((b - a) * i) / 49).h,
        ),
      );
    const [c1, c2] = p.contacts;
    expect(p.sample(c1).h).toBeCloseTo(0, 6);
    expect(peak(c1, c2)).toBeGreaterThan(peak(c2, 1));
    expect(peak(c2, 1)).toBeGreaterThan(0);
  });
  it("knocked pieces fly away from the striker and fade out", () => {
    const at = squarePoint("d5"),
      p = knockPath(at, { x: at.x - 10, y: at.y }, 1, () => 0.5);
    expect(p.sample(1).x).toBeGreaterThan(at.x);
    expect(p.sample(1).alpha).toBeCloseTo(0, 6);
  });
  it("stands beside the victim on the approach side and inside the board", () => {
    const left = attackSpot({ x: 5, y: 50 }, squarePoint("d4"));
    expect(left.x).toBeLessThan(squarePoint("d4").x);
    const edge = attackSpot({ x: 1, y: 50 }, squarePoint("a4"));
    expect(edge.x).toBeGreaterThan(squarePoint("a4").x);
  });
  it("throws from a distance unless already close", () => {
    const to = squarePoint("e4");
    const s = throwSpot({ x: 90, y: 10 }, to);
    expect(Math.hypot(s.x - to.x, s.y - to.y)).toBeCloseTo(20, 1);
    const near = { x: to.x + 5, y: to.y };
    expect(throwSpot(near, to)).toEqual(near);
  });
  it("ramming always skids the thrown piece", () => {
    expect(pickStyle(() => 0.9)).toEqual({ attack: "ram", landing: "slide" });
  });
});

describe("clip timing", () => {
  it("strike frames land inside the clip and one-shots hold their last frame", () => {
    const kick = rowOf("kick");
    expect(impactMs(kick)).toBeLessThan(clipMs(kick));
    expect(frameAt(kick, impactMs(kick))).toBe(3);
    expect(frameAt(kick, clipMs(kick) * 3)).toBe(5);
    expect(frameAt(rowOf("walk"), clipMs(rowOf("walk")))).toBe(0);
  });
});

describe("chat memory", () => {
  it("treats floods and filler as noise", () => {
    for (const t of ["666", "哈哈哈哈", "？？？", "  ", "hhhh", "草"])
      expect(isNoise(t)).toBe(true);
    for (const t of ["e4", "大肥鱼好可爱", "马到f3"])
      expect(isNoise(t)).toBe(false);
  });
  it("greets new viewers once, folds noise and duplicates", () => {
    const m = new ChatMemory();
    expect(m.addChat("1", "阿明", "你好", 0)).toBe(true);
    expect(m.addChat("1", "阿明", "你好", 1000)).toBe(false);
    expect(m.addChat("1", "阿明", "666", 2000)).toBe(false);
    m.addChat("2", "小红", "666", 2100);
    const p = m.take({});
    expect(p.newViewers).toEqual(["阿明", "小红"]);
    expect(p.chatMood).toBe("666×2");
    expect(p.newEvents.filter((e) => e.includes("你好"))).toHaveLength(1);
    expect(m.take({}).newViewers).toBeUndefined();
  });
  it("merges the same message from many viewers", () => {
    const m = new ChatMemory();
    for (let i = 0; i < 5; i++) m.addChat(String(i), "v" + i, "大肥鱼加油", i);
    expect(
      m.take({}).newEvents.filter((e) => e.includes("大肥鱼加油 ×5")),
    ).toHaveLength(1);
  });
  it("keeps history bounded and compresses overflow into a summary", () => {
    const m = new ChatMemory();
    for (let i = 0; i < 40; i++) {
      m.addChat("u" + i, "观众" + i, "话题" + i, i * 10);
      m.take({});
    }
    const old = m.overflow();
    expect(old.length).toBeGreaterThan(0);
    expect(m.history.length).toBe(16);
    m.fold(old);
    expect(m.summary.length).toBeGreaterThan(0);
    expect(Array.from(m.summary).length).toBeLessThanOrEqual(221);
  });
  it("never lets pending grow without bound", () => {
    const m = new ChatMemory();
    for (let i = 0; i < 100; i++) m.addChat("u" + i, "v", "消息" + i, i);
    expect(m.pending.length).toBeLessThanOrEqual(24);
    expect(m.summary).not.toBe("");
  });
});

describe("notation reader", () => {
  it("reads SAN in Chinese", () => {
    expect(explainSan("Nxe5+")).toBe("马 吃 e5，将军");
    expect(explainSan("e4")).toBe("兵 走到 e4");
    expect(explainSan("exd8=Q#")).toBe("兵（e 的那个） 吃 d8，升变为后，将死");
    expect(explainSan("O-O")).toContain("短易位");
    expect(explainSan("O-O-O+")).toMatch(/长易位.*将军/);
    expect(explainSan("Rad1")).toBe("车（a 的那个） 走到 d1");
  });
});
