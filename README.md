# @josephjohncox/pi-acp

Joseph fork of [`victor-software-house/pi-acp`](https://github.com/victor-software-house/pi-acp). ACP adapter for [pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent), aimed at Zed.

Writes go through Zed `fs/write_text_file` (Review Changes). Reads go through `fs/read_text_file` so the editor can follow along. Default session mode is **Review**; **Yolo** is opt-in.

Upstream protocol notes live under [`docs/`](docs/). Fork deltas: [`FORK.md`](FORK.md).

## Install

```bash
npm i -g @josephjohncox/pi-acp
```

From this repo:

```bash
bun install && bun run build
```

Needs Node 24+ or Bun 1.3+, and a working pi auth / `models.json`.

## Auto-launch the daemon

Zed talks to a long-running `pi-acp --daemon`. Install that as a user service:

```bash
# after the global npm install
pi-acp-install-daemon

# or from a checkout
./launch/install.sh
```

```bash
pi-acp-install-daemon status
pi-acp-install-daemon uninstall
```

macOS → `~/Library/LaunchAgents/com.josephjohncox.pi-acp.plist`  
Linux → `systemctl --user` unit `pi-acp`

Override the binary with `PI_ACP_BIN=/path/to/pi-acp`. Logs: `~/.pi/agent/logs/pi-acp-daemon.log`.

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

- Review: edits land as Review Changes hunks (`single_file_review` must be on).
- Yolo: writes for the rest of that thread without asking.

Thinking depth is a **config option**, not a session mode.

### 4. Tab (edit predictions)

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
