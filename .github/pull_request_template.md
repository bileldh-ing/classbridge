## What & why
<!-- Link the issue / spec section. Use a conventional-commit title: feat|fix|docs|refactor|test|ci|chore(scope): summary -->

## How it was verified
- [ ] `pnpm lint` and `pnpm typecheck`
- [ ] Unit / integration tests added or updated (`pnpm test`)
- [ ] E2E updated if a user journey changed (`pnpm test:e2e`)
- [ ] Migrations are additive and committed under `/drizzle` (journal updated)

## Security & privacy
- [ ] Authorization checked server-side (role + ownership) for every new route/action
- [ ] No secrets, tokens, personal data or message bodies in logs, errors or fixtures
- [ ] Uploads validated by magic bytes and size; private storage only

## Screenshots (UI changes, EN + AR/RTL + mobile)
