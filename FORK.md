# Joseph fork

Public-ready fork of [`victor-software-house/pi-acp`](https://github.com/victor-software-house/pi-acp).

- Repo: https://github.com/josephjohncox/pi-acp
- Package: `@josephjohncox/pi-acp`
- License: MIT (upstream copyright retained)

## What differs

- `edit` / `write` use Zed `fs/write_text_file` when the client advertises it (Review Changes / buffer hunks).
- Otherwise a permission card, then a local disk write.
- Session modes are **Review** (default) and **Yolo**. Thinking level stays a config option.
- `read` uses Zed `fs/read_text_file` so the editor can follow along; directory probes do not open buffers.
- Write/shell tools can raise `session/request_permission`.

## Publish

Pushes to `main` run typecheck, tests, then semantic-release via npm Trusted Publisher (OIDC).

- `fix:` → patch tag. Do not overwrite existing tags.
- First public line is `v0.18.0`. Next unused version wins; never `git tag -f`.

```bash
bun install && bun run build && npm pack --dry-run
```

## Make the GitHub repo public

```bash
gh repo edit josephjohncox/pi-acp --visibility public --accept-visibility-change-consequences
```

No Hadrian-internal URLs, tokens, or private registry config belong in this tree.
