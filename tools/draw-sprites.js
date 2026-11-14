#!/usr/bin/env node
// Draws the game's own sprite art and writes it to assets/.
//
//   node tools/draw-sprites.js
//
// Every sprite is built here from simple shapes on a block grid, so the art
// is ours and can be redrawn or tweaked from one place. No dependencies: the
// PNG writer below uses Node's built-in zlib.
//
// Sizes and palette match what script.js expects. Changing either shifts the
// night-lift tuning (it assumes the #535353 day paint) or the draw sizes.
//   dino-*.png   88×94  (painted at DINO_WIDTH × DINO_HEIGHT)
//   cactus.png   34×70  (painted per obstacle type; arms reach the side edges
//                        so a cluster reads as one mass)
//   ground.png 2399×24  (road edge on rows 8–9, drawn at natural size)

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const INK = [83, 83, 83, 255]; // #535353, the day paint
const RIM = [255, 255, 255, 255]; // white rim and eye shine
const CLEAR = [255, 255, 255, 0];

// --- Minimal RGBA PNG writer ----------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Block grid ------------------------------------------------------------
// Cells: 0 clear, 1 ink, 2 white detail (eye shine, mouth). A white rim is
// added around the ink afterwards, like a sticker edge, so the shape reads
// against the hills and the night sky.

function grid(w, h) {
  return { w, h, c: new Uint8Array(w * h) };
}

function set(g, x, y, v) {
  if (x >= 0 && y >= 0 && x < g.w && y < g.h) g.c[y * g.w + x] = v;
}

function get(g, x, y) {
  if (x < 0 || y < 0 || x >= g.w || y >= g.h) return 0;
  return g.c[y * g.w + x];
}

function rect(g, x0, y0, x1, y1, v = 1) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(g, x, y, v);
}

function ellipse(g, cx, cy, rx, ry, v = 1) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) set(g, x, y, v);
    }
  }
}

function triangle(g, ax, ay, bx, by, cx, cy, v = 1) {
  const minX = Math.floor(Math.min(ax, bx, cx));
  const maxX = Math.ceil(Math.max(ax, bx, cx));
  const minY = Math.floor(Math.min(ay, by, cy));
  const maxY = Math.ceil(Math.max(ay, by, cy));
  const side = (px, py, qx, qy, rx, ry) => (qx - px) * (ry - py) - (qy - py) * (rx - px);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const d1 = side(ax, ay, bx, by, x, y);
      const d2 = side(bx, by, cx, cy, x, y);
      const d3 = side(cx, cy, ax, ay, x, y);
      const neg = d1 < 0 || d2 < 0 || d3 < 0;
      const pos = d1 > 0 || d2 > 0 || d3 > 0;
      if (!(neg && pos)) set(g, x, y, v);
    }
  }
}

// Paints the grid into pixels. `block` px per cell; `rim` adds a white edge of
// one cell around the ink (8-neighbour) where the cell is clear.
function render(g, block, rim) {
  const W = g.w * block;
  const H = g.h * block;
  const out = Buffer.alloc(W * H * 4);
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      let v = get(g, x, y);
      if (v === 0 && rim) {
        for (let dy = -1; dy <= 1 && v === 0; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (get(g, x + dx, y + dy) === 1) {
              v = 2;
              break;
            }
          }
        }
      }
      const px = v === 1 ? INK : v === 2 ? RIM : CLEAR;
      for (let by = 0; by < block; by++) {
        for (let bx = 0; bx < block; bx++) {
          const i = ((y * block + by) * W + (x * block + bx)) * 4;
          out[i] = px[0];
          out[i + 1] = px[1];
          out[i + 2] = px[2];
          out[i + 3] = px[3];
        }
      }
    }
  }
  return { w: W, h: H, data: out };
}

// --- Rex: a round, spotted baby dino with back plates --------------------
// 44×47 cells at 2 px = 88×94. Faces right. Feet rest on the bottom rows.

const POSE = { STAND: 'stand', RUN_A: 'runA', RUN_B: 'runB', HIT: 'hit' };

function diamond(g, cx, cy, r, v = 1) {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (Math.abs(x - cx) + Math.abs(y - cy) <= r) set(g, x, y, v);
    }
  }
}

function leg(g, x, lifted) {
  if (lifted) {
    // Tucked up and kicked back mid-stride.
    rect(g, x, 38, x + 4, 41);
    rect(g, x - 2, 41, x + 2, 42);
    return;
  }
  // Planted: thick leg with a rounded foot that points forward.
  rect(g, x, 38, x + 4, 45);
  rect(g, x + 1, 44, x + 6, 45);
}

function drawRex(pose) {
  const g = grid(44, 47);

  // Back plates: three diamonds down the spine, drawn first so the body
  // covers their lower halves.
  diamond(g, 21, 7, 4);
  diamond(g, 14, 13, 4);
  diamond(g, 9, 21, 3);

  // Tail: three shrinking lobes that curl up and back.
  ellipse(g, 9, 31, 5, 4.5);
  ellipse(g, 5, 27.5, 3.5, 3);
  ellipse(g, 2.5, 24.5, 2, 2);

  // Body: one round belly, with a short thick neck into the head.
  ellipse(g, 20, 30, 12.5, 10);
  ellipse(g, 21, 19, 7, 7);

  // Head: big and round, set forward and up.
  ellipse(g, 30.5, 15.5, 10.5, 9);
  // Blunt muzzle so the face reads as a snout, not a beak.
  rect(g, 34, 13, 39, 21);
  ellipse(g, 39, 17, 2.5, 4);

  // Legs.
  if (pose === POSE.RUN_A) {
    leg(g, 12, true);
    leg(g, 23, false);
  } else if (pose === POSE.RUN_B) {
    leg(g, 12, false);
    leg(g, 23, true);
  } else {
    leg(g, 12, false);
    leg(g, 23, false);
  }

  // Little arm, held tucked against the chest.
  rect(g, 31, 29, 34, 31);
  rect(g, 33, 31, 34, 32);

  // Spots on the back (white detail inside the ink).
  rect(g, 15, 24, 16, 25, 2);
  rect(g, 20, 22, 21, 23, 2);
  rect(g, 11, 30, 12, 31, 2);

  if (pose === POSE.HIT) {
    // Dizzy eye: a white X.
    for (let i = 0; i < 5; i++) {
      set(g, 31 + i, 10 + i, 2);
      set(g, 35 - i, 10 + i, 2);
    }
    // Open, round mouth.
    rect(g, 35, 18, 37, 20, 2);
  } else {
    // Big round eye with a dark pupil toward the front.
    rect(g, 31, 10, 35, 14, 2);
    set(g, 31, 10, 1);
    set(g, 35, 10, 1);
    set(g, 31, 14, 1);
    set(g, 35, 14, 1);
    rect(g, 33, 11, 34, 13, 1);
    // Small smile.
    rect(g, 35, 19, 38, 19, 2);
    set(g, 34, 18, 2);
    set(g, 39, 18, 2);
  }

  return render(g, 2, true);
}

// --- Cactus: a ribbed column with two rounded arms ------------------------
// 17×35 cells at 2 px = 34×70. Arms reach both side edges (inside the rim).

function drawCactus() {
  const g = grid(17, 35);

  // Trunk with a rounded crown.
  rect(g, 6, 3, 10, 33);
  ellipse(g, 8, 3.5, 2.5, 2.5);

  // Left arm: low, elbow out to the edge, tip up.
  rect(g, 3, 19, 6, 21);
  rect(g, 1, 12, 3, 21);
  ellipse(g, 2, 12, 1.2, 1.5);

  // Right arm: high, shorter, tip up.
  rect(g, 10, 13, 13, 15);
  rect(g, 13, 7, 15, 15);
  ellipse(g, 14, 7, 1.2, 1.5);

  // Rib grooves down the trunk (white detail).
  for (let y = 5; y <= 31; y += 1) if (y % 4 !== 0) set(g, 8, y, 2);
  // Spine nicks along the outer edges.
  for (let y = 8; y <= 30; y += 5) {
    set(g, 6, y, 2);
    set(g, 10, y + 2, 2);
  }

  return render(g, 2, true);
}

// --- Ground: road edge with pebbles and grass tufts -----------------------
// 2399×24 px, drawn at 1 px per cell. Road edge on rows 8–9. Bumps above,
// pebbles below, from a fixed seed so the strip is the same every build.

function drawGround() {
  const W = 2399;
  const H = 24;
  const g = grid(W, H);
  let s = 0x5eed1e55;
  const rnd = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  rect(g, 0, 8, W - 1, 9);

  // Grass tufts: little V sprigs standing on the road edge.
  for (let x = 20; x < W - 10; x += 60 + Math.floor(rnd() * 140)) {
    const h = 3 + Math.floor(rnd() * 3);
    for (let i = 0; i < h; i++) {
      set(g, x - i, 7 - i, 1);
      set(g, x + 3 + i, 7 - i, 1);
    }
    for (let i = 0; i < h + 1; i++) set(g, x + 1, 7 - i, 1);
    for (let i = 0; i < h - 1; i++) set(g, x + 2, 7 - i, 1);
  }

  // Low mounds: a gentle 2 px rise along the edge.
  for (let x = 90; x < W - 30; x += 200 + Math.floor(rnd() * 260)) {
    const len = 14 + Math.floor(rnd() * 12);
    rect(g, x, 7, x + len, 7);
    rect(g, x + 4, 6, x + len - 4, 6);
  }

  // Pebbles and specks below the edge.
  for (let x = 4; x < W - 6; x += 18 + Math.floor(rnd() * 46)) {
    const y = 12 + Math.floor(rnd() * 10);
    const kind = rnd();
    if (kind < 0.45) {
      rect(g, x, y, x + 1, y);
    } else if (kind < 0.8) {
      rect(g, x + 1, y, x + 3, y);
      rect(g, x, y + 1, x + 4, y + 1);
    } else {
      set(g, x, y, 1);
    }
  }

  return render(g, 1, false);
}

// --- Write -----------------------------------------------------------------

function write(name, img) {
  const file = path.join(__dirname, '..', 'assets', name);
  fs.writeFileSync(file, encodePng(img.w, img.h, img.data));
  console.log(`wrote assets/${name} (${img.w}×${img.h})`);
}

write('dino-stationary.png', drawRex(POSE.STAND));
write('dino-run-0.png', drawRex(POSE.RUN_A));
write('dino-run-1.png', drawRex(POSE.RUN_B));
write('dino-lose.png', drawRex(POSE.HIT));
write('cactus.png', drawCactus());
write('ground.png', drawGround());
