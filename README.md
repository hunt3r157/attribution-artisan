# Attribution Artisan

> Zero‑dep CLI + GitHub Action that **generates THIRD_PARTY_NOTICES.md** from your installed dependencies and (optionally) **embeds license texts** for MIT/BSD, etc. Pairs perfectly with **License Lens**.

[![build](https://img.shields.io/github/actions/workflow/status/hunt3r157/attribution-artisan/ci.yml?branch=main&label=build)](https://github.com/hunt3r157/attribution-artisan/actions/workflows/ci.yml)
[![release](https://img.shields.io/github/actions/workflow/status/hunt3r157/attribution-artisan/release.yml?label=release)](https://github.com/hunt3r157/attribution-artisan/actions/workflows/release.yml)
[![npm](https://img.shields.io/npm/v/attribution-artisan.svg)](https://www.npmjs.com/package/attribution-artisan)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-Support-ff5e5b?logo=kofi&logoColor=white)](https://ko-fi.com/hunt3r157)


---

## Table of contents
- [Overview](#overview)
- [Quick start](#quick-start)
- [Usage](#usage)
- [Configuration](#configuration)
- [Output format](#output-format)
- [CI (GitHub Actions)](#ci-github-actions)
- [Notes & limitations](#notes--limitations)
- [Security](#security)
- [Contributing](#contributing)
- [License](#license)
- [Roadmap](#roadmap)
- [FAQ](#faq)

---

## Overview
**Attribution Artisan** walks `node_modules/` (including nested deps), collects each dependency’s `name@version`, license, and homepage/repository, then writes a clean **THIRD_PARTY_NOTICES.md**. You control whether to embed full license texts for select SPDX identifiers (e.g., `MIT`, `BSD-2-Clause`, `BSD-3-Clause`).

- Zero dependencies; Node ≥ 18
- No registry calls — reads local `package.json` and license files
- Optional JSON output for auditing
- Works with npm, pnpm, yarn

---

## Quick start
```bash
# ensure you have node_modules (in CI: npm ci / pnpm i / yarn install)
npx attribution-artisan generate
```

Create a config for policy:
```bash
cat > attribution-artisan.config.json <<'JSON'
{
  "includeTexts": ["MIT","BSD-2-Clause","BSD-3-Clause"],
  "exclude": ["@types/*"],
  "sort": "name"   // or "license"
}
JSON

# generate
npx attribution-artisan generate
```

---

## Usage
```bash
# Markdown (default: THIRD_PARTY_NOTICES.md)
npx attribution-artisan generate

# JSON only
npx attribution-artisan generate --format json

# both Markdown + JSON
npx attribution-artisan generate --format both

# custom output file
npx attribution-artisan generate --out NOTICE.md

# override includeTexts via CLI
npx attribution-artisan generate --include-texts MIT,BSD-3-Clause
```

**Exit codes**
- `0` — success
- `2` — runtime error (e.g., no `node_modules/`)

---

## Configuration
Create `attribution-artisan.config.json` at repo root (all optional):
```json
{
  "includeTexts": ["MIT","BSD-2-Clause","BSD-3-Clause"],
  "exclude": ["@types/*"],
  "sort": "name"
}
```
- `includeTexts` — SPDX ids whose license texts should be embedded (if found in the package or templates).
- `exclude` — glob patterns on **package name** to skip (supports `*` and scopes like `@types/*`).
- `sort` — `name` (default) or `license`.

---

## Output format

### Markdown (`THIRD_PARTY_NOTICES.md`)
- Intro block with timestamp & policy
- Per‑license sections: packages listed as `- name@version — homepage/repo`
- Optional appended license texts for `includeTexts`

### JSON (`third_party_notices.json`)
```json
{
  "generatedAt": "2025-08-14T12:00:00.000Z",
  "packages": [
    { "name": "left-pad", "version": "1.3.0", "license": "MIT", "homepage": "https://...", "repository": "https://..." }
  ],
  "embeddedTexts": { "MIT": "..." }
}
```

---

## CI (GitHub Actions)

### Minimal check
```yaml
name: attribution-artisan
on: [push, pull_request]
jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx attribution-artisan generate
```

### Composite Action usage (after you publish)
```yaml
- uses: hunt3r157/attribution-artisan@v1
```

---

## Notes & limitations
- Reads **installed** package metadata. Ensure `node_modules/` exists first.
- License detection:
  - `package.json.license` (string or `{ type: "..." }`), else `licenses[]`
  - Falls back to `UNKNOWN` if absent
  - For embedded texts: Artisan searches package license files (LICENSE, COPYING, etc.) then uses simple built‑in templates for common SPDX ids.

---

## Security
No telemetry, no network calls, local file reads only.

---

## Contributing
PRs welcome! Keep runtime **dependency‑free**. Add new SPDX templates under `templates/licenses/` when useful.

---

## License
MIT © Attribution Artisan contributors

---

## Roadmap
- [ ] More SPDX templates
- [ ] HTML export
- [ ] Support non-Node ecosystems via manifest inputs
- [ ] Option to inline license snippets per package

---

## FAQ
**Why not parse lockfiles?**  
License fields aren’t in lockfiles. Installed package metadata is the most accurate without network calls.

**Will it support monorepos/workspaces?**  
Yes. It follows nested `node_modules/` directories and scopes (e.g., `@scope/*`).

**Can I exclude dev dependencies?**  
First release lists everything installed. We can add `--prod-only` in future releases if needed.
