// npm run test:server – sends every fixture to a running TeX server, without a browser.
// Server: SERVER_URL (e.g. SERVER_URL=http://127.0.0.1:8080/api/tex), otherwise
// tex_compiler_url from static/config.json; a relative URL there is resolved
// against http://127.0.0.1:8080.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compile, readServerInfo } from '../src/lib/texserver.ts';

const config = JSON.parse(readFileSync(new URL('../static/config.json', import.meta.url), 'utf8'));
const server = readServerInfo(config);
const url = process.env.SERVER_URL ?? server.url;
const base = 'http://127.0.0.1:8080';
const timeoutMs = 120_000; // the first run may download TeX resources

const fixture = (name) => readFileSync(new URL(`../fixtures/${name}/${name}.tex`, import.meta.url), 'utf8');

async function expectPdf(name) {
  const r = await compile(fixture(name), { url, base, timeoutMs, dataMode: server.dataMode });
  assert.equal(r.status, 200, r.log);
  assert.ok(r.ok, `no PDF:\n${r.errors.map((e) => e.message).join('\n')}\n\n${r.log}`);
  const head = new TextDecoder().decode(await r.pdf.slice(0, 4).arrayBuffer());
  assert.equal(head, '%PDF');
}

test('minimal.tex gives a PDF', () => expectPdf('minimal'));

test('with-class.tex (edoxarticle from the server TeX tree) gives a PDF', () => expectPdf('with-class'));

// The client sends no assets yet, so image.png never reaches the server:
// reported as "todo" (does not fail the run) until tex_support_assets is true
test(
  'with-image.tex with image.png gives a PDF',
  { todo: server.supportsAssets ? false : 'the server accepts no assets (tex_support_assets = false)' },
  () => expectPdf('with-image')
);

test('error.tex reports the error in line 6', async () => {
  const r = await compile(fixture('error'), { url, base, timeoutMs, dataMode: server.dataMode });
  assert.equal(r.status, 200, r.log);
  assert.equal(r.ok, false);
  assert.equal(r.pdf, undefined);
  const e = r.errors.find((e) => e.line === 6);
  assert.ok(e, `no error in line 6: ${JSON.stringify(r.errors)}`);
  assert.match(e.message, /Undefined control sequence/);
});
