export type ReviewDecision = "allow-once" | "reject-once" | "allow-session-writes" | "cancelled";

export type ReviewPermissionRequest = {
	toolCallId: string;
	title: string;
	kind: "edit" | "execute" | "other";
	content: unknown[];
};

export type ReviewPermissionFn = (req: ReviewPermissionRequest) => Promise<ReviewDecision>;

type BridgeGlobal = typeof globalThis & { __piAcpReviewPermission?: ReviewPermissionFn | undefined };

export function installReviewPermission(fn: ReviewPermissionFn | undefined): void {
	const g = globalThis as BridgeGlobal;
	if (fn === undefined) {
		g.__piAcpReviewPermission = undefined;
		return;
	}
	g.__piAcpReviewPermission = fn;
}
