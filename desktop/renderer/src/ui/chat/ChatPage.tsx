import React, { useState, useCallback, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useAppSelector, useAppDispatch } from "@store/hooks";
import {
  appendMessage,
  messagesLoaded,
  setLoading,
  setSending,
  streamStarted,
  streamDelta,
  streamReasoningDelta,
  streamToolProgress,
  streamFinished,
  streamAborted,
  sessionChanged,
  approvalRequested,
  nextMsgId,
  type ChatMessage,
} from "@store/slices/chatSlice";
import { parseThinkingContent } from "../../lib/parse-thinking";
import { buildChatSessionSystemMessage, loadChatSessionSeed } from "../../services/chat-session";
import { fetchSessionMessages } from "../../services/session-api";
import { streamChatCompletion, cancelChatCompletion } from "../../services/sse-chat";
import { ChatComposer, type ChatComposerRef } from "./components/ChatComposer";
import { ChatMessageList, type DisplayMessage } from "./components/ChatMessageList";
import { ExecApprovalModal } from "./ExecApprovalModal";
import ct from "./ChatTranscript.module.css";

export function ChatPage() {
  const dispatch = useAppDispatch();
  const gatewayState = useAppSelector((s) => s.gateway.state);
  const port = gatewayState?.kind === "ready" ? gatewayState.port : 8642;

  const messages = useAppSelector((s) => s.chat.messages);
  const streaming = useAppSelector((s) => s.chat.streaming);
  const streamingText = useAppSelector((s) => s.chat.streamingText);
  const streamingThinking = useAppSelector((s) => s.chat.streamingThinking);
  const streamingActions = useAppSelector((s) => s.chat.streamingActions);
  const streamingMessageId = useAppSelector((s) => s.chat.streamingMessageId);
  const sending = useAppSelector((s) => s.chat.sending);
  const loading = useAppSelector((s) => s.chat.loading);

  const [searchParams] = useSearchParams();
  const sessionKey = searchParams.get("session") ?? "";
  const sessionSeed = React.useMemo(
    () => (sessionKey ? loadChatSessionSeed(sessionKey) : null),
    [sessionKey],
  );

  const [input, setInput] = useState("");
  const [anchorVersion, setAnchorVersion] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<ChatComposerRef>(null);
  const abortRef = useRef<AbortController | null>(null);
  const completionIdRef = useRef<string | null>(null);
  const prevSessionRef = useRef<string>("");
  const prevLoadingRef = useRef(false);

  useEffect(() => {
    if (!sessionKey || sessionKey === prevSessionRef.current) return;
    prevSessionRef.current = sessionKey;
    setAnchorVersion(0);
    dispatch(sessionChanged(sessionKey));
    dispatch(setLoading(true));

    fetchSessionMessages(port, sessionKey)
      .then((res) => {
        const msgs: ChatMessage[] = (res.messages ?? [])
          .filter((m) => (m.role === "user" || m.role === "assistant") && m.content)
          .map((m, i) => {
            const raw = m.content!;
            const reasoning = (m as Record<string, unknown>).reasoning as string | undefined;
            if (m.role === "assistant") {
              const parsed = parseThinkingContent(raw);
              return {
                id: `history-${i}`,
                role: m.role as "user" | "assistant",
                content: parsed.content || raw,
                thinking: reasoning || parsed.thinking || undefined,
              };
            }
            return {
              id: `history-${i}`,
              role: m.role as "user" | "assistant",
              content: raw,
            };
          });
        dispatch(messagesLoaded(msgs));
      })
      .catch((err) => {
        console.error("Failed to load history:", err);
        dispatch(setLoading(false));
      });
  }, [sessionKey, port, dispatch]);

  useEffect(() => {
    const el = scrollRef.current;
    const justFinishedLoading = prevLoadingRef.current && !loading;
    prevLoadingRef.current = loading;
    if (!el || !justFinishedLoading || sending || streaming) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [loading, sending, streaming]);

  useEffect(() => {
    const focusId = requestAnimationFrame(() => {
      composerRef.current?.focusInput();
    });
    return () => cancelAnimationFrame(focusId);
  }, [sessionKey]);

  const send = useCallback(() => {
    const text = input.trim();
    if (!text || sending || streaming) return;

    const userMsg: ChatMessage = { id: nextMsgId(), role: "user", content: text };
    dispatch(appendMessage(userMsg));
    setInput("");
    dispatch(setSending(true));

    const allMessages = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));
    const requestMessages = sessionSeed
      ? [buildChatSessionSystemMessage(sessionSeed), ...allMessages]
      : allMessages;

    dispatch(streamStarted());
    setAnchorVersion((value) => value + 1);
    completionIdRef.current = null;
    abortRef.current = streamChatCompletion(port, requestMessages, {
      onDelta(delta) {
        dispatch(streamDelta(delta));
      },
      onReasoningDelta(delta) {
        dispatch(streamReasoningDelta(delta));
      },
      onToolProgress(label) {
        dispatch(streamToolProgress(label));
      },
      onExecApprovalRequested(data) {
        dispatch(approvalRequested(data));
      },
      onSessionId() {
        // session_id derived by gateway, sidebar will refresh
      },
      onCompletionId(id) {
        completionIdRef.current = id;
      },
      onDone() {
        dispatch(streamFinished());
        setAnchorVersion((value) => value + 1);
        abortRef.current = null;
        completionIdRef.current = null;
      },
      onError(err) {
        console.error("Stream error:", err);
        dispatch(streamAborted());
        dispatch(appendMessage({
          id: nextMsgId(),
          role: "assistant",
          content: `Error: ${err.message}`,
        }));
        abortRef.current = null;
        completionIdRef.current = null;
      },
    });
  }, [input, sending, streaming, messages, port, dispatch, sessionSeed]);

  const handleStop = useCallback(() => {
    const cid = completionIdRef.current;
    if (cid) {
      void cancelChatCompletion(port, cid);
    }
    abortRef.current?.abort();
    abortRef.current = null;
    completionIdRef.current = null;
    dispatch(streamAborted());
  }, [dispatch, port]);

  const displayMessages: DisplayMessage[] = messages
    .filter((m): m is ChatMessage & { role: "user" | "assistant" } =>
      m.role === "user" || m.role === "assistant",
    )
    .map((m) => ({ id: m.id, role: m.role, content: m.content, thinking: m.thinking, actions: m.actions }));

  return (
    <div className={ct.UiChatShell}>
      <ChatMessageList
        messages={displayMessages}
        streamingText={streamingText}
        streamingThinking={streamingThinking}
        streamingActions={streamingActions}
        anchorVersion={anchorVersion}
        streamingMessageId={streamingMessageId}
        isStreaming={streaming}
        waitingForFirstChunk={sending}
        scrollRef={scrollRef}
      />

      <div className={ct.UiChatScrollToBottomWrap}>
        <ChatComposer
          ref={composerRef}
          value={input}
          onChange={setInput}
          onSend={send}
          disabled={sending}
          streaming={streaming}
          onStop={handleStop}
        />
      </div>

      <ExecApprovalModal />
    </div>
  );
}
