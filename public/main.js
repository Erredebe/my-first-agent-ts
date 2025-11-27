const form = document.getElementById("chat-form");
const input = document.getElementById("message-input");
const messages = document.getElementById("messages");
const sendBtn = document.getElementById("send-btn");
const statusText = document.getElementById("status-text");

let sessionId = localStorage.getItem("agent-session") || null;

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
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

function setLoading(isLoading) {
  sendBtn.disabled = isLoading;
  statusText.textContent = isLoading ? "Pensando..." : "Listo";
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

  // Parse the HTML and keep only download links that point to /api/download/
  const temp = document.createElement("div");
  temp.innerHTML = html;

  // Remove anchors that do NOT point to /api/download/
  Array.from(temp.querySelectorAll("a")).forEach((a) => {
    const href = a.getAttribute("href") || "";
    if (!/\/api\/download\//.test(href)) {
      a.remove();
    }
  });

  // Remove stray text nodes that contain local file paths or broken HTML fragments
  const walker = document.createTreeWalker(
    temp,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );
  const toRemove = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const v = node.nodeValue || "";
    if (
      /[A-Za-z]:\\/.test(v) ||
      /download=\"/.test(v) ||
      /Descargar archivo\"/.test(v)
    ) {
      toRemove.push(node);
    }
  }
  toRemove.forEach((n) => {
    const p = n.parentNode;
    n.remove();
    if (p && p.childNodes.length === 0) p.remove();
  });

  container.innerHTML = temp.innerHTML.trim();
}

// Allow pressing Enter to send the message (Shift+Enter for newline)
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
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
    if (typeof form.requestSubmit === "function") form.requestSubmit();
    else
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
    input.focus();
  }
});
