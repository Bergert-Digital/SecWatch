# SecWatch

Daily security advisory monitor for the `Bergert-Digital` GitHub organization and a hand-maintained list of self-hosted services.

Each day at 07:00 Europe/Berlin (`0 5 * * *` UTC) it:

1. Lists non-archived repos in `Bergert-Digital` (incl. private).
2. Reads each repo's dependency manifests (`package.json`, `composer.json`, `requirements.txt`, `pyproject.toml`, `go.mod`, `Dockerfile`, `docker-compose.yml`) plus a `services.yaml` for self-hosted infra.
3. Queries OSV.dev, CISA KEV, the Socket.dev threat feed, and per-service GitHub release atom feeds.
4. Computes new matches (idempotent in SQLite).
5. Ranks them via Claude Haiku 4.5: `critical / probably_relevant / probably_not / noise`.
6. Emails a digest via SMTP. Mondays always send (weekly heartbeat or recap). Other days send only if there's news.

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

1. **Push the repo to GitHub.**
2. In Coolify: **New Application** → Source: GitHub → branch `main`.
3. Build type: **Dockerfile**.
4. Resource type: **Scheduled** with cron `0 5 * * *` (UTC).
5. **Persistent volume**: mount `/data` (this is where `secwatch.db` lives — Coolify backups will include it).
6. **Environment variables**: set everything from `.env.example` in the Coolify UI.
7. **Sender setup**: ensure your SMTP relay allows `SMTP_FROM_ADDRESS` to send through it (DNS + sender authentication on the relay).
8. **PAT**: create a fine-grained GitHub PAT scoped to the `Bergert-Digital` org with `Contents: read` + `Metadata: read`. Include private repos.
9. **First run**: trigger manually from Coolify. Verify `runs.status = 'ok'` via the Coolify exec terminal:
   ```bash
   sqlite3 /data/secwatch.db "SELECT * FROM runs ORDER BY id DESC LIMIT 5"
   ```

## Maintaining `services.yaml`

Update `current_version` after upgrading a self-hosted service. The file is read on every run.

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

## Design

See [2026-05-13-secwatch-design.md](./2026-05-13-secwatch-design.md).

## Cost

< €30/year total: Anthropic Haiku (~€25), SMTP free tier, GitHub API free, Coolify is existing infra.
