import fs from "fs/promises";
import path from "path";
import { DEFAULT_MAX_READ_BYTES } from "../config/index.js";
import { createDownloadToken } from "../server/downloads.js";
export const fileTools = [
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
export async function executeFileToolCall(toolCall) {
    const { name, arguments: argsJson } = toolCall.function;
    let content;
    try {
        if (name === "read_file") {
            const args = JSON.parse(argsJson);
            content = await readFileTool(args.file_path, args.max_bytes ?? DEFAULT_MAX_READ_BYTES);
        }
        else if (name === "prepare_file_download") {
            const args = JSON.parse(argsJson);
            content = await prepareFileDownloadTool(args.file_path, args.content, args.mode);
        }
        else if (name === "prepare_download") {
            const args = JSON.parse(argsJson);
            content = await prepareDownloadTool(args.file_path);
        }
        else if (name === "write_file") {
            const args = JSON.parse(argsJson);
            content = await writeFileTool(args.file_path, args.content, args.mode);
        }
        else {
            content = `Herramienta desconocida: ${name}`;
        }
    }
    catch (error) {
        content = `Error ejecutando ${name}: ${error.message}`;
    }
    return {
        role: "tool",
        tool_call_id: toolCall.id,
        content
    };
}
async function readFileTool(filePath, maxBytes) {
    const resolved = path.resolve(process.cwd(), filePath);
    const data = await fs.readFile(resolved);
    if (data.length > maxBytes) {
        const slice = data.subarray(0, maxBytes).toString("utf8");
        return `Leídos ${maxBytes} bytes de ${resolved} (archivo truncado).\n\n${slice}`;
    }
    return data.toString("utf8");
}
async function writeFileTool(filePath, content, mode = "replace") {
    const resolved = path.resolve(process.cwd(), filePath);
    if (mode === "append") {
        await fs.appendFile(resolved, content);
        return `Contenido añadido a ${resolved}`;
    }
    await fs.writeFile(resolved, content);
    return `Archivo sobrescrito en ${resolved}`;
}
async function prepareDownloadTool(filePath) {
    const resolved = path.resolve(process.cwd(), filePath);
    await fs.access(resolved);
    const token = await createDownloadToken(resolved);
    const href = `/api/download/${token}`;
    return `Descarga lista: ${href}\n<a href="${href}" download="${path.basename(resolved)}">Descargar ${path.basename(resolved)}</a>`;
}
async function prepareFileDownloadTool(filePath, content, mode = "replace") {
    const resolved = path.resolve(process.cwd(), filePath);
    if (mode === "append") {
        await fs.appendFile(resolved, content);
    }
    else {
        await fs.writeFile(resolved, content);
    }
    const token = await createDownloadToken(resolved);
    const href = `/api/download/${token}`;
    const filename = path.basename(resolved);
    return `Archivo listo y guardado en ${resolved}\nDescarga: ${href}\n<a href="${href}" download="${filename}">Descargar ${filename}</a>`;
}
