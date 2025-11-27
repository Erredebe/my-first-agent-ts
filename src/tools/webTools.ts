import { OpenAI } from "openai";
import { ToolCall } from "../core/types.js";
import { Logger } from "../core/logger.js";

const DEFAULT_MAX_RESPONSE_BYTES = 1_000_000; // 1MB

/**
 * Definición de herramientas web accesibles desde el modelo.
 */
export const webTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "fetch_url",
      description: "Obtiene el contenido de una URL (página web, API, etc.)",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "URL completa a obtener (debe empezar con http:// o https://)"
          },
          max_bytes: {
            type: "number",
            description: `Máximo de bytes a leer (por defecto ${DEFAULT_MAX_RESPONSE_BYTES})`
          }
        },
        required: ["url"]
      }
    }
  }
];

type WebToolArgs = { url: string; max_bytes?: number };
type WebToolHandler = (args: WebToolArgs) => Promise<string>;

const webToolHandlers: Record<string, WebToolHandler> = {
  fetch_url: async (args) => {
    return fetchUrlTool(args.url, args.max_bytes ?? DEFAULT_MAX_RESPONSE_BYTES);
  }
};

/**
 * Ejecuta la herramienta web llamada por el modelo.
 */
export async function executeWebToolCall(
  toolCall: ToolCall
): Promise<OpenAI.Chat.Completions.ChatCompletionToolMessageParam> {
  const { name, arguments: argsJson } = toolCall.function;

  const handler = webToolHandlers[name];
  let content: string;

  if (!handler) {
    content = `Herramienta desconocida: ${name}`;
  } else {
    try {
      const args = JSON.parse(argsJson) as WebToolArgs;
      content = await handler(args);
    } catch (error) {
      content = `Error ejecutando ${name}: ${(error as Error).message}`;
    }
  }

  return {
    role: "tool",
    tool_call_id: toolCall.id,
    content
  };
}

async function fetchUrlTool(url: string, maxBytes: number): Promise<string> {
  try {
    // Validación básica de URL
    const parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return `Error: Solo se permiten URLs http:// o https://`;
    }

    Logger.info(`Fetching URL: ${url}`, "WebTools");

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AgentBot/1.0)"
      },
      signal: AbortSignal.timeout(10000) // 10 segundos timeout
    });

    if (!response.ok) {
      return `Error HTTP ${response.status}: ${response.statusText}`;
    }

    // Leer el contenido
    const text = await response.text();

    // Crear enlace para ver la página
    const linkHtml = `[🔗 Ver página: ${url}](${url})`;

    // Truncar si es necesario
    if (text.length > maxBytes) {
      const truncated = text.substring(0, maxBytes);
      return `${linkHtml}\n\n**Contenido** (truncado a ${maxBytes} bytes de ${text.length} totales):\n\n${truncated}`;
    }

    return `${linkHtml}\n\n**Contenido:**\n\n${text}`;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes("fetch")) {
      return `Error de red al obtener ${url}: ${error.message}`;
    }
    return `Error al obtener ${url}: ${(error as Error).message}`;
  }
}
