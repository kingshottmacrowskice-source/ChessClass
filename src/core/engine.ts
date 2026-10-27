import { chess, line, type Position } from "./game";
import { Lru, abortError } from "./cache";
import { PositionStore, positionIdentity } from "./position-store";
export const ENGINE = "Stockfish 19 full NNUE / stockfish.js 19.0.1";
export type SearchOptions = { seconds: number; threads: number; hash: number };
export type Score = {
  kind: "cp" | "mate";
  raw: number;
  turn: "w" | "b";
  white: number;
};
export type Candidate = {
  rank: number;
  depth: number;
  score: Score;
  pv: string[];
};
export type Analysis = {
  position: Position;
  fen: string;
  candidates: Candidate[];
  bestmove: string;
  engine: string;
  terminal?: string;
  source?: "computed" | "memory" | "disk";
  savedAt?: number;
};
export class CandidateCollector {
  private rows = new Map<number, Candidate>();
  private byMove = new Map<string, Candidate>();
  private complete: Candidate[] = [];
  constructor(private count: number) {}
  add(row: Candidate) {
    this.rows.set(row.rank, row);
    this.byMove.set(row.pv[0], row);
    const batch = [...this.rows.values()].sort((a, b) => a.rank - b.rank);
    if (
      batch.length === this.count &&
      batch.every((c) => c.depth === row.depth) &&
      new Set(batch.map((c) => c.pv[0])).size === this.count
    )
      this.complete = batch;
  }
  finish(bestmove: string) {
    const batch = this.complete.length
      ? this.complete
      : [...this.rows.values()].sort((a, b) => a.rank - b.rank);
    const best =
      batch.find((c) => c.pv[0] === bestmove) ?? this.byMove.get(bestmove);
    const unique = new Map<string, Candidate>();
    if (best) unique.set(bestmove, best);
    for (const row of [...batch, ...this.byMove.values()])
      if (!unique.has(row.pv[0])) unique.set(row.pv[0], row);
    return [...unique.values()]
      .slice(0, this.count)
      .map((c, i) => ({ ...c, rank: i + 1 }));
  }
}
export function parseInfo(s: string, turn: "w" | "b"): Candidate | null {
  const d = s.match(/\bdepth (\d+)/),
    v = s.match(/\bscore (cp|mate) (-?\d+)/),
    p = s.match(/\bpv ((?:[a-h][1-8][a-h][1-8][qrbn]?\s*)+)$/);
  if (!d || !v || !p || /\b(upperbound|lowerbound)\b/.test(s)) return null;
  const raw = Number(v[2]);
  return {
    rank: Number(s.match(/\bmultipv (\d+)/)?.[1] ?? 1),
    depth: Number(d[1]),
    score: {
      kind: v[1] as "cp" | "mate",
      raw,
      turn,
      white: raw * (turn === "w" ? 1 : -1),
    },
    pv: p[1].trim().split(/\s+/),
  };
}
export function scoreText(s: Score) {
  return s.kind === "mate"
    ? `将杀 ${s.white > 0 ? "+" : s.white < 0 ? "-" : s.turn === "w" ? "-" : "+"}${Math.abs(s.white)}（引擎回合）`
    : `${s.white >= 0 ? "+" : ""}${(s.white / 100).toFixed(2)}`;
}
export function estimate(s: Score, side: "w" | "b") {
  if (s.kind === "mate") {
    const winner = s.raw > 0 ? s.turn : s.turn === "w" ? "b" : "w";
    return winner === side ? 1 : 0;
  }
  return 1 / (1 + Math.exp(-0.00368208 * s.white * (side === "w" ? 1 : -1)));
}
export function grade(best: Score, actual: Score, side: "w" | "b") {
  const loss = Math.max(0, estimate(best, side) - estimate(actual, side));
  return {
    loss,
    label:
      loss < 0.02
        ? "最佳或接近最佳"
        : loss < 0.05
          ? "合理"
          : loss < 0.1
            ? "不准确"
            : loss < 0.2
              ? "失误"
              : "严重失误",
  };
}
export interface WorkerLike {
  postMessage(s: string): void;
  terminate(): void;
  onmessage: ((e: MessageEvent) => void) | null;
  onerror: ((e: Event) => void) | null;
}
export class Engine {
  cache = new Lru<Analysis>(80);
  store = new PositionStore();
  private cacheEpoch = 0;
  async clearCache() {
    this.cacheEpoch++;
    this.cache.clear();
    await this.store.clear();
  }
  private worker?: WorkerLike;
  private waits = new Set<{
    match: (s: string) => boolean;
    resolve: (s: string) => void;
    reject: (e: Error) => void;
  }>();
  private ready?: Promise<void>;
  private listener?: (s: string) => void;
  private pending = new Map<
    string,
    { promise: Promise<Analysis>; signal?: AbortSignal; position: Position }
  >();
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private factory: () => WorkerLike = () => {
      if (
        !globalThis.crossOriginIsolated ||
        typeof SharedArrayBuffer === "undefined"
      )
        throw new Error(
          "Stockfish 19 多线程需要跨源隔离，请重启开发服务并刷新页面（COOP/COEP）",
        );
      return new Worker("/engine/stockfish-19.js") as unknown as WorkerLike;
    },
  ) {}
  private wait(match: (s: string) => boolean, ms = 60000) {
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waits.delete(w);
        reject(new Error("引擎响应超时"));
      }, ms);
      const w = {
        match,
        resolve: (s: string) => {
          clearTimeout(timer);
          this.waits.delete(w);
          resolve(s);
        },
        reject: (e: Error) => {
          clearTimeout(timer);
          this.waits.delete(w);
          reject(e);
        },
      };
      this.waits.add(w);
    });
  }
  private send(s: string) {
    this.worker!.postMessage(s);
  }
  private init() {
    if (!this.ready)
      this.ready = (async () => {
        this.worker = this.factory();
        this.worker.onmessage = (e) => {
          const s = String(e.data);
          for (const w of this.waits) if (w.match(s)) w.resolve(s);
          this.listener?.(s);
        };
        this.worker.onerror = () =>
          this.reset(new Error("引擎加载失败，请检查 WASM 文件与浏览器支持"));
        const u = this.wait((s) => s === "uciok");
        this.send("uci");
        await u;
        const r = this.wait((s) => s === "readyok");
        this.send("isready");
        await r;
      })();
    return this.ready;
  }
  reset(error: Error = abortError()) {
    this.worker?.terminate();
    this.worker = undefined;
    this.ready = undefined;
    this.listener = undefined;
    for (const w of this.waits) w.reject(error);
  }
  analyze(
    p: Position,
    depth: number,
    multipv: number,
    signal?: AbortSignal,
    root?: string,
    options?: SearchOptions,
    force = false,
  ): Promise<Analysis> {
    if (signal?.aborted) return Promise.reject(abortError());
    const config = options
      ? {
          seconds: options.seconds,
          threads: options.threads,
          hash: options.hash,
        }
      : { seconds: 12, threads: 1, hash: 16 };
    const epoch = this.cacheEpoch;
    const currentFen = chess(p).fen();
    const bind = (a: Analysis, source: Analysis["source"]): Analysis => ({
      ...a,
      position: p,
      fen: currentFen,
      source,
    });
    const key = JSON.stringify([
      ENGINE,
      positionIdentity(p),
      options ? null : depth,
      multipv,
      root ?? "",
      config,
    ]);
    const cached = !force && this.cache.get(key);
    if (cached) return Promise.resolve(bind(cached, "memory"));
    const existing = this.pending.get(key);
    if (existing && !existing.signal?.aborted)
      return JSON.stringify(existing.position) === JSON.stringify(p)
        ? existing.promise
        : existing.promise.then((a) => bind(a, a.source));
    const job = this.queue
      .catch(() => {})
      .then(async () => {
        if (signal?.aborted) throw abortError();
        if (!force) {
          const saved = await this.store.get(key);
          if (signal?.aborted) throw abortError();
          if (saved && saved.engine === ENGINE && epoch === this.cacheEpoch) {
            try {
              if (
                !saved.candidates.length ||
                saved.bestmove !== saved.candidates[0].pv[0]
              )
                throw new Error("Invalid cached analysis");
              for (const row of saved.candidates) {
                line(currentFen, row.pv);
                if (
                  !Number.isFinite(row.score.white) ||
                  !Number.isFinite(row.depth)
                )
                  throw new Error("Invalid cached score");
              }
              this.cache.set(key, saved);
              return bind(saved, "disk");
            } catch {
              /* A damaged record is replaced by a fresh search. */
            }
          }
        }
        const stop = () => this.reset();
        signal?.addEventListener("abort", stop, { once: true });
        try {
          const c = chess(p),
            fen = c.fen();
          if (c.isGameOver())
            return {
              position: p,
              fen,
              candidates: [],
              bestmove: "(none)",
              engine: ENGINE,
              terminal: c.isCheckmate() ? "checkmate" : "draw",
            } as Analysis;
          await this.init();
          if (signal?.aborted) throw abortError();
          this.send("ucinewgame");
          this.send(`setoption name Threads value ${config.threads}`);
          this.send(`setoption name Hash value ${config.hash}`);
          const r = this.wait((s) => s === "readyok");
          this.send("isready");
          await r;
          const rows = new CandidateCollector(
            Math.min(root ? 1 : multipv, c.moves().length),
          );
          this.listener = (s) => {
            const row = parseInfo(s, c.turn());
            if (row) {
              try {
                line(fen, row.pv);
                rows.add(row);
              } catch {
                /* Reject illegal engine lines. */
              }
            }
          };
          this.send(`setoption name MultiPV value ${root ? 1 : multipv}`);
          this.send(
            `position fen ${p.start}${p.moves.length ? " moves " + p.moves.join(" ") : ""}`,
          );
          const done = this.wait(
            (s) => s.startsWith("bestmove "),
            config.seconds * 1000 + 30000,
          );
          this.send(
            `go ${options ? "" : `depth ${depth} `}movetime ${config.seconds * 1000}${root ? " searchmoves " + root : ""}`,
          );
          const final = await done;
          const candidates = rows.finish(final.split(" ")[1]);
          if (!candidates.length) throw new Error("引擎未返回有效分析");
          const result: Analysis = {
            position: p,
            fen,
            candidates,
            bestmove: final.split(" ")[1],
            engine: ENGINE,
            source: "computed",
            savedAt: Date.now(),
          };
          if (epoch === this.cacheEpoch && !signal?.aborted) {
            this.cache.set(key, result);
            await this.store.put(key, result);
          }
          return result;
        } catch (e) {
          this.reset(e instanceof Error ? e : new Error("引擎失败"));
          throw e;
        } finally {
          this.listener = undefined;
          signal?.removeEventListener("abort", stop);
        }
      });
    this.pending.set(key, { promise: job, signal, position: p });
    this.queue = job;
    void job
      .finally(() => {
        if (this.pending.get(key)?.promise === job) this.pending.delete(key);
      })
      .catch(() => {});
    return job;
  }
  dispose() {
    this.reset();
    this.cache.clear();
  }
}
