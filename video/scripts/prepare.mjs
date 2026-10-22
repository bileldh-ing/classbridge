// Converts the Playwright scene recordings (webm, variable frame rate) into constant-30fps H.264 clips that
// Remotion decodes quickly, and writes src/generated/manifest.json with each clip's real duration.
// Usage: SCENES_DIR=../demo-scenes node scripts/prepare.mjs
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const SRC = process.env.SCENES_DIR ?? "../demo-scenes";
const OUT = "public/scenes";
const TRIM = Number(process.env.TRIM_START ?? 0.7); // drop the blank first frames before the page paints
mkdirSync(OUT, { recursive: true });
mkdirSync("src/generated", { recursive: true });

const probe = (f) =>
  Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString().trim());

const files = readdirSync(SRC).filter((f) => /^scene-\d+.*\.webm$/.test(f)).sort();
const scenes = [];
for (const f of files) {
  const id = f.replace(/\.webm$/, "");
  const out = path.join(OUT, `${id}.mp4`);
  if (!existsSync(out)) {
    execFileSync("ffmpeg", ["-y", "-v", "error", "-ss", String(TRIM), "-i", path.join(SRC, f), "-an", "-vf", "fps=30,format=yuv420p",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-movflags", "+faststart", out], { stdio: "inherit" });
  }
  const seconds = probe(out);
  const dims = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", out]).toString().trim().split(",").map(Number);
  scenes.push({ id, file: `scenes/${id}.mp4`, seconds, width: dims[0], height: dims[1] });
  console.log(id, seconds.toFixed(1) + "s", dims.join("x"));
}
writeFileSync("src/generated/manifest.json", JSON.stringify({ generatedAt: new Date().toISOString(), scenes }, null, 2));
console.log(`total raw ${scenes.reduce((s, x) => s + x.seconds, 0).toFixed(1)}s in ${scenes.length} scenes`);
