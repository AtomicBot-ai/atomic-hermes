import React from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import ub from "./UserMessageBubble.module.css";
import ct from "../ChatTranscript.module.css";

export const UserMessageBubble = React.forwardRef<HTMLDivElement, { text: string }>(function UserMessageBubble(
  props,
  ref,
) {
  return (
    <div ref={ref} className={`${ct.UiChatRow} ${ub["UiChatRow-user"]}`}>
      <div className={ub["UiChatBubble-user"]}>
        <div className="UiChatText UiMarkdown">
          <Markdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
            {props.text}
          </Markdown>
        </div>
      </div>
    </div>
  );
});
