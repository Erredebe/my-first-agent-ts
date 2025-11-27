import { OpenAI } from "openai";
import { API_KEY, BASE_URL, MODEL, SYSTEM_PROMPT } from "../config/index.js";
import { fileTools, executeFileToolCall } from "../tools/fileTools.js";
import { MessageParam, ToolCall } from "./types.js";

/**
 * Pequeño orquestador que conserva el historial, invoca el modelo
 * y ejecuta herramientas cuando el modelo las solicita.
 */
export class ChatAgent {
  private readonly client = new OpenAI({ apiKey: API_KEY, baseURL: BASE_URL });

  // Historial de conversación que se envía en cada petición.
  private conversation: MessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT }
  ];

  /**
   * Envía un mensaje del usuario, devuelve la respuesta del asistente
   * y gestiona llamadas a herramientas si el modelo las solicita.
   */
  async sendMessage(prompt: string): Promise<string | null> {
    const trimmed = prompt.trim();
    if (!trimmed) return null;

    this.conversation.push({ role: "user", content: trimmed });

    const firstMessage = await this.requestMessage(true);
    if (!firstMessage) return null;

    if (hasToolCalls(firstMessage)) {
      return this.handleToolFlow(firstMessage);
    }

    if (firstMessage.content) {
      this.appendAssistant(firstMessage.content);
      return firstMessage.content;
    }

    return null;
  }

  /**
   * Borra el contexto manteniendo el prompt del sistema.
   */
  resetContext(): void {
    this.conversation = [{ role: "system", content: SYSTEM_PROMPT }];
  }

  /**
   * Gestiona la ruta "el modelo pidió herramientas".
   * 1. Guarda la petición del asistente con sus tool_calls.
   * 2. Ejecuta cada herramienta y añade sus resultados.
   * 3. Vuelve a llamar al modelo sin herramientas para obtener la respuesta final.
   */
  private async handleToolFlow(
    toolCallingMessage: OpenAI.Chat.Completions.ChatCompletionMessage
  ): Promise<string | null> {
    this.conversation.push({
      role: "assistant",
      content: toolCallingMessage.content ?? null,
      tool_calls: toolCallingMessage.tool_calls
    });

    const toolOutputs = await this.runToolCalls(toolCallingMessage.tool_calls ?? []);

    const finalMessage = await this.requestMessage(false);
    const finalContent = finalMessage?.content;

    if (finalContent) {
      const reply = appendToolFallback(finalContent, toolOutputs);
      this.appendAssistant(reply);
      return reply;
    }

    if (toolOutputs.length) {
      const fallback = toolOutputs.join("\n\n");
      this.appendAssistant(fallback);
      return fallback;
    }

    return null;
  }

  /**
   * Ejecuta todas las tool_calls y agrega los mensajes "tool" al historial.
   */
  private async runToolCalls(
    toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[]
  ): Promise<string[]> {
    const outputs: string[] = [];

    for (const call of toolCalls) {
      const toolResult = await executeFileToolCall(call as ToolCall);
      if (typeof toolResult.content === "string") {
        outputs.push(toolResult.content);
      }
      this.conversation.push(toolResult);
    }

    return outputs;
  }

  /**
   * Invoca al modelo. Puede habilitar o no las herramientas según el caso.
   */
  private async requestMessage(
    allowTools: boolean
  ): Promise<OpenAI.Chat.Completions.ChatCompletionMessage | null> {
    const completion = await this.client.chat.completions.create({
      model: MODEL,
      messages: this.conversation,
      tools: allowTools ? fileTools : undefined,
      tool_choice: allowTools ? "auto" : undefined
    });

    return completion.choices[0]?.message ?? null;
  }

  /**
   * Añade la respuesta del asistente al historial.
   */
  private appendAssistant(content: string): void {
    this.conversation.push({ role: "assistant", content });
  }
}

function hasToolCalls(
  message: OpenAI.Chat.Completions.ChatCompletionMessage | null
): message is OpenAI.Chat.Completions.ChatCompletionMessage & {
  tool_calls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[];
} {
  return Boolean(message?.tool_calls && message.tool_calls.length);
}

/**
 * Si el modelo no insertó enlaces de descarga, añadimos la salida cruda
 * de las herramientas al final para no perder información útil.
 */
function appendToolFallback(finalContent: string, toolOutputs: string[]): string {
  if (!toolOutputs.length) return finalContent;
  const hasDownload =
    /\/api\/download\//.test(finalContent) || /<a\s/i.test(finalContent);
  if (hasDownload) return finalContent;
  return `${finalContent}\n\n${toolOutputs.join("\n\n")}`;
}
