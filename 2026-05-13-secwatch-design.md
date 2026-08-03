# SecWatch — design

**Status:** Superseded in part — see "Scope revision" below
**Author:** Jonas (with Claude)
**Date:** 2026-05-13

## Scope revision (2026-08-03)

Dependabot alerts + automated security fixes were enabled across every non-archived
repo in `Bergert-Digital`, which covers the repo-dependency half of this design
better than SecWatch did. That half was removed:

- **Deleted:** `feeds/osv.ts`, `feeds/socket.ts`, the npm/composer/python/go parsers,
  `match/semver.ts`, and the `semver` dependency.
- **Kept:** container base images (`Dockerfile`, `docker-compose.yml`), `services.yaml`,
  CISA KEV, per-service release feeds, triage, digest email, Monday heartbeat.

Two bugs surfaced while doing this, both of which meant the *unique* half had never
worked in production:

1. `kev.ts`, `socket.ts` and `github-releases.ts` all emitted `affected: []`, and
   `computeNewFindings` only produced findings by iterating `affected`. Those three
   feeds could never match anything.
2. `services.yaml` items carry `ecosystem: "service"`, which no branch of the matcher
   handled, so the self-hosted services were inert too.

Feeds now resolve advisories against inventory names at fetch time and populate
`affected`, and matching is name-based (`match/product.ts`) rather than semver-based.
KEV's substring matching was tightened to word-start matching to stop `go` matching
`mongodb`; it still lets `postgres` match `PostgreSQL`.

Sections below describe the original, wider design. Where they mention OSV, Socket,
or package ecosystems, they are historical.

## Problem

Security incidents that affect our stack — malicious npm packages, CVEs in dependencies, vulnerabilities in self-hosted services like Coolify or Traefik — surface in many places (OSV.dev, GHSA, CISA KEV, Socket.dev, vendor release notes) and require manual cross-referencing against our actual codebase to know whether they apply. Today we have no monitoring; we hear about incidents through ad-hoc channels and would not know if a backdoored package landed in a transitive dep of one of our repos.

## Goal

Build a small standalone service ("SecWatch") that runs on Coolify, scans all repos in the `Bergert-Digital` GitHub org plus a hand-maintained list of self-hosted services, ingests advisories from a curated set of feeds daily, ranks new matches by relevance using Claude, and emails a digest. Silence on busy weeks is acceptable; a weekly heartbeat email on Mondays confirms the cron is still firing.

## Non-goals

- A web UI / dashboard. v1 is email-only. If we later want history browsing or per-finding dismissal, add then.
- Multi-tenant or multi-user. Single recipient (jonas@bergert.digital).
- Auto-PR opening or auto-bump of dependencies. The email is informational.
- Slack / PagerDuty / SMS notifications. Email only in v1.
- Repos outside `Bergert-Digital` (client work, personal forks, archived repos).
- Triage of vulnerabilities below a `noise` rank — they get a CSV of IDs only, no detail.

## Approach

A single Node + TypeScript service runs as a Coolify scheduled task at `0 5 * * *` UTC (≈ 07:00 Europe/Berlin year-round, with ~1h DST drift acceptable for an informational email). State lives in a SQLite file on a Coolify volume. The pipeline runs in five phases, each a separate module:

1. **Inventory** — build a flat list of every dependency/image/service we have visibility into.
2. **Ingest** — pull advisories from feeds.
3. **Match** — compute which advisories affect which inventory items, dedup against previously-reported findings.
4. **Triage** — one batched Claude Haiku 4.5 call ranks new findings as `critical`, `probably_relevant`, `probably_not`, or `noise`.
5. **Notify** — render and send email if there's anything to send, plus weekly heartbeat on Mondays.

Each phase is idempotent: rerunning the same day produces the same DB state and would not send duplicate emails (the `notified_at` column on `findings` gates that).

### Why daily + weekly heartbeat

The daily run is the actual security check. The weekly heartbeat exists so silence does not become ambiguous: if Monday's email does not arrive, the cron is broken. Without it, two months could pass before we notice the service died.

### Why Haiku 4.5 for triage

The triage task is small — read an advisory + a short code context, output a structured rank with a one-line reason. Haiku 4.5 handles this comfortably. Estimated cost on a busy day with 20 findings: ~$0.06 input + ~$0.003 output. Opus would be ~$3 for the same work and add no useful precision.

### Why GitHub PAT + Contents API (not Dependency Graph API, not GitHub App)

We need to parse Dockerfiles and `docker-compose.yml` files for base image versions, which GitHub's Dependency Graph does not surface. A fine-grained PAT scoped to the org with `Contents: read` + `Metadata: read` covers all the manifest reads we need with a single rotatable secret. The Contents API is well under rate limits (≤30 repos × ≤8 files × 1 read/day = ~240 calls).

## Components

### 1. Inventory phase — `src/inventory/`

**`github.ts`** — list non-archived repos in `Bergert-Digital`, fetch raw file contents via `/repos/{owner}/{repo}/contents/{path}`. Caches `repos` list for 1h to support local re-runs.

**`parsers/`** — one file per ecosystem. Each exports `parse(content: string, sourceFile: string): InventoryItem[]`:
- `npm.ts` — `package.json` direct deps + `package-lock.json` flat resolved versions
- `composer.ts` — `composer.json` + `composer.lock`
- `python.ts` — `requirements.txt`, `pyproject.toml`
- `go.ts` — `go.mod`
- `docker.ts` — `FROM` lines in Dockerfiles, `image:` fields in `docker-compose.yml`. Pinned tags only (`postgres:16.4`) get a version; floating tags (`postgres:latest`, `node`) emit a warning row but no version.

**`services.ts`** — load `services.yaml` at repo root:
```yaml
- name: coolify
  github: coollabsio/coolify
  current_version: 4.0.0-beta.420
- name: traefik
  docker_image: traefik
  current_version: "3.4"
- name: postgres
  docker_image: postgres
  current_version: "16.4"
```
The current version is read from yaml, not auto-detected. Manual edit after upgrades.

**`snapshot.ts`** — write all parsed `InventoryItem`s as `inventory_items` rows tied to the current `runs.id`.

### 2. Feed ingestion — `src/feeds/`

**`osv.ts`** — POST the entire inventory to `https://api.osv.dev/v1/querybatch`. One call returns all OSV-format advisories matching any item. Cheapest, broadest coverage; covers npm, PyPI, Go, Maven, NuGet, Packagist (composer), and more.

**`kev.ts`** — GET `https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json`. Filter to entries whose `vendorProject`/`product` appears in our inventory or services list.

**`socket.ts`** — Socket.dev npm threat feed (Atom or API; resolve in implementation). Filters: malware drops on packages we depend on.

**`github-releases.ts`** — for each `services.yaml` entry with a `github` field, fetch `/releases.atom` and extract entries flagged as security releases (title regex: `security|cve|vulnerab|advisory` or marked as pre-release vs latest — keep heuristic conservative).

All feed clients write rows to the `advisories` table with `UNIQUE(source, source_id)`. Re-fetching the same advisory is a no-op.

### 3. Match phase — `src/match/`

**`semver.ts`** — given an `InventoryItem` and an advisory's `affected` ranges, decide whether the installed version is affected. Use `semver` package for npm/composer/Go; PEP 440 for Python (use `@renovatebot/pep440` or similar — verify in implementation).

**`docker.ts`** — image:tag matching. Exact tag match against advisory's `affected` versions; treat `node:20` as `node@20.x.x` for range comparison.

**`findings.ts`** — for each (advisory, inventory_item) pair where the match returns true, INSERT into `findings`. The `UNIQUE(advisory_id, source_repo, source_file, package_name)` constraint makes this idempotent. Return only the rows where `id` is newly created — those are the day's *new* findings.

### 4. Triage — `src/triage/`

**`prompt.ts`** — given new findings, build a single prompt:
```
You are a security triage assistant. For each finding below, rank how
relevant the vulnerability is to this codebase.

Ranks:
- critical: Active exploit, RCE/auth-bypass/data-leak, or the package
  is used in a security-sensitive way in this repo.
- probably_relevant: Real vulnerability that likely applies to how the
  package is used.
- probably_not: Vulnerability exists but unlikely to apply (dev-only
  dependency, CLI-only flag affected, server-side issue on client-only
  code, etc.).
- noise: False positive, version range does not actually affect us,
  or advisory is too vague to act on.

Be conservative. When unsure between two ranks, pick the higher one.

Output JSON: { "rankings": [ { "finding_id": <int>, "rank": <str>,
"reason": <one short sentence> } ] }

Findings:
---
finding_id: 42
advisory: GHSA-xxxx-yyyy-zzzz (high) — Auth bypass in middleware
package: next@14.2.3
where: feldova/package.json
affected versions: >= 14.0.0, < 14.2.31
context (lines around match):
  "next": "14.2.3",
---
... (additional findings)
```

**`claude.ts`** — POST to Anthropic API, model `claude-haiku-4-5-20251001`, with structured output (tool use or `response_format`) enforcing the JSON schema. Validate response with Zod. Write `triage_rank` + `triage_reason` + `triaged_at` back to `findings`. On parse failure, log and skip triage (findings still get emailed without ranking; rank shown as `untriaged`).

### 5. Notify — `src/notify/`

**`policy.ts`** — decides what to send. Mondays always send something so the heartbeat is unambiguous; other days send only if there's news:

1. Is today Monday (in Europe/Berlin)?
   - **Yes**: send the weekly email.
     - If any findings landed in the past 7 days (including today's) → **weekly recap** subject: `SecWatch: weekly summary — N findings, X critical`. Body recaps the whole week.
     - Else → **weekly heartbeat** subject: `SecWatch: all clear this week`. Body is one line.
2. Not Monday:
   - Any new findings today → **daily** email, subject: `SecWatch: N new findings (X critical)`.
   - Else → no email.

Monday never sends a "daily" email — the weekly recap subsumes it (and includes today's new findings in the body). This also avoids sending two emails on one day.

**`render.ts`** — HTML email + plaintext fallback. Subject formats:
- Daily: `SecWatch: 3 new findings (1 critical)`
- Weekly, all-clear: `SecWatch: all clear this week`
- Weekly, with recap: `SecWatch: weekly summary — 7 findings, 1 critical`

Body sections:
- **Critical** (always expanded, full detail per finding)
- **Probably Relevant** (expanded, full detail)
- **Probably Not** (one compact line per finding)
- **Noise** (count + CSV of advisory IDs)

Full-detail rows show: advisory ID with link, severity badge, affected package + version, repo + file path, triage reason, patched-version range, link to full advisory.

Inline-styled HTML (table layout, no external CSS, no React Email dep). Plaintext fallback generated from the same data.

**`smtp.ts`** — send via SMTP using `nodemailer`. All credentials and the sender identity come from env vars (see `config.ts`). To: `NOTIFY_TO`. Write to `email_log` on success.

### 6. Database — `src/db/`

Drizzle ORM, SQLite, single file at `/data/secwatch.db`. Drizzle migrations live in `src/db/migrations/`.

```ts
runs (
  id INTEGER PK,
  started_at TEXT NOT NULL,    -- ISO-8601
  completed_at TEXT,
  status TEXT,                  -- 'running' | 'ok' | 'error'
  error_text TEXT
)

inventory_items (
  id INTEGER PK,
  run_id INTEGER NOT NULL REFERENCES runs(id),
  ecosystem TEXT NOT NULL,      -- 'npm' | 'composer' | 'pypi' | 'go' | 'docker' | 'service'
  name TEXT NOT NULL,
  version TEXT,                  -- nullable for floating Docker tags
  source_repo TEXT NOT NULL,     -- 'Bergert-Digital/feldova' or 'services.yaml'
  source_file TEXT NOT NULL,
  INDEX (ecosystem, name)
)

advisories (
  id INTEGER PK,
  source TEXT NOT NULL,          -- 'osv' | 'kev' | 'socket' | 'github-release'
  source_id TEXT NOT NULL,
  severity TEXT,                  -- 'critical' | 'high' | 'medium' | 'low' | 'unknown'
  summary TEXT NOT NULL,
  details TEXT,
  affected_json TEXT NOT NULL,   -- raw OSV-style affected array
  url TEXT,
  published_at TEXT,
  fetched_at TEXT NOT NULL,
  UNIQUE (source, source_id)
)

findings (
  id INTEGER PK,
  advisory_id INTEGER NOT NULL REFERENCES advisories(id),
  ecosystem TEXT NOT NULL,
  package_name TEXT NOT NULL,
  matched_version TEXT,
  source_repo TEXT NOT NULL,
  source_file TEXT NOT NULL,
  first_seen TEXT NOT NULL,
  triage_rank TEXT,              -- 'critical' | 'probably_relevant' | 'probably_not' | 'noise' | 'untriaged'
  triage_reason TEXT,
  triaged_at TEXT,
  notified_at TEXT,
  UNIQUE (advisory_id, source_repo, source_file, package_name)
)

email_log (
  id INTEGER PK,
  sent_at TEXT NOT NULL,
  kind TEXT NOT NULL,            -- 'daily' | 'weekly_recap' | 'weekly_heartbeat'
  finding_count INTEGER NOT NULL,
  to_address TEXT NOT NULL
)
```

Retention: `inventory_items` pruned at 90 days. `runs`, `advisories`, `findings`, `email_log` kept forever (low volume).

### 7. Orchestrator — `src/main.ts`

Roughly 50 lines:
1. Create a `runs` row, mark `running`.
2. Call inventory → snapshot.
3. Call each feed in parallel.
4. Match → write new findings.
5. Triage → write ranks back.
6. Notify → send email per policy.
7. Mark `runs.status = 'ok'`, set `completed_at`.

Wrapped in a top-level try/catch that logs to stderr and writes the error to `runs.error_text` before exiting non-zero.

### 8. Config — `src/config.ts`

Zod schema on env vars. Fails fast at startup if any required var is missing:
- `GITHUB_TOKEN` — fine-grained PAT, scoped to Bergert-Digital, perms: Contents (read), Metadata (read)
- `ANTHROPIC_API_KEY` — separate key from Feldova prod (cost isolation)
- `SMTP_HOST` — e.g. `smtp-relay.brevo.com`, `smtp.fastmail.com`, etc.
- `SMTP_PORT` — number; common values `465` (TLS) or `587` (STARTTLS)
- `SMTP_SECURE` — `true` for port 465 (implicit TLS), `false` for 587 (STARTTLS upgrade). Defaults to `port === 465`.
- `SMTP_USER` — SMTP username
- `SMTP_PASS` — SMTP password / app password
- `SMTP_FROM_ADDRESS` — e.g. `secwatch@bergert.digital`. Must be allowed by the SMTP relay.
- `SMTP_FROM_NAME` — e.g. `SecWatch`. Used as the display name in the From header.
- `NOTIFY_TO` — recipient address, e.g. `jonas@bergert.digital`
- `DB_PATH` — defaults to `/data/secwatch.db`
- `GITHUB_ORG` — defaults to `Bergert-Digital`
- `LOG_LEVEL` — defaults to `info`

## Deployment

**Coolify Application** (Dockerfile-based, "scheduled" runtime):
- Image: built from this repo's Dockerfile (multi-stage, `node:22-alpine` base, ~120 MB final)
- Cron: `0 5 * * *` UTC
- Volume: `/data` (SQLite file)
- Env vars: as above, set in Coolify UI
- No ports exposed
- No healthcheck (it's a batch job, not a daemon)

**Initial setup steps** (one-time, outside the pipeline):
1. Create the GitHub PAT, verify it can list `Bergert-Digital` repos and read file contents.
2. Pick an SMTP relay (Brevo, Fastmail, Postmark, your own Postfix, etc.) and verify the chosen `SMTP_FROM_ADDRESS` is allowed to send through it (DNS / sender authentication done on the relay side).
3. Mint a separate Anthropic API key.
4. Push the repo to GitHub, create the Coolify application, set env vars, attach the volume, trigger the first run manually to seed the DB.

## Testing

Vitest. Each phase tested independently with fixtures.

- **`src/inventory/parsers/*.test.ts`** — fixtures of real-world manifests (a snapshot of Feldova's `package.json`, a Coolify `docker-compose.yml`, etc.). Assert parsed item lists.
- **`src/feeds/*.test.ts`** — recorded JSON/Atom fixtures, mock `fetch`. Assert advisory parsing.
- **`src/match/semver.test.ts`** — table-driven tests with edge cases (pre-release versions, caret ranges, multi-range affected lists).
- **`src/triage/claude.test.ts`** — mock the Anthropic SDK call, assert prompt shape and response parsing.
- **`src/notify/render.test.ts`** — snapshot test for HTML + plaintext output.
- **`tests/pipeline.test.ts`** — integration test: seed inventory + advisories, run main, mock Anthropic and Brevo, assert correct findings + email sent.

CI: GitHub Actions on every push, `pnpm test` + `pnpm typecheck` + `pnpm build`.

## Error handling

- **GitHub fetch fails** (rate limit, repo permission removed) — log, skip the affected repo, continue with the others. Don't fail the whole run.
- **A feed is down** — log, skip that feed for the day, continue with the others.
- **Anthropic API fails** — emit findings as `untriaged`. They still get emailed under a separate "untriaged" section.
- **SMTP send fails** — log the error to stderr (Coolify captures it), mark the run as `error`. The findings stay in the DB un-notified (`notified_at` is NULL), so tomorrow's run picks them back up.
- **DB write fails** — fatal. Crash the run with a clear error message and exit non-zero so Coolify shows it as failed.

## Observability

- Plain stdout/stderr logging (JSON one-line format with `timestamp`, `level`, `phase`, `message`, optional `error`).
- Coolify captures container logs; no separate log shipping.
- Manual smoke check: `sqlite3 /data/secwatch.db "SELECT status, started_at, completed_at FROM runs ORDER BY id DESC LIMIT 7"` shows the last week of runs.

## Cost estimate

- **Anthropic** (Haiku 4.5, ~20 findings/day, full advisory text + context): ~$0.07/day = ~$25/year.
- **SMTP relay**: depends on chosen provider; any free tier covers ≤1 email/day. Effectively $0.
- **GitHub API**: free under public + authenticated PAT rate limits.
- **Coolify**: existing infrastructure, no marginal cost.
- **Total**: < $30/year.

## Open questions

- Should `dismissals.yaml` exist in v1 for known-irrelevant advisories that triage keeps misclassifying? Decision: **no, defer**. Tune the triage prompt first; add the file if it actually becomes needed after a few weeks.
- Should the service also scan `Bergert-Digital` *private* repos? PAT can be scoped to include them; depends on whether non-public repos contain prod dependencies. Decision: **yes, include all non-archived repos including private**. The PAT has read-only access; risk is minimal.
- Should we also email on `runs.status = 'error'`? Decision: **yes** — a short "SecWatch failed: <error>" email so we know to investigate. Implement in notify policy.
