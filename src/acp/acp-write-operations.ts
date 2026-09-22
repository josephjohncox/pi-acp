import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { AgentSideConnection } from "@agentclientprotocol/sdk";
import type { EditOperations, WriteOperations } from "@earendil-works/pi-coding-agent";

export interface AcpWriteOperationsDeps {
	conn: AgentSideConnection;
	getSessionId: () => string;
	sessionAllowWrites: { current: boolean };
	/** When true, apply via Zed `fs/write_text_file` so Review Changes / buffer nav works. */
	useClientWrite: boolean;
	useClientRead: boolean;
}

async function decideNodeWrite(
	deps: AcpWriteOperationsDeps,
	abs: string,
	newText: string,
): Promise<void> {
	if (deps.sessionAllowWrites.current) return;
	const sessionId = deps.getSessionId();
	if (sessionId === "") {
		throw new Error("ACP session is not bound; refusing to write");
	}
	let oldText = "";
	try {
		oldText = await readFile(abs, "utf8");
	} catch {
		oldText = "";
	}
	const response = await deps.conn.requestPermission({
		sessionId,
		toolCall: {
			toolCallId: randomUUID(),
			title: `Apply ${abs}`,
			kind: "edit",
			status: "pending",
			locations: [{ path: abs }],
			content: [{ type: "diff", path: abs, oldText, newText }],
		},
		options: [
			{ optionId: "allow-once", name: "Allow once", kind: "allow_once" },
			{ optionId: "reject-once", name: "Reject", kind: "reject_once" },
			{
				optionId: "allow-session-writes",
				name: "Allow writes this session",
				kind: "allow_always",
			},
		],
	});
	const outcome = response.outcome;
	if (outcome.outcome === "cancelled") {
		throw new Error("Write rejected in Zed review");
	}
	if (outcome.optionId === "allow-session-writes") {
		deps.sessionAllowWrites.current = true;
		return;
	}
	if (outcome.optionId === "allow-once") return;
	throw new Error("Write rejected in Zed review");
}

export function createGatedFsOperations(deps: AcpWriteOperationsDeps): {
	edit: EditOperations;
	write: WriteOperations;
} {
	const overlay = new Map<string, string>();

	const readUtf8 = async (absolutePath: string): Promise<string> => {
		const cached = overlay.get(absolutePath);
		if (cached !== undefined) return cached;
		if (deps.useClientRead) {
			const sessionId = deps.getSessionId();
			if (sessionId === "") throw new Error("ACP session is not bound; refusing to read");
			const response = await deps.conn.readTextFile({ sessionId, path: absolutePath });
			return response.content;
		}
		return await readFile(absolutePath, "utf8");
	};

	const apply = async (absolutePath: string, content: string): Promise<void> => {
		const sessionId = deps.getSessionId();
		if (sessionId === "") {
			throw new Error("ACP session is not bound; refusing to write");
		}
		if (deps.useClientWrite) {
			await deps.conn.writeTextFile({ sessionId, path: absolutePath, content });
			overlay.set(absolutePath, content);
			return;
		}
		await decideNodeWrite(deps, absolutePath, content);
		await mkdir(dirname(absolutePath), { recursive: true });
		await writeFile(absolutePath, content, "utf8");
		overlay.set(absolutePath, content);
	};

	return {
		edit: {
			readFile: async (absolutePath) => Buffer.from(await readUtf8(absolutePath), "utf8"),
			access: async (absolutePath) => {
				if (overlay.has(absolutePath)) return;
				if (deps.useClientRead) {
					await readUtf8(absolutePath);
					return;
				}
				await access(absolutePath);
			},
			writeFile: apply,
		},
		write: {
			mkdir: (dir) => mkdir(dir, { recursive: true }).then(() => undefined),
			writeFile: apply,
		},
	};
}
