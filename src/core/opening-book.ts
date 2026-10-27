import { DEFAULT_POSITION } from "chess.js";
import type { Position } from "./game";
export type OpeningResult = {
  article: null | {
    name: string;
    title: string;
    paragraphs: string[];
    url: string;
    revisionUrl: string;
    historyUrl: string;
    fetchedAt: number;
  };
  status: "found" | "not-found" | "not-applicable" | "unavailable";
  cached?: boolean;
  stale?: boolean;
};
export type OpeningArticle = NonNullable<OpeningResult["article"]>;
export type OpeningTranslation = { title: string; paragraphs: string[] };
export function validateTranslation(
  value: unknown,
  article: OpeningArticle,
): OpeningTranslation {
  const v = value as OpeningTranslation;
  const tokens = (text: string) =>
    (
      text.match(
        /(?<![A-Za-z0-9])(?:[a-h][1-8][a-h][1-8][qrbn]?|O-O(?:-O)?|[KQRBN]?[a-h1-8]?x?[a-h][1-8](?:=[QRBN])?)[+#]?(?![A-Za-z0-9])/g,
      ) ?? []
    )
      .sort()
      .join(" ");
  if (
    !v ||
    Object.keys(v).sort().join(",") !== "paragraphs,title" ||
    typeof v.title !== "string" ||
    !v.title.trim() ||
    v.title.length > 500 ||
    !Array.isArray(v.paragraphs) ||
    v.paragraphs.length !== article.paragraphs.length ||
    !v.paragraphs.length ||
    tokens(v.title) !== tokens(article.name) ||
    v.paragraphs.some(
      (p, i) =>
        typeof p !== "string" ||
        !p.trim() ||
        p.length > 32000 ||
        tokens(p) !== tokens(article.paragraphs[i]),
    )
  )
    throw new Error(
      "开局翻译校验失败：段落或棋步记号与原文不一致，请重试或查看原文。",
    );
  return v;
}
export const openingEligible = (p: Position) =>
  p.start === DEFAULT_POSITION && p.moves.length > 0 && p.moves.length <= 24;
export async function lookupOpening(
  p: Position,
  signal: AbortSignal,
): Promise<OpeningResult> {
  if (!openingEligible(p)) return { article: null, status: "not-applicable" };
  try {
    const response = await fetch("/api/opening-book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
      signal: AbortSignal.any([signal, AbortSignal.timeout(8500)]),
    });
    if (!response.ok) throw new Error();
    return await response.json();
  } catch {
    return { article: null, status: "unavailable" };
  }
}
