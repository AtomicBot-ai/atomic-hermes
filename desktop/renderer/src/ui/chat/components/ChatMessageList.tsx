import React from "react";
import { UserMessageBubble } from "./UserMessageBubble";
import { AssistantMessageBubble } from "./AssistantStreamBubble";
import ct from "../ChatTranscript.module.css";

export type DisplayMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  actions?: string[];
};

export type ChatMessageListProps = {
  messages: DisplayMessage[];
  streamingText: string;
  streamingThinking: string;
  streamingActions?: string[];
  anchorVersion?: number;
  streamingMessageId: string | null;
  isStreaming: boolean;
  waitingForFirstChunk: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
};

export function ChatMessageList(props: ChatMessageListProps) {
  const {
    messages,
    streamingText,
    streamingThinking,
    streamingActions = [],
    anchorVersion = 0,
    streamingMessageId,
    isStreaming,
    waitingForFirstChunk,
    scrollRef,
  } = props;
  const followBottomRef = React.useRef(true);

  const renderedMessages = React.useMemo(() => {
    if (
      !streamingMessageId
      || (!waitingForFirstChunk && !isStreaming && !streamingText && !streamingThinking && streamingActions.length === 0)
    ) {
      return messages;
    }

    return [
      ...messages,
      {
        id: streamingMessageId,
        role: "assistant" as const,
        content: streamingText,
        thinking: streamingThinking,
        actions: streamingActions,
      },
    ];
  }, [isStreaming, messages, streamingActions, streamingMessageId, streamingText, streamingThinking, waitingForFirstChunk]);

  // Detect user-initiated scroll input and flip stickiness based on resulting position.
  // Programmatic scrolls (our own scrollTo below) don't fire these events, so they
  // never accidentally detach or re-attach the sticky state.
  React.useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const STICK_THRESHOLD_PX = 80;

    const reevaluate = () => {
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      followBottomRef.current = distanceFromBottom <= STICK_THRESHOLD_PX;
    };

    const handleUserInput = () => {
      requestAnimationFrame(reevaluate);
    };

    container.addEventListener("wheel", handleUserInput, { passive: true });
    container.addEventListener("touchmove", handleUserInput, { passive: true });
    container.addEventListener("keydown", handleUserInput);

    return () => {
      container.removeEventListener("wheel", handleUserInput);
      container.removeEventListener("touchmove", handleUserInput);
      container.removeEventListener("keydown", handleUserInput);
    };
  }, [scrollRef]);

  // New send / stream completion boundary — user clearly wants to see the latest,
  // so re-enable stickiness.
  React.useEffect(() => {
    if (anchorVersion === 0) return;
    followBottomRef.current = true;
  }, [anchorVersion]);

  // Follow the bottom on every streamed chunk, but only while the user hasn't
  // scrolled away. Uses scrollTop assignment (no smooth behavior) to avoid the
  // per-token animation jitter.
  React.useEffect(() => {
    if (!followBottomRef.current) return;
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [streamingText, streamingThinking, streamingActions, anchorVersion, renderedMessages.length, scrollRef]);

  return (
    <div className={`${ct.UiChatTranscript} scrollable`} ref={scrollRef}>
      <div className={ct.UiChatTranscriptInner}>
        {renderedMessages.map((msg, idx) => {
          if (msg.role === "user") {
            return (
              <UserMessageBubble
                key={msg.id}
                text={msg.content}
              />
            );
          }
          const isLast = idx === renderedMessages.length - 1;
          const isPending = msg.id === streamingMessageId && (waitingForFirstChunk || isStreaming);
          const classNameRoot = [
            isLast ? ct.UiChatRowLastAssistant : "",
            isPending ? ct.UiChatRowPendingAssistant : "",
          ].filter(Boolean).join(" ") || undefined;
          return (
            <AssistantMessageBubble
              key={msg.id}
              text={msg.content}
              thinking={msg.thinking}
              actions={msg.actions}
              classNameRoot={classNameRoot}
              isStreaming={isPending}
              showLoading={isPending}
            />
          );
        })}
      </div>
    </div>
  );
}
