import { describe, it, expect, vi, beforeEach } from "vitest";
import { webTools, executeWebToolCall } from "./webTools.js";
import { ToolCall } from "../core/types.js";

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe("webTools", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("debe tener la herramienta fetch_url definida", () => {
    expect(webTools).toHaveLength(1);
    expect(webTools[0].function.name).toBe("fetch_url");
  });

  it("debe obtener contenido de una URL exitosamente", async () => {
    const mockContent = "Hola desde la web!";
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => mockContent
    });

    const toolCall: ToolCall = {
      id: "call-1",
      type: "function",
      function: {
        name: "fetch_url",
        arguments: JSON.stringify({ url: "https://example.com" })
      }
    };

    const result = await executeWebToolCall(toolCall);

    expect(result.role).toBe("tool");
    expect(result.tool_call_id).toBe("call-1");
    expect(result.content).toContain("example.com");
    expect(result.content).toContain(mockContent);
  });

  it("debe truncar contenido largo", async () => {
    const longContent = "A".repeat(2_000_000);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => longContent
    });

    const toolCall: ToolCall = {
      id: "call-2",
      type: "function",
      function: {
        name: "fetch_url",
        arguments: JSON.stringify({ url: "https://large.com", max_bytes: 1000 })
      }
    };

    const result = await executeWebToolCall(toolCall);

    expect(result.content).toContain("truncado");
    expect(result.content.length).toBeLessThan(longContent.length);
  });

  it("debe manejar errores HTTP", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found"
    });

    const toolCall: ToolCall = {
      id: "call-3",
      type: "function",
      function: {
        name: "fetch_url",
        arguments: JSON.stringify({ url: "https://notfound.com" })
      }
    };

    const result = await executeWebToolCall(toolCall);

    expect(result.content).toContain("404");
    expect(result.content).toContain("Not Found");
  });

  it("debe rechazar URLs no HTTP/HTTPS", async () => {
    const toolCall: ToolCall = {
      id: "call-4",
      type: "function",
      function: {
        name: "fetch_url",
        arguments: JSON.stringify({ url: "file:///etc/passwd" })
      }
    };

    const result = await executeWebToolCall(toolCall);

    expect(result.content).toContain("Solo se permiten URLs http");
  });
});
