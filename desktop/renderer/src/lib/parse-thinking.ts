const THINK_BLOCK_RE = /<think>([\s\S]*?)(?:<\/think>|$)/g;

export type ParsedThinking = {
  thinking: string;
  content: string;
  isThinkingComplete: boolean;
};

/**
 * Extract <think>...</think> blocks from raw model output.
 * Returns the thinking text and the remaining content.
 *
 * During streaming the closing tag may be absent — `isThinkingComplete`
 * indicates whether all think blocks are properly closed.
 */
export function parseThinkingContent(raw: string): ParsedThinking {
  const thinkingParts: string[] = [];
  let content = raw;
  let isThinkingComplete = true;

  let match: RegExpExecArray | null;
  THINK_BLOCK_RE.lastIndex = 0;

  while ((match = THINK_BLOCK_RE.exec(raw)) !== null) {
    thinkingParts.push(match[1]);
    if (!raw.includes("</think>", match.index + 7)) {
      isThinkingComplete = false;
    }
  }

  content = raw.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, "").trim();

  return {
    thinking: thinkingParts.join("\n").trim(),
    content,
    isThinkingComplete,
  };
}
