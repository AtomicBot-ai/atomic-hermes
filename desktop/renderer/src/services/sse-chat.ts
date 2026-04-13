import { getBaseUrl } from "./api";
import { withHermesHeaders } from "./request-context";

export type ChatCompletionMessage = {
  role: string;
  content: string;
};

export type StreamCallbacks = {
  onDelta: (text: string) => void;
  onReasoningDelta?: (text: string) => void;
  onToolProgress?: (label: string) => void;
  onSessionId?: (sessionId: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: Error) => void;
};

/**
 * Stream a chat completion from the gateway using SSE (server-sent events).
 * Returns an AbortController that can be used to cancel the stream.
 */
export function streamChatCompletion(
  port: number,
  messages: ChatCompletionMessage[],
  callbacks: StreamCallbacks,
): AbortController {
  const controller = new AbortController();
  let accumulated = "";

  const handleEvent = (eventName: string, data: string) => {
    if (!data || data === "[DONE]") return;

    try {
      if (eventName === "session_id") {
        const payload = JSON.parse(data) as { session_id?: string };
        if (payload.session_id) {
          callbacks.onSessionId?.(payload.session_id);
        }
        return;
      }

      if (eventName === "reasoning_delta") {
        const chunk = JSON.parse(data) as {
          choices?: Array<{ delta?: { reasoning?: string } }>;
        };
        const reasoning = chunk.choices?.[0]?.delta?.reasoning;
        if (reasoning) {
          callbacks.onReasoningDelta?.(reasoning);
        }
        return;
      }

      if (eventName === "tool_progress") {
        const chunk = JSON.parse(data) as {
          choices?: Array<{
            delta?: { tool_progress?: { emoji?: string; label?: string; tool?: string } };
          }>;
        };
        const toolProgress = chunk.choices?.[0]?.delta?.tool_progress;
        const label = toolProgress?.label ?? toolProgress?.tool;
        if (label) {
          const prefix = toolProgress?.emoji ? `${toolProgress.emoji} ` : "";
          callbacks.onToolProgress?.(`${prefix}${label}`);
        }
        return;
      }

      if (eventName === "error") {
        const payload = JSON.parse(data) as { error?: string; message?: string };
        callbacks.onError(new Error(payload.error || payload.message || "Unknown stream error"));
        return;
      }

      const chunk = JSON.parse(data) as {
        session_id?: string;
        choices?: Array<{ delta?: { content?: string }; finish_reason?: string }>;
      };
      if (chunk.session_id) {
        callbacks.onSessionId?.(chunk.session_id);
      }
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) {
        accumulated += content;
        callbacks.onDelta(content);
      }
    } catch {
      // skip malformed JSON events
    }
  };

  (async () => {
    try {
      const res = await fetch(`${getBaseUrl(port)}/api/v1/chat/completions`, withHermesHeaders({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, stream: true }),
        signal: controller.signal,
      }));

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        callbacks.onError(new Error(`HTTP ${res.status}: ${text}`));
        return;
      }

      const sessionId = res.headers.get("X-Hermes-Session-Id");
      if (sessionId) {
        callbacks.onSessionId?.(sessionId);
      }

      const reader = res.body?.getReader();
      if (!reader) {
        callbacks.onError(new Error("No response body"));
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() ?? "";

        for (const block of blocks) {
          const lines = block.split("\n");
          let eventName = "";
          const dataLines: string[] = [];

          for (const line of lines) {
            if (line.startsWith("event:")) {
              eventName = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              dataLines.push(line.slice(5).trimStart());
            }
          }

          handleEvent(eventName, dataLines.join("\n"));
        }
      }

      callbacks.onDone(accumulated);
    } catch (err) {
      if (controller.signal.aborted) {
        callbacks.onDone(accumulated);
        return;
      }
      callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    }
  })();

  return controller;
}
