import express, { Request, Response } from "express";
import cors from "cors";
import path from "path";
import { randomUUID } from "crypto";
import { exec } from "child_process";
import { fileURLToPath } from "url";
import { ChatAgent } from "../core/chatAgent.js";
import { getDownloadPath } from "./downloads.js";
import { getConfig } from "../config/index.js";
import { Logger } from "../core/logger.js";

/**
 * Servidor Express que expone la API de chat y sirve el frontal web.
 * Exportamos `app` para poder testear con supertest sin arrancar el servidor.
 */
export const app = express();

// CORS configuration
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true
}));

app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, "../../public");

// Cada pestaña del navegador conserva su sesión de conversación.
const agents = new Map<string, { agent: ChatAgent; lastActive: number }>();
const SESSION_TIMEOUT_MS = 60 * 60 * 1000; // 1 hora

function getAgent(sessionId: string): ChatAgent {
  const existing = agents.get(sessionId);
  if (existing) {
    existing.lastActive = Date.now();
    return existing.agent;
  }
  
  const config = getConfig();
  const agent = new ChatAgent(config);
  agents.set(sessionId, { agent, lastActive: Date.now() });
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

app.use(express.static(publicDir));

app.post("/api/chat", async (req: Request, res: Response) => {
  const { message, sessionId } = req.body as {
    message?: string;
    sessionId?: string;
  };

  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "Falta 'message' o está vacío" });
  }

  const sid =
    sessionId && typeof sessionId === "string" ? sessionId : randomUUID();
  const agent = getAgent(sid);

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
