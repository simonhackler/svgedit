# Multiline E2E Tests

Run these commands from the project root.

Start the e2e preview server:

```bash
npm run start:e2e
```

In another shell, run only the multiline Playwright tests:

```bash
npx playwright test tests/e2e/multiline-text.spec.js
```

If you use the Nix shell for Playwright in this repo, start both commands from that same shell environment.
