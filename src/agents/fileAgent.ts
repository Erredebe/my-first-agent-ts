import { executeFileToolCall } from "../tools/fileTools.js";
import { ToolCall } from "../core/types.js";
import { Logger } from "../core/logger.js";

export type FileAction =
  | "read"
  | "write"
  | "prepare_download"
  | "prepare_file_download"
  | "convert_to_base64";

type ParsedCommand = {
  action: FileAction;
  path: string;
  content?: string;
  maxBytes?: number;
  mode?: "replace" | "append";
};

/**
 * Agente especializado en operaciones de archivos.
 * Encapsula las herramientas ya existentes para ofrecer una interfaz
 * simple al orquestador sin depender del modelo.
 */
export class FileAgent {
  constructor(private readonly source: string = "orchestrator") {}

  /**
   * Entrada principal desde el orquestador. Devuelve un texto listo
   * para el usuario o un mensaje de error amigable.
   */
  async handleRequest(rawInput: string): Promise<string> {
    const parsed = this.parseCommand(rawInput);
    if (!parsed) {
      return "No pude identificar qué hacer con ese archivo. Usa un formato como `/file read ruta.txt` o `/file write ruta.txt Contenido`.";
    }

    try {
      return await this.runTool(parsed);
    } catch (error) {
      Logger.error("Fallo en FileAgent", error, "FileAgent");
      return (
        "Hubo un problema al operar con el archivo. " +
        (error instanceof Error ? error.message : String(error))
      );
    }
  }

  private async runTool(command: ParsedCommand): Promise<string> {
    const args: Record<string, unknown> = { file_path: command.path };
    let toolName: string;

    switch (command.action) {
      case "read":
        toolName = "read_file";
        if (command.maxBytes) args.max_bytes = command.maxBytes;
        break;
      case "convert_to_base64":
        toolName = "convert_file_to_base64";
        if (command.maxBytes) args.max_bytes = command.maxBytes;
        break;
      case "prepare_download":
        toolName = "prepare_download";
        break;
      case "prepare_file_download":
        toolName = "prepare_file_download";
        args.content = command.content ?? "";
        args.mode = command.mode ?? "replace";
        break;
      case "write":
        toolName = "write_file";
        args.content = command.content ?? "";
        args.mode = command.mode ?? "replace";
        break;
      default:
        throw new Error(`Acción de archivo no soportada: ${command.action}`);
    }

    const toolCall: ToolCall = {
      id: `file_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: "function",
      function: {
        name: toolName,
        arguments: JSON.stringify(args),
      },
    };

    const result = await executeFileToolCall(toolCall);
    return typeof result.content === "string"
      ? result.content
      : JSON.stringify(result.content);
  }

  /**
   * Admite formatos como:
   * - /file read ruta.txt
   * - /file write ruta.txt contenido libre...
   * - /file append ruta.txt contenido
   * - leer archivo notas.md
   * - prepara descarga notas.md
   */
  private parseCommand(text: string): ParsedCommand | null {
    const normalized = text.trim();
    if (!normalized) return null;

    const lower = normalized.toLowerCase();
    const tokens = normalized.split(/\s+/);
    const startsWithFile =
      tokens[0] === "/file" ||
      tokens[0] === "/archivo" ||
      tokens[0] === "/fichero";

    // --- Detección explícita con prefijos ---
    if (startsWithFile) {
      const actionToken = tokens[1];
      const rest = tokens.slice(2).join(" ").trim();
      if (!actionToken || !rest) return null;

      // read / base64 / download / write
      if (["read", "leer"].includes(actionToken)) {
        const [path, maxBytes] = rest.split(/\s+/, 2);
        return {
          action: "read",
          path,
          maxBytes: this.toNumber(maxBytes),
        };
      }

      if (["base64", "convert", "convertir"].includes(actionToken)) {
        const [path, maxBytes] = rest.split(/\s+/, 2);
        return {
          action: "convert_to_base64",
          path,
          maxBytes: this.toNumber(maxBytes),
        };
      }

      if (["download", "descarga", "prepare_download"].includes(actionToken)) {
        return { action: "prepare_download", path: rest };
      }

      if (["prepare_file_download", "share"].includes(actionToken)) {
        const [path, ...contentParts] = rest.split(/\s+/);
        return {
          action: "prepare_file_download",
          path,
          content: contentParts.join(" "),
        };
      }

      // write/append
      if (["write", "escribir", "guardar", "append"].includes(actionToken)) {
        const [path, ...contentParts] = rest.split(/\s+/);
        const mode: "replace" | "append" =
          actionToken === "append" ? "append" : "replace";
        return {
          action: "write",
          path,
          content: contentParts.join(" "),
          mode,
        };
      }
    }

    // --- Heurísticas simples ---
    const readMatch = normalized.match(
      /(leer|abrir|ver)\s+(el\s+)?(archivo|fichero)\s+([^\s]+)/i
    );
    if (readMatch) {
      return { action: "read", path: readMatch[4] };
    }

    const writeMatch = normalized.match(
      /(escribir|guardar|sobrescribir|append|añadir).*(archivo|fichero)\s+([^\s]+)\s+(.+)/i
    );
    if (writeMatch) {
      const detectedPath = writeMatch[3];
      const pathIndex = normalized.toLowerCase().indexOf(detectedPath.toLowerCase());
      const content = pathIndex >= 0
        ? normalized.slice(pathIndex + detectedPath.length).trim()
        : writeMatch[4];
      return {
        action: "write",
        path: detectedPath,
        content,
      };
    }

    const downloadMatch = normalized.match(
      /(prepara|genera).*(descarga).*(archivo|fichero)\s+([^\s]+)/i
    );
    if (downloadMatch) {
      return { action: "prepare_download", path: downloadMatch[4] };
    }

    const base64Match = normalized.match(/base64\s+(de\s+)?(archivo|fichero)\s+([^\s]+)/i);
    if (base64Match) {
      return { action: "convert_to_base64", path: base64Match[3] };
    }

    return null;
  }

  private toNumber(value?: string): number | undefined {
    if (!value) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
}
