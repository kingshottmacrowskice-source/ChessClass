import type { Chess, Square } from "chess.js";
import type { Listening, ListeningEvent } from "./tingqiao";
export type DefenseHost = {
  listening: Map<Square, Listening>;
  passiveEvents: ListeningEvent[];
  breakPiece(
    game: Chess,
    square: Square,
    reason?: string,
    source?: Square,
  ): boolean;
};
export type DefenseContext = {
  game: Chess;
  rules: DefenseHost;
  target: Square;
  targets: readonly Square[];
  source?: Square;
  reason: string;
  /** True when the attack source has the same color as the protected piece. */
  friendly: boolean;
};
export type DefenseResult = { preventDamage?: boolean; interrupt?: boolean };
export type DefenseRule = {
  id: string;
  /** Whether this defense may run when the attacker is an ally. Defaults to false. */
  allowFriendly?: boolean;
  resolve(context: DefenseContext): DefenseResult | void;
};
/** All target defenses run before any shields or damage. Register future defenses here. */
export const defenseRules: DefenseRule[] = [
  {
    id: "tingqiao",
    allowFriendly: false,
    resolve({ game, rules, target, source }) {
      const state = rules.listening.get(target),
        protectedPiece = game.get(target);
      if (!protectedPiece || state?.cooldown !== 0 || !source) return;
      const attacker = game.get(source);
      // The engine has already filtered friendly fire unless allowFriendly is set;
      // listening additionally requires a real attacking piece.
      if (!attacker) return;
      if (!rules.breakPiece(game, source, "听桥反击", target)) return;
      state.cooldown = 10;
      rules.passiveEvents.push({
        guardian: target,
        attacker: source,
        king: attacker.type === "k",
      });
      return { preventDamage: true, interrupt: true };
    },
  },
];
export function resolveDefenses(
  game: Chess,
  rules: DefenseHost,
  targets: readonly Square[],
  source: Square | undefined,
  reason: string,
) {
  const prevented = new Set<Square>();
  for (const target of targets) {
    const protectedPiece = game.get(target);
    if (!protectedPiece) continue;
    const attacker = source ? game.get(source) : undefined,
      friendly = !!attacker && attacker.color === protectedPiece.color;
    for (const defense of defenseRules) {
      if (friendly && !defense.allowFriendly) continue;
      const result = defense.resolve({
        game,
        rules,
        target,
        targets,
        source,
        reason,
        friendly,
      });
      if (result?.preventDamage) prevented.add(target);
      if (result?.interrupt || (source && !game.get(source)))
        return { prevented, interrupted: true };
    }
  }
  return { prevented, interrupted: false };
}
