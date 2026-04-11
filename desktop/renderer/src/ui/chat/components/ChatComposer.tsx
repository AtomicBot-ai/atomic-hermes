import React from "react";
import { SendIcon } from "@shared/kit";
import s from "./ChatComposer.module.css";

export type ChatComposerRef = { focusInput: () => void };

export type ChatComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  streaming?: boolean;
  onStop?: () => void;
  placeholder?: string;
};

export const ChatComposer = React.forwardRef<ChatComposerRef, ChatComposerProps>(
  function ChatComposer(
    {
      value,
      onChange,
      onSend,
      disabled = false,
      streaming = false,
      onStop,
      placeholder = "Assign me a task or ask anything...",
    },
    ref,
  ) {
    const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);

    const focusInput = React.useCallback(() => {
      textareaRef.current?.focus();
    }, []);

    React.useImperativeHandle(ref, () => ({
      focusInput,
    }), [focusInput]);

    React.useEffect(() => {
      focusInput();
    }, [focusInput]);

    React.useEffect(() => {
      const handler = () => focusInput();
      document.addEventListener("refocus-chat-input", handler);
      return () => document.removeEventListener("refocus-chat-input", handler);
    }, [focusInput]);

    const MIN_INPUT_HEIGHT = 28;
    const MAX_INPUT_HEIGHT = 180;

    const adjustTextareaHeight = React.useCallback(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = "0";
      const next = Math.min(Math.max(el.scrollHeight, MIN_INPUT_HEIGHT), MAX_INPUT_HEIGHT);
      el.style.height = `${next}px`;
    }, []);

    React.useLayoutEffect(() => {
      adjustTextareaHeight();
    }, [value, adjustTextareaHeight]);

    const canSend = value.trim().length > 0;

    const handlePaste = React.useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const pastedText = e.clipboardData.getData("text/plain");
      if (!pastedText) return;

      e.preventDefault();

      const normalizedText = pastedText.replace(/\r\n?/g, "\n").replace(/\n+$/u, "");
      const target = e.currentTarget;
      const selectionStart = target.selectionStart ?? value.length;
      const selectionEnd = target.selectionEnd ?? value.length;
      const nextValue =
        value.slice(0, selectionStart) + normalizedText + value.slice(selectionEnd);

      onChange(nextValue);

      const nextCaretPosition = selectionStart + normalizedText.length;
      requestAnimationFrame(() => {
        target.setSelectionRange(nextCaretPosition, nextCaretPosition);
        adjustTextareaHeight();
      });
    }, [adjustTextareaHeight, onChange, value]);

    return (
      <div className={s.UiChatComposer}>
        <div className={s.UiChatComposerInner}>
          <textarea
            ref={textareaRef}
            className={s.UiChatInput}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            rows={1}
            onPaste={handlePaste}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
          />

          <div className={s.UiChatComposerButtonBlock}>
            <div />
            <div className={s.UiChatComposerButtonGroup}>
              {streaming && onStop ? (
                <button
                  type="button"
                  className={`${s.UiChatSendButton} ${s.UiChatStopButton}`}
                  onClick={onStop}
                  aria-label="Stop"
                  title="Stop"
                >
                  <div className={s.UiChatStopButtonInner} />
                </button>
              ) : (
                <button
                  type="button"
                  className={s.UiChatSendButton}
                  onClick={onSend}
                  disabled={disabled || !canSend}
                  aria-label={disabled ? "Sending..." : "Send"}
                  title={disabled ? "Sending..." : "Send"}
                >
                  <SendIcon />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  },
);
