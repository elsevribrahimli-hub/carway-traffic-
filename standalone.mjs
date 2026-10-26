// CARWAY TRAFFIC — Standalone builder: bundles the game into ONE self-contained
// standalone.html (CSS inlined, JS+three.js bundled via esbuild, no external refs).
// Run: `npm run build:standalone`  (needs devDependency `esbuild`)
// NOTE: kept in tools/ (not build/) because snapshot-excluded dir names don't persist.
import { buildSync } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const out = buildSync({
  entryPoints: [join(root, 'js/main.js')],
  bundle: true,
  minify: true,
  format: 'esm', // esm: supports top-level await (boot pre-decode); output has no imports/exports
  alias: { three: join(root, 'libs/three.module.js') },
  write: false,
  logLevel: 'warning',
});
let bundle = out.outputFiles[0].text;
// Safety: never allow a literal closing script tag inside the inline bundle.
bundle = bundle.replace(/<\/script/gi, '<\\/script');

let html = readFileSync(join(root, 'index.html'), 'utf8');
const css = readFileSync(join(root, 'css/style.css'), 'utf8');

const linkTag = '<link rel="stylesheet" href="./css/style.css">';
if (!html.includes(linkTag)) throw new Error('CSS link tag not found in index.html');
html = html.replace(linkTag, () => `<style>\n${css}\n</style>`);

const importmapRe = /<script type="importmap">[\s\S]*?<\/script>\n?/;
if (!importmapRe.test(html)) throw new Error('importmap block not found in index.html');
html = html.replace(importmapRe, '');

const moduleTag = '<script type="module" src="./js/main.js"></script>';
if (!html.includes(moduleTag)) throw new Error('module script tag not found in index.html');
html = html.replace(moduleTag, () => `<script type="module">\n${bundle}\n</script>`);

// Inline the YF brand mark (intro + nav drawer) as a data URI.
const logoTag = 'src="./assets/yf-logo.png"';
if (!html.includes(logoTag)) throw new Error('logo img tag not found in index.html');
const logoB64 = readFileSync(join(root, 'assets/yf-logo.png')).toString('base64');
html = html.split(logoTag).join(`src="data:image/png;base64,${logoB64}"`);

// Verify: no remaining external file references (src=/href= must be gone; style inlined).
const leftovers = [...html.matchAll(/(?:src|href)="(?!(?:data:|#))[^"]*"/g)].map((m) => m[0]);
if (leftovers.length) throw new Error('external refs remain: ' + leftovers.join(', '));
if (html.includes('importmap')) throw new Error('importmap text remains');

const target = join(root, 'standalone.html');
writeFileSync(target, html);
console.log(`standalone.html written: ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB, zero external refs`);
