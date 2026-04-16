import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAppSelector, useAppDispatch } from "@store/hooks";
import { captureRenderer, ANALYTICS_EVENTS } from "@analytics";
import { approvalRequested } from "@store/slices/chatSlice";
import { parseThinkingContent } from "../../lib/parse-thinking";
import {
  buildChatSessionSystemMessage,
  consumePendingChatSessionSeed,
  resolveDesktopChatRoutingSeed,
  rotatePendingChatSessionSeed,
  saveChatSessionSeed,
} from "../../services/chat-session";
import { streamChatCompletion, cancelChatCompletion } from "../../services/sse-chat";
import { routes } from "../app/routes";
import { notifyIfHidden } from "../../lib/desktop-notifications";
import { ChatComposer, type ChatComposerRef } from "./components/ChatComposer";
import { ChatMessageList, type DisplayMessage } from "./components/ChatMessageList";
import { ExecApprovalModal } from "./ExecApprovalModal";
import ct from "./ChatTranscript.module.css";

export function StartChatPage() {
  const dispatch = useAppDispatch();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamingRaw, setStreamingRaw] = useState("");
  const [streamingThinking, setStreamingThinking] = useState("");
  const [streamingActions, setStreamingActions] = useState<string[]>([]);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [pendingUserMessage, setPendingUserMessage] = useState("");
  const composerRef = useRef<ChatComposerRef>(null);
  const abortRef = useRef<AbortController | null>(null);
  const completionIdRef = useRef<string | null>(null);
  const createdSessionIdRef = useRef<string | null>(null);
  const sessionSeedRef = useRef(resolveDesktopChatRoutingSeed(""));
  const scrollRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const gatewayState = useAppSelector((s) => s.gateway.state);
  const port = gatewayState?.kind === "ready" ? gatewayState.port : 8642;
  const logoUrl = new URL("../../../../assets/main-logo.png", import.meta.url).toString();
  const parsedStream = useMemo(() => parseThinkingContent(streamingRaw), [streamingRaw]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || pendingUserMessage) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [pendingUserMessage]);

  useEffect(() => {
    const focusId = requestAnimationFrame(() => {
      composerRef.current?.focusInput();
    });
    return () => cancelAnimationFrame(focusId);
  }, []);

  const send = useCallback(() => {
    const text = input.trim();
    if (!text || sending || streaming) return;
    setSending(true);
    setInput("");
    setPendingUserMessage(text);
    captureRenderer(ANALYTICS_EVENTS.messageSent);
    setStreamingRaw("");
    setStreamingThinking("");
    setStreamingActions([]);
    setStreamingMessageId(`pending-assistant-${crypto.randomUUID()}`);
    createdSessionIdRef.current = null;

    const messages = [
      buildChatSessionSystemMessage(sessionSeedRef.current),
      { role: "user", content: text },
    ];

    completionIdRef.current = null;
    abortRef.current = streamChatCompletion(port, messages, {
      onSessionId(sessionId) {
        saveChatSessionSeed(sessionId, sessionSeedRef.current);
        consumePendingChatSessionSeed();
        createdSessionIdRef.current = sessionId;
      },
      onCompletionId(id) {
        completionIdRef.current = id;
      },
      onDelta(delta) {
        setStreaming(true);
        setSending(false);
        setStreamingRaw((prev) => prev + delta);
      },
      onReasoningDelta(delta) {
        setStreaming(true);
        setSending(false);
        setStreamingThinking((prev) => prev + delta);
      },
      onToolProgress(label) {
        setStreaming(true);
        setSending(false);
        setStreamingActions((prev) => [...prev, label]);
      },
      onExecApprovalRequested(data) {
        dispatch(approvalRequested(data));
        const detail = data.description ? `${data.description}\n${data.command}` : data.command;
        notifyIfHidden("Approval required", detail);
      },
      onDone(fullText) {
        notifyIfHidden("Task complete", fullText || "Hermes has finished the task");
        setSending(false);
        setStreaming(false);
        abortRef.current = null;
        completionIdRef.current = null;
        if (createdSessionIdRef.current) {
          void navigate(
            `${routes.chat}?session=${encodeURIComponent(createdSessionIdRef.current)}`,
            { replace: true },
          );
        }
      },
      onError(err) {
        console.error("StartChatPage: stream error", err);
        setSending(false);
        setStreaming(false);
        setStreamingRaw(err.message || "An error occurred");
        setPendingUserMessage((prev) => prev || text);
        abortRef.current = null;
        completionIdRef.current = null;
        createdSessionIdRef.current = null;
      },
    });
  }, [input, sending, streaming, port, navigate, dispatch]);

  const handleStop = useCallback(() => {
    const cid = completionIdRef.current;
    if (cid) {
      void cancelChatCompletion(port, cid);
    }
    createdSessionIdRef.current = null;
    completionIdRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;
    setSending(false);
    setStreaming(false);
    setStreamingThinking("");
    setStreamingActions([]);
    setStreamingMessageId(null);
    sessionSeedRef.current = rotatePendingChatSessionSeed();
  }, [port]);

  const displayMessages: DisplayMessage[] = pendingUserMessage
    ? [{ id: "pending-user", role: "user", content: pendingUserMessage }]
    : [];

  const hasPendingChat = displayMessages.length > 0 || sending || streaming || !!streamingRaw;

  return (
    <div className={ct.UiChatShell}>
      {hasPendingChat ? (
        <ChatMessageList
          messages={displayMessages}
          streamingText={parsedStream.content}
          streamingThinking={streamingThinking || parsedStream.thinking}
          streamingActions={streamingActions}
          streamingMessageId={streamingMessageId}
          isStreaming={streaming}
          waitingForFirstChunk={sending && !streaming}
          scrollRef={scrollRef}
        />
      ) : (
        <div className={ct.UiChatTranscript}>
          <div className={ct.UiChatEmpty}>
            <img className={ct.UiChatEmptyLogo} src={logoUrl} alt="" aria-hidden="true" />
            <div className={ct.UiChatEmptyTitle}>Atomic Hermes</div>
            <div className={ct.UiChatEmptySubtitle}>Send a message to start chatting</div>
          </div>
        </div>
      )}

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
