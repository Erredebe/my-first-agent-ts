import { describe, it, expect, vi } from "vitest";
import { OrchestratorAgent } from "./orchestratorAgent.js";
import { Config } from "../config/index.js";

const baseConfig: Config = {
  model: "dummy-model",
  baseURL: "http://localhost:1234/v1",
  apiKey: "test-key",
  systemPrompt: "you are a test",
};

function createChatAgentDouble() {
  return {
    sendMessage: vi.fn().mockResolvedValue("chat-response"),
    resetContext: vi.fn(),
    setSystemPrompt: vi.fn(),
  };
}

describe("OrchestratorAgent", () => {
  it("usa ChatAgent por defecto", async () => {
    const chatAgent = createChatAgentDouble();
    const orchestrator = new OrchestratorAgent(baseConfig, {
      createChatAgent: () => chatAgent as any,
    });

    const reply = await orchestrator.sendMessage("hola");

    expect(reply).toBe("chat-response");
    expect(chatAgent.sendMessage).toHaveBeenCalledWith("hola");
  });

  it("deriva a FileAgent cuando detecta una instrucción de archivo", async () => {
    const chatAgent = createChatAgentDouble();
    const fileAgent = { handleRequest: vi.fn().mockResolvedValue("file-done") };
    const orchestrator = new OrchestratorAgent(baseConfig, {
      createChatAgent: () => chatAgent as any,
      fileAgent: fileAgent as any,
    });

    const reply = await orchestrator.sendMessage("/file read demo.txt");

    expect(reply).toBe("file-done");
    expect(fileAgent.handleRequest).toHaveBeenCalledWith("/file read demo.txt");
    expect(chatAgent.sendMessage).not.toHaveBeenCalled();
  });

  it("deriva a WebAgent cuando la petición es de búsqueda en la web", async () => {
    const chatAgent = createChatAgentDouble();
    const webAgent = { handleRequest: vi.fn().mockResolvedValue("web-done") };
    const orchestrator = new OrchestratorAgent(baseConfig, {
      createChatAgent: () => chatAgent as any,
      webAgent: webAgent as any,
    });

    const reply = await orchestrator.sendMessage("buscar en la web https://example.com");

    expect(reply).toBe("web-done");
    expect(webAgent.handleRequest).toHaveBeenCalledWith("buscar en la web https://example.com");
    expect(chatAgent.sendMessage).not.toHaveBeenCalled();
  });
});
