import chalk from "chalk";
import readline from "readline";
import { ChatAgent } from "../core/chatAgent.js";
import { BASE_URL, MODEL, getConfig } from "../config/index.js";

const agent = new ChatAgent(getConfig());

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: chalk.green("tú > ")
});

const intro = `${chalk.bold("Agente GPT OSS (CLI)")}
Base: ${BASE_URL} | Modelo: ${MODEL}
Escribe ${chalk.cyan("/salir")} para terminar o ${chalk.cyan("/borrar")} para limpiar el contexto.`;

console.log(intro);

/**
 * Procesa comandos internos (no se envían al modelo).
 */
function handleCommand(input: string): "exit" | "handled" | "none" {
  if (input === "/salir") {
    rl.close();
    return "exit";
  }

  if (input === "/borrar") {
    agent.resetContext();
    console.log(chalk.yellow("Contexto borrado."));
    return "handled";
  }

  return "none";
}

async function main() {
  rl.prompt();

  for await (const line of rl) {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      continue;
    }

    const commandResult = handleCommand(input);
    if (commandResult === "exit") {
      break;
    }
    if (commandResult === "handled") {
      rl.prompt();
      continue;
    }

    const reply = await agent.sendMessage(input);
    if (reply) {
      process.stdout.write(chalk.blue("agente > ") + reply + "\n");
    } else {
      process.stdout.write(chalk.yellow("No se recibió respuesta del modelo.\n"));
    }
    rl.prompt();
  }
}

main().catch((err) => {
  console.error(chalk.red("Fallo inesperado:"), err);
  process.exit(1);
});
