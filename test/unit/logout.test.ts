/**
 * unstable_logout unit tests. Pi-acp clears every provider's credentials
 * from the shared AuthStorage. Tests use AuthStorage.inMemory + dependency
 * injection by reaching into the agent's session-manager surface — same
 * pattern as delete-session.test.ts.
 */

import { describe, expect, test } from "bun:test";

import { AuthStorage } from "@earendil-works/pi-coding-agent";
import { PiAcpAgent } from "@pi-acp/acp/agent";
import { asAgentConn, FakeAgentSideConnection } from "../helpers/fakes";

describe("PiAcpAgent.logout", () => {
	test("no live session uses injected storage, not ~/.pi/agent/auth.json", async () => {
		const storage = AuthStorage.inMemory({
			anthropic: { type: "api_key", key: "do-not-touch-disk" },
		});
		const agent = new PiAcpAgent(asAgentConn(new FakeAgentSideConnection()));
		(agent as unknown as { createAuthStorage: () => AuthStorage }).createAuthStorage = () =>
			storage;
		const r = await agent.logout({});
		expect(r).toBeDefined();
		expect(storage.list()).toEqual([]);
	});

	test("clears every provider's credentials from the shared AuthStorage", async () => {
		// Mint a sentinel AuthStorage instance + back-door it onto the agent
		// via a fake live session whose modelRegistry.authStorage points at it.
		const storage = AuthStorage.inMemory({
			anthropic: { type: "api_key", key: "secret1" },
			openai: { type: "api_key", key: "secret2" },
		});
		expect(storage.list()).toEqual(expect.arrayContaining(["anthropic", "openai"]));

		const agent = new PiAcpAgent(asAgentConn(new FakeAgentSideConnection()));
		const fakeSession = {
			sessionId: "s1",
			piSession: { modelRegistry: { authStorage: storage } },
		};
		const sessionsField = (agent as unknown as { sessions: { register: (s: unknown) => void } })
			.sessions;
		sessionsField.register(fakeSession);

		const r = await agent.logout({});
		expect(storage.list()).toEqual([]);
		const meta = r._meta as { piAcp?: { clearedProviders?: string[] } };
		expect(meta.piAcp?.clearedProviders).toEqual(expect.arrayContaining(["anthropic", "openai"]));
	});

	test("emits a notice via sessionUpdate to every live session", async () => {
		const conn = new FakeAgentSideConnection();
		const agent = new PiAcpAgent(asAgentConn(conn));
		const storage = AuthStorage.inMemory({});
		const fakeSession = {
			sessionId: "sX",
			piSession: { modelRegistry: { authStorage: storage } },
		};
		(agent as unknown as { sessions: { register: (s: unknown) => void } }).sessions.register(
			fakeSession,
		);
		await agent.logout({});
		// allow microtask queue to flush the void-await sessionUpdate
		await new Promise<void>((r) => setTimeout(r, 10));
		const announce = conn.updates.find(
			(u) =>
				u.sessionId === "sX" &&
				u.update.sessionUpdate === "agent_message_chunk" &&
				typeof (u.update as { content?: { text?: string } }).content?.text === "string" &&
				(u.update as { content: { text: string } }).content.text.includes("Logged out"),
		);
		expect(announce).toBeDefined();
	});

	test("idempotent — second call is a no-op", async () => {
		const storage = AuthStorage.inMemory({
			anthropic: { type: "api_key", key: "s" },
		});
		const agent = new PiAcpAgent(asAgentConn(new FakeAgentSideConnection()));
		const fakeSession = {
			sessionId: "s",
			piSession: { modelRegistry: { authStorage: storage } },
		};
		(agent as unknown as { sessions: { register: (s: unknown) => void } }).sessions.register(
			fakeSession,
		);
		await agent.logout({});
		expect(storage.list()).toEqual([]);
		// Second call must still succeed
		const r = await agent.logout({});
		expect(r).toBeDefined();
	});
});
