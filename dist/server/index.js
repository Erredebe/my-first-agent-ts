import express from "express";
import path from "path";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import { ChatAgent } from "../core/chatAgent.js";
const app = express();
app.use(express.json());
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, "../../public");
const agents = new Map();
function getAgent(sessionId) {
    const existing = agents.get(sessionId);
    if (existing)
        return existing;
    const agent = new ChatAgent();
    agents.set(sessionId, agent);
    return agent;
}
app.use(express.static(publicDir));
app.post("/api/chat", async (req, res) => {
    const { message, sessionId } = req.body;
    if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "Falta 'message'" });
    }
    const sid = sessionId && typeof sessionId === "string" ? sessionId : randomUUID();
    const agent = getAgent(sid);
    try {
        const reply = await agent.sendMessage(message);
        res.json({ reply, sessionId: sid });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
const port = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(port, () => {
    console.log(`Frontend listo en http://localhost:${port}`);
});
