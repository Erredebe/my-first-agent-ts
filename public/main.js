const form = document.getElementById("chat-form");
const input = document.getElementById("message-input");
const messages = document.getElementById("messages");
const sendBtn = document.getElementById("send-btn");
const statusText = document.getElementById("status-text");

let sessionId = localStorage.getItem("agent-session") || null;

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  appendBubble(text, "user");
  input.value = "";
  setLoading(true);

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, sessionId })
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
    appendBubble(`Error: ${(err).message}`, "assistant");
  } finally {
    setLoading(false);
  }
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
  const mdLink = /\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/api\/download\/[^\s)]+)\)/g;
  const downloadPath = /(https?:\/\/[^\s]+\/api\/download\/[a-zA-Z0-9-]+|\/api\/download\/[a-zA-Z0-9-]+)/g;
  let html = text
    .replace(mdLink, (_m, label, url) => `<a href="${url}" target="_blank" rel="noopener noreferrer" download>${label}</a>`)
    .replace(downloadPath, (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer" download>Descargar archivo</a>`);

  container.innerHTML = html;
}
