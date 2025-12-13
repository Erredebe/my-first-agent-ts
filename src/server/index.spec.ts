import { describe, it, expect, beforeEach, vi } from "vitest";
import path from "path";
import fs from "fs/promises";
import os from "os";
import request from "supertest";
import { app } from "./index.js";
import { createDownloadToken } from "./downloads.js";

const sendMessageMock = vi.fn();
const setSystemPromptMock = vi.fn();

vi.mock("../core/chatAgent.js", () => ({
  ChatAgent: class {
    sendMessage = sendMessageMock;
    setSystemPrompt = setSystemPromptMock;
  }
}));

vi.mock("child_process", () => ({
  exec: vi.fn()
}));

describe("server routes", () => {
  beforeEach(() => {
    sendMessageMock.mockReset();
    setSystemPromptMock.mockReset();
  });

  it("rechaza peticiones sin mensaje", async () => {
    const res = await request(app).post("/api/chat").send({ message: " " });
    expect(res.status).toBe(400);
  });

  it("responde con reply y sessionId cuando el mensaje es válido", async () => {
    sendMessageMock.mockResolvedValueOnce("respuesta");
    const res = await request(app)
      .post("/api/chat")
      .send({ message: "hola" });

    expect(res.status).toBe(200);
    expect(res.body.reply).toBe("respuesta");
    expect(res.body.sessionId).toBeTruthy();
  });

  it("expone y actualiza el system prompt", async () => {
    const initial = await request(app).get("/api/system-prompt");
    expect(initial.status).toBe(200);
    expect(typeof initial.body.systemPrompt).toBe("string");

    sendMessageMock.mockResolvedValueOnce("ok");
    await request(app).post("/api/chat").send({ message: "hola" });

    const res = await request(app)
      .post("/api/system-prompt")
      .send({ systemPrompt: "nuevo prompt" });

    expect(res.status).toBe(200);
    expect(res.body.systemPrompt).toBe("nuevo prompt");
    expect(setSystemPromptMock).toHaveBeenCalledWith("nuevo prompt");

    const after = await request(app).get("/api/system-prompt");
    expect(after.body.systemPrompt).toBe("nuevo prompt");
  });

  it("devuelve 404 para tokens de descarga inválidos", async () => {
    const res = await request(app).get("/api/download/token-invalido");
    expect(res.status).toBe(404);
  });

  it("sirve archivos existentes cuando el token es válido", async () => {
    const tmpFile = path.join(os.tmpdir(), "server-download.txt");
    const content = "hola descarga";
    await fs.writeFile(tmpFile, content);
    const token = await createDownloadToken(tmpFile);

    const res = await request(app).get(`/api/download/${token}`);
    expect(res.status).toBe(200);
    expect(res.text).toBe(content);
  });
});
