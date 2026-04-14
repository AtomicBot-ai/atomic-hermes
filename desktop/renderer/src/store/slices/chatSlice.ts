import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { parseThinkingContent } from "../../lib/parse-thinking";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  thinking?: string;
  actions?: string[];
};

export type PendingApproval = {
  command: string;
  description: string;
  sessionId: string;
};

type ChatState = {
  messages: ChatMessage[];
  activeSessionKey: string | null;
  loading: boolean;
  sending: boolean;
  streaming: boolean;
  streamingText: string;
  streamingThinking: string;
  streamingActions: string[];
  streamingRaw: string;
  streamingMessageId: string | null;
  pendingApproval: PendingApproval | null;
};

const initialState: ChatState = {
  messages: [],
  activeSessionKey: null,
  loading: false,
  sending: false,
  streaming: false,
  streamingText: "",
  streamingThinking: "",
  streamingActions: [],
  streamingRaw: "",
  streamingMessageId: null,
  pendingApproval: null,
};

let msgCounter = 0;
export function nextMsgId(): string {
  return `msg-${++msgCounter}-${Date.now()}`;
}

const chatSlice = createSlice({
  name: "chat",
  initialState,
  reducers: {
    sessionChanged(state, action: PayloadAction<string | null>) {
      state.activeSessionKey = action.payload;
      state.messages = [];
      state.streaming = false;
      state.streamingText = "";
      state.streamingThinking = "";
      state.streamingActions = [];
      state.streamingRaw = "";
      state.streamingMessageId = null;
      state.sending = false;
      state.pendingApproval = null;
    },
    messagesLoaded(state, action: PayloadAction<ChatMessage[]>) {
      state.messages = action.payload;
      state.loading = false;
    },
    appendMessage(state, action: PayloadAction<ChatMessage>) {
      state.messages.push(action.payload);
    },
    setLoading(state, action: PayloadAction<boolean>) {
      state.loading = action.payload;
    },
    setSending(state, action: PayloadAction<boolean>) {
      state.sending = action.payload;
    },
    streamStarted(state) {
      state.streaming = true;
      state.streamingText = "";
      state.streamingThinking = "";
      state.streamingActions = [];
      state.streamingRaw = "";
      state.streamingMessageId = nextMsgId();
    },
    streamDelta(state, action: PayloadAction<string>) {
      state.streamingRaw += action.payload;
      const parsed = parseThinkingContent(state.streamingRaw);
      state.streamingText = parsed.content;
      if (parsed.thinking && !state.streamingThinking) {
        state.streamingThinking = parsed.thinking;
      }
      state.sending = false;
    },
    streamReasoningDelta(state, action: PayloadAction<string>) {
      state.streamingThinking += action.payload;
      state.sending = false;
    },
    streamToolProgress(state, action: PayloadAction<string>) {
      state.streamingActions.push(action.payload);
      state.sending = false;
    },
    streamFinished(state) {
      if (state.streamingRaw || state.streamingThinking || state.streamingActions.length > 0) {
        const parsed = parseThinkingContent(state.streamingRaw);
        state.messages.push({
          id: state.streamingMessageId ?? nextMsgId(),
          role: "assistant",
          content: parsed.content,
          thinking: state.streamingThinking || parsed.thinking || undefined,
          actions: state.streamingActions.length > 0 ? state.streamingActions : undefined,
        });
      }
      state.streaming = false;
      state.streamingText = "";
      state.streamingThinking = "";
      state.streamingActions = [];
      state.streamingRaw = "";
      state.streamingMessageId = null;
      state.sending = false;
    },
    streamAborted(state) {
      if (state.streamingRaw || state.streamingThinking || state.streamingActions.length > 0) {
        const parsed = parseThinkingContent(state.streamingRaw);
        state.messages.push({
          id: state.streamingMessageId ?? nextMsgId(),
          role: "assistant",
          content: parsed.content,
          thinking: state.streamingThinking || parsed.thinking || undefined,
          actions: state.streamingActions.length > 0 ? state.streamingActions : undefined,
        });
      }
      state.streaming = false;
      state.streamingText = "";
      state.streamingThinking = "";
      state.streamingActions = [];
      state.streamingRaw = "";
      state.streamingMessageId = null;
      state.sending = false;
    },
    clearChat(state) {
      state.messages = [];
      state.activeSessionKey = null;
      state.streaming = false;
      state.streamingText = "";
      state.streamingThinking = "";
      state.streamingActions = [];
      state.streamingRaw = "";
      state.streamingMessageId = null;
      state.sending = false;
      state.pendingApproval = null;
    },
    approvalRequested(state, action: PayloadAction<PendingApproval>) {
      state.pendingApproval = action.payload;
    },
    approvalResolved(state) {
      state.pendingApproval = null;
    },
  },
});

export const {
  sessionChanged,
  messagesLoaded,
  appendMessage,
  setLoading,
  setSending,
  streamStarted,
  streamDelta,
  streamReasoningDelta,
  streamToolProgress,
  streamFinished,
  streamAborted,
  clearChat,
  approvalRequested,
  approvalResolved,
} = chatSlice.actions;

export const chatReducer = chatSlice.reducer;
