import { resolveDefenses } from "./defenses";
import {
  Chess,
  SQUARES,
  type Move,
  type Square,
  type Color,
  type PieceSymbol,
} from "chess.js";
import { playUci } from "../core/game";
import { demonProviders, type DemonAction } from "./demonFish";
import { attacks, inCheck, movedCannons, variantMoves } from "./cannonRules";
import {
  bombardmentArea,
  type Bombardment,
  type BombardmentEvent,
} from "./bombardment";
import {
  footprint,
  giantAt,
  unitSquares,
  tributeGroups,
  summonPlans,
  giantMoves,
  skillRows,
  type Giants,
} from "./obelisk";
import type { Listening, ListeningEvent } from "./tingqiao";
import type { Analysis } from "../core/engine";
import { chooseEnemyMove } from "./difficulty";
export type CombatEvent = {
  kind: "attack" | "shield" | "break";
  target: Square;
  source?: Square;
  reason: string;
  remaining?: number;
};
export class StandardRules {
  readonly mode: string = "standard";
  temporaryPieces = new Set<Square>();
  giants: Giants = new Map();
  combatEvents: CombatEvent[] = [];
  prepareSpecial(
    _game: Chess,
    action: DemonAction,
    _random = Math.random,
  ): DemonAction {
    return action;
  }
  bombardments: Bombardment[] = [];
  bombardmentEvents: BombardmentEvent[] = [];
  blastDraw = false;
  listening = new Map<Square, Listening>();
  passiveEvents: ListeningEvent[] = [];
  winner?: Color;
  cannons = new Set<Square>();
  craters = new Set<Square>();
  lost: Record<Color, (PieceSymbol | "c" | "o")[]> = { w: [], b: [] };
  reset(): void {
    this.temporaryPieces.clear();
    this.giants.clear();
    this.combatEvents = [];
    this.bombardments = [];
    this.bombardmentEvents = [];
    this.blastDraw = false;
    this.listening.clear();
    this.passiveEvents = [];
    this.winner = undefined;
    this.craters.clear();
    this.cannons.clear();
    this.lost = { w: [], b: [] };
  }
  fork(): StandardRules {
    return this;
  }
  isCheck(game: Chess): boolean {
    return game.isCheck();
  }
  isAttacked(game: Chess, square: Square, color: Color): boolean {
    return game.isAttacked(square, color);
  }
  legalMoves(game: Chess): Move[] {
    return game.moves({ verbose: true });
  }
  play(game: Chess, uci: string): Move {
    if (
      !this.legalMoves(game).some(
        (m) => m.from + m.to + (m.promotion ?? "") === uci,
      )
    )
      throw new Error("当前规则不允许该走法");
    return playUci(game, uci);
  }
  specialActions(_game: Chess): DemonAction[] {
    return [];
  }
  chooseMove(game: Chess, analysis: Analysis, difficulty: number): string {
    return chooseEnemyMove(analysis, difficulty, game);
  }
  commitSpecial(_game: Chess, _action: DemonAction): void {
    throw new Error("普通模式不允许特殊行动");
  }
  isCheckmate(game: Chess): boolean {
    return game.isCheckmate();
  }
  isDraw(game: Chess): boolean {
    return game.isDraw();
  }
  isGameOver(game: Chess): boolean {
    return this.isCheckmate(game) || this.isDraw(game);
  }
}

/** All damage flows through attack() or breakPiece(). Threat maps never deal damage. */
export class DemonRules extends StandardRules {
  readonly mode = "demon";
  private repetitions = new Map<string, number>();
  private positionKey(game: Chess): string {
    return (
      game.fen().split(" ").slice(0, 4).join(" ") +
      "|" +
      JSON.stringify([
        [...this.giants],
        [...this.listening],
        [...this.cannons],
        [...this.craters],
        this.bombardments,
      ])
    );
  }
  reset(): void {
    super.reset();
    this.repetitions.clear();
  }
  fork(): DemonRules {
    const r = new DemonRules();
    r.temporaryPieces = new Set(this.temporaryPieces);
    r.giants = new Map([...this.giants].map(([s, v]) => [s, { ...v }]));
    r.listening = new Map([...this.listening].map(([s, v]) => [s, { ...v }]));
    r.cannons = new Set(this.cannons);
    r.craters = new Set(this.craters);
    r.lost = { w: [...this.lost.w], b: [...this.lost.b] };
    r.bombardments = this.bombardments.map((v) => ({ ...v }));
    r.repetitions = new Map(this.repetitions);
    r.winner = this.winner;
    r.blastDraw = this.blastDraw;
    return r;
  }
  unitAt(square: Square): Square {
    return giantAt(this.giants, square) ?? square;
  }
  isAttacked(game: Chess, square: Square, color: Color): boolean {
    return attacks(game, square, color, this.cannons, undefined, this.giants);
  }
  isCheck(game: Chess): boolean {
    return inCheck(game, game.turn(), this.cannons, this.giants);
  }
  private beginAction(): void {
    this.combatEvents = [];
    this.passiveEvents = [];
    this.bombardmentEvents = [];
    for (const state of this.listening.values())
      state.cooldown = Math.max(0, state.cooldown - 1);
  }
  /** Direct destruction ignores shields and cannot trigger on-attack passives. */
  breakPiece(
    game: Chess,
    square: Square,
    reason = "击破",
    source?: Square,
  ): boolean {
    const anchor = this.unitAt(square),
      p = game.get(anchor);
    if (!p) return false;
    this.combatEvents.push({ kind: "break", target: anchor, source, reason });
    const cells = this.giants.has(anchor) ? footprint(anchor) : [anchor];
    for (const shell of this.bombardments)
      if (cells.includes(shell.target)) shell.tracking = false;
    this.listening.delete(anchor);
    if (p.type === "k") {
      const winning = p.color === "w" ? "b" : "w";
      if (this.winner && this.winner !== winning) {
        this.winner = undefined;
        this.blastDraw = true;
      } else if (!this.blastDraw) this.winner = winning;
      return true; // Retain the king only in the transport FEN; winner owns game termination.
    }
    // Instant item units have no persistent chess-piece identity to revive.
    if (!this.temporaryPieces.delete(anchor))
      this.lost[p.color].push(
        this.giants.has(anchor) ? "o" : this.cannons.has(anchor) ? "c" : p.type,
      );
    this.giants.delete(anchor);
    this.cannons.delete(anchor);
    cells.forEach((s) => game.remove(s));
    return true;
  }
  /** Single attacks and area attacks share exactly the same defense pipeline. */
  attack(
    game: Chess,
    square: Square,
    source?: Square,
    reason = "攻击",
  ): boolean {
    const target = this.unitAt(square);
    return this.attackBatch(game, [target], source, reason).has(target);
  }
  private attackBatch(
    game: Chess,
    squares: Square[],
    source: Square | undefined,
    reason: string,
  ): Set<Square> {
    const targets = [
      ...new Set(squares.filter((s) => game.get(s)).map((s) => this.unitAt(s))),
    ];
    const attacker = source ? this.unitAt(source) : undefined;
    const broken = new Set<Square>();
    if (attacker && !game.get(attacker)) return broken;
    // Declare the complete target set; these events are attacks, not damage.
    for (const target of targets)
      this.combatEvents.push({
        kind: "attack",
        target,
        source: attacker,
        reason,
      });
    const defenses = resolveDefenses(game, this, targets, attacker, reason);
    if (defenses.interrupted) return broken;
    // No target loses a shield or piece until the entire defense phase completes.
    for (const target of targets) {
      if (!game.get(target) || defenses.prevented.has(target)) continue;
      if (attacker && (!game.get(attacker) || this.winner || this.blastDraw))
        break;
      const giant = this.giants.get(target);
      if (giant && giant.shields > 0) {
        giant.shields--;
        this.combatEvents.push({
          kind: "shield",
          target,
          source: attacker,
          reason,
          remaining: giant.shields,
        });
      } else if (this.breakPiece(game, target, reason, attacker))
        broken.add(target);
    }
    return broken;
  }
  private attackArea(
    game: Chess,
    squares: Square[],
    source: Square | undefined,
    reason: string,
    enemy?: Color,
  ): void {
    this.attackBatch(
      game,
      squares.filter(
        (s) => game.get(s) && (!enemy || game.get(s)?.color === enemy),
      ),
      source,
      reason,
    );
  }
  private spawnGiant(
    game: Chess,
    target: Square,
    color: Color,
    origin: "summon-item" | "other",
  ): void {
    this.giants.set(target, { color, shields: 2, origin });
    footprint(target).forEach((s) => game.put({ type: "r", color }, s));
  }
  private moveUnit(
    game: Chess,
    from: Square,
    to: Square,
    promotion?: PieceSymbol,
  ): void {
    const piece = game.get(from);
    if (!piece) return;
    const giant = this.giants.get(from);
    if (giant) {
      footprint(from).forEach((s) => game.remove(s));
      this.giants.delete(from);
      footprint(to).forEach((s) =>
        game.put({ type: "r", color: piece.color }, s),
      );
      this.giants.set(to, giant);
      for (const shell of this.bombardments)
        if (shell.tracking && footprint(from).includes(shell.target)) {
          shell.target = (String.fromCharCode(
            shell.target.charCodeAt(0) + to.charCodeAt(0) - from.charCodeAt(0),
          ) +
            (Number(shell.target[1]) +
              Number(to[1]) -
              Number(from[1]))) as Square;
        }
    } else {
      game.remove(from);
      game.put({ type: promotion ?? piece.type, color: piece.color }, to);
      this.cannons = movedCannons(this.cannons, from, to);
      for (const shell of this.bombardments)
        if (shell.tracking && shell.target === from) shell.target = to;
    }
    const skill = this.listening.get(from);
    this.listening.delete(from);
    if (skill) this.listening.set(to, skill);
  }
  private finishAction(
    game: Chess,
    before: Chess,
    moved?: Move,
    createdLock?: Square,
  ): void {
    // Every subsequent action advances existing artillery, never the action creating its lock.
    const due = this.bombardments.filter((s) => --s.remaining <= 0);
    this.bombardments = this.bombardments.filter((s) => s.remaining > 0);
    for (const shell of due) {
      const squares = bombardmentArea(shell.target),
        start = this.combatEvents.length;
      this.attackArea(game, squares, undefined, "城防副炮轰炸");
      this.bombardmentEvents.push({
        target: shell.target,
        squares,
        destroyed: this.combatEvents
          .slice(start)
          .filter((e) => e.kind === "break")
          .map((e) => e.target),
      });
    }
    for (const [anchor, giant] of [...this.giants])
      if (giant.origin !== "summon-item")
        this.breakPiece(game, anchor, "非正规召唤：回合结束");
    if (createdLock)
      this.bombardments.push({
        target: createdLock,
        color: "w",
        remaining: 3,
        tracking: game.get(createdLock)?.color === "w",
      });
    const fields = before.fen().split(" "),
      side = before.turn();
    fields[0] = game.fen().split(" ")[0];
    fields[1] = side === "w" ? "b" : "w";
    fields[2] = game.fen().split(" ")[2];
    fields[3] = moved?.after.split(" ")[3] ?? "-";
    fields[4] =
      moved?.piece === "p" || this.combatEvents.length
        ? "0"
        : String(Number(fields[4]) + 1);
    if (side === "b") fields[5] = String(Number(fields[5]) + 1);
    if (this.winner) fields[1] = this.winner === "b" ? "w" : "b";
    if (this.combatEvents.some((e) => e.kind === "break")) fields[3] = "-";
    game.load(fields.join(" "));
    const key = this.positionKey(game);
    this.repetitions.set(key, (this.repetitions.get(key) ?? 0) + 1);
  }
  private executeMove(game: Chess, move: Move): void {
    const before = new Chess(game.fen());
    this.beginAction();
    const giant = this.giants.get(move.from);
    let moved = false;
    if (giant) {
      const old = footprint(move.from);
      const targets = [
        ...new Set(
          footprint(move.to)
            .filter((s) => !old.includes(s) && game.get(s))
            .map((s) => this.unitAt(s)),
        ),
      ];
      this.attackArea(game, targets, move.from, "巨神兵攻击");
      if (
        this.giants.has(move.from) &&
        !this.winner &&
        !this.blastDraw &&
        footprint(move.to).every((s) => old.includes(s) || !game.get(s))
      ) {
        this.moveUnit(game, move.from, move.to);
        moved = true;
      }
    } else {
      const target = move.isEnPassant()
        ? ((move.to[0] + move.from[1]) as Square)
        : move.to;
      if (move.captured) this.attack(game, target, move.from, "棋子攻击");
      if (
        game.get(move.from) &&
        !this.winner &&
        !this.blastDraw &&
        (!move.captured || !game.get(target))
      ) {
        this.moveUnit(game, move.from, move.to, move.promotion);
        moved = true;
        if (move.isKingsideCastle() || move.isQueensideCastle())
          this.moveUnit(
            game,
            ((move.isKingsideCastle() ? "h" : "a") + move.from[1]) as Square,
            ((move.isKingsideCastle() ? "f" : "d") + move.from[1]) as Square,
          );
      }
    }
    // Castling rights are not regained when a shield prevents movement.
    if (moved && !giant) {
      const fields = game.fen().split(" ");
      const rights = move.after.split(" ")[2];
      fields[2] =
        [...fields[2]].filter((c) => rights.includes(c)).join("") || "-";
      game.load(fields.join(" "));
    }
    (move as Move & { attackOnly?: boolean }).attackOnly = !moved;
    this.finishAction(game, before, moved ? move : undefined);
  }
  private nameMoves(moves: Move[]): Move[] {
    for (const m of moves) {
      if (this.giants.has(m.from) || this.cannons.has(m.from)) continue;
      if (m.isKingsideCastle()) {
        m.san = "O-O";
        continue;
      }
      if (m.isQueensideCastle()) {
        m.san = "O-O-O";
        continue;
      }
      const others = moves.filter(
        (other) =>
          other !== m &&
          other.piece === m.piece &&
          other.to === m.to &&
          !this.giants.has(other.from) &&
          !this.cannons.has(other.from),
      );
      let disambiguation = "";
      if (others.length)
        disambiguation = others.every((o) => o.from[0] !== m.from[0])
          ? m.from[0]
          : others.every((o) => o.from[1] !== m.from[1])
            ? m.from[1]
            : m.from;
      m.san =
        (m.piece === "p"
          ? m.captured
            ? m.from[0]
            : ""
          : m.piece.toUpperCase() + disambiguation) +
        (m.captured ? "x" : "") +
        m.to +
        (m.promotion ? "=" + m.promotion.toUpperCase() : "");
    }
    return moves;
  }
  private rawMoves(game: Chess): Move[] {
    return this.nameMoves([
      ...variantMoves(
        game,
        this.cannons,
        this.craters,
        (m) => m.after,
        this.giants,
      ),
      ...giantMoves(game, this.giants, this.craters),
    ]);
  }
  private legalResult(game: Chess, move: Move): string | undefined {
    const r = this.fork(),
      copy = new Chess(game.fen());
    r.executeMove(copy, move);
    return r.winner ||
      r.blastDraw ||
      !inCheck(copy, move.color, r.cannons, r.giants)
      ? copy.fen()
      : undefined;
  }
  legalMoves(game: Chess): Move[] {
    if (this.winner || this.blastDraw) return [];
    return this.nameMoves(
      this.rawMoves(game).flatMap((m) => {
        const after = this.legalResult(game, m);
        return after
          ? [
              Object.assign(Object.create(Object.getPrototypeOf(m)), m, {
                after,
              }) as Move,
            ]
          : [];
      }),
    );
  }
  play(game: Chess, uci: string): Move {
    const raw = this.rawMoves(game).find((m) => m.lan === uci);
    if (!raw || !this.legalResult(game, raw))
      throw new Error("当前规则不允许该走法");
    const key = this.positionKey(game);
    if (!this.repetitions.has(key)) this.repetitions.set(key, 1);
    this.executeMove(game, raw);
    raw.after = game.fen();
    if (
      raw.captured &&
      !this.combatEvents.some(
        (e) =>
          e.kind === "break" &&
          e.source === raw.from &&
          (e.reason === "棋子攻击" || e.reason === "巨神兵攻击"),
      )
    ) {
      raw.captured = undefined;
      raw.flags = raw.flags.replace("c", "").replace("e", "") || "n";
      raw.san += "（攻击未击破）";
      raw.promotion = undefined;
    }
    return raw;
  }
  isCheckmate(game: Chess): boolean {
    if (this.blastDraw) return false;
    if (this.winner) return true;
    return (
      this.isCheck(game) &&
      !this.legalMoves(game).length &&
      !this.specialActions(game).length
    );
  }
  isDraw(game: Chess): boolean {
    if (this.blastDraw) return true;
    if (this.winner) return false;
    return (
      (!this.bombardments.length &&
        !this.giants.size &&
        game.isInsufficientMaterial()) ||
      (this.repetitions.get(this.positionKey(game)) ?? 0) >= 3 ||
      (!this.bombardments.length && game.isDrawByFiftyMoves()) ||
      (!this.isCheck(game) &&
        !this.legalMoves(game).length &&
        !this.specialActions(game).length)
    );
  }
  chooseMove(game: Chess, analysis: Analysis, difficulty: number): string {
    const legal = this.legalMoves(game).map(
      (m) => m.from + m.to + (m.promotion ?? ""),
    );
    if (!legal.length) throw new Error("魔鱼规则下没有普通走法");
    const candidates = analysis.candidates.filter((c) =>
      legal.includes(c.pv[0]),
    );
    const bestmove = legal.includes(analysis.bestmove)
      ? analysis.bestmove
      : (candidates[0]?.pv[0] ?? legal[0]);
    const proposed = chooseEnemyMove(
      { ...analysis, bestmove, candidates },
      difficulty,
      game,
    );
    return legal.includes(proposed) ? proposed : bestmove;
  }

  private endOnly(game: Chess): string {
    const f = game.fen().split(" ");
    f[1] = "w";
    f[3] = "-";
    f[4] = String(Number(f[4]) + 1);
    f[5] = String(Number(f[5]) + 1);
    return f.join(" ");
  }
  private giantActionTemplates(game: Chess): DemonAction[] {
    if (game.turn() !== "b") return [];
    const actions: DemonAction[] = [];
    const base = {
      kind: "item" as const,
      before: game.fen(),
      after: this.endOnly(game),
      piece: "r" as const,
    };
    const plans = summonPlans(game, this.giants, this.craters, "b");
    if (plans.length)
      actions.push({
        ...base,
        item: "summon-obelisk",
        giant: true,
        target: plans[0].targets[0],
        label: "召唤欧贝利斯克的巨神兵 · 随机献祭三枚棋子",
      });
    for (const [anchor, giant] of this.giants)
      if (
        giant.color === "b" &&
        tributeGroups(game, this.giants, "b", 2, anchor).length
      )
        actions.push({
          ...base,
          kind: "skill",
          skill: "obelisk-fury",
          from: anchor,
          target: anchor,
          label: "欧贝利斯克 · 献祭两枚棋子，攻击前方两行",
        });
    if (this.lost.b.includes("o"))
      for (const target of SQUARES) {
        const cells = footprint(target);
        if (
          cells.length === 4 &&
          cells.every(
            (s) => Number(s[1]) >= 5 && !game.get(s) && !this.craters.has(s),
          )
        )
          actions.push({
            ...base,
            item: "monster-reborn",
            giant: true,
            target,
            label: "死者苏生 · 欧贝利斯克（本回合结束击破）",
          });
      }
    return actions;
  }
  private sacrificesValid(game: Chess, action: DemonAction): boolean {
    const count =
      action.item === "summon-obelisk"
        ? 3
        : action.skill === "obelisk-fury"
          ? 2
          : 0;
    const cost = action.sacrifices ?? [];
    return (
      cost.length === count &&
      new Set(cost).size === count &&
      cost.every(
        (s) =>
          this.unitAt(s) === s &&
          s !== action.from &&
          game.get(s)?.color === "b" &&
          game.get(s)?.type !== "k",
      )
    );
  }
  prepareSpecial(
    game: Chess,
    action: DemonAction,
    random = Math.random,
  ): DemonAction {
    if (action.item !== "summon-obelisk" && action.skill !== "obelisk-fury")
      return action;
    const candidates: { sacrifices: Square[]; targets: Square[] }[] =
      action.item === "summon-obelisk"
        ? summonPlans(game, this.giants, this.craters, "b")
        : tributeGroups(game, this.giants, "b", 2, action.from).map(
            (sacrifices) => ({ sacrifices, targets: [action.target] }),
          );
    // Choose costs first, then a placement; only legal outcomes enter the lottery.
    while (candidates.length) {
      const index = Math.min(
        candidates.length - 1,
        Math.floor(random() * candidates.length),
      );
      const plan = candidates.splice(index, 1)[0],
        targets = [...plan.targets];
      while (targets.length) {
        const at = Math.min(
          targets.length - 1,
          Math.floor(random() * targets.length),
        );
        const target = targets.splice(at, 1)[0],
          selected = { ...action, sacrifices: [...plan.sacrifices], target };
        const r = this.fork(),
          copy = new Chess(game.fen());
        r.executeSpecial(copy, selected);
        if (r.winner || r.blastDraw || !inCheck(copy, "b", r.cannons, r.giants))
          return { ...selected, after: copy.fen(), baseAfter: undefined };
      }
    }
    throw new Error("没有合法的献祭结果");
  }

  specialActions(game: Chess): DemonAction[] {
    if (game.turn() !== "b" || this.winner || this.blastDraw) return [];
    const stoneActions: DemonAction[] = unitSquares(game, this.giants).flatMap(
      (s) => {
        const p = game.get(s)!;
        return p.color === "b" &&
          ["k", "q", "r", "b"].includes(p.type) &&
          !this.cannons.has(s) &&
          !this.giants.has(s) &&
          !this.listening.has(s)
          ? [
              {
                kind: "item",
                item: "tingqiao-stone",
                before: game.fen(),
                after: this.endOnly(game),
                target: s,
                piece: p.type,
                label: `技能石·听桥 · ${s} 学会听桥`,
              },
            ]
          : [];
      },
    );
    const ordinary = demonProviders
      .flatMap((p) =>
        p.candidates(
          game,
          this.lost.b.filter((v): v is PieceSymbol | "c" => v !== "o"),
          () => false,
        ),
      )
      .filter(
        (a) =>
          !this.craters.has(a.target) &&
          !(
            a.from &&
            (this.cannons.has(a.from) || giantAt(this.giants, a.from))
          ),
      );
    const canonical = ordinary
      .map((a) =>
        a.kind === "destroy" || a.item === "londinium-artillery"
          ? { ...a, target: this.unitAt(a.target) }
          : a,
      )
      .filter(
        (a, index, all) =>
          all.findIndex(
            (b) =>
              b.kind === a.kind &&
              b.item === a.item &&
              b.target === a.target &&
              b.from === a.from &&
              b.rule === a.rule &&
              b.piece === a.piece &&
              b.cannon === a.cannon,
          ) === index,
      );
    const giantActions = this.giantActionTemplates(game);
    return [...canonical, ...stoneActions, ...giantActions].flatMap(
      (action) => {
        if (
          action.item === "summon-obelisk" ||
          action.skill === "obelisk-fury"
        ) {
          try {
            this.prepareSpecial(game, action, () => 0);
            return [action];
          } catch {
            return [];
          }
        }
        const r = this.fork(),
          copy = new Chess(game.fen());
        try {
          r.executeSpecial(copy, action);
        } catch {
          return [];
        }
        if (
          !r.winner &&
          !r.blastDraw &&
          inCheck(copy, "b", r.cannons, r.giants)
        )
          return [];
        return [{ ...action, after: copy.fen() }];
      },
    );
  }
  private executeSpecial(game: Chess, action: DemonAction): void {
    const before = new Chess(game.fen());
    this.beginAction();
    if (action.item === "summon-obelisk" || action.skill === "obelisk-fury") {
      if (!this.sacrificesValid(game, action))
        throw new Error("献祭棋子不合法");
      if (
        action.skill &&
        (!action.from || this.giants.get(action.from)?.color !== "b")
      )
        throw new Error("主动技能来源不存在");
      for (const s of action.sacrifices!) this.breakPiece(game, s, "献祭");
      if (action.item === "summon-obelisk") {
        const cells = footprint(action.target);
        if (
          cells.length !== 4 ||
          cells.some(
            (s) => Number(s[1]) < 5 || game.get(s) || this.craters.has(s),
          )
        )
          throw new Error("召唤位置不可用");
        this.spawnGiant(game, action.target, "b", "summon-item");
      } else {
        const source = action.from!,
          rows = skillRows(source, "b");
        this.attackArea(
          game,
          SQUARES.filter((s) => rows.includes(Number(s[1]))),
          source,
          "欧贝利斯克主动技能",
          "w",
        );
      }
    } else if (action.kind === "destroy") {
      this.breakPiece(game, action.target, "魔鱼击破");
    } else if (action.kind === "movement" && action.from) {
      const p = game.get(action.from);
      if (!p) throw new Error("棋子不存在");
      if (game.get(action.target))
        this.attack(game, action.target, action.from, "移形攻击");
      if (game.get(action.from) && !game.get(action.target) && !this.winner)
        this.moveUnit(
          game,
          action.from,
          action.target,
          p.type === "p" && action.target[1] === "1" ? "q" : undefined,
        );
    } else if (action.item === "doom-shroom") {
      if (game.get(action.target)) throw new Error("毁灭菇落点已被占用");
      // A rook placeholder permits deployment on rank eight; it is removed
      // before the action ends and never contributes a rook to the graveyard.
      game.put({ type: "r", color: "b" }, action.target);
      this.temporaryPieces.add(action.target);
      const area = bombardmentArea(action.target).filter(
        (s) => s !== action.target && game.get(s)?.type !== "k",
      );
      this.attackArea(game, area, action.target, "毁灭菇爆炸", "w");
      if (this.temporaryPieces.has(action.target)) {
        this.breakPiece(game, action.target, "毁灭菇自我消除");
        this.craters.add(action.target);
      }
    } else if (action.item === "monster-reborn") {
      const kind = action.giant ? "o" : action.cannon ? "c" : action.piece,
        index = this.lost.b.indexOf(kind);
      if (index < 0) throw new Error("没有可复活的棋子");
      if (action.giant) {
        const cells = footprint(action.target);
        if (
          cells.length !== 4 ||
          cells.some(
            (s) => game.get(s) || this.craters.has(s) || Number(s[1]) < 5,
          )
        )
          throw new Error("复活位置不可用");
        this.spawnGiant(game, action.target, "b", "other");
      } else {
        game.put({ type: action.piece, color: "b" }, action.target);
        if (action.cannon) this.cannons.add(action.target);
      }
      this.lost.b.splice(index, 1);
    } else if (action.item === "summon-cannon") {
      game.put({ type: "r", color: "b" }, action.target);
      this.cannons.add(action.target);
    } else if (action.item === "tingqiao-stone") {
      this.listening.set(action.target, { color: "b", cooldown: 0 });
    }
    this.finishAction(
      game,
      before,
      undefined,
      action.item === "londinium-artillery" ? action.target : undefined,
    );
  }
  commitSpecial(game: Chess, action: DemonAction): void {
    if (game.fen() !== action.before || game.turn() !== "b")
      throw new Error("特殊行动已过期");
    let allowed: DemonAction | undefined;
    if (action.item === "summon-obelisk" || action.skill === "obelisk-fury") {
      if (
        (action.item === "summon-obelisk" &&
          (action.kind !== "item" || action.skill)) ||
        (action.skill === "obelisk-fury" &&
          (action.kind !== "skill" ||
            action.item ||
            action.target !== action.from))
      )
        throw new Error("无效召唤或技能");
      if (!this.sacrificesValid(game, action)) throw new Error("无效献祭");
      allowed = action;
    } else
      allowed = this.specialActions(game).find(
        (a) =>
          a.kind === action.kind &&
          a.item === action.item &&
          a.skill === action.skill &&
          a.from === action.from &&
          a.target === action.target &&
          a.piece === action.piece &&
          a.cannon === action.cannon &&
          a.giant === action.giant &&
          a.rule === action.rule &&
          a.after === action.after,
      );
    if (!allowed) throw new Error("当前规则不允许该行动");
    const test = this.fork(),
      copy = new Chess(game.fen());
    test.executeSpecial(copy, allowed);
    if (
      copy.fen() !== action.after ||
      (!test.winner &&
        !test.blastDraw &&
        inCheck(copy, "b", test.cannons, test.giants))
    )
      throw new Error("特殊行动结果无效");
    this.executeSpecial(game, allowed);
  }
}
export const standardRules = new StandardRules();
export const demonRules = new DemonRules();
export function liveRules(enabled: boolean): StandardRules {
  return enabled ? demonRules : standardRules;
}
