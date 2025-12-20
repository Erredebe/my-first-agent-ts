import express, { Request, Response } from "express";
import cors from "cors";
import path from "path";
import { randomUUID } from "crypto";
import { exec } from "child_process";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import multer from "multer";
import type { OpenAI } from "openai";
import { ChatAgent } from "../core/chatAgent.js";
import { createDownloadToken, getDownloadPath } from "./downloads.js";
import {
  getConfig,
  getCurrentBaseURL,
  getCurrentModel,
  setModel,
  setBaseURL,
  getDetectedBackend,
} from "../config/index.js";
import { Logger } from "../core/logger.js";
import {
  detectBackend,
  fetchModelsForBackend,
} from "../core/llm.js";

/**
 * Servidor Express que expone la API de chat y sirve el frontal web.
 * Exportamos `app` para poder testear con supertest sin arrancar el servidor.
 */
export const app = express();

// CORS configuration
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
);

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ limit: "20mb", extended: true }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, "../../public");
let currentSystemPrompt = getConfig().systemPrompt;
const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");
const uploadsReady = fs.mkdir(UPLOAD_DIR, { recursive: true });
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = new Set([
  "text/plain",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);
const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}`));
    } else {
      cb(null, true);
    }
  },
});

// Cada pestaña del navegador conserva su sesión de conversación.
const agents = new Map<
  string,
  { agent: ChatAgent; lastActive: number; model: string }
>();
const SESSION_TIMEOUT_MS = 60 * 60 * 1000; // 1 hora

function getAgent(sessionId: string, modelOverride?: string): ChatAgent {
  const baseConfig = getConfig();
  const model = modelOverride?.trim() || baseConfig.model;
  const systemPrompt = currentSystemPrompt;

  const existing = agents.get(sessionId);
  if (existing && existing.model === model) {
    existing.lastActive = Date.now();
    return existing.agent;
  }

  const config = { ...baseConfig, model, systemPrompt };
  const agent = new ChatAgent(config);
  agents.set(sessionId, { agent, lastActive: Date.now(), model });
  return agent;
}

// Limpieza de sesiones inactivas
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of agents.entries()) {
    if (now - session.lastActive > SESSION_TIMEOUT_MS) {
      agents.delete(id);
      Logger.info(`Session ${id} expired and removed`, "Server");
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes

// ============ BACKEND DETECTION HELPERS ============



app.use(express.static(publicDir));

app.get("/api/models", async (_req: Request, res: Response) => {
  const config = getConfig();
  let backend = getDetectedBackend();

  // Auto-detect if not already detected
  if (!backend) {
    backend = await detectBackend(config.baseURL);
  }

  try {
    const models = await fetchModelsForBackend(config.baseURL, backend);
    res.json({
      models,
      defaultModel: config.model,
      backend: backend || "unknown",
    });
  } catch (error) {
    Logger.error("Error in /api/models", error, "Server");
    res.status(500).json({ error: "No se pudieron obtener los modelos" });
  }
});

app.get("/api/config", (_req: Request, res: Response) => {
  try {
    return res.json({
      model: getCurrentModel(),
      baseURL: getCurrentBaseURL(),
      backend: getDetectedBackend(),
    });
  } catch (err) {
    return res
      .status(500)
      .json({ error: "Failed to read config", details: String(err) });
  }
});

app.post("/api/model", express.json(), (req: Request, res: Response) => {
  const { model, baseURL } = req.body as {
    model?: string;
    baseURL?: string;
  };

  if (!model && !baseURL) {
    return res
      .status(400)
      .json({ error: "Se requiere 'model' o 'baseURL' en el cuerpo" });
  }

  if (model) setModel(model);
  if (baseURL) setBaseURL(baseURL);

  // Limpiar sesiones activas
  agents.clear();

  return res.json({ ok: true, model: model ?? null, baseURL: baseURL ?? null });
});

app.post(
  "/api/model/load",
  express.json(),
  async (req: Request, res: Response) => {
    const { model } = req.body as { model?: string };
    if (!model) {
      return res.status(400).json({ error: "Model name required" });
    }

    let baseURL = getCurrentBaseURL();
    const maxWaitMs = 30000; // 30 seconds max
    const pollIntervalMs = 2000; // Poll every 2 seconds
    const startTime = Date.now();

    let backend = getDetectedBackend();
    if (!backend) {
      backend = await detectBackend(baseURL);
    }

    // Poll until model is available
    while (Date.now() - startTime < maxWaitMs) {
      const available = await fetchModelsForBackend(baseURL, backend);
      if (available.some(m => m.id === model)) {
        setModel(model);
        agents.clear();
        return res.json({ ok: true, loaded: true, model });
      }
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }

    return res.status(408).json({
      error: `Model '${model}' did not load within ${maxWaitMs / 1000}s`,
      timeout: true,
    });
  }
);

app.get("/api/system-prompt", (_req: Request, res: Response) => {
  res.json({ systemPrompt: currentSystemPrompt });
});

app.post("/api/system-prompt", (req: Request, res: Response) => {
  const { systemPrompt } = req.body as { systemPrompt?: string };
  if (
    !systemPrompt ||
    typeof systemPrompt !== "string" ||
    !systemPrompt.trim()
  ) {
    return res.status(400).json({ error: "El system prompt es obligatorio" });
  }

  currentSystemPrompt = systemPrompt.trim();
  for (const session of agents.values()) {
    session.agent.setSystemPrompt(currentSystemPrompt);
  }

  res.json({ systemPrompt: currentSystemPrompt });
});

app.post("/api/upload", (req: Request, res: Response) => {
  upload.single("file")(req, res, async (err: unknown) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        const message =
          err.code === "LIMIT_FILE_SIZE"
            ? `El archivo es demasiado grande (limite ${MAX_UPLOAD_BYTES} bytes)`
            : err.message;
        return res.status(400).json({ error: message });
      }
      const message = (err as Error).message || "No se pudo procesar el archivo";
      return res.status(400).json({ error: message });
    }

    try {
      await uploadsReady;
    } catch (error) {
      Logger.error("No se pudo crear el directorio de uploads", error, "Server");
      return res.status(500).json({ error: "No se pudo preparar la carpeta de archivos" });
    }

    const file = req.file;
    const originalName = file?.originalname;
    const type = file?.mimetype;
    const size = file?.size ?? 0;
    const buffer = file?.buffer;

    if (!file || !originalName || !type || !buffer) {
      return res.status(400).json({ error: "Falta el archivo a subir" });
    }

    if (size < 0 || size > MAX_UPLOAD_BYTES) {
      return res
        .status(400)
        .json({ error: `El archivo es demasiado grande (limite ${MAX_UPLOAD_BYTES} bytes)` });
    }

    if (!ALLOWED_MIME_TYPES.has(type)) {
      return res.status(400).json({ error: `Tipo de archivo no permitido: ${type}` });
    }

    const extension = path.extname(originalName) || "";
    const safeBaseName = path.basename(originalName, extension).replace(/[^a-zA-Z0-9._-]/g, "_") || "archivo";
    const storedName = `${Date.now()}-${randomUUID()}-${safeBaseName}${extension}`;
    const storedPath = path.join(UPLOAD_DIR, storedName);

    try {
      await fs.writeFile(storedPath, buffer);
      const token = await createDownloadToken(storedPath);
      return res.json({
        ok: true,
        filePath: storedPath,
        relativePath: path.relative(process.cwd(), storedPath),
        downloadUrl: `/api/download/${token}`,
        mimeType: type,
        originalName,
        size: buffer.length,
      });
    } catch (error) {
      Logger.error("No se pudo guardar el archivo subido", error, "Server");
      return res.status(500).json({ error: "No se pudo guardar el archivo" });
    }
  });
});

type AttachmentPayload = {
  downloadUrl?: string;
  mimeType?: string;
  originalName?: string;
  size?: number;
  relativePath?: string;
  filePath?: string;
};

app.post("/api/chat", async (req: Request, res: Response) => {
  const { message, sessionId, model, attachments } = req.body as {
    message?: string;
    sessionId?: string;
    model?: string;
    attachments?: AttachmentPayload[];
  };

  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "Falta 'message' o esta vacio" });
  }

  const sid =
    sessionId && typeof sessionId === "string" ? sessionId : randomUUID();
  const agent = getAgent(sid, model);

  let content: string | OpenAI.Chat.Completions.ChatCompletionContentPart[];
  try {
    content = await buildUserContent(message, attachments, req);
  } catch (err) {
    Logger.error("No se pudieron preparar los adjuntos para el mensaje", err, "Server");
    return res.status(500).json({ error: "No se pudieron procesar los adjuntos" });
  }

  try {
    const reply = await agent.sendMessage(content);
    const hasImages = Array.isArray(content) && content.some(p => (p as any).type === "image_url");
    Logger.info(
      `Chat request sent. attachments=${attachments?.length ?? 0} hasImages=${hasImages}`,
      "Server"
    );
    res.json({ reply, sessionId: sid });
  } catch (err) {
    Logger.error("Error in /api/chat", err, "Server");
    res.status(500).json({ error: (err as Error).message });
  }
});

async function buildUserContent(
  message: string,
  attachments: AttachmentPayload[] | undefined,
  req: Request
): Promise<string | OpenAI.Chat.Completions.ChatCompletionContentPart[]> {
  const parts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: "text", text: message }
  ];

  const files = Array.isArray(attachments) ? attachments : [];
  for (const file of files) {
    const url = file.downloadUrl;
    const hasPathRef = Boolean(file.filePath || file.relativePath);
    if (!url && !hasPathRef) continue;

    const mime = file.mimeType || guessMimeFromPath(file);
    if (isImageMime(mime)) {
      const dataUrl = await toInlineImageUrl({ ...file, mimeType: mime });
      const finalUrl = dataUrl ?? (url ? toAbsoluteUrl(url, req) : null);
      if (finalUrl) {
        parts.push({ type: "image_url", image_url: { url: finalUrl, detail: "high" } });
        Logger.info(
          `Imagen adjunta para modelo: ${file.originalName ?? file.relativePath ?? url ?? "(sin nombre)"}`,
          "Server"
        );
      }
    }

    if (!isImageMime(mime) && url) {
      parts.push({
        type: "text",
        text: `Archivo disponible: ${url} (${mime ?? "tipo desconocido"})`
      });
    }
  }

  // Si hay imágenes, limpiamos el texto inicial para quitar la sección "Archivos disponibles..." que invita a usar herramientas.
  const hasImages = files.some((f) => isImageMime(f.mimeType || guessMimeFromPath(f)));
  if (hasImages && parts.length && parts[0]?.type === "text") {
    parts[0].text = stripAttachmentNotice(parts[0].text);
  }

  return parts.length === 1 ? message : parts;
}

function toAbsoluteUrl(url: string, req: Request): string {
  if (/^https?:\/\//i.test(url)) return url;
  const origin = `${req.protocol}://${req.get("host")}`;
  return new URL(url, origin).toString();
}

function isImageMime(mime?: string): boolean {
  return mime ? IMAGE_MIME_TYPES.has(mime) : false;
}

function guessMimeFromPath(file: AttachmentPayload): string | undefined {
  const p = file.filePath || file.relativePath || file.originalName;
  if (!p) return undefined;
  const ext = path.extname(p).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg" || ext === ".jpe") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  return undefined;
}

async function toInlineImageUrl(file: AttachmentPayload): Promise<string | null> {
  try {
    const mime = file.mimeType || guessMimeFromPath(file);
    if (!mime || !isImageMime(mime)) return null;
    const resolvedPath = file.filePath
      ? file.filePath
      : file.relativePath
      ? path.resolve(process.cwd(), file.relativePath)
      : null;
    if (!resolvedPath) return null;
    const data = await fs.readFile(resolvedPath);
    const base64 = data.toString("base64");
    return `data:${mime};base64,${base64}`;
  } catch (error) {
    Logger.error("No se pudo leer el archivo de imagen para inline", error, "Server");
    return null;
  }
}

function stripAttachmentNotice(text: string): string {
  const marker = "\n\nArchivos disponibles";
  const idx = text.indexOf(marker);
  if (idx === -1) return text;
  return text.slice(0, idx).trim();
}

app.get("/api/download/:token", async (req: Request, res: Response) => {
  const { token } = req.params;
  const filePath = token ? getDownloadPath(token) : undefined;
  console.log(`[server] /api/download request for token=${token}`);
  if (!filePath) {
    console.log(`[server] token not found: ${token}`);
    return res.status(404).send("Enlace no válido o caducado");
  }
  console.log(`[server] sending file ${filePath} for token ${token}`);
  return res.download(filePath, path.basename(filePath), (err) => {
    if (err)
      console.error(
        `[server] error sending file for token ${token}:`,
        err.message
      );
    else Logger.info(`Download sent for token ${token}`, "Server");
  });
});

const port = process.env.PORT ? Number(process.env.PORT) : 3000;
if (process.env.NODE_ENV !== "test") {
  const server = app.listen(port, () => {
    Logger.info(`Frontend ready at http://localhost:${port}`, "Server");
    openBrowser(`http://localhost:${port}`);
  });

  // Graceful shutdown
  const shutdown = () => {
    Logger.info("Shutting down server...", "Server");
    server.close(() => {
      Logger.info("Server closed", "Server");
      process.exit(0);
    });
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

/**
 * Abre el navegador en la URL indicada en función del sistema operativo.
 */
function openBrowser(url: string) {
  const platform = process.platform;
  const command =
    platform === "win32"
      ? `start "" "${url}"`
      : platform === "darwin"
      ? `open "${url}"`
      : `xdg-open "${url}"`;
  exec(command);
}
