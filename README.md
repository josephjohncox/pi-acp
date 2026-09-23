# @josephjohncox/pi-acp

Joseph fork of [`victor-software-house/pi-acp`](https://github.com/victor-software-house/pi-acp). ACP adapter for [pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent), aimed at Zed.

Writes go through Zed `fs/write_text_file` (Review Changes). Reads go through `fs/read_text_file` so the editor can follow along. Default session mode is **Review**; **Yolo** is opt-in.

Upstream protocol notes live under [`docs/`](docs/). Fork deltas: [`FORK.md`](FORK.md).

## Install

```bash
npm i -g @josephjohncox/pi-acp
pi-acp --install-daemon
# same: pi-acp-install-daemon
```

That writes a user LaunchAgent (macOS) or systemd --user unit (Linux) pointing at a durable wrapper (`~/.pi/agent/bin/pi-acp-joseph`) over this package's `dist/index.mjs`. KeepAlive + RunAtLoad. Re-run after `npm i -g` so the wrapper tracks the new files.

```bash
pi-acp --restart-daemon     # or: pi-acp-install-daemon restart
pi-acp --uninstall-daemon
pi-acp-install-daemon status
```

`npx @josephjohncox/pi-acp --install-daemon` is refused if it would pin an npx cache path. Global install first.

From this checkout:

```bash
bun install && bun run build
./launch/install.sh          # or: PI_ACP_BIN=$PWD/../pi/bin/pi-acp-joseph ./launch/install.sh
```

## Auto-launch the daemon

Zed does not keep the adapter process. A user daemon does. The installer writes a **LaunchAgent** (macOS) or a **systemd --user** unit (Linux) that runs `pi-acp --daemon` and keeps it up.

### Install

Prefer the commands under **Install** above. From a checkout:

```bash
./launch/install.sh install
./launch/install.sh restart
./launch/install.sh status
./launch/install.sh uninstall
```

`PI_ACP_BIN` wins if set and executable. Otherwise the script pins `launch/../dist/index.mjs` through `~/.pi/agent/bin/pi-acp-joseph`.

### What it writes

| | macOS | Linux |
|---|---|---|
| Unit | `~/Library/LaunchAgents/com.josephjohncox.pi-acp.plist` | `~/.config/systemd/user/pi-acp.service` |
| Label | `gui/$(id -u)/com.josephjohncox.pi-acp` | `pi-acp.service` |
| Templates | `launch/com.josephjohncox.pi-acp.plist.in` | `launch/pi-acp-user.service.in` |

macOS: `RunAtLoad` + `KeepAlive`. Domain is **`gui/$UID`**, not `gui/501` unless that is your uid. Logs: `~/.pi/agent/logs/pi-acp-daemon.log`.

Env in the unit is only `HOME` and that frozen `PATH`. It does **not** load your zshrc. Put secrets in `~/.pi/agent/models.json` / `auth.json`, not in the plist.

Old Hadrian unit `co.hadrian.pi-acp` must stay unloaded (`*.plist.disabled`). Two daemons fight the socket.

### Status / restart / remove

```bash
pi-acp-install-daemon status
pi-acp-install-daemon uninstall
```

macOS by hand:

```bash
uid="$(id -u)"
launchctl print "gui/${uid}/com.josephjohncox.pi-acp"
launchctl kickstart -k "gui/${uid}/com.josephjohncox.pi-acp"   # after rebuilding dist
launchctl bootout "gui/${uid}/com.josephjohncox.pi-acp"        # stop + unload
```

Linux: `systemctl --user status pi-acp` / `restart` / `disable --now`.

After `bun run build` in this repo, kickstart (or `systemctl --user restart pi-acp`). Then a **new** Zed thread. Old session IDs die with the daemon.

## Config locations

pi-acp does **not** have its own models/auth. It uses pi’s, then an overlay manifest.

### Pi (shared with the CLI)

| Path | What |
|---|---|
| `~/.pi/agent/settings.json` | default provider/model, packages |
| `~/.pi/agent/models.json` | provider credentials (Bifrost: url + key + headers; no model list) |
| `~/.pi/agent/auth.json` | OAuth (Codex etc.). Do not point tests at this file |
| `~/.pi/agent/extensions/` | loaded on session create (`pi-bifrost` lives here as a symlink) |
| `~/.pi/agent/bifrost-catalog.json` | cached Bifrost model list |
| `~/.pi/agent/logs/pi-acp-daemon.log` | daemon stdout/stderr |

### Overlay (ACP only)

Cascade, first hit wins:

1. `session/new` `_meta.piAcp.manifest` (inline object or path)
2. `<cwd>/.pi-acp.yaml`
3. `~/.pi-acp/config.yaml`
4. synthesized default (`mode: local`, empty roots → `agentDir` = `getAgentDir()`)

`~/.pi-acp/config.yaml` is the user-global overlay. Repo copy: `dev_configs/pi/acp/config.yaml`. Typical contents: `mode: overlay` plus local roots for `~/.pi/agent` and `~/.pi-acp/zed-agent` (Zed review `AGENTS.md`).

`~` / `~/…` in those paths are expanded. `~other` is not. Before that expansion, `agentDir: ~/.pi/agent` was a relative directory under the project cwd, so extensions (Bifrost) never loaded and only Codex OAuth models showed.

Zed editor settings stay in `~/.config/zed/settings.json` (`agent_servers`, profiles, `edit_predictions`). Not this overlay.

## Models, Bifrost, new Zed

Bifrost is **not** an ACP provider. Zed 1.5’s provider pane talks `providers/list|set|disable`. Those only see whatever is already in a **live** pi `ModelRegistry`. No session ⇒ we return `{ providers: [] }`. That is not “Bifrost missing”; nothing has booted yet.

How models actually appear:

1. `~/.pi/agent/extensions/pi-bifrost` → `vendor/pi-bifrost` (symlink). Not an npm package in `settings.json`.
2. On `createAgentSession`, the extension `registerProvider("bifrost", { models })` from a live catalog or `~/.pi/agent/bifrost-catalog.json`.
3. `models.json` `providers.bifrost` is **baseUrl + apiKey + headers only**. It has no `models` array and no `api`. The catalog is the model list.
4. We advertise those models as session `configOptions` (id `model`) and still send a leftover `models` field for older Zed. ACP `session/set_model` is gone in SDK 1.5; the picker is `session/set_config_option`.

If the new Zed screen is “add Anthropic / OpenAI / Google”, that will never list Bifrost. Open a thread and use the session model option. If that list is empty, the extension did not register — check the daemon log for `pi-bifrost:` and that the symlink target still exists.

## Zed setup

User settings: `~/.config/zed/settings.json` (Zed does not honor project-level `agent_servers` / `edit_predictions`).

### 1. Point the ACP agent at this binary

```json
{
  "agent_servers": {
    "pi-acp": {
      "type": "custom",
      "command": "pi-acp",
      "args": []
    }
  },
  "agent": {
    "single_file_review": true,
    "default_profile": "write"
  }
}
```

If `pi-acp` is not on the PATH Zed uses, put the absolute path from `command -v pi-acp` in `command`.

Open the Agent panel → pick **pi-acp** → **new thread**. Old session IDs die when the daemon restarts.

### 2. Profiles (Composer vs Apply vs Inline)

These are Zed agent profiles, not a second product.

```json
{
  "agent": {
    "profiles": {
      "write": {
        "name": "Apply",
        "tools": {
          "read_file": true,
          "grep": true,
          "terminal": true,
          "edit_file": true
        },
        "enable_all_context_servers": false,
        "context_servers": {}
      },
      "inline": {
        "name": "Inline",
        "tools": {
          "read_file": true,
          "grep": true,
          "terminal": false,
          "edit_file": true
        },
        "enable_all_context_servers": false,
        "context_servers": {}
      },
      "research": {
        "name": "Planner",
        "tools": {
          "read_file": true,
          "grep": true,
          "terminal": false,
          "edit_file": false
        },
        "enable_all_context_servers": false,
        "context_servers": {}
      }
    }
  }
}
```

Leave `enable_all_context_servers` false unless you intend every Zed MCP to land in the thread.

### 3. Review vs Yolo

In a live pi-acp thread, the session mode picker is **Review** (default) or **Yolo**.

- Review: edits land as Review Changes hunks (`single_file_review` must be on). Shell asks first.
- Yolo: writes hit disk for the rest of that thread. Zed has no accept-all-hunks RPC.

Thinking depth is a **config option**, not a session mode.

### 4. Send a file or selection

This is a Zed key, not a pi-acp RPC. The adapter already accepts `resource` / `resource_link` on `session/prompt`.

- Selection / location: `cmd-right` or `cmd-shift-right` (`agent::AddSelectionToThread`). Bound in vim visual/normal/insert. This steals Zed end-of-line / select-to-end-of-line; in vim those are `$` / `v$`.
- Whole file: `@path` in the agent composer. Zed has no `AddFileToThread` action.
- Empty selection: Zed decides whether that is the current line or a no-op. We do not invent a `/file` slash command that cannot see the buffer.

You must have a live pi-acp thread.

### 5. Editing a previous prompt

No. Native Zed Agent can rewrite a sent card. External ACP threads show **Unavailable Editing** ([zed#56332](https://github.com/zed-industries/zed/discussions/56332)). ACP has no `session/edit_message`. Fork/resume does not rewind to a mid-thread user turn. Do not click the card and expect this adapter to invent it.

Workaround: new thread, or `@` / `cmd-right` the same spots and say what changed.

### 6. Tab (edit predictions)

Tab is separate from ACP. Point `edit_predictions` at your FIM proxy. That setting is user-global in Zed; one window’s proxy wins.

## Commands

`/compact`, `/export`, `/session`, `/name`, `/follow-up`, `/changelog`, plus pi prompt templates and `/skill:…`.

## Auth

ACP Registry terminal-auth, or whatever pi already has in `~/.pi/agent`. This daemon will create an empty `~/.pi/agent/auth.json` if the file is missing. Do not run the test suite against that file (logout tests used to wipe it; they no longer do).

## Release

Pushes to `main` run tests, then semantic-release with npm Trusted Publisher.

- `fix:` → patch tag (`v0.18.1`)
- `feat:` → minor
- Never overwrite a tag. No `git tag -f`, no `git push --force --tags`. If a version is wrong, cut the next patch.

## License

MIT. Upstream copyright is in [LICENSE](LICENSE).
