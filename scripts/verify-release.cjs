#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const [dir = 'assets', repo = 'asheept/cgv-seat-alarm-releases', tag = process.env.GITHUB_REF_NAME] = process.argv.slice(2);
const fail = m => { throw new Error(m); };
if (!/^asheept\/(cgv-seat-alarm-releases|megabox-seat-alarm-releases)$/.test(repo) || !/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag || '')) fail('invalid repository or release tag');
const version = tag.slice(1), stem = `${repo.split('/')[1].replace(/-releases$/, '')}-${version}-setup`;
const expected = [`${stem}.exe`, `${stem}.exe.sig`, 'latest.json', 'release-notes.md', 'release-info.json', 'SHA256SUMS.txt'];
if (process.argv[5] === '--public-tree') {
  const tracked = execFileSync('git', ['ls-tree', '-r', '--name-only', 'HEAD'], { encoding: 'utf8' }).trim().split(/\r?\n/).sort();
  const allowed = ['README.md', '.github/workflows/publish-release.yml', 'scripts/verify-release.cjs', ...expected.map(n => `assets/${n}`)].sort();
  if (JSON.stringify(tracked) !== JSON.stringify(allowed)) fail(`public tag contains unexpected tracked files: ${tracked.join(', ')}`);
}
const actual = fs.readdirSync(dir).sort();
if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) fail(`unexpected assets: ${actual.join(', ')}`);
const read = n => fs.readFileSync(path.join(dir, n));
const hash = n => crypto.createHash('sha256').update(read(n)).digest('hex');
const info = JSON.parse(read('release-info.json'));
if (info.schema !== 1 || info.repository !== repo || info.tag !== tag || info.version !== version || info.installer !== expected[0] || info.updater !== expected[0] || info.signature !== expected[1]) fail('release-info metadata mismatch');
if (JSON.stringify(Object.keys(info.files).sort()) !== JSON.stringify(expected.slice(0, 4).sort())) fail('release-info file set mismatch');
for (const n of expected.slice(0, 4)) if (info.files[n] !== hash(n)) fail(`hash mismatch: ${n}`);
const sums = read('SHA256SUMS.txt').toString('utf8').trimEnd().split('\n');
const expectedSums = [...expected.slice(0, 4), 'release-info.json'].map(n => `${hash(n)}  ${n}`);
if (JSON.stringify(sums) !== JSON.stringify(expectedSums)) fail('SHA256SUMS mismatch');
const latest = JSON.parse(read('latest.json'));
const platform = latest.platforms?.['windows-x86_64'];
if (latest.version !== version || Object.keys(latest.platforms || {}).length !== 1 || !platform) fail('updater version/platform mismatch');
const sig = read(expected[1]).toString('utf8').trim();
if (!sig || platform.signature !== sig) fail('updater signature mismatch');
if (platform.url !== `https://github.com/${repo}/releases/download/${tag}/${expected[0]}`) fail('updater URL mismatch');
for (const n of expected) if (fs.statSync(path.join(dir, n)).size === 0) fail(`empty asset: ${n}`);
console.log(`Verified ${repo} ${tag}`);
