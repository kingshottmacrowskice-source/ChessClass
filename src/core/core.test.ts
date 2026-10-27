import { describe, it, expect, vi } from "vitest";
import { Chess } from "chess.js";
import {
  initial,
  move,
  position,
  chess,
  importGame,
  exportPgn,
  playUci,
  line,
  facts,
  status,
} from "./game";
import {
  parseInfo,
  grade,
  estimate,
  Engine,
  CandidateCollector,
  type WorkerLike,
} from "./engine";
import { Lru } from "./cache";
import {
  defaults,
  Llm,
  endpoint,
  validateExplanation,
  type Snapshot,
  type Explanation,
} from "./explanation";
describe("game rules and history", () => {
  it("imports FEN and PGN, rejects invalid input, exports custom start", () => {
    expect(() => importGame("bad", "FEN")).toThrow();
    expect(() => importGame("1. e9", "PGN")).toThrow();
    const g = importGame(
      '[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]\n\n1. e4 Kd7',
      "PGN",
    );
    expect(chess(position(g)).turn()).toBe("w");
    expect(exportPgn(g)).toContain("SetUp");
    expect(line(g.main.start, g.main.moves).map((x) => x.san)).toEqual([
      "e4",
      "Kd7",
    ]);
  });
  it("legal and illegal moves, capture", () => {
    const g = move(initial(), "e2e4");
    expect(chess(position(g)).turn()).toBe("b");
    expect(() => move(g, "e4e5")).toThrow();
    const c = new Chess();
    ["e2e4", "d7d5", "e4d5"].forEach((u) => playUci(c, u));
    expect(c.history({ verbose: true })[2].captured).toBe("p");
  });
  it("castles and en passant", () => {
    const c = new Chess("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    expect(playUci(c, "e1g1").san).toBe("O-O");
    expect(c.get("f1")?.type).toBe("r");
    const e = new Chess();
    ["e2e4", "a7a6", "e4e5", "d7d5", "e5d6"].forEach((u) => playUci(e, u));
    expect(e.get("d5")).toBeUndefined();
    expect(e.history({ verbose: true })[4].isEnPassant()).toBe(true);
  });
  it.each(["q", "r", "b", "n"])("promotion %s", (p) => {
    const c = new Chess("7k/P7/8/8/8/8/8/7K w - - 0 1");
    playUci(c, "a7a8" + p);
    expect(c.get("a8")?.type).toBe(p);
  });
  it("undo, restore, branch preserves main", () => {
    const g = importGame("1. e4 e5 2. Nf3", "PGN");
    const back = { ...g, cursor: 1 };
    expect(chess(position(back)).turn()).toBe("b");
    const branch = move(back, "c7c5");
    expect(branch.main.moves).toEqual(g.main.moves);
    expect(branch.branch?.moves).toEqual(["e2e4", "c7c5"]);
    expect(chess(position({ ...branch, branch: null, cursor: 3 })).fen()).toBe(
      chess(position(g)).fen(),
    );
  });
  it("mate, stalemate, fifty moves and repetition with history", () => {
    expect(status(new Chess("7k/6Q1/6K1/8/8/8/8/8 b - - 0 1"))).toContain(
      "将杀",
    );
    expect(status(new Chess("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1"))).toBe("逼和");
    expect(
      new Chess("7k/8/8/8/8/8/R7/K7 w - - 100 60").isDrawByFiftyMoves(),
    ).toBe(true);
    const c = new Chess();
    for (let i = 0; i < 2; i++)
      ["g1f3", "g8f6", "f3g1", "f6g8"].forEach((u) => playUci(c, u));
    expect(c.isThreefoldRepetition()).toBe(true);
    expect(new Chess(c.fen()).isThreefoldRepetition()).toBe(false);
  });
  it("facts are rule observations, pinned piece cannot move illegally", () => {
    expect(facts(new Chess().fen(), "e2e4").centerControlDelta).toBe(1);
    const c = new Chess("4r1k1/8/8/8/8/8/4N3/4K3 w - - 0 1");
    expect(() => playUci(c, "e2c3")).toThrow();
  });
});
describe("scores", () => {
  it("parses MultiPV, black POV, mate zero, incomplete/bounds", () => {
    const a = parseInfo(
      "info depth 12 multipv 2 score cp 80 nodes 20 pv e7e5 g1f3",
      "b",
    )!;
    expect(a.rank).toBe(2);
    expect(a.score.white).toBe(-80);
    expect(parseInfo("info depth 12", "w")).toBeNull();
    expect(
      parseInfo("info depth 12 score cp 20 lowerbound pv e2e4", "w"),
    ).toBeNull();
    const m = parseInfo("info depth 1 score mate 0 pv e2e4", "w")!;
    expect(estimate(m.score, "w")).toBe(0);
  });
  it("nonlinear loss and mate values never treated as centipawns", () => {
    const s = (cp: number) => ({
      kind: "cp" as const,
      raw: cp,
      turn: "w" as const,
      white: cp,
    });
    expect(grade(s(0), s(-300), "w").label).toBe("严重失误");
    expect(grade(s(2000), s(1700), "w").label).toBe("最佳或接近最佳");
    expect(estimate({ kind: "mate", raw: -2, turn: "b", white: 2 }, "w")).toBe(
      1,
    );
    expect(grade(s(-30), s(300), "b").loss).toBeGreaterThan(0.2);
  });
});
const snap: Snapshot = {
  version: 1,
  task: "RecommendMove",
  fen: new Chess().fen(),
  evidence: [
    {
      id: "candidate-1",
      fen: new Chess().fen(),
      pv: ["e2e4"],
      san: ["e4"],
      facts: [facts(new Chess().fen(), "e2e4")],
    },
  ],
};
const valid: Explanation = {
  task: snap.task,
  fen: snap.fen,
  summary: { text: "可能争夺中心", evidenceRefs: ["candidate-1"] },
  intent: [],
  advantages: [],
  drawbacks: [],
  risks: [],
  responses: [],
  comparison: [],
  confidence: "low",
  confidenceReason: "有限搜索",
};
describe("model validation and network", () => {
  it("reuses validated disk explanations and separates model, language and evidence without storing keys", async () => {
    const rows = new Map<string, typeof valid>();
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({
        choices: [{ message: { content: JSON.stringify(valid) } }],
      }),
    );
    const create = () => {
      const llm = new Llm(fetcher);
      vi.spyOn(llm.store, "get").mockImplementation(async (key) =>
        rows.get(key),
      );
      vi.spyOn(llm.store, "put").mockImplementation(async (key, value) => {
        rows.set(key, value);
      });
      return llm;
    };
    const settings = { ...defaults, model: "test", key: "secret-not-to-store" };
    await create().explain(snap, settings);
    const reopened = create();
    expect(
      await reopened.explain(snap, { ...settings, key: "different-key" }),
    ).toEqual(valid);
    expect(reopened.source).toBe("disk");
    const reordered = JSON.parse(
      JSON.stringify(snap, (_name, value) =>
        value && typeof value === "object" && !Array.isArray(value)
          ? Object.fromEntries(Object.entries(value).reverse())
          : value,
      ),
    );
    const reorderedReader = create();
    await reorderedReader.explain(reordered, settings);
    expect(reorderedReader.source).toBe("disk");
    expect(fetcher).toHaveBeenCalledTimes(1);
    await create().explain(snap, { ...settings, model: "another-model" });
    await create().explain(snap, { ...settings, language: "English" });
    await create().explain(
      { ...snap, evidence: snap.evidence.map((e) => ({ ...e, depth: 99 })) },
      settings,
    );
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect([...rows.keys()].every((key) => /^[a-f0-9]{64}$/.test(key))).toBe(
      true,
    );
    expect(JSON.stringify([...rows])).not.toContain("secret-not-to-store");
    // A persisted explanation with a mismatched position must never be displayed.
    for (const [key, row] of rows) rows.set(key, { ...row, fen: "wrong" });
    await create().explain(snap, settings);
    expect(fetcher).toHaveBeenCalledTimes(5);
  });
  it("does not persist invalid or cancelled explanations", async () => {
    let finish!: (response: Response) => void;
    const fetcher = vi.fn<typeof fetch>(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const llm = new Llm(fetcher);
    vi.spyOn(llm.store, "get").mockResolvedValue(undefined);
    const put = vi.spyOn(llm.store, "put").mockResolvedValue(undefined);
    const signal = new AbortController();
    const pending = llm.explain(snap, defaults, signal.signal);
    const rejected = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    llm.clearMemory();
    signal.abort();
    finish(
      Response.json({
        choices: [{ message: { content: JSON.stringify(valid) } }],
      }),
    );
    await rejected;
    expect(put).not.toHaveBeenCalled();
    const invalid = new Llm(async () =>
      Response.json({
        choices: [
          { message: { content: JSON.stringify({ ...valid, fen: "wrong" }) } },
        ],
      }),
    );
    vi.spyOn(invalid.store, "get").mockResolvedValue(undefined);
    const invalidPut = vi
      .spyOn(invalid.store, "put")
      .mockResolvedValue(undefined);
    await expect(invalid.explain(snap, defaults)).rejects.toThrow("校验失败");
    expect(invalidPut).not.toHaveBeenCalled();
  });
  it("strict schema, position, evidence references and legal lines", () => {
    expect(validateExplanation(valid, snap)).toEqual(valid);
    for (const invalid of [
      { ...valid, fen: "wrong" },
      { ...valid, summary: {} },
      { ...valid, risks: undefined },
      { ...valid, summary: { text: "x", evidenceRefs: ["invented"] } },
      { ...valid, newMove: "e2e5" },
    ])
      expect(() => validateExplanation(invalid, snap)).toThrow();
    expect(() =>
      validateExplanation(valid, {
        ...snap,
        evidence: [{ ...snap.evidence[0], pv: ["e2e5"] }],
      }),
    ).toThrow();
  });
  it("normalizes endpoint", () => {
    expect(endpoint("http://localhost:11434/v1/")).toBe(
      "http://localhost:11434/v1/chat/completions",
    );
    expect(endpoint("https://example.com/v1/chat/completions")).toBe(
      "https://example.com/v1/chat/completions",
    );
    expect(() => endpoint("https://key@example.com")).toThrow();
  });
  it("deduplicates, caches, no key in payload and rejects malformed JSON", async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(valid) } }],
          }),
        ),
    );
    const l = new Llm(fetcher);
    const s = { ...defaults, model: "test", key: "test-only-placeholder" };
    const a = l.explain(snap, s);
    expect(l.explain(snap, s)).toBe(a);
    await a;
    await l.explain(snap, s);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][1]?.body).not.toContain(
      "test-only-placeholder",
    );
    expect(JSON.stringify(l.cache)).not.toContain("test-only-placeholder");
    const bad = new Llm((async () => new Response("{bad")) as typeof fetch);
    await expect(bad.explain(snap, s)).rejects.toThrow("JSON");
  });
  it("cancels, times out and classifies HTTP/CORS failures", async () => {
    const waiting: typeof fetch = (_url, init) =>
      new Promise((_, reject) =>
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("abort", "AbortError")),
        ),
      );
    const l = new Llm(waiting);
    const a = new AbortController();
    const p = l.test(defaults, a.signal);
    a.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
    await expect(l.test({ ...defaults, timeout: 0.01 })).rejects.toThrow(
      "超时",
    );
    const unauth = new Llm(
      (async () => new Response("", { status: 401 })) as typeof fetch,
    );
    await expect(unauth.test(defaults)).rejects.toThrow("鉴权");
    const cors = new Llm((async () => {
      throw new TypeError();
    }) as typeof fetch);
    await expect(cors.test(defaults)).rejects.toThrow("CORS");
  });
});
describe("engine lifecycle", () => {
  it("persistent keys contain only engine settings and never model credentials", async () => {
    const { w, commands } = fake();
    const e = new Engine(() => w);
    const write = vi.spyOn(e.store, "put");
    const settings = {
      ...defaults,
      key: "not-a-real-secret",
      model: "private-model-marker",
      base: "https://private-host.invalid/v1",
    };
    await e.analyze(position(initial()), 14, 1, undefined, undefined, settings);
    const saved = JSON.stringify(write.mock.calls);
    expect(write).toHaveBeenCalledTimes(1);
    for (const token of [
      "not-a-real-secret",
      "private-model-marker",
      "private-host",
    ])
      expect(saved).not.toContain(token);
    const changedSettings = {
      ...settings,
      key: "changed-placeholder",
    };
    await e.analyze(
      position(initial()),
      14,
      1,
      undefined,
      undefined,
      changedSettings,
    );
    expect(commands.filter((c) => c.startsWith("go"))).toHaveLength(1);
    e.dispose();
  });
  it("timed MultiPV stop does not mix duplicate moves from unfinished depths", () => {
    const collector = new CandidateCollector(3);
    const add = (depth: number, rank: number, uci: string) =>
      collector.add(
        parseInfo(
          `info depth ${depth} multipv ${rank} score cp 20 pv ${uci}`,
          "w",
        )!,
      );
    add(10, 1, "e2e4");
    add(10, 2, "d2d4");
    add(10, 3, "g1f3");
    add(11, 1, "d2d4"); // New rank 1 overlaps the old rank 2 when time expires.
    const rows = collector.finish("d2d4");
    expect(rows.map((c) => c.pv[0])).toEqual(["d2d4", "e2e4", "g1f3"]);
    expect(rows.map((c) => c.rank)).toEqual([1, 2, 3]);
    expect(rows.every((c) => c.depth === 10)).toBe(true);
  });
  function fake() {
    const commands: string[] = [];
    let dead = false;
    const w: WorkerLike = {
      onmessage: null,
      onerror: null,
      terminate: () => {
        dead = true;
      },
      postMessage(s) {
        commands.push(s);
        const emit = (x: string) =>
          queueMicrotask(() => {
            if (!dead) w.onmessage?.({ data: x } as MessageEvent);
          });
        if (s === "uci") emit("uciok");
        if (s === "isready") emit("readyok");
        if (s.startsWith("go")) {
          const u = s.includes("searchmoves") ? "a2a3" : "e2e4";
          emit("info depth 8 score cp 20 pv " + u);
          emit("bestmove " + u);
        }
      },
    };
    return { w, commands };
  }
  it("handshake, dedup, cache and actual outside MultiPV gets root search", async () => {
    const { w, commands } = fake();
    const e = new Engine(() => w),
      p = position(initial());
    const a = e.analyze(p, 8, 3);
    expect(e.analyze(p, 8, 3)).toBe(a);
    await a;
    await e.analyze(p, 8, 3);
    expect(commands.filter((x) => x.startsWith("go"))).toHaveLength(1);
    const actual = await e.analyze(p, 8, 1, undefined, "a2a3");
    expect(actual.bestmove).toBe("a2a3");
    expect(commands.at(-1)).toContain("searchmoves a2a3");
    expect(commands.indexOf("uci")).toBeLessThan(commands.indexOf("isready"));
    e.dispose();
  });
  it("startup failure rejects and next request can recover", async () => {
    const f = fake();
    let first = true;
    const e = new Engine(() => {
      if (first) {
        first = false;
        return {
          ...f.w,
          postMessage() {
            queueMicrotask(() => this.onerror?.(new Event("error")));
          },
        };
      }
      return fake().w;
    });
    await expect(e.analyze(position(initial()), 8, 3)).rejects.toThrow(
      "加载失败",
    );
    expect((await e.analyze(position(initial()), 8, 3)).bestmove).toBe("e2e4");
    e.dispose();
  });
  it("bounded LRU", () => {
    const c = new Lru<number>(2);
    c.set("a", 1);
    c.set("b", 2);
    c.get("a");
    c.set("c", 3);
    expect(c.get("b")).toBeUndefined();
    c.clear();
    expect(c.get("a")).toBeUndefined();
  });
  it("time budget has no depth cap and changed thread/hash/time options bypass cache", async () => {
    const { w, commands } = fake();
    const e = new Engine(() => w),
      p = position(initial());
    const config = { seconds: 8, threads: 15, hash: 16 };
    await e.analyze(p, 14, 1, undefined, undefined, config);
    await e.analyze(p, 14, 1, undefined, undefined, config);
    expect(commands.filter((c) => c.startsWith("go"))).toEqual([
      "go movetime 8000",
    ]);
    for (const changed of [
      { ...config, seconds: 9 },
      { ...config, threads: 2 },
      { ...config, hash: 32 },
    ])
      await e.analyze(p, 14, 1, undefined, undefined, changed);
    expect(commands.filter((c) => c.startsWith("go"))).toHaveLength(4);
    expect(commands).toContain("setoption name Threads value 15");
    expect(commands).toContain("setoption name Hash value 16");
    expect(
      commands
        .filter((c) => c.startsWith("go"))
        .every((c) => !c.includes("depth")),
    ).toBe(true);
    e.dispose();
  });
});
