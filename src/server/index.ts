import express, { Request, Response } from "express";
import path from "path";
import { randomUUID } from "crypto";
import { exec } from "child_process";
import { fileURLToPath } from "url";
import { ChatAgent } from "../core/chatAgent.js";
import { getDownloadPath } from "./downloads.js";

/**
 * Servidor Express que expone la API de chat y sirve el frontal web.
 * Exportamos `app` para poder testear con supertest sin arrancar el servidor.
 */
export const app = express();
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, "../../public");

// Cada pestaña del navegador conserva su sesión de conversación.
const agents = new Map<string, ChatAgent>();

function getAgent(sessionId: string): ChatAgent {
  const existing = agents.get(sessionId);
  if (existing) return existing;
  const agent = new ChatAgent();
  agents.set(sessionId, agent);
  return agent;
}

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
    console.error("[server] fallo en /api/chat:", err);
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
    else console.log(`[server] download sent for token ${token}`);
  });
});

const port = process.env.PORT ? Number(process.env.PORT) : 3000;
if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => {
    console.log(`Frontend listo en http://localhost:${port}`);
    openBrowser(`http://localhost:${port}`);
  });
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
