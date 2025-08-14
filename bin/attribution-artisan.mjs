#!/usr/bin/env node
// Attribution Artisan — generate THIRD_PARTY_NOTICES.md (zero-dep, Node >= 18)
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
// robust flag parser: supports "--k v", "--k=v", and bare "--k"
function parseFlags(arr){
  const o={};
  for (let i=0;i<arr.length;i++){
    const a=arr[i];
    if (!a.startsWith('--')) continue;
    const nxt = arr[i+1];
    if (nxt && !nxt.startsWith('--')) { o[a.slice(2)] = nxt; i++; }
    else { const [k,v] = a.slice(2).split('='); o[k] = v ?? true; }
  }
  return o;
}
const flags = parseFlags(args);
const cmd = (args[0] && !args[0].startsWith('--')) ? args[0] : 'generate';
if (cmd !== 'generate') { usage(); process.exit(1); }

const cwd = process.cwd();
const root = getProjectRoot(cwd);
const cfg = loadConfig(root, flags);

const nodeModules = path.join(root, 'node_modules');
if (!fs.existsSync(nodeModules)) {
  console.error('✖ node_modules not found. Run npm ci / pnpm i / yarn install first.');
  process.exit(2);
}

const pkgs = scanNodeModules(nodeModules, cfg.exclude);
const embeddedTexts = buildEmbeddedTexts(pkgs, root, cfg.includeTexts);
const md = renderMarkdown(pkgs, embeddedTexts, cfg);
const fmt = (typeof flags.format === 'string' && flags.format) ? flags.format.toLowerCase() : 'md';
const out = (typeof flags.out === 'string' && flags.out) ? flags.out : 'THIRD_PARTY_NOTICES.md';

if (fmt === 'md' || fmt === 'both') {
  fs.writeFileSync(path.join(root, out), md, 'utf8');
  console.log(`✓ Wrote ${out}`);
}
if (fmt === 'json' || fmt === 'both') {
  const json = {
    generatedAt: new Date().toISOString(),
    config: cfg,
    packages: pkgs,
    embeddedTexts
  };
  fs.writeFileSync(path.join(root, 'third_party_notices.json'), JSON.stringify(json, null, 2), 'utf8');
  console.log('✓ Wrote third_party_notices.json');
}

process.exit(0);

// ----------------- functions -----------------

function usage() {
  console.log(`Attribution Artisan
Usage:
  npx attribution-artisan generate [--format md|json|both] [--out THIRD_PARTY_NOTICES.md] [--include-texts MIT,BSD-3-Clause]
`);
}

function getProjectRoot(start) {
  let dir = start;
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    dir = path.dirname(dir);
  }
  return start;
}

function loadConfig(root, flags) {
  const p = path.join(root, 'attribution-artisan.config.json');
  let cfg = { includeTexts: ["MIT","BSD-2-Clause","BSD-3-Clause"], exclude: ["@types/*"], sort: "name" };
  if (fs.existsSync(p)) {
    try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(p, 'utf8')) }; } catch {}
  }
  if (typeof flags['include-texts'] === 'string') {
  cfg.includeTexts = flags['include-texts'].split(',').map(s=>s.trim()).filter(Boolean);
}
  return cfg;
}

function scanNodeModules(root, excludePatterns = []) {
  const out = [];
  const seen = new Set();
  const exclude = (name) => excludePatterns.some(p => globMatch(name, p));

  function visit(dir) {
    if (!fs.existsSync(dir)) return;
    for (const ent of safeReaddir(dir)) {
      if (ent === '.bin') continue;
      if (ent.startsWith('@')) { visit(path.join(dir, ent)); continue; }
      const pkgDir = path.join(dir, ent);
      const pkgJson = path.join(pkgDir, 'package.json');
      if (fs.existsSync(pkgJson)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgJson, 'utf8'));
          if (exclude(pkg.name)) continue;
          const key = `${pkg.name}@${pkg.version}`;
          if (!seen.has(key)) {
            seen.add(key);
            const license = normalizeLicense(pkg.license, pkg.licenses);
            const homepage = pickHomepage(pkg);
            const repository = pickRepo(pkg);
            out.push({ name: pkg.name, version: pkg.version, license, homepage, repository, dir: pkgDir });
          }
          const nested = path.join(pkgDir, 'node_modules');
          if (fs.existsSync(nested)) visit(nested);
        } catch {}
      } else if (isDir(pkgDir)) {
        const nested = path.join(pkgDir, 'node_modules');
        if (fs.existsSync(nested)) visit(nested);
      }
    }
  }

  visit(root);

  return out.sort((a,b) => {
    if (a.name !== b.name) return a.name.localeCompare(b.name);
    return (a.version || '').localeCompare(b.version || '');
  });
}

function pickHomepage(pkg) {
  if (typeof pkg.homepage === 'string') return pkg.homepage;
  if (pkg.repository) {
    if (typeof pkg.repository === 'string') return normalizeRepoUrl(pkg.repository);
    if (pkg.repository.url) return normalizeRepoUrl(pkg.repository.url);
  }
  return undefined;
}
function pickRepo(pkg) {
  if (pkg.repository) {
    if (typeof pkg.repository === 'string') return normalizeRepoUrl(pkg.repository);
    if (pkg.repository.url) return normalizeRepoUrl(pkg.repository.url);
  }
  return undefined;
}
function normalizeRepoUrl(u) {
  if (u.startsWith('git+')) u = u.slice(4);
  if (u.endsWith('.git')) u = u.slice(0, -4);
  return u;
}

function safeReaddir(dir) {
  try { return fs.readdirSync(dir); } catch { return []; }
}
function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}
function normalizeLicense(license, licenses) {
  if (typeof license === 'string') return license.trim();
  if (license && typeof license.type === 'string') return license.type.trim();
  if (Array.isArray(licenses) && licenses.length) {
    const parts = [];
    for (const l of licenses) {
      if (typeof l === 'string') parts.push(l.trim());
      else if (l && typeof l.type === 'string') parts.push(l.type.trim());
    }
    if (parts.length) return parts.join(' OR ');
  }
  return 'UNKNOWN';
}

function globMatch(text, pattern) {
  // very small glob: * matches any chars, pattern anchors at start/end
  const esc = pattern.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&').replace(/\*/g, '.*');
  const re = new RegExp('^' + esc + '$');
  return re.test(text);
}

function buildEmbeddedTexts(pkgs, projectRoot, includeTexts) {
  const set = new Set(includeTexts.map(s => s.toUpperCase()));
  const want = new Set();
  for (const p of pkgs) {
    const lic = String(p.license || '').toUpperCase();
    // pick first matching SPDX from multi-license "A OR B"
    const spdx = lic.split(/\s+OR\s+/i).find(l => set.has(l));
    if (spdx) want.add(spdx);
  }
  const texts = {};
  for (const spdx of want) {
    const t = findLicenseTextForSpdx(spdx, projectRoot);
    if (t) texts[spdx] = t;
  }
  return texts;
}

function findLicenseTextForSpdx(spdx, projectRoot) {
  // 1) try templates
  const tpl = path.join(projectRoot, 'templates', 'licenses', `${spdx}.txt`);
  if (fs.existsSync(tpl)) return fs.readFileSync(tpl, 'utf8');

  // 2) otherwise, try to locate a package that uses this SPDX and has a license file
  // (for first release we skip per-package extraction here)
  return undefined;
}

function renderMarkdown(pkgs, embeddedTexts, cfg) {
  const now = new Date().toISOString();
  const byLicense = {};
  for (const p of pkgs) {
    const key = p.license || 'UNKNOWN';
    (byLicense[key] ||= []).push(p);
  }
  const sortBy = (cfg.sort || 'name').toLowerCase();
  const licKeys = Object.keys(byLicense).sort((a,b) => sortBy === 'license' ? a.localeCompare(b) : a.localeCompare(b));
  for (const k of licKeys) {
    byLicense[k].sort((a,b) => a.name.localeCompare(b.name) || String(a.version).localeCompare(String(b.version)));
  }

  let out = '';
  out += `# Third‑Party Notices\n\n`;
  out += `_Generated by Attribution Artisan on ${now}_\n\n`;
  out += `This document lists third‑party packages included in this project, along with their license information. For selected licenses, the full text is included below.\n\n`;
  for (const lic of licKeys) {
    out += `## ${lic}\n\n`;
    for (const p of byLicense[lic]) {
      const link = p.homepage || p.repository || '';
      const name = `${p.name}@${p.version}`;
      out += link ? `- ${name} — ${link}\n` : `- ${name}\n`;
    }
    out += `\n`;
  }

  const keys = Object.keys(embeddedTexts);
  if (keys.length) {
    out += `---\n\n# License Texts\n\n`;
    for (const k of keys.sort()) {
      out += `## ${k}\n\n`;
      out += '```\n' + embeddedTexts[k].trim() + '\n```\n\n';
    }
  }

  return out;
}
