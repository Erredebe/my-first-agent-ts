const DOM = {
  form: document.getElementById("chat-form"),
  input: document.getElementById("message-input"),
  messages: document.getElementById("messages"),
  sendBtn: document.getElementById("send-btn"),
  statusText: document.getElementById("status-text"),
  modelSelect: document.getElementById("model-select"),
  refreshModelsBtn: document.getElementById("refresh-models"),
  modelStatus: document.getElementById("model-status")
};

const state = {
  sessionId: localStorage.getItem("agent-session") ?? null,
  isThinking: false,
  model: localStorage.getItem("agent-model") ?? null,
  models: [],
  defaultModel: null
};

DOM.form.addEventListener("submit", handleSubmit);
DOM.input.addEventListener("keydown", handleInputKeydown);
DOM.sendBtn.addEventListener("keydown", handleSendKeydown);
DOM.modelSelect?.addEventListener("change", handleModelChange);
DOM.refreshModelsBtn?.addEventListener("click", () => loadModels());

loadModels().catch(() => {
  setModelStatus("No se pudieron cargar los modelos", true);
});

async function loadModels() {
  if (!DOM.modelSelect) return;

  setModelStatus("Cargando modelos...");
  toggleModelControls(true);

  try {
    const response = await fetch(`${window.API_URL}/api/models`);
    if (!response.ok) {
      throw new Error("No se pudieron cargar los modelos");
    }

    const payload = await response.json();
    const ids = Array.isArray(payload.models)
      ? payload.models
          .map((m) => (typeof m === "string" ? m : m?.id))
          .filter(Boolean)
      : [];

    state.defaultModel =
      typeof payload.defaultModel === "string" ? payload.defaultModel : null;
    state.models = ids;

    renderModelOptions(ids);

    const candidate =
      state.model && ids.includes(state.model) ? state.model : null;
    const fallback =
      state.defaultModel && ids.includes(state.defaultModel)
        ? state.defaultModel
        : ids[0] ?? state.defaultModel ?? null;
    const pick = candidate || fallback;

    if (pick) {
      setActiveModel(pick, false);
    } else {
      setModelStatus("No se encontraron modelos", true);
    }
  } catch (error) {
    setModelStatus(
      error instanceof Error ? error.message : "Error al obtener modelos",
      true
    );
  } finally {
    toggleModelControls(false);
  }
}

function renderModelOptions(list) {
  if (!DOM.modelSelect) return;
  DOM.modelSelect.innerHTML = "";

  if (!list.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Sin modelos";
    DOM.modelSelect.appendChild(opt);
    DOM.modelSelect.disabled = true;
    return;
  }

  list.forEach((id) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = id;
    DOM.modelSelect.appendChild(opt);
  });

  DOM.modelSelect.disabled = false;
}

function setActiveModel(modelId, announceChange = false) {
  state.model = modelId;
  localStorage.setItem("agent-model", modelId);

  if (DOM.modelSelect && DOM.modelSelect.value !== modelId) {
    DOM.modelSelect.value = modelId;
  }

  setModelStatus(`Modelo activo: ${modelId}`);

  if (announceChange) {
    state.sessionId = null;
    localStorage.removeItem("agent-session");
    appendBubble(
      `Modelo cambiado a ${modelId}. Se reinicia el contexto.`,
      "assistant"
    );
  }
}

function handleModelChange(event) {
  const value = event.target.value;
  if (!value || value === state.model) return;
  setActiveModel(value, true);
}

function toggleModelControls(isLoading) {
  if (DOM.modelSelect) {
    DOM.modelSelect.disabled = isLoading || !state.models.length;
  }
  if (DOM.refreshModelsBtn) {
    DOM.refreshModelsBtn.disabled = isLoading;
  }
}

function setModelStatus(text, isError = false) {
  if (!DOM.modelStatus) return;
  DOM.modelStatus.textContent = text;
  DOM.modelStatus.classList.toggle("error", Boolean(isError));
}

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
  const response = await fetch(`${window.API_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      sessionId: state.sessionId,
      model: state.model
    })
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
/**
 * Renderiza contenido del asistente permitiendo:
 * - Markdown completo (usando marked)
 * - Bloques ```html``` -> HTML interpretado
 * - Bloques <think> -> <details> colapsables
 * - Enlaces de descarga directos
 */
function renderAssistantContent(container, text) {
  // 1. Extraer bloques ```html ... ``` para que no los toque marked
  const htmlBlocks = [];
  let processedText = text.replace(/```html\n([\s\S]*?)\n```/g, (match, inner) => {
    htmlBlocks.push(inner);
    return `__HTML_BLOCK_${htmlBlocks.length - 1}__`;
  });

  // 2. Extraer bloques <think> ... </think> para que no los toque marked (o procesarlos antes)
  //    Preferimos procesarlos antes para que el contenido dentro de think también pueda tener markdown si se quiere,
  //    pero por simplicidad y para evitar conflictos, los extraemos y luego los restauramos.
  const thinkBlocks = [];
  processedText = processedText.replace(/<think>([\s\S]*?)<\/think>/gi, (match, body) => {
    thinkBlocks.push(body);
    return `__THINK_BLOCK_${thinkBlocks.length - 1}__`;
  });

  // 3. Renderizar Markdown con marked
  let html = marked.parse(processedText);

  // 4. Restaurar bloques HTML (interpretados)
  html = html.replace(/__HTML_BLOCK_(\d+)__/g, (match, index) => {
    return htmlBlocks[index];
  });

  // 5. Restaurar bloques <think> (como details)
  //    Nota: El contenido dentro de think lo escapamos para evitar XSS si fuera user content,
  //    pero aquí viene del modelo. Aún así, es mejor renderizarlo como texto plano o markdown simple.
  //    Aquí lo renderizamos como markdown también para que se vea bonito.
  html = html.replace(/__THINK_BLOCK_(\d+)__/g, (match, index) => {
    const body = thinkBlocks[index];
    // Renderizamos el contenido del think también con marked, o lo dejamos raw.
    // Vamos a dejarlo procesado por marked para que listas, etc. se vean bien dentro del think.
    const bodyHtml = marked.parse(body);
    return `<details class="think-block"><summary class="think-summary">Mostrar pensamiento</summary><div class="think-body">${bodyHtml}</div></details>`;
  });

  // 6. Manejo especial para enlaces de descarga (si marked no los dejó como queremos o para asegurar target blank)
  //    Marked ya convierte [label](url) en <a href="url">label</a>.
  //    Solo necesitamos asegurar que los enlaces de descarga tengan el atributo download si apuntan a /api/download
  //    o forzar target="_blank" en todos los enlaces.
  
  // Usamos un contenedor temporal para manipular el DOM resultante
  const temp = document.createElement("div");
  temp.innerHTML = html;

  // Post-procesamiento de enlaces
  const links = temp.querySelectorAll("a");
  links.forEach(a => {
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    if (a.href.includes("/api/download/")) {
      a.download = ""; // Activar descarga
      if (a.textContent === a.href) {
         a.textContent = "Descargar archivo";
      }
    }
  });

  container.innerHTML = temp.innerHTML;
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
