import fs from "fs/promises";
import path from "path";
import { OpenAI } from "openai";
import { DEFAULT_MAX_READ_BYTES } from "../config/index.js";
import { ToolCall } from "../core/types.js";
import { createDownloadToken } from "../server/downloads.js";

/**
 * Definición pública de herramientas accesibles desde el modelo.
 * Se describe cada firma en JSON Schema para que el LLM pueda llamarlas.
 */
export const fileTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Lee un archivo de texto en el disco y devuelve su contenido",
      parameters: {
        type: "object",
        properties: {
          file_path: {
            type: "string",
            description: "Ruta del archivo a leer, relativa al proyecto o absoluta"
          },
          max_bytes: {
            type: "number",
            description: `Máximo de bytes a leer (por defecto ${DEFAULT_MAX_READ_BYTES})`
          }
        },
        required: ["file_path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "convert_file_to_base64",
      description:
        "Lee un archivo binario y devuelve su contenido en base64, truncándolo si excede el límite",
      parameters: {
        type: "object",
        properties: {
          file_path: {
            type: "string",
            description: "Ruta del archivo a codificar"
          },
          max_bytes: {
            type: "number",
            description: `Máximo de bytes a leer antes de codificar (por defecto ${DEFAULT_MAX_READ_BYTES})`
          }
        },
        required: ["file_path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "prepare_file_download",
      description: "Crea o sobreescribe un archivo y devuelve un enlace de descarga listo para el navegador",
      parameters: {
        type: "object",
        properties: {
          file_path: {
            type: "string",
            description: "Ruta del archivo a generar, relativa al proyecto o absoluta"
          },
          content: {
            type: "string",
            description: "Contenido a escribir en el archivo"
          },
          mode: {
            type: "string",
            enum: ["replace", "append"],
            description: "replace sobrescribe (default), append añade al final"
          }
        },
        required: ["file_path", "content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "prepare_download",
      description: "Genera un enlace de descarga para un archivo existente y accesible por el navegador",
      parameters: {
        type: "object",
        properties: {
          file_path: {
            type: "string",
            description: "Ruta del archivo a descargar, relativa al proyecto o absoluta"
          }
        },
        required: ["file_path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Escribe texto en un archivo (sobrescribe o añade)",
      parameters: {
        type: "object",
        properties: {
          file_path: {
            type: "string",
            description: "Ruta del archivo a escribir, relativa al proyecto o absoluta"
          },
          content: {
            type: "string",
            description: "Contenido a escribir"
          },
          mode: {
            type: "string",
            enum: ["replace", "append"],
            description: "replace sobrescribe (default), append añade al final"
          }
        },
        required: ["file_path", "content"]
      }
    }
  }
];

type HandlerArgs =
  | { file_path: string; max_bytes?: number }
  | { file_path: string; content: string; mode?: "replace" | "append" };

type ToolHandler = (args: HandlerArgs) => Promise<string>;

const toolHandlers: Record<string, ToolHandler> = {
  read_file: async (rawArgs) => {
    const args = rawArgs as { file_path: string; max_bytes?: number };
    return readFileTool(args.file_path, args.max_bytes ?? DEFAULT_MAX_READ_BYTES);
  },
  convert_file_to_base64: async (rawArgs) => {
    const args = rawArgs as { file_path: string; max_bytes?: number };
    return convertFileToBase64Tool(args.file_path, args.max_bytes ?? DEFAULT_MAX_READ_BYTES);
  },
  prepare_file_download: async (rawArgs) => {
    const args = rawArgs as { file_path: string; content: string; mode?: "replace" | "append" };
    return prepareFileDownloadTool(args.file_path, args.content, args.mode);
  },
  prepare_download: async (rawArgs) => {
    const args = rawArgs as { file_path: string };
    return prepareDownloadTool(args.file_path);
  },
  write_file: async (rawArgs) => {
    const args = rawArgs as { file_path: string; content: string; mode?: "replace" | "append" };
    return writeFileTool(args.file_path, args.content, args.mode);
  }
};

/**
 * Ejecuta la herramienta llamada por el modelo y devuelve un mensaje "tool"
 * listo para añadirse al historial de la conversación.
 */
export async function executeFileToolCall(
  toolCall: ToolCall
): Promise<OpenAI.Chat.Completions.ChatCompletionToolMessageParam> {
  const { name, arguments: argsJson } = toolCall.function;

  const handler = toolHandlers[name];
  let content: string;

  if (!handler) {
    content = `Herramienta desconocida: ${name}`;
  } else {
    try {
      const args = JSON.parse(argsJson) as HandlerArgs;
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

async function readFileTool(filePath: string, maxBytes: number): Promise<string> {
  const resolved = resolvePath(filePath);
  const data = await fs.readFile(resolved);
  if (data.length > maxBytes) {
    const slice = data.subarray(0, maxBytes).toString("utf8");
    return `Leídos ${maxBytes} bytes de ${resolved} (archivo truncado).\n\n${slice}`;
  }
  return data.toString("utf8");
}

async function convertFileToBase64Tool(
  filePath: string,
  maxBytes: number
): Promise<string> {
  const resolved = resolvePath(filePath);
  const data = await fs.readFile(resolved);
  const limited = data.length > maxBytes ? data.subarray(0, maxBytes) : data;
  const base64 = limited.toString("base64");
  const note =
    data.length > maxBytes
      ? `Archivo truncado a ${maxBytes} bytes antes de codificar.`
      : "Archivo codificado completo.";

  return [
    note,
    `Ruta: ${resolved}`,
    `Bytes originales: ${data.length}`,
    `Bytes codificados: ${limited.length}`,
    `Base64: ${base64}`
  ].join("\n");
}

async function writeFileTool(
  filePath: string,
  content: string,
  mode: "replace" | "append" = "replace"
): Promise<string> {
  const resolved = resolvePath(filePath);
  if (mode === "append") {
    await fs.appendFile(resolved, content);
    return `Contenido añadido a ${resolved}`;
  }
  await fs.writeFile(resolved, content);
  return `Archivo sobrescrito en ${resolved}`;
}

async function prepareDownloadTool(filePath: string): Promise<string> {
  const resolved = resolvePath(filePath);
  await fs.access(resolved);
  const token = await createDownloadToken(resolved);
  const href = `/api/download/${token}`;
  const filename = path.basename(resolved);
  return `Descarga lista: ${href}\n<a href="${href}" download="${filename}">Descargar ${filename}</a>`;
}

async function prepareFileDownloadTool(
  filePath: string,
  content: string,
  mode: "replace" | "append" = "replace"
): Promise<string> {
  const resolved = resolvePath(filePath);
  if (mode === "append") {
    await fs.appendFile(resolved, content);
  } else {
    await fs.writeFile(resolved, content);
  }
  const token = await createDownloadToken(resolved);
  const href = `/api/download/${token}`;
  const filename = path.basename(resolved);
  return `Archivo listo y guardado en ${resolved}\nDescarga: ${href}\n<a href="${href}" download="${filename}">Descargar ${filename}</a>`;
}

function resolvePath(p: string): string {
  return path.resolve(process.cwd(), p);
}
