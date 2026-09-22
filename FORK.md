# Joseph fork

Public-ready fork of [`victor-software-house/pi-acp`](https://github.com/victor-software-house/pi-acp).

- Repo: https://github.com/josephjohncox/pi-acp
- Package: `@josephjohncox/pi-acp`
- License: MIT (upstream copyright retained)

## What differs

- `edit` / `write` use Zed `fs/write_text_file` when the client advertises it (Review Changes / buffer hunks).
- Otherwise a permission card, then a local disk write.
- Write/shell tools can raise `session/request_permission`.

## Publish

CI on `main` typechecks, lints, and tests. **npm publish is `workflow_dispatch` only** until a trusted publisher exists.

To publish to npmjs:

1. `npm login` as a user who can own `@josephjohncox/pi-acp`.
2. npm → Trusted Publisher → GitHub Actions → `josephjohncox/pi-acp` / workflow `Release`.
3. Run the `Release` workflow (or push a conventional commit to `main` after enabling the release step).

```bash
bun install && bun run build && npm pack --dry-run
```

## Make the GitHub repo public

```bash
gh repo edit josephjohncox/pi-acp --visibility public --accept-visibility-change-consequences
```

No Hadrian-internal URLs, tokens, or private registry config belong in this tree.
