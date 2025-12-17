import { OpenAI } from "openai";
import { Config } from "../config/index.js";
import { fileTools, executeFileToolCall } from "../tools/fileTools.js";
import { webTools, executeWebToolCall } from "../tools/webTools.js";
import { MessageParam, ToolCall } from "./types.js";
import { Logger } from "./logger.js";

// Combinar todas las herramientas disponibles
const allTools = [...fileTools, ...webTools];

// Cache to track which models support tools
const modelToolSupport = new Map<string, boolean>();

/**
 * Pequeño orquestador que conserva el historial, invoca el modelo
 * y ejecuta herramientas cuando el modelo las solicita.
 */
export class ChatAgent {
  private readonly client: OpenAI;
  private readonly config: Config;

  // Historial de conversación que se envía en cada petición.
  private conversation: MessageParam[];
  
  // Track if this model supports tools
  private toolsSupported: boolean | null = null;

  constructor(config: Config) {
    this.config = config;
    this.client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });
    this.conversation = [{ role: "system", content: config.systemPrompt }];
    
    // Check cache for tool support
    const cached = modelToolSupport.get(config.model);
    if (cached !== undefined) {
      this.toolsSupported = cached;
    }
  }

  /**
   * Envía un mensaje del usuario, devuelve la respuesta del asistente
   * y gestiona llamadas a herramientas si el modelo las solicita.
   */
  async sendMessage(prompt: string): Promise<string | null> {
    const trimmed = prompt.trim();
    if (!trimmed) return null;

    this.conversation.push({ role: "user", content: trimmed });

    // Try with tools if we haven't determined support yet or if we know it's supported
    const shouldTryTools = this.toolsSupported !== false;
    const firstMessage = await this.requestMessage(shouldTryTools);
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
    this.conversation = [{ role: "system", content: this.config.systemPrompt }];
  }

  /**
   * Actualiza el system prompt y reinicia el contexto.
   */
  setSystemPrompt(systemPrompt: string): void {
    this.config.systemPrompt = systemPrompt;
    this.resetContext();
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
      const fallback = toolOutputs.join("\\n\\n");
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

    // Ejecución en paralelo
    const results = await Promise.all(
      toolCalls.map(async (call) => {
        try {
          Logger.info(`Executing tool: ${call.function.name}`, "ChatAgent");
          // Determinar qué executor usar según el nombre de la herramienta
          const isWebTool = webTools.some(t => t.function.name === call.function.name);
          const toolResult = isWebTool 
            ? await executeWebToolCall(call as ToolCall)
            : await executeFileToolCall(call as ToolCall);
          return toolResult;
        } catch (error) {
          Logger.error(`Error executing tool ${call.function.name}`, error, "ChatAgent");
          return {
            role: "tool",
            tool_call_id: call.id,
            content: `Error executing tool: ${error instanceof Error ? error.message : String(error)}`
          } as OpenAI.Chat.Completions.ChatCompletionToolMessageParam;
        }
      })
    );

    for (const result of results) {
       if (typeof result.content === "string") {
        outputs.push(result.content);
      }
      this.conversation.push(result);
    }

    return outputs;
  }

  /**
   * Invoca al modelo. Puede habilitar o no las herramientas según el caso.
   */
  private async requestMessage(
    allowTools: boolean
  ): Promise<OpenAI.Chat.Completions.ChatCompletionMessage | null> {
    try {
      const completion = await this.client.chat.completions.create({
        model: this.config.model,
        messages: this.conversation,
        tools: allowTools ? allTools : undefined,
        tool_choice: allowTools ? "auto" : undefined
      });

      // If we successfully used tools, mark as supported
      if (allowTools && this.toolsSupported === null) {
        this.toolsSupported = true;
        modelToolSupport.set(this.config.model, true);
        Logger.info(`Model ${this.config.model} supports tools`, "ChatAgent");
      }

      return completion.choices[0]?.message ?? null;
    } catch (error) {
      // Check if error is due to tools not being supported
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isToolError = errorMessage.includes("does not support tools") || 
                         (errorMessage.includes("tool") && errorMessage.includes("not supported"));
      
      if (isToolError && allowTools) {
        Logger.info(`Model ${this.config.model} does not support tools, retrying without tools`, "ChatAgent");
        
        // Mark model as not supporting tools
        this.toolsSupported = false;
        modelToolSupport.set(this.config.model, false);
        
        // Retry without tools
        return this.requestMessage(false);
      }
      
      Logger.error("Error requesting message from OpenAI", error, "ChatAgent");
      return null;
    }
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
