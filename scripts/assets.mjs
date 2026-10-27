import {
  mkdir,
  copyFile,
  readdir,
  readFile,
  writeFile,
} from "node:fs/promises";
await mkdir("public/engine", { recursive: true });
await mkdir("public/licenses", { recursive: true });
for (const file of await readdir("node_modules/stockfish/bin"))
  if (file === "stockfish-19.js" || file === "stockfish-19.wasm")
    await copyFile(
      "node_modules/stockfish/bin/" + file,
      "public/engine/" + file,
    );
for (const [pkg, file] of [
  ["stockfish", "Copying.txt"],
  ["chess.js", "LICENSE"],
  ["react-chessboard", "LICENSE"],
  ["react", "LICENSE"],
  ["react-dom", "LICENSE"],
])
  await copyFile(`node_modules/${pkg}/${file}`, `public/licenses/${pkg}.txt`);
await copyFile("node_modules/stockfish/Copying.txt", "LICENSE");
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
let notices =
  "Runtime dependency licenses. Generated from installed, locked packages.\n";
for (const [path, meta] of Object.entries(lock.packages)) {
  if (!path || meta.dev || meta.optional) continue;
  const pkg = JSON.parse(await readFile(path + "/package.json", "utf8"));
  notices += `\n\n==== ${pkg.name} ${pkg.version} (${pkg.license}) ====\n${typeof pkg.repository === "object" ? pkg.repository.url : (pkg.repository ?? "")}\n`;
  const files = (await readdir(path)).filter((f) =>
    /^(license|copying|notice)(\.|$)/i.test(f),
  );
  for (const file of files)
    notices += (await readFile(path + "/" + file, "utf8")) + "\n";
  if (!files.length && pkg.name.startsWith("@react-dnd/")) {
    notices += await readFile("node_modules/react-dnd/LICENSE", "utf8");
    notices += "\nOriginal utility fork license:\n";
    notices += await readFile(
      "licenses/react-dnd-" + pkg.name.split("/")[1] + ".txt",
      "utf8",
    );
  } else if (!files.length) {
    throw new Error("Missing production license: " + pkg.name);
  }
}
await writeFile("public/licenses/production-notices.txt", notices);
await copyFile(
  "THIRD_PARTY_NOTICES.md",
  "public/licenses/THIRD_PARTY_NOTICES.md",
);
