import chalk from "chalk";
import { OpenAI } from "openai";
import fs from "fs/promises";
import path from "path";
import readline from "readline";

const MODEL = "openai/gpt-oss-20b";
const BASE_URL = process.env.OPENAI_BASE_URL ?? "http://127.0.0.1:1234/v1";
const API_KEY = process.env.OPENAI_API_KEY ?? "not-needed";

const client = new OpenAI({
  apiKey: API_KEY,
  baseURL: BASE_URL
});

type Role = "system" | "user" | "assistant";

interface Message {
  role: Role;
  content: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
  name?: string;
}

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
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
            description: "Máximo de bytes a leer (por defecto 200000)"
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

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: chalk.green("tú > ")
});

const intro = `${chalk.bold("Agente GPT OSS (CLI)")}
Base: ${BASE_URL} | Modelo: ${MODEL}
Escribe ${chalk.cyan("/salir")} para terminar o ${chalk.cyan("/borrar")} para limpiar el contexto.`;

console.log(intro);

const conversation: Message[] = [
  {
    role: "system",
    content: "Eres un asistente útil y conciso."
  }
];

async function sendMessage(prompt: string) {
  conversation.push({ role: "user", content: prompt });

  try {
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: conversation,
      tools,
      tool_choice: "auto"
    });

    const message = completion.choices[0]?.message;
    if (!message) {
      console.error(chalk.red("Respuesta vacía del modelo."));
      return;
    }

    if (message.tool_calls && message.tool_calls.length > 0) {
      conversation.push({
        role: "assistant",
        content: message.content ?? "",
        tool_calls: message.tool_calls
      });

      for (const toolCall of message.tool_calls) {
        await handleToolCall(toolCall);
      }

      // Segunda llamada para que el modelo conteste tras los resultados de herramientas
      const second = await client.chat.completions.create({
        model: MODEL,
        messages: conversation
      });

      const finalMessage = second.choices[0]?.message;
      if (finalMessage?.content) {
        conversation.push({ role: "assistant", content: finalMessage.content });
        printAssistant(finalMessage.content);
      }
      return;
    }

    if (message.content) {
      conversation.push({ role: "assistant", content: message.content });
      printAssistant(message.content);
    }
  } catch (error) {
    console.error(chalk.red("Error al llamar al modelo:"), error);
  }
}

function printAssistant(text: string) {
  process.stdout.write(chalk.blue("agente > ") + text + "\n");
}

async function handleToolCall(toolCall: {
  id: string;
  function: { name: string; arguments: string };
}) {
  const { name, arguments: argsJson } = toolCall.function;
  let result: string;

  try {
    if (name === "read_file") {
      const args = JSON.parse(argsJson) as { file_path: string; max_bytes?: number };
      result = await readFileTool(args.file_path, args.max_bytes);
    } else if (name === "write_file") {
      const args = JSON.parse(argsJson) as { file_path: string; content: string; mode?: "replace" | "append" };
      result = await writeFileTool(args.file_path, args.content, args.mode);
    } else {
      result = `Herramienta desconocida: ${name}`;
    }
  } catch (err) {
    result = `Error ejecutando ${name}: ${(err as Error).message}`;
  }

  conversation.push({
    role: "tool",
    name,
    content: result,
    tool_call_id: toolCall.id
  } as unknown as Message); // type cast por compatibilidad
}

async function readFileTool(filePath: string, maxBytes = 200_000): Promise<string> {
  const resolved = path.resolve(process.cwd(), filePath);
  const data = await fs.readFile(resolved);
  if (data.length > maxBytes) {
    const slice = data.subarray(0, maxBytes).toString("utf8");
    return `Leídos ${maxBytes} bytes de ${resolved} (archivo truncado).\n\n${slice}`;
  }
  return data.toString("utf8");
}

async function writeFileTool(filePath: string, content: string, mode: "replace" | "append" = "replace"): Promise<string> {
  const resolved = path.resolve(process.cwd(), filePath);
  if (mode === "append") {
    await fs.appendFile(resolved, content);
    return `Contenido añadido a ${resolved}`;
  }
  await fs.writeFile(resolved, content);
  return `Archivo sobrescrito en ${resolved}`;
}

function handleCommand(input: string): boolean {
  if (input === "/salir") {
    rl.close();
    return true;
  }

  if (input === "/borrar") {
    conversation.splice(1); // preserva system prompt
    console.log(chalk.yellow("Contexto borrado."));
    return true;
  }

  return false;
}

async function main() {
  rl.prompt();

  for await (const line of rl) {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      continue;
    }

    const handled = handleCommand(input);
    if (handled) {
      if (!rl.closed) rl.prompt();
      continue;
    }

    await sendMessage(input);
    rl.prompt();
  }
}

main().catch((err) => {
  console.error(chalk.red("Fallo inesperado:"), err);
  process.exit(1);
});
