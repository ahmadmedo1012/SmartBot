// p6 (Phase 6, P6-2-d4 GROUP 1) — regenerate the SmartBot raster brand
// assets in the «Circuit Petrol» identity: petrol ground #071A21, teal
// SIGNAL visor #17C3A4 (the machine's voice), lime LED #C6F24E (the
// AI/automation heartbeat). Replaces the retired night+gold Madarek
// marks that contradicted the already-petrol manifest.ts.
//
// Mirrors the Smart-Menu pattern (scripts/r152-regen-brand.mjs): one
// glyph SVG drawn at 512, every export a lanczos downscale — plus an
// in-script PIXEL VERIFICATION pass (zero Madarek night #070B16, zero
// gold-family, petrol/teal/lime present) whose evidence prints to stdout
// and rides the commit message.
//
// Targets (EXACT current sizes/formats/paths, zero markup change):
//   public/favicon.png (96, full-bleed rounded square r≈18%)
//   public/brand-icon.png (160, circular badge Ø80%)
//   public/icon-192.png (192, circular badge Ø80%)
//   public/icon-512.png (512, circular badge Ø80%, palette PNG)
//   public/icon-192-maskable.png + public/icon-512-maskable.png (full-bleed,
//     glyph inside the maskable safe zone)
//   public/apple-touch-icon.png (180, full-bleed — iOS masks itself)
//   src/app/favicon.ico (16/32/48 PNG-in-ICO)
//   src/app/opengraph-image.png (1200×630 — Playwright render of a petrol
//     HTML stage so Arabic + Space Grotesk shape through the REAL local
//     woff2 faces, exactly as the app ships them)
//
// Usage: node scripts/p6-regen-brand.mjs
import sharp from "sharp";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ── Circuit Petrol constants (globals.css dark-theme literals) ── */
const PETROL = "#071A21"; // ground (background)
const SHELL = "#123039"; // robot head shell (--secondary)
const CARD = "#0D2830"; // ear nodes (--card)
const HAIRLINE = "#1D4450"; // circuit strokes (--border)
const TEAL = "#17C3A4"; // SIGNAL TEAL visor (--accent-solid)
const LIME = "#C6F24E"; // LED (--c-lime-ink)

/* ── The RobotMark-inspired glyph — robot head only (antenna + LED +
   ear circuit nodes + matte shell + sunken visor slot + teal glass +
   idle eyes), cropped from src/components/shared/RobotMark.tsx's
   0 0 120 120 geometry into a 120×84 viewBox. ── */
function glyph() {
  return `
  <line x1="60" y1="14" x2="60" y2="28" stroke="${HAIRLINE}" stroke-width="3" stroke-linecap="round"/>
  <circle cx="60" cy="9" r="5.5" fill="${LIME}"/>
  <rect x="8" y="44" width="7" height="16" rx="3.5" fill="${CARD}" stroke="${HAIRLINE}" stroke-width="1.5"/>
  <rect x="105" y="44" width="7" height="16" rx="3.5" fill="${CARD}" stroke="${HAIRLINE}" stroke-width="1.5"/>
  <rect x="22" y="24" width="76" height="56" rx="18" fill="${SHELL}" stroke="${HAIRLINE}" stroke-width="2"/>
  <rect x="32" y="36" width="56" height="28" rx="13" fill="${PETROL}" stroke="${HAIRLINE}" stroke-width="1.5"/>
  <rect x="35" y="39" width="50" height="22" rx="10" fill="${TEAL}"/>
  <rect x="45" y="45" width="9" height="12" rx="4.5" fill="${PETROL}"/>
  <rect x="66" y="45" width="9" height="12" rx="4.5" fill="${PETROL}"/>`;
}

/* master SVG (drawn at 512) — `kind` picks the badge law:
   circle  → circular badge Ø80% of canvas (brand-icon / icon-192 / icon-512)
   rounded → full-bleed rounded square r≈18% (favicon)
   full    → full-bleed square, glyph in the maskable safe zone (maskables +
             apple-touch; glyph width ≈46% keeps every OS crop safe) */
function masterSvg(kind) {
  const S = 512;
  const gw = 512 * (kind === "full" ? 0.46 : 0.67); // glyph width in the 512 box
  const gh = (gw * 84) / 120;
  const dx = (S - gw) / 2;
  const dy = (S - gh) / 2;
  const scale = gw / 120;
  let ground = "";
  if (kind === "circle") {
    const d = S * 0.8;
    ground = `<circle cx="${S / 2}" cy="${S / 2}" r="${d / 2}" fill="${PETROL}"/>`;
  } else if (kind === "rounded") {
    const r = S * 0.18;
    ground = `<rect x="0" y="0" width="${S}" height="${S}" rx="${r}" fill="${PETROL}"/>`;
  } else {
    ground = `<rect x="0" y="0" width="${S}" height="${S}" fill="${PETROL}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  ${ground}
  <g transform="translate(${dx} ${dy}) scale(${scale})">${glyph()}</g>
</svg>`;
}

async function png(size, out, kind, palette = false) {
  const buf = Buffer.from(masterSvg(kind));
  await sharp(buf)
    .resize(size, size, { kernel: "lanczos3" })
    .png({ palette, effort: palette ? 10 : 7 })
    .toFile(join(ROOT, out));
  console.log("✓", out, `${size}x${size}`, kind);
}

/* ICO container with PNG payloads (Vista+ — every modern browser). */
async function ico(sizes, out) {
  const images = [];
  for (const size of sizes) {
    images.push(
      await sharp(Buffer.from(masterSvg("rounded"))).resize(size, size, { kernel: "lanczos3" }).png().toBuffer(),
    );
  }
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);
  const entries = Buffer.alloc(16 * count);
  let offset = 6 + 16 * count;
  images.forEach((buf, i) => {
    entries.writeUInt8(sizes[i], i * 16 + 0);
    entries.writeUInt8(sizes[i], i * 16 + 1);
    entries.writeUInt16LE(1, i * 16 + 4);
    entries.writeUInt16LE(32, i * 16 + 6);
    entries.writeUInt32LE(buf.length, i * 16 + 8);
    entries.writeUInt32LE(offset, i * 16 + 12);
    offset += buf.length;
  });
  writeFileSync(join(ROOT, out), Buffer.concat([header, entries, ...images]));
  console.log("✓", out, sizes.join("/"));
}

/* ── opengraph-image.png — 1200×630 petrol stage, rendered through
   Chromium so the REAL local woff2 faces shape the Arabic + the Space
   Grotesk display line (librsvg/pango have no Arabic shaper in this
   sandbox and no Space Grotesk face at all). ── */
async function og() {
  const b64 = (p) => `data:font/woff2;base64,${readFileSync(join(ROOT, "public", p)).toString("base64")}`;
  const html = `<!doctype html>
<html dir="rtl" lang="ar"><head><meta charset="utf-8"><style>
  @font-face { font-family: "Space Grotesk"; src: url(${b64("fonts/space-grotesk-latin.woff2")}) format("woff2"); font-weight: 300 700; }
  @font-face { font-family: "IBM Plex Sans Arabic"; src: url(${b64("fonts/plex-sans-arabic-500-normal-arabic.woff2")}) format("woff2"); font-weight: 500; }
  @font-face { font-family: "IBM Plex Sans Arabic"; src: url(${b64("fonts/plex-sans-arabic-700-normal-arabic.woff2")}) format("woff2"); font-weight: 700; }
  @font-face { font-family: "IBM Plex Mono"; src: url(${b64("fonts/plex-mono-400-normal-latin.woff2")}) format("woff2"); font-weight: 400; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 1200px; height: 630px; overflow: hidden; background: #071A21; color: #E9F5F0;
         font-family: "IBM Plex Sans Arabic"; position: relative; }
  .grid { position: absolute; inset: 0;
          background-image: linear-gradient(#0D2830 1px, transparent 1px), linear-gradient(90deg, #0D2830 1px, transparent 1px);
          background-size: 60px 60px; opacity: .35; }
  .trace { position: absolute; inset-inline: 64px; height: 2px; bottom: 84px; background: repeating-linear-gradient(to left, #1D4450 0 14px, transparent 14px 26px); }
  .trace .node { position: absolute; top: -3px; width: 8px; height: 8px; border-radius: 50%; background: #1D4450; }
  .trace .node.live { background: #C6F24E; box-shadow: 0 0 14px rgba(198,242,78,.55); }
  .row { position: absolute; inset: 64px 72px 108px 72px; display: flex; align-items: center; gap: 64px; }
  .robot { flex: 0 0 auto; }
  .type { flex: 1 1 auto; }
  .eyebrow { display: flex; align-items: center; gap: 14px; color: #C6F24E; font-size: 30px; font-weight: 500; }
  .eyebrow .led { width: 14px; height: 14px; border-radius: 50%; background: #C6F24E; box-shadow: 0 0 16px rgba(198,242,78,.6); }
  h1 { font-family: "Space Grotesk"; font-weight: 700; font-size: 118px; line-height: 1.02;
       color: #17C3A4; letter-spacing: -0.02em; margin-top: 14px; }
  h2 { font-size: 46px; font-weight: 700; color: #E9F5F0; margin-top: 18px; line-height: 1.35; }
  p  { font-size: 27px; font-weight: 500; color: #9FC3BC; margin-top: 14px; line-height: 1.6; }
  .domain { position: absolute; bottom: 58px; inset-inline-start: 72px; direction: ltr;
            font-family: "IBM Plex Mono"; font-size: 21px; color: #6E938E; }
</style></head>
<body>
  <div class="grid"></div>
  <div class="row">
    <svg class="robot" width="300" height="210" viewBox="0 0 120 84" aria-hidden="true">${glyph()}</svg>
    <div class="type">
      <div class="eyebrow"><span class="led"></span><span>الربط الذكي</span></div>
      <h1>SmartBot</h1>
      <h2>منصة إدارة فيسبوك الذكية</h2>
      <p>أتمتة الردود · تحليلات متقدمة · إدارة متكاملة لصفحات فيسبوك</p>
    </div>
  </div>
  <div class="trace">
    <span class="node" style="inset-inline-start: 6%;"></span>
    <span class="node" style="inset-inline-start: 38%;"></span>
    <span class="node live" style="inset-inline-start: 70%;"></span>
    <span class="node" style="inset-inline-start: 94%;"></span>
  </div>
  <div class="domain">bot.smart-link.ly</div>
</body></html>`;
  const dir = mkdtempSync(join(tmpdir(), "sb-og-"));
  const file = join(dir, "og.html");
  writeFileSync(file, html);
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    ({ chromium } = await import("playwright-core"));
  }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto(`file://${file}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  /* evidence: the four faces actually resolved (a fallback would still
     screenshot — this proves the brand typography shipped in the PNG). */
  const fontsOk = await page.evaluate(() => ({
    grotesk: document.fonts.check('700 100px "Space Grotesk"'),
    plex700: document.fonts.check('700 40px "IBM Plex Sans Arabic"'),
    plex500: document.fonts.check('500 40px "IBM Plex Sans Arabic"'),
    mono: document.fonts.check('400 20px "IBM Plex Mono"'),
  }));
  console.log("  og fonts:", JSON.stringify(fontsOk));
  await page.screenshot({ path: join(ROOT, "src/app/opengraph-image.png"), type: "png" });
  await browser.close();
  rmSync(dir, { recursive: true, force: true });
  console.log("✓ src/app/opengraph-image.png 1200x630 (chromium stage)");
}

/* ── PIXEL VERIFICATION — the evidence pass ──
   For every output: exact-format assert + full-buffer scan for
   (a) Madarek night #070B16 pixels — must be ZERO,
   (b) Madarek gold family (R 185-235 / G 130-185 / B 35-85 — catches
       #E4AF4A, #D5A13A, #C29A32 and every AA blend between them) — ZERO,
   (c) petrol ground, SIGNAL teal, lime LED — all PRESENT. */
async function verify(file, { w, h } = {}) {
  const abs = join(ROOT, file);
  const meta = await sharp(abs).metadata();
  const { data, info } = await sharp(abs).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, CH = 4;
  const px = (x, y) => {
    const i = (y * W + x) * CH;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  };
  const near = (p, hex, tol = 10) => {
    const [r, g, b] = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
    return Math.abs(p[0] - r) <= tol && Math.abs(p[1] - g) <= tol && Math.abs(p[2] - b) <= tol;
  };
  const gold = (p) => p[0] >= 185 && p[0] <= 235 && p[1] >= 130 && p[1] <= 185 && p[2] >= 35 && p[2] <= 85;
  const madarek = (p) => near(p, "#070B16", 2);
  let n = 0, night = 0, gld = 0, petrol = 0, teal = 0, lime = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < W; x++) {
      const p = px(x, y);
      if (p[3] < 8) continue;
      n++;
      if (madarek(p)) night++;
      if (gold(p)) gld++;
      if (near(p, "#071A21", 6)) petrol++;
      if (near(p, "#17C3A4", 14)) teal++;
      if (near(p, "#C6F24E", 14)) lime++;
    }
  }
  const c = px(Math.floor(W / 2), Math.floor(info.height / 2));
  const fail = [];
  if (w && (meta.width !== w || meta.height !== h)) fail.push(`size ${meta.width}x${meta.height}`);
  if (night !== 0) fail.push(`madarek-night:${night}`);
  if (gld !== 0) fail.push(`gold:${gld}`);
  if (petrol === 0) fail.push("no-petrol");
  if (teal === 0) fail.push("no-teal");
  if (lime === 0) fail.push("no-lime");
  console.log(
    `${fail.length ? "✗" : "✓"} verify ${file} — opaque:${n} petrol:${petrol} teal:${teal} lime:${lime}` +
      ` madarekNight:${night} goldFamily:${gld} center:rgb(${c[0]},${c[1]},${c[2]}) ${fail.length ? "FAIL " + fail.join(",") : "PASS"}`,
  );
  if (fail.length) process.exitCode = 1;
}

function verifyIco(file, sizes) {
  const buf = readFileSync(join(ROOT, file));
  const type = buf.readUInt16LE(2);
  const count = buf.readUInt16LE(4);
  const ok = type === 1 && count === sizes.length && sizes.every((s, i) => buf.readUInt8(6 + 16 * i) === s);
  console.log(`${ok ? "✓" : "✗"} verify ${file} — ICO type:${type} entries:${count} sizes:${sizes.join("/")} ${ok ? "PASS" : "FAIL"}`);
  if (!ok) process.exitCode = 1;
}

await png(96, "public/favicon.png", "rounded");
await png(160, "public/brand-icon.png", "circle");
await png(192, "public/icon-192.png", "circle");
await png(512, "public/icon-512.png", "circle", true); // palette PNG — matches the old set's indexed format
await png(192, "public/icon-192-maskable.png", "full");
await png(512, "public/icon-512-maskable.png", "full");
await png(180, "public/apple-touch-icon.png", "full");
await ico([16, 32, 48], "src/app/favicon.ico");
await og();

await verify("public/favicon.png", { w: 96, h: 96 });
await verify("public/brand-icon.png", { w: 160, h: 160 });
await verify("public/icon-192.png", { w: 192, h: 192 });
await verify("public/icon-512.png", { w: 512, h: 512 });
await verify("public/icon-192-maskable.png", { w: 192, h: 192 });
await verify("public/icon-512-maskable.png", { w: 512, h: 512 });
await verify("public/apple-touch-icon.png", { w: 180, h: 180 });
await verify("src/app/opengraph-image.png", { w: 1200, h: 630 });
verifyIco("src/app/favicon.ico", [16, 32, 48]);
console.log("done — 9 raster brand assets re-rendered in the Circuit Petrol identity");
