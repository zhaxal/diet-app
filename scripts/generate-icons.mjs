/*
 * Generates every app icon from one geometry definition.
 *
 * Run: node scripts/generate-icons.mjs
 *
 * The output is committed — this is not a build step. It exists so the SVG and
 * the PNGs can never drift from each other, and so the mark is defined in the
 * design system's own tokens rather than redrawn by hand in two file formats.
 *
 * There is no image library here on purpose. The mark is axis-aligned
 * rectangles, so it rasterises exactly with no anti-aliasing and no dependency —
 * which matters for a project whose whole constraint is surviving on one small
 * box for years. `sharp` happens to be present as a transitive dependency of
 * Next; relying on that for a committed artifact would be borrowing trouble.
 */

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

// ── The mark ───────────────────────────────────────────────────────────────
//
// Three meter bars: the system's signature component, and the structure of the
// Today screen at a glance. Amber fills of differing length against a sunken
// track, on the app's own dark ground.
//
// What it deliberately is not: the ring it replaces. DESIGN.md bans circles
// ("The Nothing-Is-Round Rule"), bans gradients, and lists progress rings among
// the things that stand in for content — and the old icon was an emerald
// gradient ring, in a colour that is not in the palette at all. It was the last
// place that emerald survived.

const GROUND = [0x09, 0x0c, 0x11]; // --bg, dark. Also the manifest theme_color.
const TRACK = [0x1a, 0x20, 0x29]; // --line-soft, dark
const FILL = [0xf5, 0x9e, 0x0b]; // --accent, dark

/** Fill fraction of each bar. Three readings, all still in range. */
const FILLS = [0.86, 0.48, 0.68];

/**
 * Bars as fractions of the canvas, so one definition drives every size.
 * `spread` is how much of the canvas the mark's bounding box spans.
 */
function bars(spread) {
  const width = spread;
  const barH = (spread * 0.185) / 1;
  const gap = spread * 0.115;
  const totalH = 3 * barH + 2 * gap;
  const x = (1 - width) / 2;
  const y0 = (1 - totalH) / 2;

  return FILLS.map((f, i) => ({
    x,
    y: y0 + i * (barH + gap),
    w: width,
    h: barH,
    fill: f,
  }));
}

/**
 * A maskable icon may be cropped to a circle of 80% diameter, so its content
 * has to sit inside that circle — not merely inside an 80% square. The corner
 * of the mark's bounding box is the binding constraint.
 */
const SPREAD = { any: 0.76, maskable: 0.54 };

function assertMaskableFits() {
  const [first] = bars(SPREAD.maskable);
  const last = bars(SPREAD.maskable)[2];
  const halfW = first.w / 2;
  const halfH = (last.y + last.h - first.y) / 2;
  const corner = Math.hypot(halfW, halfH);
  const safe = 0.4; // radius of the guaranteed-visible circle
  if (corner > safe) {
    throw new Error(
      `Maskable mark reaches ${corner.toFixed(3)} from centre, past the ${safe} safe radius`,
    );
  }
  return { corner, safe };
}

// ── SVG ────────────────────────────────────────────────────────────────────

const hex = ([r, g, b]) =>
  "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");

function svg(variant) {
  const S = 512;
  const rects = bars(SPREAD[variant])
    .flatMap((b) => {
      const x = (b.x * S).toFixed(1);
      const y = (b.y * S).toFixed(1);
      const w = (b.w * S).toFixed(1);
      const h = (b.h * S).toFixed(1);
      const fw = (b.w * b.fill * S).toFixed(1);
      return [
        `  <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${hex(TRACK)}"/>`,
        `  <rect x="${x}" y="${y}" width="${fw}" height="${h}" fill="${hex(FILL)}"/>`,
      ];
    })
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">
  <rect width="${S}" height="${S}" fill="${hex(GROUND)}"/>
${rects}
</svg>
`;
}

// ── PNG ────────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Opaque RGB. An apple-touch-icon must not be transparent anyway. */
function png(size, variant) {
  const px = Buffer.alloc(size * size * 3);
  for (let i = 0; i < size * size; i++) {
    px[i * 3] = GROUND[0];
    px[i * 3 + 1] = GROUND[1];
    px[i * 3 + 2] = GROUND[2];
  }

  const paint = (x0, y0, w, h, colour) => {
    // Round to whole pixels: every edge is axis-aligned, so the mark lands
    // exactly on the grid at every size and needs no anti-aliasing.
    const xs = Math.round(x0 * size);
    const ys = Math.round(y0 * size);
    const xe = Math.round((x0 + w) * size);
    const ye = Math.round((y0 + h) * size);
    for (let y = Math.max(0, ys); y < Math.min(size, ye); y++) {
      for (let x = Math.max(0, xs); x < Math.min(size, xe); x++) {
        const o = (y * size + x) * 3;
        px[o] = colour[0];
        px[o + 1] = colour[1];
        px[o + 2] = colour[2];
      }
    }
  };

  for (const b of bars(SPREAD[variant])) {
    paint(b.x, b.y, b.w, b.h, TRACK);
    paint(b.x, b.y, b.w * b.fill, b.h, FILL);
  }

  // Scanlines, each prefixed with filter type 0 (none).
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    px.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── Emit ───────────────────────────────────────────────────────────────────

const fit = assertMaskableFits();
mkdirSync(PUBLIC, { recursive: true });

const outputs = [
  ["icon.svg", Buffer.from(svg("any"))],
  ["icon-maskable.svg", Buffer.from(svg("maskable"))],
  // iOS ignores an SVG apple-touch-icon entirely and falls back to a screenshot
  // of the page, which is why the home-screen icon was wrong on iPhone.
  ["apple-touch-icon.png", png(180, "any")],
  ["icon-192.png", png(192, "any")],
  ["icon-512.png", png(512, "any")],
  ["icon-maskable-512.png", png(512, "maskable")],
];

for (const [name, data] of outputs) {
  writeFileSync(join(PUBLIC, name), data);
  console.log(`  ${name.padEnd(26)} ${String(data.length).padStart(7)} bytes`);
}
console.log(
  `\nmaskable mark reaches ${fit.corner.toFixed(3)} of ${fit.safe} safe radius — fits`,
);
