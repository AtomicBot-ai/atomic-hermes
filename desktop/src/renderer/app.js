// @ts-check
"use strict";

/** @type {number|null} */
let backendPort = null;
/** @type {WebSocket|null} */
let ws = null;
/** @type {string} */
let sessionId = "default-" + Date.now().toString(36);
/** @type {string} */
let currentModel = "";
/** @type {boolean} */
let isStreaming = false;

// DOM refs
const screens = {
  loading: document.getElementById("loading-screen"),
  settings: document.getElementById("settings-screen"),
  chat: document.getElementById("chat-screen"),
};
const loadingError = document.getElementById("loading-error");
const settingsError = document.getElementById("settings-error");
const messagesEl = document.getElementById("messages");
const messageInput = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");
const chatStatus = document.getElementById("chat-status");
const providerSelect = document.getElementById("provider-select");
const modelInput = document.getElementById("model-input");

// ===== Screen management =====
function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.remove("active"));
  screens[name].classList.add("active");
}

// ===== Provider key group toggling =====
const keyGroups = {
  openrouter: document.getElementById("openrouter-key-group"),
  anthropic: document.getElementById("anthropic-key-group"),
  openai: document.getElementById("openai-key-group"),
  nous: document.getElementById("nous-key-group"),
};

providerSelect.addEventListener("change", () => {
  Object.values(keyGroups).forEach((g) => g.classList.add("hidden"));
  const selected = providerSelect.value;
  if (keyGroups[selected]) keyGroups[selected].classList.remove("hidden");
});

// ===== Settings save =====
document.getElementById("save-settings-btn").addEventListener("click", async () => {
  const provider = providerSelect.value;
  const env = {};
  const config = {};

  const keyInputs = {
    openrouter: { el: document.getElementById("openrouter-key"), envKey: "OPENROUTER_API_KEY" },
    anthropic: { el: document.getElementById("anthropic-key"), envKey: "ANTHROPIC_API_KEY" },
    openai: { el: document.getElementById("openai-key"), envKey: "OPENAI_API_KEY" },
    nous: { el: document.getElementById("nous-key"), envKey: "NOUS_API_KEY" },
  };

  const entry = keyInputs[provider];
  if (entry && entry.el.value.trim()) {
    env[entry.envKey] = entry.el.value.trim();
  }

  const model = modelInput.value.trim();
  if (model) {
    config.model = model;
    currentModel = model;
  }

  if (Object.keys(env).length === 0) {
    settingsError.textContent = "Please enter an API key";
    settingsError.style.display = "block";
    return;
  }

  try {
    const resp = await fetch(`http://127.0.0.1:${backendPort}/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config, env }),
    });
    const data = await resp.json();
    if (data.status === "error") throw new Error(data.error);

    showScreen("chat");
    connectWebSocket();
  } catch (e) {
    settingsError.textContent = `Error: ${e.message}`;
    settingsError.style.display = "block";
  }
});

// ===== Initialization =====
async function init() {
  if (window.hermesAPI) {
    window.hermesAPI.onPythonError((error) => {
      loadingError.textContent = error;
      loadingError.style.display = "block";
    });

    window.hermesAPI.onPythonReady(async () => {
      backendPort = await window.hermesAPI.getPort();
      await onBackendReady();
    });
  } else {
    // Dev fallback: try to connect directly
    backendPort = 8765;
    setTimeout(() => pollHealth(), 500);
  }
}

async function pollHealth() {
  for (let i = 0; i < 60; i++) {
    try {
      const resp = await fetch(`http://127.0.0.1:${backendPort}/health`);
      if (resp.ok) {
        await onBackendReady();
        return;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  loadingError.textContent = "Could not connect to backend";
  loadingError.style.display = "block";
}

async function onBackendReady() {
  try {
    const resp = await fetch(`http://127.0.0.1:${backendPort}/config`);
    const data = await resp.json();

    if (data.has_api_keys) {
      if (data.config && data.config.model) currentModel = data.config.model;
      showScreen("chat");
      connectWebSocket();
    } else {
      showScreen("settings");
    }
  } catch {
    showScreen("settings");
  }
}

// ===== WebSocket =====
function connectWebSocket() {
  if (ws && ws.readyState <= 1) return;

  ws = new WebSocket(`ws://127.0.0.1:${backendPort}/chat`);

  ws.onopen = () => {
    chatStatus.textContent = "ready";
    chatStatus.className = "chat-status connected";
  };

  ws.onclose = () => {
    chatStatus.textContent = "disconnected";
    chatStatus.className = "chat-status";
    setTimeout(connectWebSocket, 2000);
  };

  ws.onerror = () => {
    chatStatus.textContent = "error";
    chatStatus.className = "chat-status";
  };

  ws.onmessage = (evt) => {
    try {
      const event = JSON.parse(evt.data);
      handleEvent(event);
    } catch {}
  };
}

// ===== Event handling =====

/** @type {HTMLElement|null} */
let currentAssistantBubble = null;
let currentAssistantText = "";

function handleEvent(event) {
  switch (event.type) {
    case "stream_delta":
      if (!currentAssistantBubble) {
        currentAssistantBubble = appendAssistantMessage("");
        currentAssistantText = "";
      }
      currentAssistantText += event.text;
      renderMarkdown(currentAssistantBubble, currentAssistantText, true);
      scrollToBottom();
      break;

    case "thinking":
      appendThinkingBlock(event.text);
      scrollToBottom();
      break;

    case "tool_start":
      appendToolBlock(event.id, event.name, event.args, event.preview);
      scrollToBottom();
      break;

    case "tool_complete":
      completeToolBlock(event.id, event.name, event.result);
      break;

    case "step":
      // Step count update — could show in status
      break;

    case "final_response":
      if (currentAssistantBubble && !currentAssistantText && event.text) {
        currentAssistantText = event.text;
        renderMarkdown(currentAssistantBubble, currentAssistantText, false);
      } else if (!currentAssistantBubble && event.text) {
        currentAssistantBubble = appendAssistantMessage("");
        currentAssistantText = event.text;
        renderMarkdown(currentAssistantBubble, currentAssistantText, false);
      } else if (currentAssistantBubble) {
        renderMarkdown(currentAssistantBubble, currentAssistantText, false);
      }
      currentAssistantBubble = null;
      currentAssistantText = "";
      isStreaming = false;
      sendBtn.disabled = false;
      messageInput.disabled = false;
      messageInput.focus();
      scrollToBottom();
      break;

    case "error":
      appendSystemMessage(`Error: ${event.text}`);
      isStreaming = false;
      sendBtn.disabled = false;
      messageInput.disabled = false;
      break;
  }
}

// ===== Message rendering =====
function appendUserMessage(text) {
  const msg = document.createElement("div");
  msg.className = "message message-user";
  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  bubble.textContent = text;
  msg.appendChild(bubble);
  messagesEl.appendChild(msg);
  scrollToBottom();
}

function appendAssistantMessage(html) {
  const msg = document.createElement("div");
  msg.className = "message message-assistant";
  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  bubble.innerHTML = html;
  msg.appendChild(bubble);
  messagesEl.appendChild(msg);
  return bubble;
}

function appendSystemMessage(text) {
  const msg = document.createElement("div");
  msg.className = "message message-assistant";
  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  bubble.style.color = "var(--error)";
  bubble.textContent = text;
  msg.appendChild(bubble);
  messagesEl.appendChild(msg);
  scrollToBottom();
}

function appendThinkingBlock(text) {
  const lastMsg = messagesEl.querySelector(".message-assistant:last-child");
  if (!lastMsg) return;

  const existing = lastMsg.querySelector(".thinking-block:last-of-type");
  if (existing) {
    const content = existing.querySelector(".thinking-content");
    if (content) content.textContent += text;
    return;
  }

  const block = document.createElement("div");
  block.className = "thinking-block";
  block.innerHTML = `<div class="thinking-label">Thinking</div><div class="thinking-content">${escapeHtml(text)}</div>`;
  block.addEventListener("click", () => block.classList.toggle("expanded"));
  lastMsg.appendChild(block);
}

function appendToolBlock(id, name, args, preview) {
  const lastMsg = messagesEl.querySelector(".message-assistant:last-child");
  const container = lastMsg || messagesEl;

  if (!currentAssistantBubble) {
    currentAssistantBubble = appendAssistantMessage("");
    currentAssistantText = "";
  }
  const msgContainer = currentAssistantBubble.parentElement;

  const block = document.createElement("div");
  block.className = "tool-block";
  block.dataset.toolId = id;

  const argsStr = typeof args === "object" ? JSON.stringify(args, null, 2) : String(args || "");

  block.innerHTML = `
    <div class="tool-header">
      <span class="tool-name">${escapeHtml(name)}</span>
      <span class="tool-status running">running...</span>
    </div>
    <div class="tool-body"><strong>Args:</strong>\n${escapeHtml(argsStr)}</div>
  `;

  block.querySelector(".tool-header").addEventListener("click", () => {
    block.classList.toggle("expanded");
  });

  msgContainer.appendChild(block);
}

function completeToolBlock(id, name, result) {
  const block = messagesEl.querySelector(`.tool-block[data-tool-id="${id}"]`);
  if (!block) return;

  const status = block.querySelector(".tool-status");
  if (status) {
    status.textContent = "done";
    status.className = "tool-status done";
  }

  const body = block.querySelector(".tool-body");
  if (body && result) {
    const truncated = result.length > 500 ? result.slice(0, 500) + "..." : result;
    body.innerHTML += `\n\n<strong>Result:</strong>\n${escapeHtml(truncated)}`;
  }
}

// ===== Markdown rendering (lightweight) =====
function renderMarkdown(el, text, streaming) {
  let html = escapeHtml(text);

  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code>${code}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Italic
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Headers
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // Lists
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html.replace(/^(\d+)\. (.+)$/gm, "<li>$2</li>");

  // Line breaks to paragraphs
  html = html.replace(/\n\n/g, "</p><p>");
  html = "<p>" + html + "</p>";
  html = html.replace(/<p><\/p>/g, "");

  if (streaming) {
    html += '<span class="streaming-cursor"></span>';
  }

  el.innerHTML = html;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
}

// ===== Send message =====
function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || isStreaming || !ws || ws.readyState !== 1) return;

  // Remove welcome message
  const welcome = messagesEl.querySelector(".welcome-message");
  if (welcome) welcome.remove();

  appendUserMessage(text);
  messageInput.value = "";
  autoResizeInput();

  isStreaming = true;
  sendBtn.disabled = true;

  currentAssistantBubble = null;
  currentAssistantText = "";

  ws.send(JSON.stringify({
    message: text,
    session_id: sessionId,
    model: currentModel,
  }));
}

sendBtn.addEventListener("click", sendMessage);

messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Auto-resize textarea
function autoResizeInput() {
  messageInput.style.height = "auto";
  messageInput.style.height = Math.min(messageInput.scrollHeight, 200) + "px";
}
messageInput.addEventListener("input", autoResizeInput);

// New chat
document.getElementById("new-chat-btn").addEventListener("click", () => {
  sessionId = "session-" + Date.now().toString(36);
  messagesEl.innerHTML = `
    <div class="welcome-message">
      <div class="welcome-icon"><img src="../assets/icon-sm.png" alt="" width="48" height="48"></div>
      <h2>Welcome to Atomic Hermes</h2>
      <p>Ask me anything. I can search the web, write code, manage files, run commands, and more.</p>
    </div>
  `;
  currentAssistantBubble = null;
  currentAssistantText = "";
});

// Open settings
document.getElementById("settings-btn").addEventListener("click", () => {
  showScreen("settings");
});

// Start
init();
