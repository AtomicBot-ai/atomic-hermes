import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { LoadingPhrase } from "./LoadingPhrase";
import { ThinkingBlock } from "./ThinkingBlock";
import am from "./AssistantMessage.module.css";
import ct from "../ChatTranscript.module.css";

type AssistantMessageBubbleProps = {
  text: string;
  thinking?: string;
  actions?: string[];
  classNameRoot?: string;
  isStreaming?: boolean;
  showLoading?: boolean;
};

export function AssistantMessageBubble(props: AssistantMessageBubbleProps) {
  const hasText = !!props.text;
  const hasThinking = !!props.thinking;
  const hasActions = (props.actions?.length ?? 0) > 0;
  const isStreaming = props.isStreaming ?? false;
  const showLoading = props.showLoading ?? false;

  return (
    <div className={`${ct.UiChatRow} ${am["UiChatRow-assistant"]} ${props.classNameRoot ?? ""}`}>
      <div
        className={`${am["UiChatBubble-assistant"]} ${isStreaming ? am["UiChatBubble-stream"] : ""}`.trim()}
      >
        <ThinkingBlock
          thinking={props.thinking}
          actions={props.actions}
          isStreaming={isStreaming && !hasText}
          reserveSpace={!hasThinking && !hasActions}
        />
        {hasText ? (
          <div className="UiChatText UiMarkdown">
            <Markdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
              {props.text}
            </Markdown>
          </div>
        ) : showLoading && !hasThinking && !hasActions ? (
          <>
            <div className={am.UiChatStreamTextReserve} aria-hidden="true" />
            <div className="UiChatBubbleMeta">
              <LoadingPhrase />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function TypingIndicator(props: { classNameRoot?: string }) {
  return (
    <AssistantMessageBubble
      text=""
      classNameRoot={props.classNameRoot}
      isStreaming
      showLoading
    />
  );
}

export function AssistantStreamBubble(props: AssistantMessageBubbleProps) {
  return <AssistantMessageBubble {...props} isStreaming showLoading />;
}
