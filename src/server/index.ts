import express, { Request, Response } from "express";
import path from "path";
import { randomUUID } from "crypto";
import { exec } from "child_process";
import { fileURLToPath } from "url";
import { ChatAgent } from "../core/chatAgent.js";
import { getDownloadPath } from "./downloads.js";

const app = express();
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, "../../public");

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
  const { message, sessionId } = req.body as { message?: string; sessionId?: string };

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Falta 'message'" });
  }

  const sid = sessionId && typeof sessionId === "string" ? sessionId : randomUUID();
  const agent = getAgent(sid);

  try {
    const reply = await agent.sendMessage(message);
    res.json({ reply, sessionId: sid });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get("/api/download/:token", async (req: Request, res: Response) => {
  const { token } = req.params;
  const filePath = token ? getDownloadPath(token) : undefined;
  if (!filePath) {
    return res.status(404).send("Enlace no válido o caducado");
  }
  return res.download(filePath, path.basename(filePath));
});

const port = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(port, () => {
  console.log(`Frontend listo en http://localhost:${port}`);
  openBrowser(`http://localhost:${port}`);
});

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
