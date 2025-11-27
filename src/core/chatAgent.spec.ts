import { describe, it, expect, beforeEach, vi } from "vitest";
import { ChatAgent } from "./chatAgent.js";
import { getConfig } from "../config/index.js";

// Mocks (hoisted para que Vitest los ejecute antes de cargar el módulo)
const createCompletionMock = vi.hoisted(() => vi.fn());
const executeFileToolCallMock = vi.hoisted(() => vi.fn());

vi.mock("openai", () => {
  class OpenAI {
    chat = {
      completions: {
        create: createCompletionMock
      }
    };
    constructor() {}
  }
  return { OpenAI };
});

vi.mock("../tools/fileTools.js", () => ({
  fileTools: [{ type: "function", function: { name: "read_file" } }],
  executeFileToolCall: executeFileToolCallMock
}));

describe("ChatAgent", () => {
  beforeEach(() => {
    createCompletionMock.mockReset();
    executeFileToolCallMock.mockReset();
  });


  it("devuelve la respuesta directa del modelo cuando no hay tools", async () => {
    createCompletionMock.mockResolvedValueOnce({
      choices: [{ message: { role: "assistant", content: "Hola" } }]
    });

    const agent = new ChatAgent(getConfig());
    const reply = await agent.sendMessage("ping");

    expect(reply).toBe("Hola");
    expect(createCompletionMock).toHaveBeenCalledTimes(1);
    const args = createCompletionMock.mock.calls[0][0];
    expect(args.tools).toBeDefined();
    expect(args.tool_choice).toBe("auto");
  });

  it("combina la salida de herramientas con la respuesta final si no hay enlaces de descarga", async () => {
    createCompletionMock
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: "call-1",
                  type: "function",
                  function: {
                    name: "read_file",
                    arguments: JSON.stringify({ file_path: "dummy.txt" })
                  }
                }
              ]
            }
          }
        ]
      })
      .mockResolvedValueOnce({
        choices: [{ message: { role: "assistant", content: "Hecho" } }]
      });

    executeFileToolCallMock.mockResolvedValueOnce({
      role: "tool",
      tool_call_id: "call-1",
      content: "tool-output"
    });

    const agent = new ChatAgent(getConfig());
    const reply = await agent.sendMessage("usa la tool");

    expect(reply).toBe("Hecho\n\ntool-output");
    expect(createCompletionMock).toHaveBeenCalledTimes(2);
    expect(executeFileToolCallMock).toHaveBeenCalledTimes(1);
  });

  it("ignora envíos vacíos", async () => {
    const agent = new ChatAgent(getConfig());
    const reply = await agent.sendMessage("   ");
    expect(reply).toBeNull();
    expect(createCompletionMock).not.toHaveBeenCalled();
  });
});
