// Bundle dist/ into one self-contained HTML body fragment (fonts inlined as data URIs).
// Usage: node scripts/singlefile.mjs <out.html> [--fragment]
import fs from 'fs';
import path from 'path';

const out = process.argv[2] ?? 'dist/underkeep.html';
const fragment = process.argv.includes('--fragment');
const dist = path.resolve('dist');
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const jsFile = html.match(/src="\.\/(assets\/[^"]+\.js)"/)[1];
const cssFile = html.match(/href="\.\/(assets\/[^"]+\.css)"/)[1];
let css = fs.readFileSync(path.join(dist, cssFile), 'utf8');
let js = fs.readFileSync(path.join(dist, jsFile), 'utf8');

// keep only the latin subsets to stay lean
css = css.replace(/@font-face\{[^}]*(vietnamese|latin-ext)[^}]*\}/g, '');
css = css.replace(/url\(\.?\/?([^)]+\.(woff2?))\)/g, (m, f, ext) => {
  const file = path.join(dist, 'assets', path.basename(f));
  if (!fs.existsSync(file)) return m;
  const b64 = fs.readFileSync(file).toString('base64');
  return `url(data:font/${ext};base64,${b64})`;
});
js = js.replace(/<\/script/gi, '<\\/script');

const title = '<title>Underkeep</title>';
const meta = '<meta name="description" content="A dark-medieval dungeon-keeping roguelike with PS1-style graphics.">';
const body = `<canvas id="view"></canvas>\n<div id="ui"></div>\n<script type="module">${js}</script>`;
const page = fragment
  ? `${title}\n${meta}\n<style>${css}</style>\n${body}\n`
  : `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">${title}${meta}<style>${css}</style></head><body>${body}</body></html>\n`;
fs.writeFileSync(out, page);
console.log(`wrote ${out} (${(page.length / 1024).toFixed(0)} KB)`);
