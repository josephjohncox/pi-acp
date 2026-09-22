#!/usr/bin/env bash
# Install or remove the user auto-launch for the Joseph pi-acp daemon.
set -euo pipefail

LABEL="com.josephjohncox.pi-acp"
HERE="$(cd "$(dirname "$0")" && pwd)"

usage() {
	echo "usage: $0 [install|uninstall|status]" >&2
	exit 2
}

resolve_bin() {
	if [[ -n "${PI_ACP_BIN:-}" && -x "${PI_ACP_BIN}" ]]; then
		echo "${PI_ACP_BIN}"
		return
	fi
	if command -v pi-acp >/dev/null 2>&1; then
		command -v pi-acp
		return
	fi
	echo "pi-acp not on PATH. Install with: npm i -g @josephjohncox/pi-acp" >&2
	exit 1
}

subst() {
	local src="$1" dest="$2" bin="$3"
	sed \
		-e "s|@BIN@|${bin}|g" \
		-e "s|@HOME@|${HOME}|g" \
		-e "s|@PATH@|${PATH}|g" \
		"${src}" >"${dest}"
}

cmd="${1:-install}"
case "${cmd}" in
install | uninstall | status) ;;
-h | --help) usage ;;
*) usage ;;
esac

if [[ "$(uname -s)" == "Darwin" ]]; then
	uid="$(id -u)"
	plist_src="${HERE}/com.josephjohncox.pi-acp.plist.in"
	plist_dest="${HOME}/Library/LaunchAgents/${LABEL}.plist"
	mkdir -p "${HOME}/Library/LaunchAgents" "${HOME}/.pi/agent/logs"

	if [[ "${cmd}" == "status" ]]; then
		launchctl print "gui/${uid}/${LABEL}" 2>/dev/null | sed -n '1,20p' || echo "${LABEL}: not loaded"
		exit 0
	fi

	launchctl bootout "gui/${uid}/${LABEL}" 2>/dev/null || true
	if [[ "${cmd}" == "uninstall" ]]; then
		rm -f "${plist_dest}"
		echo "removed ${LABEL}"
		exit 0
	fi

	bin="$(resolve_bin)"
	subst "${plist_src}" "${plist_dest}" "${bin}"
	launchctl bootstrap "gui/${uid}" "${plist_dest}"
	launchctl enable "gui/${uid}/${LABEL}"
	launchctl kickstart -k "gui/${uid}/${LABEL}"
	echo "loaded ${LABEL} -> ${bin} --daemon"
	exit 0
fi

# Linux systemd --user
unit_src="${HERE}/pi-acp-user.service.in"
unit_dest="${HOME}/.config/systemd/user/pi-acp.service"
mkdir -p "${HOME}/.config/systemd/user" "${HOME}/.pi/agent/logs"

if [[ "${cmd}" == "status" ]]; then
	systemctl --user status pi-acp --no-pager || true
	exit 0
fi

if [[ "${cmd}" == "uninstall" ]]; then
	systemctl --user disable --now pi-acp 2>/dev/null || true
	rm -f "${unit_dest}"
	systemctl --user daemon-reload
	echo "removed systemd --user pi-acp"
	exit 0
fi

bin="$(resolve_bin)"
subst "${unit_src}" "${unit_dest}" "${bin}"
systemctl --user daemon-reload
systemctl --user enable --now pi-acp
echo "enabled systemd --user pi-acp -> ${bin} --daemon"
