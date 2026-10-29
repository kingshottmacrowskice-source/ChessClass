import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import {
  cachedLocalVoice,
  saveLocalVoice,
  saveVoiceManifest,
} from "./local-voice-cache.mjs";
const source = await readFile(
  new URL("../src/live/lines.ts", import.meta.url),
  "utf8",
);
const js = stripTypeScriptTypes(source);
const { localJapaneseLines } = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64")
);
let rate = 1.05,
  pitch = 1;
try {
  const settings = JSON.parse(
    await readFile(
      new URL("../data/live-settings.json", import.meta.url),
      "utf8",
    ),
  );
  rate = settings.voiceConfig?.rate ?? rate;
  pitch = settings.voiceConfig?.pitch ?? pitch;
} catch {}
const speakers = await (
  await fetch("http://127.0.0.1:50032/v1/speakers")
).json();
const speaker = speakers.find((s) => s.styles?.length);
const texts = localJapaneseLines();
let completed = 0,
  generated = 0,
  bytesTotal = 0;
console.log(
  JSON.stringify({
    total: texts.length,
    rate,
    pitch,
    speaker: speaker.speakerName,
    style: speaker.styles[0].styleName,
  }),
);
for (const text of texts) {
  let bytes = await cachedLocalVoice({ japanese: text, rate, pitch });
  if (!bytes) {
    const r = await fetch("http://127.0.0.1:50032/v1/synthesis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        speakerUuid: speaker.speakerUuid,
        styleId: speaker.styles[0].styleId,
        text,
        speedScale: rate,
        pitchScale: pitch - 1,
        volumeScale: 1,
        intonationScale: 1,
        prePhonemeLength: 0.1,
        postPhonemeLength: 0.1,
        outputSamplingRate: 24000,
      }),
      signal: AbortSignal.timeout(120000),
    });
    if (!r.ok) throw Error("Synthesis " + r.status);
    bytes = Buffer.from(await r.arrayBuffer());
    await saveLocalVoice(text, rate, pitch, bytes);
    generated++;
  }
  bytesTotal += bytes.length;
  completed++;
  if (completed % 200 === 0)
    console.log(JSON.stringify({ completed, total: texts.length }));
}
await saveVoiceManifest({
  speaker: speaker.speakerName,
  speakerUuid: speaker.speakerUuid,
  styleId: speaker.styles[0].styleId,
  rate,
  pitch,
  count: completed,
  bytesTotal,
  createdAt: new Date().toISOString(),
});
console.log(JSON.stringify({ completed, generated, bytesTotal }));
