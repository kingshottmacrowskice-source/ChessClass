import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../data/local-voice/", import.meta.url));
export const voiceCacheKey = (text, rate = 1.05, pitch = 1) =>
  createHash("sha256")
    .update(JSON.stringify([text, rate, pitch]))
    .digest("hex");
export async function cachedLocalVoice(body) {
  if (typeof body.japanese !== "string") return null;
  try {
    return await readFile(
      root + voiceCacheKey(body.japanese, body.rate, body.pitch) + ".wav",
    );
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
export async function saveLocalVoice(text, rate, pitch, bytes) {
  if (bytes.toString("ascii", 0, 4) !== "RIFF") throw Error("Invalid WAV");
  await mkdir(root, { recursive: true });
  await writeFile(root + voiceCacheKey(text, rate, pitch) + ".wav", bytes);
}
export async function saveVoiceManifest(value) {
  await mkdir(root, { recursive: true });
  await writeFile(root + "manifest.json", JSON.stringify(value, null, 2));
}
