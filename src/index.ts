import chalk from "chalk";
import { OpenAI } from "openai";
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
}

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
    const stream = await client.chat.completions.create({
      model: MODEL,
      messages: conversation,
      stream: true
    });

    const assistantReply: string[] = [];
    process.stdout.write(chalk.blue("agente > "));

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (delta) {
        assistantReply.push(delta);
        process.stdout.write(delta);
      }
    }

    process.stdout.write("\n");
    conversation.push({ role: "assistant", content: assistantReply.join("") });
  } catch (error) {
    console.error(chalk.red("Error al llamar al modelo:"), error);
  }
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
