import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { createGatedFsOperations } from "@pi-acp/acp/acp-write-operations";

function makeConn(opts?: { buffer?: string }) {
	const writes: Array<{ path: string; content: string }> = [];
	const reads: string[] = [];
	const perms: string[] = [];
	const buffer = { current: opts?.buffer ?? "" };
	const conn = {
		async writeTextFile(params: { path: string; content: string }) {
			writes.push({ path: params.path, content: params.content });
			return {};
		},
		async readTextFile(params: { path: string }) {
			reads.push(params.path);
			return { content: buffer.current };
		},
		async requestPermission(params: { toolCall: { title: string } }) {
			perms.push(params.toolCall.title);
			return { outcome: { outcome: "selected", optionId: "allow-once" } };
		},
	};
	return { conn, writes, reads, perms, buffer };
}

describe("createGatedFsOperations", () => {
	test("Review + client write uses writeTextFile and does not cache proposed text", async () => {
		const stub = makeConn({ buffer: "disk-or-zed" });
		const ops = createGatedFsOperations({
			conn: stub.conn as never,
			getSessionId: () => "s1",
			sessionAllowWrites: { current: false },
			useClientWrite: true,
			useClientRead: true,
		});
		await ops.write.writeFile("/tmp/x.ts", "proposed");
		expect(stub.writes).toEqual([{ path: "/tmp/x.ts", content: "proposed" }]);
		const got = await ops.edit.readFile("/tmp/x.ts");
		expect(got.toString("utf8")).toBe("disk-or-zed");
		expect(stub.reads).toEqual(["/tmp/x.ts"]);
	});

	test("Yolo + client write writes disk and skips writeTextFile", async () => {
		const dir = await mkdtemp(join(tmpdir(), "pi-acp-yolo-"));
		const path = join(dir, "out.ts");
		const stub = makeConn();
		const ops = createGatedFsOperations({
			conn: stub.conn as never,
			getSessionId: () => "s1",
			sessionAllowWrites: { current: true },
			useClientWrite: true,
			useClientRead: false,
		});
		await ops.write.writeFile(path, "yolo-body");
		expect(stub.writes).toEqual([]);
		expect(await readFile(path, "utf8")).toBe("yolo-body");
	});

	test("non-client write still asks permission then writes disk", async () => {
		const dir = await mkdtemp(join(tmpdir(), "pi-acp-node-"));
		const path = join(dir, "out.ts");
		await writeFile(path, "old");
		const stub = makeConn();
		const ops = createGatedFsOperations({
			conn: stub.conn as never,
			getSessionId: () => "s1",
			sessionAllowWrites: { current: false },
			useClientWrite: false,
			useClientRead: false,
		});
		await ops.write.writeFile(path, "new");
		expect(stub.perms).toHaveLength(1);
		expect(await readFile(path, "utf8")).toBe("new");
	});
});
