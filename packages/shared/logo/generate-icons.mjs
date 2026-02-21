import sharp from "sharp";
import { readFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const svgBuffer = readFileSync(join(__dirname, "logo.svg"));

const targets = [
  { size: 192, out: "../../../apps/docs/static/img/app-icon.png" },
  { size: 32, out: "../../../apps/docs/static/img/favicon.png" },
  { size: 128, out: "../../../apps/mobile/src/assets/icons/icon.png" },
];

for (const { size, out } of targets) {
  const outPath = join(__dirname, out);
  mkdirSync(dirname(outPath), { recursive: true });
  await sharp(svgBuffer).resize(size, size).png().toFile(outPath);
  console.log(`${size}x${size} → ${out}`);
}
