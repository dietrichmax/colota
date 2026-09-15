import sharp from "sharp"
import { readFileSync, mkdirSync, existsSync } from "fs"
import { join, dirname, resolve } from "path"
import { fileURLToPath } from "url"
import { lightColors } from "../packages/shared/dist/colors.js"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const SRC = join(ROOT, "apps", "docs", "static", "img", "screenshots")
const FONTS = join(ROOT, "apps", "mobile", "android", "app", "src", "main", "assets", "fonts")
const OUT = resolve(
  process.argv[2] ?? join(ROOT, "fastlane", "metadata", "android", "en-US", "images", "phoneScreenshots")
)
const slides = JSON.parse(readFileSync(join(ROOT, "screenshots", "store.json"), "utf8"))

const W = 1080
const H = 1920
const PHONE_TOP = 500
const SCREEN_W = 600
const BEZEL = 14
const SCREEN_RADIUS = 48
const TEXT_W = 920

const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

async function renderText(text, font, fontfile, color, letterSpacing) {
  const markup = `<span foreground="${color}" letter_spacing="${letterSpacing}">${escape(text)}</span>`
  const { data, info } = await sharp({
    text: { text: markup, font, fontfile: join(FONTS, fontfile), width: TEXT_W, align: "centre", rgba: true, dpi: 72 }
  })
    .png()
    .toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height }
}

function backgroundSvg(screenH) {
  const deviceW = SCREEN_W + 2 * BEZEL
  const deviceH = screenH + 2 * BEZEL
  const x = (W - deviceW) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${lightColors.primaryDark}"/>
      <stop offset="1" stop-color="${lightColors.primary}"/>
    </linearGradient>
    <filter id="blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="36"/></filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect x="${x}" y="${PHONE_TOP + 40}" width="${deviceW}" height="${deviceH}" rx="${SCREEN_RADIUS + BEZEL}" fill="#000000" fill-opacity="0.45" filter="url(#blur)"/>
  <rect x="${x}" y="${PHONE_TOP}" width="${deviceW}" height="${deviceH}" rx="${SCREEN_RADIUS + BEZEL}" fill="#0D0D0D" stroke="#3A3A3A" stroke-width="3"/>
</svg>`
}

async function placeholder(shot) {
  const label = await renderText(shot, "Inter Medium 64", "Inter-Medium.ttf", lightColors.textSecondary, 0)
  return sharp({ create: { width: 1080, height: 2400, channels: 4, background: lightColors.well } })
    .composite([{ input: label.data, left: Math.round((1080 - label.width) / 2), top: 900 }])
    .png()
    .toBuffer()
}

async function renderSlide({ source, shot, headline, subline }, index) {
  const file = join(SRC, source)
  const input = existsSync(file) ? file : await placeholder(shot)
  const { width, height } = await sharp(input).metadata()
  const screenH = Math.round((SCREEN_W * height) / width)

  const mask = `<svg xmlns="http://www.w3.org/2000/svg" width="${SCREEN_W}" height="${screenH}"><rect width="${SCREEN_W}" height="${screenH}" rx="${SCREEN_RADIUS}" fill="#FFFFFF"/></svg>`
  const rounded = await sharp(input)
    .resize(SCREEN_W, screenH)
    .composite([{ input: Buffer.from(mask), blend: "dest-in" }])
    .png()
    .toBuffer()
  const screen = await sharp(rounded)
    .extract({ left: 0, top: 0, width: SCREEN_W, height: Math.min(screenH, H - PHONE_TOP - BEZEL) })
    .toBuffer()

  const title = await renderText(headline, "Inter Bold 88", "Inter-Bold.ttf", "#FFFFFF", -1536)
  const sub = await renderText(subline, "Inter Medium 44", "Inter-Medium.ttf", lightColors.primaryContainer, 0)
  const gap = 44
  const textTop = Math.round((PHONE_TOP - (title.height + gap + sub.height)) / 2)

  const out = join(OUT, `${index + 1}.png`)
  await sharp(Buffer.from(backgroundSvg(screenH)))
    .composite([
      { input: title.data, left: Math.round((W - title.width) / 2), top: textTop },
      { input: sub.data, left: Math.round((W - sub.width) / 2), top: textTop + title.height + gap },
      { input: screen, left: (W - SCREEN_W) / 2, top: PHONE_TOP + BEZEL }
    ])
    .png()
    .toFile(out)
  console.log(`${input === file ? source : `${source} (placeholder)`} -> ${out}`)
}

const missing = slides.filter((slide) => !existsSync(join(SRC, slide.source))).map((slide) => slide.source)
if (missing.length > 0 && !process.argv[2]) {
  console.error(`Missing in ${SRC}: ${missing.join(", ")}. Pass an output directory to preview with placeholders.`)
  process.exit(1)
}

mkdirSync(OUT, { recursive: true })
for (const [index, slide] of slides.entries()) {
  await renderSlide(slide, index)
}
