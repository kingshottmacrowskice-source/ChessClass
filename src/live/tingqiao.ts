import type { Square, Color } from "chess.js";
export type Listening = { color: Color; cooldown: number };
export type ListeningEvent = {
  guardian: Square;
  attacker: Square;
  king: boolean;
};
// Threat detection is separate from attack resolution. Listening is resolved by DemonRules.attack.
