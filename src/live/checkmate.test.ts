import { expect, it } from "vitest";
import { Chess } from "chess.js";
import { DemonRules } from "./rules";

it("standard checkmate against the demon ends the game despite special escapes", () => {
  // Black king h8, white queen g7 (check), white king g6 protects the queen.
  const g = new Chess("7k/6Q1/6K1/8/8/8/8/8 b - - 0 1");
  const r = new DemonRules();
  // The demon can still "destroy" the queen, but a true checkmate ends the game.
  expect(r.specialActions(g).length).toBeGreaterThan(0);
  expect(r.legalMoves(g)).toHaveLength(0);
  expect(r.isCheckmate(g)).toBe(true);
  expect(r.isGameOver(g)).toBe(true);
});

it("a check with legal escapes is not checkmate", () => {
  // Black king h8 in check from white rook a8, but can escape to h7/g7.
  const g = new Chess("R6k/8/8/8/8/8/8/K7 b - - 0 1");
  const r = new DemonRules();
  expect(r.isCheck(g)).toBe(true);
  expect(r.legalMoves(g).length).toBeGreaterThan(0);
  expect(r.isCheckmate(g)).toBe(false);
});

it("black checkmating white still ends the game", () => {
  const g = new Chess("8/8/8/8/8/6k1/5q2/7K b - - 0 1");
  const r = new DemonRules();
  r.play(g, "f2g2");
  expect(r.isCheckmate(g)).toBe(true);
  expect(r.isGameOver(g)).toBe(true);
});
