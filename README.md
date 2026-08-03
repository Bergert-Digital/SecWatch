# SecWatch

Daily security monitor for the infrastructure Dependabot cannot see: **container base images** across the `Bergert-Digital` GitHub org, and a hand-maintained list of **self-hosted services**.

Each day at 07:00 Europe/Berlin (`0 5 * * *` UTC) it:

1. Lists non-archived repos in `Bergert-Digital` (incl. private).
2. Reads each repo's `Dockerfile` / `docker-compose.yml` for base images, plus `services.yaml` for self-hosted infra.
3. Queries CISA KEV and per-service GitHub release atom feeds.
4. Computes new matches (idempotent in SQLite).
5. Ranks them via Claude Haiku 4.5: `critical / probably_relevant / probably_not / noise`.
6. Emails a digest via SMTP. Mondays always send (weekly heartbeat or recap). Other days send only if there's news.

## Scope: what this deliberately does not do

Package dependencies (`package.json`, `composer.json`, `requirements.txt`, `go.mod`, …) are **Dependabot's job**. Dependabot alerts and automated security fixes are enabled on every non-archived repo in the org, and it resolves versions from the real dependency graph — more accurately than manifest parsing can. SecWatch used to duplicate that via OSV and the Socket.dev feed; that half was removed.

What is left is the part Dependabot structurally cannot cover:

| Gap | Why Dependabot misses it |
|---|---|
| Self-hosted services (Coolify, Traefik, Postgres on Hetzner) | They live in no repo |
| Container base image CVEs | Dependabot does version bumps for Docker, but GHSA does not map CVEs to image tags, so there are no security alerts |
| CISA KEV (actively exploited) | Not a Dependabot signal |
| One aggregated push digest | Dependabot alerts are per-repo pull |
| Heartbeat | Dependabot's silence is ambiguous |

Because matching is by product **name** (KEV and release notes carry no machine-readable version ranges), name collisions are the expected false-positive mode. Triage is prompted to call them out.

## Local development

```bash
pnpm install
cp .env.example .env  # fill in values
pnpm db:generate      # only if you change the schema
pnpm db:migrate       # apply migrations to DB_PATH
pnpm test
pnpm start            # runs the pipeline once
```

## Env vars

See [.env.example](./.env.example) for the full list.

| Var | Purpose |
|---|---|
| `GITHUB_TOKEN` | Fine-grained PAT, scope: `Bergert-Digital` org, perms `Contents: read` + `Metadata: read` |
| `GITHUB_ORG` | Default `Bergert-Digital` |
| `ANTHROPIC_API_KEY` | Triage (Haiku 4.5) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` | SMTP transport (`secure=true` on port 465; defaults inferred from port) |
| `SMTP_USER` / `SMTP_PASS` | SMTP credentials |
| `SMTP_FROM_ADDRESS` / `SMTP_FROM_NAME` | From header. Address must be allowed by the relay. |
| `NOTIFY_TO` | Recipient |
| `DB_PATH` | SQLite file (default `/data/secwatch.db`) |
| `LOG_LEVEL` | `debug` / `info` / `warn` / `error` |

## Coolify deployment

SecWatch runs as an idle container (`CMD ["sleep", "infinity"]`) plus a Coolify **Scheduled Task** that invokes `node /app/dist/main.js` on the cron. The pipeline is **not** the container's main process.

1. **Push the repo to GitHub.**
2. In Coolify: **New Application** → Source: GitHub → branch `main`.
3. Build type: **Dockerfile**.
4. **Persistent volume**: mount `/data` (where `secwatch.db` lives — Coolify backups will include it).
5. **Environment variables**: set everything from `.env.example` in the Coolify UI.
6. **Scheduled Task** (in the Application's "Scheduled Tasks" tab):
   - Command: `node /app/dist/main.js`
   - Frequency: `0 5 * * *` (UTC, ≈07:00 Europe/Berlin)
7. **PAT**: create a fine-grained GitHub PAT scoped to the `Bergert-Digital` org with `Contents: read` + `Metadata: read`. Include private repos.
8. **Sender setup**: ensure your SMTP relay allows `SMTP_FROM_ADDRESS` to send through it (DNS + sender authentication on the relay).
9. **First run**: from the Application's Scheduled Tasks tab, click "Run now". Verify via Coolify's exec terminal:
   ```bash
   sqlite3 /data/secwatch.db "SELECT * FROM runs ORDER BY id DESC LIMIT 5"
   ```

## Maintaining `services.yaml`

This file is now the main input, not a side note — anything running on the Hetzner boxes that is not listed here is unmonitored. Update `current_version` after upgrading a service. The file is read on every run.

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

`github:` subscribes the service to its release-notes feed (entries mentioning security/CVE/patch become advisories). `docker_image:` is informational. Both name forms feed KEV matching.

## Design

See [2026-05-13-secwatch-design.md](./2026-05-13-secwatch-design.md).

## Cost

< €10/year total: Anthropic Haiku (a handful of findings a month, not hundreds), SMTP free tier, GitHub API free, Coolify is existing infra.
