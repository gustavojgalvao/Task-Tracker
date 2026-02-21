// Gera ícones PNG sem dependências externas — usa apenas módulos built-in do Node.js
// Execute com: node generate-icons-builtin.js

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Minimal PNG encoder — completely dependency-free
function encodePNG(width, height, pixels) {
    // pixels = Uint8Array of [R, G, B, A, R, G, B, A, ...] row by row

    function adler32(data) {
        let a = 1, b = 0;
        for (let i = 0; i < data.length; i++) {
            a = (a + data[i]) % 65521;
            b = (b + a) % 65521;
        }
        return (b << 16) | a;
    }

    function crc32(data) {
        const table = [];
        for (let i = 0; i < 256; i++) {
            let c = i;
            for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            table.push(c);
        }
        let crc = 0xffffffff;
        for (let i = 0; i < data.length; i++) crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
        return (crc ^ 0xffffffff) >>> 0;
    }

    function uint32be(n) {
        return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
    }

    function chunk(type, data) {
        const typeBytes = [...type].map(c => c.charCodeAt(0));
        const all = [...typeBytes, ...data];
        const c = crc32(all);
        return [...uint32be(data.length), ...typeBytes, ...data, ...uint32be(c)];
    }

    const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

    const ihdr = [
        ...uint32be(width), ...uint32be(height),
        8, 2, 0, 0, 0  // bit depth, color type (RGB), compression, filter, interlace
    ];

    // Build raw image data (filter byte 0 per row) using RGBA → RGB conversion
    const raw = [];
    for (let y = 0; y < height; y++) {
        raw.push(0); // filter type None
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            raw.push(pixels[i], pixels[i + 1], pixels[i + 2]);
        }
    }

    const compressed = zlib.deflateSync(Buffer.from(raw));

    const png = [
        ...SIGNATURE,
        ...chunk('IHDR', ihdr),
        ...chunk('IDAT', [...compressed]),
        ...chunk('IEND', [])
    ];

    return Buffer.from(png);
}

function drawIcon(size) {
    const pixels = new Uint8Array(size * size * 4);

    const radius = Math.round(size * 0.18);

    function inRoundedRect(x, y) {
        const rx = Math.min(x, size - 1 - x);
        const ry = Math.min(y, size - 1 - y);
        if (rx >= radius || ry >= radius) return true;
        const dx = radius - rx;
        const dy = radius - ry;
        return dx * dx + dy * dy <= radius * radius;
    }

    // Gradient: bottom-left = #8b5cf6, top-right = #22c55e
    const r1 = 0x8b, g1 = 0x5c, b1 = 0xf6;
    const r2 = 0x22, g2 = 0xc5, b2 = 0x5e;

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const idx = (y * size + x) * 4;

            if (!inRoundedRect(x, y)) {
                // Transparent outside rounded rect
                pixels[idx] = pixels[idx + 1] = pixels[idx + 2] = pixels[idx + 3] = 0;
                continue;
            }

            // Diagonal gradient: t goes from 0 (bottom-left) to 1 (top-right)
            const t = 1 - (x + (size - y)) / (2 * size);
            pixels[idx] = Math.round(r1 + (r2 - r1) * t);
            pixels[idx + 1] = Math.round(g1 + (g2 - g1) * t);
            pixels[idx + 2] = Math.round(b1 + (b2 - b1) * t);
            pixels[idx + 3] = 255;
        }
    }

    // Draw anti-aliased chevron-up using thick stroke
    const lw = size * 0.11;
    const x1 = size * 0.25, y1 = size * 0.65;
    const x2 = size * 0.5, y2 = size * 0.35;
    const x3 = size * 0.75, y3 = size * 0.65;

    function drawSegment(ax, ay, bx, by) {
        const dx = bx - ax, dy = by - ay;
        const len = Math.sqrt(dx * dx + dy * dy);
        const nx = -dy / len, ny = dx / len;
        const half = lw / 2;

        const minX = Math.floor(Math.min(ax, bx) - half - 2);
        const maxX = Math.ceil(Math.max(ax, bx) + half + 2);
        const minY = Math.floor(Math.min(ay, by) - half - 2);
        const maxY = Math.ceil(Math.max(ay, by) + half + 2);

        for (let py = Math.max(0, minY); py <= Math.min(size - 1, maxY); py++) {
            for (let px = Math.max(0, minX); px <= Math.min(size - 1, maxX); px++) {
                const ex = px - ax, ey = py - ay;
                const along = ex * dx / len + ey * dy / len;
                if (along < 0 || along > len) {
                    // Check round cap
                    const cap = along < 0 ? { x: ax, y: ay } : { x: bx, y: by };
                    const cdx = px - cap.x, cdy = py - cap.y;
                    const dist = Math.sqrt(cdx * cdx + cdy * cdy);
                    if (dist > half + 0.5) continue;
                    const alpha = dist < half - 0.5 ? 1 : (half + 0.5 - dist);
                    const idx2 = (py * size + px) * 4;
                    pixels[idx2] = Math.round(255 * alpha + pixels[idx2] * (1 - alpha));
                    pixels[idx2 + 1] = Math.round(255 * alpha + pixels[idx2 + 1] * (1 - alpha));
                    pixels[idx2 + 2] = Math.round(255 * alpha + pixels[idx2 + 2] * (1 - alpha));
                } else {
                    const perp = Math.abs(ex * nx + ey * ny);
                    if (perp > half + 0.5) continue;
                    const alpha = perp < half - 0.5 ? 1 : (half + 0.5 - perp);
                    const idx2 = (py * size + px) * 4;
                    pixels[idx2] = Math.round(255 * alpha + pixels[idx2] * (1 - alpha));
                    pixels[idx2 + 1] = Math.round(255 * alpha + pixels[idx2 + 1] * (1 - alpha));
                    pixels[idx2 + 2] = Math.round(255 * alpha + pixels[idx2 + 2] * (1 - alpha));
                }
            }
        }
    }

    drawSegment(x1, y1, x2, y2);
    drawSegment(x2, y2, x3, y3);

    return encodePNG(size, size, pixels);
}

const outDir = path.join(__dirname, 'icons');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

console.log('Gerando ícones...');
fs.writeFileSync(path.join(outDir, 'icon-192.png'), drawIcon(192));
console.log('✅ icon-192.png gerado');
fs.writeFileSync(path.join(outDir, 'icon-512.png'), drawIcon(512));
console.log('✅ icon-512.png gerado');
console.log('✅ Ícones salvos em /icons/');
