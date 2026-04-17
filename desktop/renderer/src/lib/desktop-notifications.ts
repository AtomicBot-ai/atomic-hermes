import removeMarkdown from "remove-markdown";

const MAX_BODY_LENGTH = 120;
const THINK_RE = /<think>[\s\S]*?(?:<\/think>|$)/g;

function stripThinking(text: string): string {
  return text.replace(THINK_RE, "").trim();
}

function stripMarkdown(text: string): string {
  return removeMarkdown(text, {
    stripListLeaders: true,
    gfm: true,
    useImgAltText: true,
  }).trim();
}

function toPlainText(text: string): string {
  return stripMarkdown(stripThinking(text));
}

function truncate(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= MAX_BODY_LENGTH) return oneLine;
  return oneLine.slice(0, MAX_BODY_LENGTH - 1) + "…";
}

export function notifyIfHidden(title: string, body: string): void {
  if (!document.hidden) return;
  const cleanedBody = toPlainText(body);
  if (!cleanedBody) return;
  const cleanedTitle = toPlainText(title);
  const api = (window as any).hermesAPI;
  api?.showNotification?.(cleanedTitle, truncate(cleanedBody));
}
