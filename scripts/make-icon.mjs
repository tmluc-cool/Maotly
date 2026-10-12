#!/usr/bin/env node
// Turns build/icon.svg into build/icon.png (512px) and build/icon.ico (16–256px).

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'build', 'icon.svg'));

const render = (size) => sharp(svg, { density: 384 }).resize(size, size).png().toBuffer();

writeFileSync(join(root, 'build', 'icon.png'), await render(512));
const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngs = await Promise.all(sizes.map(render));
writeFileSync(join(root, 'build', 'icon.ico'), await pngToIco(pngs));
console.log('✔ build/icon.png und build/icon.ico erzeugt');
