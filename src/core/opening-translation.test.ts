import { describe, it, expect, vi } from "vitest";
import { Llm, defaults } from "./explanation";
import {
  validateTranslation,
  type OpeningArticle,
  type OpeningTranslation,
} from "./opening-book";
const article: OpeningArticle = {
  name: "King's Pawn Opening",
  title: "Chess Opening Theory/1. e4",
  paragraphs: ["1. e4 controls the center."],
  url: "https://en.wikibooks.org/wiki/Chess_Opening_Theory/1._e4",
  revisionUrl: "https://en.wikibooks.org/w/index.php?oldid=1",
  historyUrl: "https://en.wikibooks.org/w/index.php?action=history",
  fetchedAt: 1,
};
const translation = { title: "王兵开局", paragraphs: ["1. e4 控制中心。"] };
describe("opening translations", () => {
  it("preserves paragraph alignment and move notation", () => {
    expect(validateTranslation(translation, article)).toEqual(translation);
    expect(() =>
      validateTranslation(
        { ...translation, paragraphs: ["1. e5 控制中心。"] },
        article,
      ),
    ).toThrow();
    expect(() =>
      validateTranslation({ ...translation, paragraphs: [] }, article),
    ).toThrow();
    expect(() =>
      validateTranslation({ ...translation, extra: "new advice" }, article),
    ).toThrow();
  });
  it("reuses persisted translations while separating article revision, language and model", async () => {
    const rows = new Map<string, OpeningTranslation>();
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({
        choices: [{ message: { content: JSON.stringify(translation) } }],
      }),
    );
    const make = () => {
      const llm = new Llm(fetcher);
      vi.spyOn(llm.translationStore, "get").mockImplementation(async (key) =>
        rows.get(key),
      );
      vi.spyOn(llm.translationStore, "put").mockImplementation(
        async (key, value) => {
          rows.set(key, value);
        },
      );
      return llm;
    };
    const settings = {
      ...defaults,
      model: "translation-model",
      key: "fake-private-key",
    };
    const first = make();
    const pending = first.translateOpening(article, settings);
    expect(first.translateOpening(article, settings)).toBe(pending);
    await pending;
    const reopened = make();
    expect(await reopened.translateOpening(article, settings)).toEqual(
      translation,
    );
    expect(reopened.translationSource).toBe("disk");
    expect(fetcher).toHaveBeenCalledTimes(1);
    await make().translateOpening(
      { ...article, revisionUrl: article.revisionUrl + "2" },
      settings,
    );
    await make().translateOpening(article, { ...settings, model: "other" });
    await make().translateOpening(article, {
      ...settings,
      language: "English",
    });
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(JSON.stringify([...rows])).not.toContain(settings.key);
    expect([...rows.keys()].every((key) => /^[a-f0-9]{64}$/.test(key))).toBe(
      true,
    );
  });
});
