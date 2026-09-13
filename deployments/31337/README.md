# Generated local deployment

`pnpm local:setup` writes the ignored `manifest.json` and `verification.json` after authenticating the compiled graph and actual local runtime/receipts. `pnpm deploy:local` rechecks and reuses that graph; it never silently replaces an existing deployment.

These files describe one machine's persistent Anvil state. They are deliberately not a verified deployment claim for a fresh clone. Follow the [development quickstart](../../README.md#development). Captured deployment evidence remains under [test/evidence/local-deployment](../../test/evidence/local-deployment).
