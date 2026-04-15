import { getBaseUrl } from "./api";
import { withHermesHeaders } from "./request-context";

export type ApprovalDecision = "allow-once" | "allow-always" | "deny";

export async function resolveApproval(
  port: number,
  sessionId: string,
  decision: ApprovalDecision,
): Promise<void> {
  const res = await fetch(
    `${getBaseUrl(port)}/api/approval/resolve`,
    withHermesHeaders({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, decision }),
    }),
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Approval resolve failed: HTTP ${res.status} ${text}`);
  }
}
