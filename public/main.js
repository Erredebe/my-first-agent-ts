const form = document.getElementById("chat-form");
const input = document.getElementById("message-input");
const messages = document.getElementById("messages");
const sendBtn = document.getElementById("send-btn");
const statusText = document.getElementById("status-text");

let sessionId = localStorage.getItem("agent-session") || null;

// Estado que indica si el agente está procesando una respuesta
let isThinking = false;

// Extract sending logic to reuse from keyboard handlers
async function sendFormMessage(rawText) {
  const text = rawText.trim();
  if (!text) return;

  appendBubble(text, "user");
  input.value = "";
  setLoading(true);

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, sessionId }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Error de red");
    }

    const data = await res.json();
    sessionId = data.sessionId;
    if (sessionId) {
      localStorage.setItem("agent-session", sessionId);
    }

    appendBubble(data.reply ?? "(sin respuesta)", "assistant");
  } catch (err) {
    appendBubble(`Error: ${err.message}`, "assistant");
  } finally {
    setLoading(false);
    // After sending, keep the focus on the input and place cursor at the end
    input.focus();
    try {
      input.selectionStart = input.selectionEnd = input.value.length;
    } catch (e) {
      /* ignore on older browsers */
    }
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (isThinking) return; // bloquear envíos mientras piensa
  await sendFormMessage(input.value);
});

function appendBubble(text, role) {
  const div = document.createElement("div");
  div.className = `bubble ${role}`;
  if (role === "assistant") {
    renderAssistantContent(div, text);
  } else {
    div.textContent = text;
  }
  // If there's a thinking bubble visible, replace it with the assistant response
  const thinking = document.getElementById("thinking-bubble");
  if (role === "assistant" && thinking) {
    messages.replaceChild(div, thinking);
  } else {
    messages.appendChild(div);
  }
  messages.scrollTop = messages.scrollHeight;
}

function setLoading(isLoading) {
  sendBtn.disabled = isLoading;
  statusText.textContent = isLoading ? "Pensando..." : "Listo";
  isThinking = !!isLoading;
  if (isLoading) {
    // show a temporary assistant bubble indicating thinking
    if (!document.getElementById("thinking-bubble")) {
      const thinkingDiv = document.createElement("div");
      thinkingDiv.id = "thinking-bubble";
      thinkingDiv.className = "bubble assistant thinking";
      thinkingDiv.innerHTML = `<span class="thinking-dots">Pensando<span class="dots">&nbsp;&middot;&nbsp;&middot;&nbsp;&middot;</span></span>`;
      messages.appendChild(thinkingDiv);
      messages.scrollTop = messages.scrollHeight;
    }
  } else {
    const existing = document.getElementById("thinking-bubble");
    if (existing) existing.remove();
  }
}

function renderAssistantContent(container, text) {
  // Si el modelo devuelve un bloque de código HTML (```html ... ```),
  // desempaquetamos ese bloque para que el HTML dentro sea interpretado
  // y los enlaces funcionen correctamente en la UI.
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

  // Resaltar bloques <think> transformándolos en un bloque colapsable <details>
  const thinkRegex = /<think>([\s\S]*?)<\/think>/gi;
  html = html.replace(thinkRegex, (_m, body) => {
    const safe = escapeHtml(body.trim());
    return `<details class="think-block"><summary class="think-summary">Mostrar contenido</summary><div class="think-body">${safe}</div></details>`;
  });

  // If we can find a download URL (either absolute or relative), build a clean anchor
  const downloadUrlMatch = html.match(
    /(https?:\/\/[\w:\-\.\/]+\/api\/download\/[a-zA-Z0-9-]+|\/api\/download\/[a-zA-Z0-9-]+)/
  );
  const downloadAttrMatch = html.match(/download=\"([^\"]+)\"/);
  if (downloadUrlMatch) {
    const url = downloadUrlMatch[0];
    const filename = downloadAttrMatch
      ? downloadAttrMatch[1]
      : "Descargar archivo";
    // Build a minimal, safe anchor so the browser can trigger the download
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.download = filename;
    a.textContent = filename;
    // Clear container and append the anchor
    container.innerHTML = "";
    container.appendChild(a);
    return;
  }

  // Fallback: render any markdown/downloadPath conversions we made earlier
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

// Allow pressing Enter to send the message (Shift+Enter for newline)
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    if (isThinking) {
      e.preventDefault();
      return; // bloquear Enter mientras está pensando
    }
    e.preventDefault();
    // Submit the form programmatically; this will trigger our submit handler
    if (typeof form.requestSubmit === "function") {
      form.requestSubmit();
    } else {
      // Fallback for older browsers
      const evt = new Event("submit", { bubbles: true, cancelable: true });
      form.dispatchEvent(evt);
    }
  }
});

// If Enter is pressed while the send button has focus, submit and return focus to input
sendBtn.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    if (isThinking) {
      input.focus();
      return; // bloquear si está pensando
    }
    if (typeof form.requestSubmit === "function") form.requestSubmit();
    else
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
    input.focus();
  }
});
