#!/usr/bin/env node
/**
 * build.mjs — produce the two downloadable plugin zips.
 *
 *   dist/dsh-whale-effort-slider-<ver>-default.zip   opaque panel, no liquid glass
 *   dist/dsh-whale-effort-slider-<ver>-glass.zip     liquid-glass panel
 *
 * The two builds differ by exactly ONE line in client.js (`const GLASS = ...`);
 * everything else is copied verbatim, so they can never drift. `client.js` in
 * the repo keeps GLASS = true (what the author runs); the default zip flips it.
 *
 * Usage: node build.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const NAME = pkg.name;
const VERSION = pkg.version;
const SRC = fs.readFileSync(path.join(ROOT, 'client.js'), 'utf8');
const GLASS_LINE = 'const GLASS = true;';

if (!SRC.includes(GLASS_LINE)) {
  console.error('client.js does not contain "' + GLASS_LINE + '" — did you edit the switch?');
  process.exit(1);
}

const SHARED = [
  'index.js',
  'cordis.patch.yml',
  'icon.svg',
  'LICENSE',
  'NOTICE',
  'README.md',
  'locale',
];

const VARIANTS = [
  {
    tag: 'default',
    glass: false,
    title: '默认版本 · 实色面板（无液态玻璃）',
    note: '面板是不透明卡片：主题色底 + 1px 描边 + 柔和投影，没有 backdrop-filter。'
      + '\n在低配机 / 关闭了硬件加速的浏览器上更稳，也更容易看清文字。',
  },
  {
    tag: 'glass',
    glass: true,
    title: '液态玻璃版本',
    note: '面板是 v1.2.6 那套 iOS 液态玻璃：0.19 透明度的 tint + 顶部釉光 + 6px 冻雾 + 四层边缘光。'
      + '\n背后有壁纸时最好看；纯色背景下接近半透明深色卡。',
  },
];

/* `glass` is the value written into client.js for that build:
 *   default -> const GLASS = false  (opaque panel)
 *   glass   -> const GLASS = true   (liquid glass)                          */

function write(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dst);
    else fs.copyFileSync(src, dst);
  }
}

const OUT = path.join(ROOT, 'dist');
const STAGE = path.join(ROOT, 'build');
fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const manifest = [];

for (const v of VARIANTS) {
  const dirName = `${NAME}-${VERSION}-${v.tag}`;
  const dir = path.join(STAGE, dirName);
  fs.mkdirSync(dir, { recursive: true });

  // client.js — flip the one switch
  const client = SRC.replace(
    GLASS_LINE,
    `const GLASS = ${v.glass ? 'true' : 'false'};`
  );
  write(path.join(dir, 'client.js'), client);

  // everything shared
  for (const rel of SHARED) {
    const from = path.join(ROOT, rel);
    const to = path.join(dir, rel);
    if (fs.statSync(from).isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }

  // package.json — same name/version (the two builds are alternatives, not
  // siblings: only one may be installed because both claim the same slot)
  const outPkg = {
    ...pkg,
    description: pkg.description + (v.glass ? ' [liquid-glass build]' : ' [default opaque build]'),
  };
  write(path.join(dir, 'package.json'), JSON.stringify(outPkg, null, 2) + '\n');

  // a plain-text README for people who never open the repo (ASCII filename:
  // bsdtar on Windows writes non-ANSI names using the system code page and
  // they come out as mojibake after extraction)
  write(
    path.join(dir, 'INSTALL.txt'),
    [
      `${NAME} ${VERSION} — ${v.title}`,
      '',
      v.note,
      '',
      '安装（二选一，不要两个都装：它们抢同一个输入框席位）',
      '1. 完全退出 DSH Desktop。',
      '2. 把这个文件夹放到一个不会被清理的位置，例如：',
      '   D:\\plugins\\dsh-whale-effort-slider',
      '3. 打开 DSH Desktop → 设置 → 插件 → 添加插件 → 选择上面那个文件夹。',
      '4. 再完全退出并重开 DSH Desktop。',
      '',
      '卸载：在同一个插件页面里停用/移除即可，插件 fail-open，不会留下钩子。',
      '',
      `来源：基于 ABING1111/dsh-codex-model-effort-selector v1.1.2（MIT）独立演进。`,
    ].join('\n')
  );

  // zip it (bsdtar understands -a from the .zip extension on Windows)
  const zipPath = path.join(OUT, `${dirName}.zip`);
  fs.rmSync(zipPath, { force: true });
  execFileSync('tar', ['-a', '-c', '-f', zipPath, '-C', STAGE, dirName], { stdio: 'inherit' });

  const size = fs.statSync(zipPath).size;
  manifest.push({
    tag: v.tag,
    file: path.basename(zipPath),
    bytes: size,
    title: v.title,
    note: v.note,
    glass: v.glass,
  });
  console.log(`✓ ${path.basename(zipPath)}  ${(size / 1024 / 1024).toFixed(2)} MB`);
}

write(path.join(OUT, 'build-manifest.json'), JSON.stringify({ name: NAME, version: VERSION, builds: manifest }, null, 2) + '\n');
fs.rmSync(STAGE, { recursive: true, force: true });
console.log('manifest → dist/build-manifest.json');
