import { expect, it } from "vitest";
import { moveReaction } from "./lines";
it("restores bilingual reactions for both sides and captures", () => {
  for (const color of ["w", "b"])
    for (const captured of [undefined, "n"]) {
      const r = moveReaction({
        color,
        piece: "p",
        captured,
        to: "e4",
        san: captured ? "dxe4" : "e4",
      });
      expect(r.text).toBeTruthy();
      expect(r.japanese).toMatch(/[ぁ-んァ-ン]/);
      expect(r.japanese).not.toContain("{");
      expect(r.kind).toBe(
        captured
          ? color === "b"
            ? "myCapture"
            : "lostPiece"
          : color === "b"
            ? "myMove"
            : "theirMove",
      );
    }
});

it("prebuilt catalogue covers every piece, square and reaction variant", async () => {
  const { localJapaneseLines } = await import("./lines");
  const catalogue = new Set(localJapaneseLines());
  for (const color of ["w", "b"])
    for (const piece of "pnbrqk")
      for (const file of "abcdefgh")
        for (const rank of "12345678")
          for (const captured of [undefined, "p", "n", "b", "r", "q"]) {
            for (let i = 0; i < 4; i++)
              expect(
                catalogue.has(
                  moveReaction({
                    color,
                    piece,
                    captured,
                    to: file + rank,
                    san: "e4",
                  }).japanese,
                ),
              ).toBe(true);
          }
});

it("prioritizes check and mate over capture, with cached bilingual reactions", async () => {
  const { localJapaneseLines } = await import("./lines");
  const catalogue = new Set(localJapaneseLines());
  for (const [color, san, kind] of [
    ["w", "Qxe7+", "gotChecked"],
    ["w", "Qxe7#", "gotMated"],
    ["b", "Qxe7#", "myMate"],
  ] as const) {
    for (let i = 0; i < 12; i++) {
      const r = moveReaction({
        color,
        piece: "q",
        captured: "r",
        to: "e7",
        san,
      });
      expect(r.kind).toBe(kind);
      expect(r.text).not.toContain("{");
      expect(catalogue.has(r.japanese)).toBe(true);
    }
  }
});
