import express, { Request, Response } from "express";
import cors from "cors";
import path from "path";
import { randomUUID } from "crypto";
import { exec } from "child_process";
import { fileURLToPath } from "url";
import { OpenAI } from "openai";
import { ChatAgent } from "../core/chatAgent.js";
import { getDownloadPath } from "./downloads.js";
import {
  getConfig,
  getCurrentBaseURL,
  getCurrentModel,
  setModel,
  setBaseURL,
  setBackendType,
  getDetectedBackend,
  type BackendType,
} from "../config/index.js";
import { Logger } from "../core/logger.js";

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

app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, "../../public");
let currentSystemPrompt = getConfig().systemPrompt;

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

/**
 * Detect which backend is available (LM Studio or Ollama)
 */
async function detectBackend(baseURL: string): Promise<BackendType | null> {
  const normalized = baseURL.replace(/\/$/, "");

  // Try LM Studio first (OpenAI-compatible /v1/models)
  try {
    const lmStudioUrl = normalized.includes("/v1")
      ? normalized + "/models"
      : normalized + "/v1/models";
    const resp = await fetch(lmStudioUrl, {
      signal: AbortSignal.timeout(2000),
    });
    if (resp.ok) {
      const body = await resp.json();
      if (body.data || body.models || Array.isArray(body)) {
        setBackendType("lm-studio");
        return "lm-studio";
      }
    }
  } catch (e) {
    // Ignore LM Studio detection errors
  }

  // Try Ollama (/api/tags)
  try {
    const url = new URL(normalized);
    const host = url.hostname;
    const ollamaUrl = `http://${host}:11434/api/tags`;
    const resp = await fetch(ollamaUrl, {
      signal: AbortSignal.timeout(2000),
    });
    if (resp.ok) {
      const body = await resp.json();
      if (body.models && Array.isArray(body.models)) {
        setBackendType("ollama");
        return "ollama";
      }
    }
  } catch (e) {
    // Ignore Ollama detection errors
  }

  return null;
}

/**
 * Fetch available models from the detected backend
 */
async function fetchModelsForBackend(
  baseURL: string,
  backend: BackendType | null
): Promise<string[]> {
  const normalized = baseURL.replace(/\/$/, "");

  if (backend === "ollama") {
    try {
      const url = new URL(normalized);
      const host = url.hostname;
      const ollamaUrl = `http://${host}:11434/api/tags`;
      const resp = await fetch(ollamaUrl);
      if (resp.ok) {
        const body = await resp.json();
        if (body.models && Array.isArray(body.models)) {
          return body.models.map((m: any) => m.name || m);
        }
      }
    } catch (err) {
      // ignore
    }
  } else {
    // LM Studio (OpenAI-compatible)
    try {
      const lmStudioUrl = normalized.includes("/v1")
        ? normalized + "/models"
        : normalized + "/v1/models";
      const resp = await fetch(lmStudioUrl);
      if (resp.ok) {
        const body = await resp.json();
        if (Array.isArray(body)) {
          return body.map((m: any) => (typeof m === "string" ? m : m.id));
        }
        if (body.data && Array.isArray(body.data)) {
          return body.data.map((m: any) => m.id || m);
        }
        if (body.models && Array.isArray(body.models)) {
          return body.models.map((m: any) =>
            typeof m === "string" ? m : m.id
          );
        }
      }
    } catch (err) {
      // ignore
    }
  }

  return [];
}

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
      models: models.map((m) => ({ id: m })),
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
      if (available.includes(model)) {
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

app.post("/api/chat", async (req: Request, res: Response) => {
  const { message, sessionId, model } = req.body as {
    message?: string;
    sessionId?: string;
    model?: string;
  };

  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "Falta 'message' o está vacío" });
  }

  const sid =
    sessionId && typeof sessionId === "string" ? sessionId : randomUUID();
  const agent = getAgent(sid, model);

  try {
    const reply = await agent.sendMessage(message);
    res.json({ reply, sessionId: sid });
  } catch (err) {
    Logger.error("Error in /api/chat", err, "Server");
    res.status(500).json({ error: (err as Error).message });
  }
});

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
