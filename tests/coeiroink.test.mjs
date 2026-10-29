import { test } from "node:test";
import assert from "node:assert/strict";
import { synthesizeJapanese } from "../scripts/coeiroink.mjs";
test("Chinese text is translated before local synthesis, with no key sent to the engine", async () => {
  const calls = [];
  const fake = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith("/speakers"))
      return Response.json([
        { speakerUuid: "installed", styles: [{ styleId: 90 }] },
      ]);
    if (url.endsWith("/completions"))
      return Response.json({
        choices: [
          { message: { content: JSON.stringify({ text: "こんにちは。", styleId: 90 }) }, finish_reason: "stop" },
        ],
      });
    return new Response("RIFF");
  };
  const audio = await synthesizeJapanese(
    { input: "你好[BGM_NEXT]", rate: 1, pitch: 1 },
    { deepseek: { apiKey: "secret" } },
    fake,
  );
  assert.equal(await audio.text(), "RIFF");
  const translation = JSON.parse(calls[1].init.body);
  assert.equal(translation.messages[1].content, "你好");
  assert.deepEqual(translation.thinking, { type: "disabled" });
  const synthesis = JSON.parse(calls[2].init.body);
  assert.equal(synthesis.text, "こんにちは。");
  assert.equal(synthesis.styleId, 90);
  assert.equal(synthesis.pitchScale, 0);
  assert.equal(calls[2].init.headers.Authorization, undefined);
});
test("failed translation never falls back to reading Chinese", async () => {
  let count = 0;
  await assert.rejects(
    synthesizeJapanese(
      { input: "你好" },
      { deepseek: { apiKey: "secret" } },
      async () => {
        count++;
        return count === 1
          ? Response.json([{ speakerUuid: "a", styles: [{ styleId: 1 }] }])
          : new Response("", { status: 503 });
      },
    ),
  );
  assert.equal(count, 2);
});

test("fixed Japanese local dialogue needs no AI key or translation request", async () => {
  const calls = [];
  await synthesizeJapanese(
    { input: "我的马！", japanese: "私のナイト！" },
    {},
    async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith("/speakers"))
        return Response.json([
          { speakerUuid: "local", styles: [{ styleId: 90 }] },
        ]);
      return new Response("RIFF");
    },
  );
  assert.equal(calls.length, 2);
  assert.equal(JSON.parse(calls[1].init.body).text, "私のナイト！");
  assert.ok(calls.every((c) => c.url.startsWith("http://127.0.0.1:50032/")));
});

for (const chosen of [90, 91, 92, 93, 999])
  test(`AI style ${chosen} is validated against installed styles`, async () => {
    let synthesis;
    await synthesizeJapanese(
      { input: "你的棋子我收下了" },
      { deepseek: { apiKey: "test" } },
      async (url, init) => {
        if (url.endsWith("/speakers"))
          return Response.json([
            {
              speakerUuid: "a",
              styles: [90, 91, 92, 93].map((styleId) => ({
                styleId,
                styleName: String(styleId),
              })),
            },
          ]);
        if (url.endsWith("/completions")) {
          assert.deepEqual(JSON.parse(init.body).response_format, {
            type: "json_object",
          });
          return Response.json({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    text: "いただきます。",
                    styleId: chosen,
                  }),
                },
                finish_reason: "stop",
              },
            ],
          });
        }
        synthesis = JSON.parse(init.body);
        return new Response("RIFF");
      },
    );
    assert.equal(synthesis.styleId, chosen === 999 ? 90 : chosen);
    assert.equal(synthesis.text, "いただきます。");
  });
