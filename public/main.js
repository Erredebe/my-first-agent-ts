const DOM = {
  form: document.getElementById("chat-form"),
  input: document.getElementById("message-input"),
  messages: document.getElementById("messages"),
  sendBtn: document.getElementById("send-btn"),
  statusText: document.getElementById("status-text"),
  statusIndicator: document.querySelector(".status"),
  modelSelect: document.getElementById("model-select"),
  refreshModelsBtn: document.getElementById("refresh-models"),
  modelStatus: document.getElementById("model-status"),
  systemPromptInput: document.getElementById("system-prompt"),
  saveSystemPromptBtn: document.getElementById("save-system-prompt"),
  promptStatus: document.getElementById("prompt-status"),
  toolbar: document.querySelector(".toolbar"),
  toolbarToggle: document.getElementById("toolbar-toggle"),
  uploadForm: document.getElementById("upload-form"),
  fileInput: document.getElementById("file-input"),
  uploadBtn: document.getElementById("upload-btn"),
  fileLabel: document.getElementById("file-label"),
  uploadStatus: document.getElementById("upload-status"),
  attachmentList: document.getElementById("attachment-list"),
  uploadCard: document.querySelector(".upload-card"),
  uploadToggle: document.getElementById("upload-toggle"),
  inputMeta: document.getElementById("input-meta"),
  modelLine: document.getElementById("model-line"),
};

const state = {
  sessionId: localStorage.getItem("agent-session") ?? null,
  isThinking: false,
  model: localStorage.getItem("agent-model") ?? null,
  models: [],
  defaultModel: null,
  systemPrompt: "",
  isConnected: false,
  toolbarCollapsed: localStorage.getItem("toolbar-collapsed") === "true",
  uploadCollapsed: localStorage.getItem("upload-collapsed") === "true",
  attachments: [],
};

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_UPLOAD_TYPES = new Set([
  "text/plain",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "image/gif",
]);

DOM.form.addEventListener("submit", handleSubmit);
DOM.input.addEventListener("keydown", handleInputKeydown);
DOM.sendBtn.addEventListener("keydown", handleSendKeydown);
DOM.modelSelect?.addEventListener("change", handleModelChange);
DOM.refreshModelsBtn?.addEventListener("click", () => loadModels());
DOM.saveSystemPromptBtn?.addEventListener("click", handleSystemPromptSave);
DOM.toolbarToggle?.addEventListener("click", toggleToolbar);
DOM.uploadToggle?.addEventListener("click", toggleUploadCard);
DOM.uploadForm?.addEventListener("submit", handleUploadSubmit);
DOM.fileInput?.addEventListener("change", handleFileChange);
DOM.inputMeta?.addEventListener("click", handleMetaClick);
updateModelLine();

// Initialize toolbar state
initializeToolbar();
initializeUploadCard();
// Initialize connection status as disconnected
updateConnectionStatus(false);

loadModels().catch(() => {
  setModelStatus("No se pudieron cargar los modelos", true);
});
loadSystemPrompt().catch(() => {
  setPromptStatus("No se pudo cargar el system prompt", true);
});
renderAttachments();
handleFileChange();

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
    const models = Array.isArray(payload.models) ? payload.models : [];
    const ids = models.map((m) => m.id || m).filter(Boolean);

    state.defaultModel =
      typeof payload.defaultModel === "string" ? payload.defaultModel : null;
    state.models = models;

    // Store detected backend
    if (payload.backend) {
      localStorage.setItem("agent-backend", payload.backend);
      setModelStatus(`Backend detectado: ${payload.backend}`);
    }

    renderModelOptions(models);

    // Only select a model if we actually have models available
    const candidate =
      state.model && ids.includes(state.model) ? state.model : null;
    const fallback =
      state.defaultModel && ids.includes(state.defaultModel)
        ? state.defaultModel
        : ids[0] ?? null;  // Don't fall back to defaultModel if it's not in the list
    const pick = candidate || fallback;

    if (pick) {
      setActiveModel(pick, false);
      updateConnectionStatus(true);
    } else {
      // No models available - either empty array or no valid model
      if (ids.length === 0) {
        setModelStatus("No hay modelos disponibles. Verifica que LM Studio u Ollama estén corriendo.", true);
      } else {
        setModelStatus("No se encontraron modelos", true);
      }
      updateConnectionStatus(false);
    }
  } catch (error) {
    setModelStatus(
      error instanceof Error ? error.message : "Error al obtener modelos",
      true
    );
    updateConnectionStatus(false);
  } finally {
    toggleModelControls(false);
    updateInputMeta();
    updateModelLine();
  }
}

function renderModelOptions(models) {
  if (!DOM.modelSelect) return;
  DOM.modelSelect.innerHTML = "";

  if (!models.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Sin modelos";
    DOM.modelSelect.appendChild(opt);
    DOM.modelSelect.disabled = true;
    return;
  }

  models.forEach((model) => {
    const opt = document.createElement("option");
    const id = model.id || model;
    opt.value = id;
    
    // Build display text with additional info
    let displayText = id;
    if (model.size || model.family) {
      const extras = [];
      if (model.family) extras.push(model.family);
      if (model.size) extras.push(model.size);
      displayText += ` (${extras.join(", ")})`;
    }
    
    opt.textContent = displayText;
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
  updateInputMeta();
  updateModelLine();

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
    DOM.modelSelect.setAttribute("aria-busy", String(isLoading));
  }
  if (DOM.refreshModelsBtn) {
    DOM.refreshModelsBtn.disabled = isLoading;
    DOM.refreshModelsBtn.setAttribute("aria-busy", String(isLoading));
  }
}

function setModelStatus(text, isError = false) {
  if (!DOM.modelStatus) return;
  DOM.modelStatus.textContent = text;
  DOM.modelStatus.classList.toggle("error", Boolean(isError));
}

async function loadSystemPrompt() {
  if (!DOM.systemPromptInput) return;
  setPromptStatus("Cargando system prompt...");
  togglePromptControls(true);

  try {
    const response = await fetch(`${window.API_URL}/api/system-prompt`);
    if (!response.ok) {
      throw new Error("No se pudo obtener el system prompt");
    }

    const payload = await response.json();
    const prompt =
      typeof payload.systemPrompt === "string" ? payload.systemPrompt : "";

    state.systemPrompt = prompt;
    DOM.systemPromptInput.value = prompt;
    setPromptStatus("System prompt listo");
  } catch (error) {
    setPromptStatus(
      error instanceof Error ? error.message : "Error al obtener system prompt",
      true
    );
  } finally {
    togglePromptControls(false);
  }
}

async function handleSystemPromptSave() {
  if (!DOM.systemPromptInput) return;
  const value = DOM.systemPromptInput.value.trim();
  if (!value) {
    setPromptStatus("El system prompt no puede estar vacío", true);
    return;
  }

  togglePromptControls(true);
  setPromptStatus("Guardando...");

  try {
    const response = await fetch(`${window.API_URL}/api/system-prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ systemPrompt: value }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || "No se pudo guardar");
    }

    state.systemPrompt = value;
    state.sessionId = null;
    localStorage.removeItem("agent-session");
    setPromptStatus("System prompt actualizado. Se reinició el contexto.");
    appendBubble(
      "System prompt actualizado. Se reinicia la conversación.",
      "assistant"
    );
  } catch (error) {
    setPromptStatus(
      error instanceof Error ? error.message : "Error al guardar",
      true
    );
  } finally {
    togglePromptControls(false);
  }
}

function setPromptStatus(text, isError = false) {
  if (!DOM.promptStatus) return;
  DOM.promptStatus.textContent = text;
  DOM.promptStatus.classList.toggle("error", Boolean(isError));
}

function togglePromptControls(isLoading) {
  if (DOM.systemPromptInput) {
    DOM.systemPromptInput.disabled = isLoading;
    DOM.systemPromptInput.setAttribute("aria-busy", String(isLoading));
  }
  if (DOM.saveSystemPromptBtn) {
    DOM.saveSystemPromptBtn.disabled = isLoading;
    DOM.saveSystemPromptBtn.setAttribute("aria-busy", String(isLoading));
  }
}

function handleFileChange() {
  const file = DOM.fileInput?.files?.[0];
  if (!DOM.fileLabel) return;
  DOM.fileLabel.textContent = file
    ? `${file.name} (${formatBytes(file.size)})`
    : "Selecciona un archivo";
}

async function handleUploadSubmit(event) {
  event.preventDefault();
  if (!DOM.fileInput) return;
  const file = DOM.fileInput.files?.[0];

  if (!file) {
    setUploadStatus("Selecciona un archivo para subir", true);
    return;
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    setUploadStatus(`El archivo supera el límite de 10MB (${formatBytes(file.size)})`, true);
    return;
  }

  if (!ALLOWED_UPLOAD_TYPES.has(file.type)) {
    setUploadStatus(`Tipo no permitido (${file.type || "desconocido"})`, true);
    return;
  }

  setUploadLoading(true);
  setUploadStatus("Subiendo archivo...");

  try {
    const uploaded = await uploadFileToServer(file);
    const previewUrl = URL.createObjectURL(file);
    addAttachment({ ...uploaded, previewUrl, mimeType: file.type });
    setUploadStatus(`Archivo listo: ${uploaded.relativePath || uploaded.filePath}`);
    DOM.fileInput.value = "";
    handleFileChange();
  } catch (error) {
    setUploadStatus(error instanceof Error ? error.message : "No se pudo subir el archivo", true);
  } finally {
    setUploadLoading(false);
  }
}

function setUploadLoading(isLoading) {
  if (DOM.uploadBtn) {
    DOM.uploadBtn.disabled = isLoading;
    DOM.uploadBtn.textContent = isLoading ? "Subiendo..." : "Subir";
    DOM.uploadBtn.setAttribute("aria-busy", String(isLoading));
  }
  if (DOM.fileInput) {
    DOM.fileInput.disabled = isLoading;
  }
}

function setUploadStatus(text, isError = false) {
  if (!DOM.uploadStatus) return;
  DOM.uploadStatus.textContent = text;
  DOM.uploadStatus.classList.toggle("error", Boolean(isError));
}

async function uploadFileToServer(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("name", file.name);
  formData.append("type", file.type);
  formData.append("size", String(file.size));

  const response = await fetch(`${window.API_URL}/api/upload`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "No se pudo subir el archivo");
  }

  return response.json();
}

function addAttachment(attachment) {
  state.attachments.push(attachment);
  renderAttachments();
  updateModelLine();
}

function removeAttachment(index) {
  state.attachments.splice(index, 1);
  renderAttachments();
}

function renderAttachments() {
  if (!DOM.attachmentList) return;
  DOM.attachmentList.innerHTML = "";

  if (!state.attachments.length) {
    DOM.attachmentList.textContent = "No hay archivos listos. Sube uno para compartirlo.";
    updateInputMeta();
    updateModelLine();
    return;
  }

  state.attachments.forEach((file, index) => {
    const chip = document.createElement("div");
    chip.className = "attachment-chip";

    const name = file.originalName || file.name || "Archivo";
    const label = document.createElement("span");
    label.textContent = `${name} (${formatBytes(file.size ?? 0)})`;
    chip.appendChild(label);

    const pathInfo = document.createElement("span");
    pathInfo.className = "muted";
    pathInfo.textContent = file.relativePath || file.filePath || "";
    chip.appendChild(pathInfo);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.setAttribute("aria-label", `Quitar ${name}`);
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", () => removeAttachment(index));
    chip.appendChild(removeBtn);

    DOM.attachmentList.appendChild(chip);
  });

  updateInputMeta();
  updateModelLine();
}

function buildMessageWithAttachments(text, attachments) {
  if (!attachments.length) return text;

  const files = attachments
    .map((file) => {
      const label = file.relativePath || file.filePath || file.originalName || file.name || "archivo";
      const type = file.mimeType || "tipo desconocido";
      const sizeLabel = formatBytes(file.size ?? 0);
      const download = file.downloadUrl ? ` [descarga: ${file.downloadUrl}]` : "";
      return `- ${label} (${type}, ${sizeLabel})${download}`;
    })
    .join("\n");

  return `${text}\n\nArchivos disponibles para el asistente (usa read_file o convert_file_to_base64 si los necesitas):\n${files}`;
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[exponent]}`;
}

function updateInputMeta() {
  if (!DOM.inputMeta) return;
  const files = state.attachments;

  const fileChips = files
    .map((f) => {
      const label = f.originalName || f.name || f.relativePath || "archivo";
      const thumb =
        f.mimeType?.startsWith("image/") && f.previewUrl
          ? `<img class="meta-thumb" src="${f.previewUrl}" alt="${label}" />`
          : "";
      const href = f.previewUrl || f.downloadUrl || null;
      const content = `${thumb}${label}`;
      return href
        ? `<span class="meta-chip" data-index="${files.indexOf(f)}"><a href="${href}" target="_blank" rel="noopener noreferrer">${content}</a><button type="button" class="meta-remove" aria-label="Quitar ${label}">×</button></span>`
        : `<span class="meta-chip" data-index="${files.indexOf(f)}">${content}<button type="button" class="meta-remove" aria-label="Quitar ${label}">×</button></span>`;
    })
    .join("");

  const filesLine = files.length
    ? `<div class="meta-line chips" aria-label="Archivos adjuntos">${fileChips}</div>`
    : "";

  DOM.inputMeta.innerHTML = filesLine;
}

function handleMetaClick(event) {
  const target = event.target;
  if (!target.classList.contains("meta-remove")) return;
  const chip = target.closest(".meta-chip");
  const idx = chip?.dataset?.index;
  if (idx === undefined) return;
  const indexNum = Number(idx);
  if (Number.isNaN(indexNum)) return;
  removeAttachment(indexNum);
}

function updateModelLine() {
  if (!DOM.modelLine) return;
  const modelLabel = state.model ? `Modelo: ${state.model}` : "";
  DOM.modelLine.textContent = modelLabel;
}

async function handleSubmit(event) {
  event.preventDefault();
  if (state.isThinking) return; // bloquear envíos mientras el modelo procesa

  const text = DOM.input.value.trim();
  if (!text) return;

  const attachments = [...state.attachments];
  const message = buildMessageWithAttachments(text, attachments);

  appendBubble(text, "user", attachments);
  DOM.input.value = "";
  setThinking(true);

  try {
    const reply = await sendMessage(message, attachments);
    appendBubble(reply ?? "(sin respuesta)", "assistant");
    if (attachments.length) {
      state.attachments = [];
      renderAttachments();
    }
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
    DOM.form.dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true })
    );
  }
}

async function sendMessage(message, attachments = []) {
  const response = await fetch(`${window.API_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      sessionId: state.sessionId,
      model: state.model,
      attachments,
    }),
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

function appendBubble(text, role, attachments = []) {
  const bubble = document.createElement("div");
  bubble.className = `bubble ${role}`;

  if (role === "assistant") {
    renderAssistantContent(bubble, text);
  } else {
    bubble.textContent = text;

    if (attachments?.length) {
      const list = document.createElement("ul");
      list.className = "helper";

      attachments.forEach((file) => {
        const item = document.createElement("li");
        const name = file.originalName || file.name || file.relativePath || "Archivo";
        item.textContent = `${name} (${formatBytes(file.size ?? 0)}) - ${file.relativePath || file.filePath}`;
        list.appendChild(item);
      });

      bubble.appendChild(list);
    }
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
  DOM.form.setAttribute("aria-busy", String(state.isThinking));
  
  if (state.isThinking) {
    DOM.statusText.textContent = "Pensando...";
    showThinkingBubble();
  } else {
    DOM.statusText.textContent = state.isConnected ? "Listo" : "Desconectado";
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
  let processedText = text.replace(
    /```html\n([\s\S]*?)\n```/g,
    (match, inner) => {
      htmlBlocks.push(inner);
      return `__HTML_BLOCK_${htmlBlocks.length - 1}__`;
    }
  );

  // 2. Extraer bloques <think> ... </think> para que no los toque marked (o procesarlos antes)
  //    Preferimos procesarlos antes para que el contenido dentro de think también pueda tener markdown si se quiere,
  //    pero por simplicidad y para evitar conflictos, los extraemos y luego los restauramos.
  const thinkBlocks = [];
  processedText = processedText.replace(
    /<think>([\s\S]*?)<\/think>/gi,
    (match, body) => {
      thinkBlocks.push(body);
      return `__THINK_BLOCK_${thinkBlocks.length - 1}__`;
    }
  );

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
  links.forEach((a) => {
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

function updateConnectionStatus(isConnected) {
  state.isConnected = isConnected;
  
  if (DOM.statusIndicator) {
    DOM.statusIndicator.classList.toggle("connected", isConnected);
    DOM.statusIndicator.classList.toggle("disconnected", !isConnected);
  }
  
  if (DOM.statusText && !state.isThinking) {
    DOM.statusText.textContent = isConnected ? "Listo" : "Desconectado";
  }
}

function initializeToolbar() {
  if (!DOM.toolbar || !DOM.toolbarToggle) return;
  
  // Apply saved state
  if (state.toolbarCollapsed) {
    DOM.toolbar.setAttribute("data-collapsed", "true");
    DOM.toolbarToggle.setAttribute("aria-expanded", "false");
  }
}

function toggleToolbar() {
  if (!DOM.toolbar || !DOM.toolbarToggle) return;
  
  const isCollapsed = DOM.toolbar.getAttribute("data-collapsed") === "true";
  const newState = !isCollapsed;
  
  DOM.toolbar.setAttribute("data-collapsed", String(newState));
  DOM.toolbarToggle.setAttribute("aria-expanded", String(!newState));
  
  // Save state
  state.toolbarCollapsed = newState;
  localStorage.setItem("toolbar-collapsed", String(newState));
}

function initializeUploadCard() {
  if (!DOM.uploadCard || !DOM.uploadToggle) return;

  if (state.uploadCollapsed) {
    DOM.uploadCard.setAttribute("data-collapsed", "true");
    DOM.uploadToggle.setAttribute("aria-expanded", "false");
  }
}

function toggleUploadCard() {
  if (!DOM.uploadCard || !DOM.uploadToggle) return;

  const isCollapsed = DOM.uploadCard.getAttribute("data-collapsed") === "true";
  const newState = !isCollapsed;

  DOM.uploadCard.setAttribute("data-collapsed", String(newState));
  DOM.uploadToggle.setAttribute("aria-expanded", String(!newState));
  state.uploadCollapsed = newState;
  localStorage.setItem("upload-collapsed", String(newState));
}
