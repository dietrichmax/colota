import sharp from "sharp";
import { readFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const logoBuffer = readFileSync(join(__dirname, "logo.svg"));
const logoTransparentBuffer = readFileSync(join(__dirname, "logo-transparent.svg"));

const targets = [
  // Docs (full logo with background)
  { size: 192, out: "../../../apps/docs/static/img/app-icon.png", src: logoBuffer },
  { size: 32, out: "../../../apps/docs/static/img/favicon.png", src: logoBuffer },
  // In-app (transparent, themed by the app)
  { size: 128, out: "../../../apps/mobile/src/assets/icons/icon.png", src: logoTransparentBuffer },
];

for (const { size, out, src } of targets) {
  const outPath = join(__dirname, out);
  mkdirSync(dirname(outPath), { recursive: true });
  await sharp(src).resize(size, size).png().toFile(outPath);
  console.log(`${size}x${size} → ${out}`);
}
