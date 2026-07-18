// One-command deploy for the Moments Worker.
//
// Run with:  pnpm build:frontend && node scripts/deploy.mjs
// (the root `pnpm deploy` script does exactly this)
//
// What it does, idempotently, so a forked repo can be deployed with the
// "Deploy to Cloudflare" button with (almost) zero manual steps:
//   1. Ensure the D1 database exists; write its id back into wrangler.toml.
//   2. Ensure the R2 bucket exists.
//   3. Apply D1 migrations (idempotent — safe to re-run).
//   4. Create admin secrets ONLY if missing (never overwrites an existing
//      password, so re-deploys keep working).
//   5. `wrangler deploy`.
//
// Account / domain are intentionally NOT pinned in wrangler.toml so that a
// forked copy deploys under the deployer's own Cloudflare account + the
// *.workers.dev subdomain.

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TOML = resolve(ROOT, 'wrangler.toml');

const UUID_RE =
  /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

// Resolve the wrangler binary once. We prefer a direct `wrangler` on PATH
// (global install + the Deploy-to-Cloudflare environment), then fall back to
// `pnpm exec wrangler` / `npx wrangler` for repos that pin it locally.
// shell:true is REQUIRED on Windows so the `wrangler.cmd` shim resolves
// (spawnSync without a shell returns ENOENT for .cmd binaries).
function findWrangler() {
  const candidates = [
    { bin: 'wrangler', prefix: [] },
    { bin: 'pnpm', prefix: ['exec', 'wrangler'] },
    { bin: 'npx', prefix: ['wrangler'] },
  ];
  for (const c of candidates) {
    const r = spawnSync(c.bin, [...c.prefix, '--version'], {
      shell: true,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (r.status === 0) {
      return c;
    }
  }
  return null;
}

const WRANGLER = findWrangler();
if (!WRANGLER) {
  console.error('✗ 找不到 wrangler 命令。请先安装：');
  console.error('    npm install -g wrangler   （或  pnpm add -D wrangler）');
  process.exit(1);
}
console.log(
  '  使用 wrangler 命令：' +
    (WRANGLER.bin + (WRANGLER.prefix.length ? ' ' + WRANGLER.prefix.join(' ') : '')),
);

/** Run wrangler via the resolved binary. Returns {status, out, err}. */
function wrangle(args, opts = {}) {
  const r = spawnSync(WRANGLER.bin, [...WRANGLER.prefix, ...args], {
    shell: true,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    ...opts,
  });
  return { status: r.status ?? 1, out: r.stdout || '', err: r.stderr || '' };
}

function firstUuid(text) {
  const m = String(text).match(UUID_RE);
  return m ? m[1] : null;
}

console.log('→ 准备 D1 数据库 (moments)...');

// 诊断：先确认 wrangler 已登录且账户可用
const who = wrangle(['whoami']);
if (who.status !== 0) {
  console.error('✗ wrangler 未登录或登录失败：');
  console.error((who.err || who.out || '').trim().split('\n').slice(0, 6).join('\n'));
  console.error('  请先运行：wrangler login  （确保登录到可写账户 60ca3cd...）');
  process.exit(1);
} else {
  console.log('  当前 Cloudflare 账户：\n' + (who.out || '').trim());
}

let dbId = null;

// Prefer creating it; the output carries the new id. If it already exists,
// the command fails (no id in output) and we fall back to listing.
const created = wrangle(['d1', 'create', 'moments']);
dbId = firstUuid(created.out + created.err);
if (!dbId) {
  const errLine = (created.err || created.out || '').trim().split('\n')[0];
  console.log('  (create 跳过: ' + (errLine || '已存在') + ')');
  const listed = wrangle(['d1', 'list']);
  dbId = firstUuid(listed.out + listed.err);
  if (!dbId) {
    console.error('  d1 list 也未能获取 id，D1 命令错误输出：');
    console.error((listed.err || listed.out || '').trim().split('\n').slice(0, 8).join('\n'));
  }
}
if (!dbId) {
  console.error('✗ 无法获取 D1 database id，部署中止。');
  process.exit(1);
}
console.log('  D1 id =', dbId);

// Write the id back into wrangler.toml (no-op if it already matches).
let toml = readFileSync(TOML, 'utf8');
if (!toml.includes(dbId)) {
  toml = toml.replace(/database_id\s*=\s*"[^"]*"/, `database_id = "${dbId}"`);
  writeFileSync(TOML, toml);
  console.log('  已把 database_id 写回 wrangler.toml');
}

console.log('→ 准备 R2 存储桶 (moments-images)...');
const r2 = wrangle(['r2', 'bucket', 'create', 'moments-images']);
if (r2.status !== 0) {
  const msg = (r2.err || r2.out || '').split('\n').find((l) => l.trim()) || '';
  console.log('  (跳过: ' + msg.trim() + ')');
}

console.log('→ 应用 D1 migrations...');
wrangle(['d1', 'migrations', 'apply', 'moments', '--remote'], {
  stdio: 'inherit',
});

console.log('→ 检查后台密钥...');
const secrets = wrangle(['secret', 'list']);
const secretText = secrets.out + secrets.err;
const haveJwt = secretText.includes('ADMIN_JWT_SECRET');
const havePw = secretText.includes('ADMIN_PASSWORD');

function putSecret(name, value) {
  // wrangler secret put reads the value from stdin when non-interactive.
  let r = wrangle(['secret', 'put', name], { input: value + '\n' });
  if (r.status !== 0) {
    // Fallback: some versions prefer --value
    r = wrangle(['secret', 'put', name, '--value', value]);
  }
  return r.status === 0;
}

if (!haveJwt) {
  const jwt = randomBytes(32).toString('hex');
  putSecret('ADMIN_JWT_SECRET', jwt);
  console.log('  已生成 ADMIN_JWT_SECRET');
}

if (!havePw) {
  const pw = randomBytes(9)
    .toString('base64')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 14);
  putSecret('ADMIN_PASSWORD', pw);
  console.log('\n🔑 后台登录密码 ADMIN_PASSWORD = ' + pw);
  console.log('   部署完成后访问  https://<你的子域>.workers.dev/admin  用此密码登录\n');
} else {
  console.log('  ADMIN_PASSWORD 已存在，跳过（保留原密码）');
}

console.log('→ 部署 Worker...');
const dep = wrangle(['deploy'], { stdio: 'inherit' });
process.exit(dep.status ?? 0);
