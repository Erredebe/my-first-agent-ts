const DOM = {
  form: document.getElementById("chat-form"),
  input: document.getElementById("message-input"),
  messages: document.getElementById("messages"),
  sendBtn: document.getElementById("send-btn"),
  statusText: document.getElementById("status-text")
};

const state = {
  sessionId: localStorage.getItem("agent-session") ?? null,
  isThinking: false
};

DOM.form.addEventListener("submit", handleSubmit);
DOM.input.addEventListener("keydown", handleInputKeydown);
DOM.sendBtn.addEventListener("keydown", handleSendKeydown);

async function handleSubmit(event) {
  event.preventDefault();
  if (state.isThinking) return; // bloquear envíos mientras el modelo procesa

  const text = DOM.input.value.trim();
  if (!text) return;

  appendBubble(text, "user");
  DOM.input.value = "";
  setThinking(true);

  try {
    const reply = await sendMessage(text);
    appendBubble(reply ?? "(sin respuesta)", "assistant");
  } catch (error) {
    appendBubble(`Error: ${error.message}`, "assistant");
  } finally {
    setThinking(false);
    focusInputEnd();
  }
}

function handleInputKeydown(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    if (state.isThinking) {
      event.preventDefault();
      return; // bloquear Enter mientras está pensando
    }
    event.preventDefault();
    submitForm();
  }
}

function handleSendKeydown(event) {
  if (event.key === "Enter") {
    event.preventDefault();
    if (state.isThinking) {
      focusInputEnd();
      return; // bloquear si está pensando
    }
    submitForm();
    focusInputEnd();
  }
}

function submitForm() {
  if (typeof DOM.form.requestSubmit === "function") {
    DOM.form.requestSubmit();
  } else {
    DOM.form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  }
}

async function sendMessage(message) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, sessionId: state.sessionId })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Error de red");
  }

  const data = await response.json();
  state.sessionId = data.sessionId ?? state.sessionId;
  if (state.sessionId) {
    localStorage.setItem("agent-session", state.sessionId);
  }
  return data.reply;
}

function appendBubble(text, role) {
  const bubble = document.createElement("div");
  bubble.className = `bubble ${role}`;

  if (role === "assistant") {
    renderAssistantContent(bubble, text);
  } else {
    bubble.textContent = text;
  }

  const thinking = document.getElementById("thinking-bubble");
  if (role === "assistant" && thinking) {
    DOM.messages.replaceChild(bubble, thinking);
  } else {
    DOM.messages.appendChild(bubble);
  }

  scrollMessagesToEnd();
}

function setThinking(value) {
  state.isThinking = Boolean(value);
  DOM.sendBtn.disabled = state.isThinking;
  DOM.statusText.textContent = state.isThinking ? "Pensando..." : "Listo";

  if (state.isThinking) {
    showThinkingBubble();
  } else {
    removeThinkingBubble();
  }
}

function showThinkingBubble() {
  if (document.getElementById("thinking-bubble")) return;
  const div = document.createElement("div");
  div.id = "thinking-bubble";
  div.className = "bubble assistant thinking";
  div.innerHTML =
    '<span class="thinking-dots">Pensando<span class="dots">&nbsp;&middot;&nbsp;&middot;&nbsp;&middot;</span></span>';
  DOM.messages.appendChild(div);
  scrollMessagesToEnd();
}

function removeThinkingBubble() {
  const bubble = document.getElementById("thinking-bubble");
  if (bubble) bubble.remove();
}

/**
 * Renderiza contenido del asistente permitiendo:
 * - Enlaces Markdown -> <a>
 * - Bloques ```html``` -> HTML interpretado
 * - Bloques <think> -> <details> colapsables
 * - Enlaces de descarga directos
 */
function renderAssistantContent(container, text) {
  const codeHtmlBlock = /```(?:html)?\n([\s\S]*?)\n```/g;
  let html = text.replace(codeHtmlBlock, (_m, inner) => inner);

  const mdLink =
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/api\/download\/[^\s)]+)\)/g;
  const downloadPath =
    /(https?:\/\/[^\s]+\/api\/download\/[a-zA-Z0-9-]+|\/api\/download\/[a-zA-Z0-9-]+)/g;

  html = html
    .replace(
      mdLink,
      (_m, label, url) =>
        `<a href="${url}" target="_blank" rel="noopener noreferrer" download>${label}</a>`
    )
    .replace(
      downloadPath,
      (url) =>
        `<a href="${url}" target="_blank" rel="noopener noreferrer" download>Descargar archivo</a>`
    );

  // Convertimos bloques <think> en <details> colapsables
  const thinkRegex = /<think>([\s\S]*?)<\/think>/gi;
  html = html.replace(thinkRegex, (_m, body) => {
    const safe = escapeHtml(body.trim());
    return `<details class="think-block"><summary class="think-summary">Mostrar contenido</summary><div class="think-body">${safe}</div></details>`;
  });

  // Si hay un único enlace de descarga, lo renderizamos limpio
  const downloadUrlMatch = html.match(
    /(https?:\/\/[\w:\-./]+\/api\/download\/[a-zA-Z0-9-]+|\/api\/download\/[a-zA-Z0-9-]+)/
  );
  const downloadAttrMatch = html.match(/download="([^"]+)"/);
  if (downloadUrlMatch) {
    const url = downloadUrlMatch[0];
    const filename = downloadAttrMatch ? downloadAttrMatch[1] : "Descargar archivo";
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.download = filename;
    a.textContent = filename;
    container.innerHTML = "";
    container.appendChild(a);
    return;
  }

  // Por defecto renderizamos el HTML ya transformado
  const temp = document.createElement("div");
  temp.innerHTML = html;
  container.innerHTML = temp.innerHTML.trim();
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function focusInputEnd() {
  DOM.input.focus();
  try {
    DOM.input.selectionStart = DOM.input.selectionEnd = DOM.input.value.length;
  } catch {
    // Algunos navegadores antiguos no soportan selectionStart/End en textarea.
  }
}

function scrollMessagesToEnd() {
  DOM.messages.scrollTop = DOM.messages.scrollHeight;
}
