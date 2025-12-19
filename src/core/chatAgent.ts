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

  // Límite de iteraciones para evitar bucles infinitos
  private readonly MAX_ITERATIONS = 5;

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
   * Inyecta la descripción de las herramientas en el system prompt para modelos sin soporte nativo.
   */
  private injectToolDefinitions(): void {
    const definitions = allTools.map(t => {
      return `- **${t.function.name}**: ${t.function.description}\n  Args: ${JSON.stringify(t.function.parameters)}`;
    }).join("\n");
    
    const toolInstruction = `\n\nHerramientas disponibles:\n${definitions}\n\nPara llamar a una herramienta usa el formato:\nTOOL_CALL: name="nombre" arguments={"arg": "valor"}`;
    
    if (this.conversation[0].role === "system") {
      // Evitar duplicados
      if (!this.conversation[0].content.includes("Herramientas disponibles:")) {
        this.conversation[0].content += toolInstruction;
      }
    }
  }

  /**
   * Envía un mensaje del usuario, devuelve la respuesta del asistente
   * y gestiona llamadas a herramientas si el modelo las solicita.
   */
  async sendMessage(
    prompt: string | OpenAI.Chat.Completions.ChatCompletionContentPart[]
  ): Promise<string | null> {
    const isArray = Array.isArray(prompt);
    const content = isArray ? prompt : (typeof prompt === "string" ? prompt.trim() : prompt);
    if (isArray && !prompt.length) return null;
    if (!isArray && !content) return null;

    // Fix type error by casting to any or using correct type
    this.conversation.push({ role: "user", content: content as any });

    // Si hay imagenes adjuntas, no usamos tools para forzar vision
    const hasImages =
      isArray &&
      (content as OpenAI.Chat.Completions.ChatCompletionContentPart[]).some(
        (p) => p.type === "image_url"
      );

    // Iterative logic to support multiple tool calls in sequence
    let iteration = 0;
    const allToolOutputs: string[] = [];

    while (iteration < this.MAX_ITERATIONS) {
      iteration++;
      
      // Try with tools only when allowed and supported
      const shouldTryTools = !hasImages && this.toolsSupported !== false;
      
      // Si sabemos que no soporta tools nativas, nos aseguramos de que tenga las instrucciones
      if (!hasImages && this.toolsSupported === false) {
        this.injectToolDefinitions();
      }

      const message = await this.requestMessage(shouldTryTools);
      if (!message) return null;

      // 1. Detect tool calls (native or manual)
      const nativeToolCalls = message.tool_calls || [];
      const manualToolCalls = this.parseManualToolCalls(message.content || "");
      
      if (nativeToolCalls.length === 0 && manualToolCalls.length === 0) {
        // No more tools needed, return final content
        if (message.content) {
          const finalReply = appendToolFallback(message.content, allToolOutputs);
          this.appendAssistant(finalReply);
          return finalReply;
        }
        
        if (allToolOutputs.length > 0) {
          const fallback = allToolOutputs.join("\n\n");
          this.appendAssistant(fallback);
          return fallback;
        }

        return null;
      }

      // 2. Handle tool calls
      let currentOutputs: string[] = [];
      if (nativeToolCalls.length > 0) {
        currentOutputs = await this.handleNativeToolFlow(message);
      } else if (manualToolCalls.length > 0) {
        currentOutputs = await this.handleManualToolFlow(message, manualToolCalls);
      }
      
      allToolOutputs.push(...currentOutputs);
      // Continue to next iteration to give the model the results
    }

    Logger.warn(`Max iterations (${this.MAX_ITERATIONS}) reached for ${this.config.model}`, "ChatAgent");
    return "Lo siento, he alcanzado el límite de pasos para completar esta tarea.";
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
   * Gestiona la ruta "el modelo pidió herramientas nativas".
   */
  private async handleNativeToolFlow(
    toolCallingMessage: OpenAI.Chat.Completions.ChatCompletionMessage
  ): Promise<string[]> {
    this.conversation.push({
      role: "assistant",
      content: toolCallingMessage.content ?? null,
      tool_calls: toolCallingMessage.tool_calls
    });

    return this.runToolCalls(toolCallingMessage.tool_calls ?? []);
  }

  /**
   * Gestiona la ruta "el modelo pidió herramientas manualmente".
   */
  private async handleManualToolFlow(
    message: OpenAI.Chat.Completions.ChatCompletionMessage,
    manualCalls: ToolCall[]
  ): Promise<string[]> {
    this.appendAssistant(message.content || "");
    return this.runToolCalls(manualCalls);
  }

  /**
   * Ejecuta todas las tool_calls y agrega los mensajes "tool" al historial.
   */
  private async runToolCalls(
    toolCalls: ToolCall[]
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
            content: `Error: El comando falló con el mensaje: ${error instanceof Error ? error.message : String(error)}. Revisa los parámetros e inténtalo de nuevo.`
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
        if (completion.choices[0]?.message.tool_calls) {
          this.toolsSupported = true;
          modelToolSupport.set(this.config.model, true);
          Logger.info(`Model ${this.config.model} supports native tools`, "ChatAgent");
        }
      }

      return completion.choices[0]?.message ?? null;
    } catch (error) {
      // Check if error is due to tools not being supported
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isToolError = errorMessage.includes("does not support tools") || 
                         (errorMessage.includes("tool") && errorMessage.includes("not supported"));
      
      if (isToolError && allowTools) {
        Logger.info(`Model ${this.config.model} does not support native tools, switching to manual mode`, "ChatAgent");
        
        // Mark model as not supporting tools
        this.toolsSupported = false;
        modelToolSupport.set(this.config.model, false);
        
        // Retry without tools (manual mode will take over in sendMessage loop)
        return this.requestMessage(false);
      }
      
      Logger.error("Error requesting message from OpenAI", error, "ChatAgent");
      return null;
    }
  }

  /**
   * Parsea llamadas a herramientas manuales en el texto.
   * Formato esperado: TOOL_CALL: name="nombre" arguments={...}
   */
  private parseManualToolCalls(content: string): ToolCall[] {
    const toolCalls: ToolCall[] = [];
    const regex = /TOOL_CALL:\s*name=["']([^"']+)["']\s*arguments=({.*})/g;
    
    let match;
    while ((match = regex.exec(content)) !== null) {
      const name = match[1];
      const argsStr = match[2];
      try {
        // Generar un ID aleatorio para la llamada manual
        const id = "call_" + Math.random().toString(36).substring(2, 11);
        toolCalls.push({
          id,
          type: "function",
          function: {
            name,
            arguments: argsStr
          }
        });
      } catch (e) {
        Logger.error(`Error parsing manual tool call arguments: ${argsStr}`, e, "ChatAgent");
      }
    }
    
    return toolCalls;
  }

  /**
   * Añade la respuesta del asistente al historial.
   */
  private appendAssistant(content: string): void {
    if (content) {
      this.conversation.push({ role: "assistant", content });
    }
  }
}

/**
 * Verifica si un mensaje contiene tool_calls.
 */
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
