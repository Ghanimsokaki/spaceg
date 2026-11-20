// Bundles src/ into a single self-contained index.html (no network needed to play).
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const watch = process.argv.includes('--watch');
async function build() {
  const res = await esbuild.build({
    entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'iife',
    target: ['es2020'], write: false, legalComments: 'none',
  });
  const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const html = readFileSync('src/index.html', 'utf8').replace('<script type="module">/*__BUNDLE__*/</script>', () => `<script>${js}</script>`);
  writeFileSync('index.html', html);
  // deployable static output (Vercel / any static host)
  mkdirSync('dist', { recursive: true });
  writeFileSync('dist/index.html', html);
  console.log(`index.html written (${(html.length / 1024).toFixed(0)} KB)`);
  // Optional: a fragment without the document wrapper, for hosts that supply their own skeleton
  const out = process.env.FRAGMENT_OUT;
  if (out) {
    const frag = html
      .replace(/<!DOCTYPE html>\s*/i, '').replace(/<html[^>]*>\s*/i, '').replace(/<\/html>\s*$/i, '')
      .replace(/<head>\s*/i, '').replace(/<\/head>\s*/i, '').replace(/<body>\s*/i, '').replace(/<\/body>\s*/i, '')
      .replace(/<meta charset="UTF-8">\s*/i, '').replace(/<meta name="viewport"[^>]*>\s*/i, '');
    writeFileSync(out, frag);
    console.log(`fragment written to ${out}`);
  }
}
await build();
if (watch) {
  const { watch: fsWatch } = await import('node:fs');
  fsWatch('src', { recursive: true }, () => build().catch(e => console.error(e.message)));
}
