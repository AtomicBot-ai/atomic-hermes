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
  const latestUserRef = React.useRef<HTMLDivElement | null>(null);

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

  const latestUserMessageId = React.useMemo(() => {
    for (let index = renderedMessages.length - 1; index >= 0; index -= 1) {
      const message = renderedMessages[index];
      if (message?.role === "user") {
        return message.id;
      }
    }
    return null;
  }, [renderedMessages]);

  React.useEffect(() => {
    if ((!streamingMessageId && anchorVersion === 0) || !latestUserRef.current || !scrollRef.current) return;

    let timeoutId: number | null = null;
    let frameId = 0;

    const alignLatestUser = (behavior: ScrollBehavior) => {
      const container = scrollRef.current;
      const target = latestUserRef.current;
      if (!container || !target) return;

      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const desiredTop = -40;
      const nextScrollTop = container.scrollTop + (targetRect.top - containerRect.top) - desiredTop;

      container.scrollTo({
        top: Math.max(0, nextScrollTop),
        behavior,
      });
    };

    frameId = requestAnimationFrame(() => {
      alignLatestUser("smooth");
      timeoutId = window.setTimeout(() => {
        alignLatestUser("auto");
      }, 140);
    });

    return () => {
      cancelAnimationFrame(frameId);
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [
    anchorVersion,
    isStreaming,
    latestUserMessageId,
    scrollRef,
    streamingMessageId,
    streamingText,
    waitingForFirstChunk,
  ]);

  return (
    <div className={`${ct.UiChatTranscript} scrollable`} ref={scrollRef}>
      <div className={ct.UiChatTranscriptInner}>
        {renderedMessages.map((msg, idx) => {
          if (msg.role === "user") {
            return (
              <UserMessageBubble
                key={msg.id}
                ref={msg.id === latestUserMessageId ? latestUserRef : undefined}
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
