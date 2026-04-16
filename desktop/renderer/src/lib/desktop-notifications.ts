const MAX_BODY_LENGTH = 120;
const THINK_RE = /<think>[\s\S]*?(?:<\/think>|$)/g;

function stripThinking(text: string): string {
  return text.replace(THINK_RE, "").trim();
}

function truncate(text: string): string {
  const oneLine = text.replace(/\n/g, " ").trim();
  if (oneLine.length <= MAX_BODY_LENGTH) return oneLine;
  return oneLine.slice(0, MAX_BODY_LENGTH - 1) + "…";
}

export function notifyIfHidden(title: string, body: string): void {
  if (!document.hidden) return;
  const cleaned = stripThinking(body);
  if (!cleaned) return;
  const api = (window as any).hermesAPI;
  api?.showNotification?.(title, truncate(cleaned));
}
