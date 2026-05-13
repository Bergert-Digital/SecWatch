# SecWatch

Daily security advisory monitor for Bergert-Digital repos and self-hosted services.

See [2026-05-13-secwatch-design.md](./2026-05-13-secwatch-design.md) for the design.

## Local dev

```bash
pnpm install
cp .env.example .env  # fill in values
pnpm db:migrate
pnpm test
```
