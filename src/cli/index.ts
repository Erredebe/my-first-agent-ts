import chalk from "chalk";
import readline from "readline";
import { OrchestratorAgent } from "../agents/orchestratorAgent.js";
import {
  getConfig,
  getCurrentBaseURL,
  getCurrentModel,
  setModel,
  getDetectedBackend,
} from "../config/index.js";
import {
  detectBackend,
  fetchModelsForBackend,
} from "../core/llm.js";

const config = getConfig();
let orchestrator = new OrchestratorAgent(config);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: chalk.green("tú > "),
});

const intro = `${chalk.bold("Agente RDB (CLI)")}
Base: ${getCurrentBaseURL()} | Modelo: ${getCurrentModel()}

Comandos disponibles:
 ${chalk.cyan("/model")}           Listar modelos disponibles
 ${chalk.cyan("/model <idx|nombre>")} Cambiar de modelo (por índice o nombre)
 ${chalk.cyan("/system")}          Ver system prompt actual
 ${chalk.cyan("/system <texto>")}  Cambiar system prompt
 ${chalk.cyan("/borrar")}          Limpiar contexto
 ${chalk.cyan("/salir")}           Salir`;

console.log(intro);

/**
 * Procesa comandos internos (no se envían al modelo).
 */
/**
 * Procesa comandos internos (no se envían al modelo).
 */
async function handleCommand(
  input: string
): Promise<"exit" | "handled" | "none" | "reload_agent"> {
  if (input === "/salir") {
    rl.close();
    return "exit";
  }

  if (input === "/borrar") {
    orchestrator.resetContext();
    console.log(chalk.yellow("Contexto borrado."));
    return "handled";
  }

  if (input.startsWith("/model")) {
    const parts = input.split(" ");
    if (parts.length === 1) {
      // List models
      const backend = getDetectedBackend();
      const models = await fetchModelsForBackend(getCurrentBaseURL(), backend);
      console.log(chalk.cyan("Modelos disponibles:"));
      models.forEach((m, index) => {
        const isCurrent = m.id === getCurrentModel();
        console.log(
          ` ${chalk.gray(`[${index + 1}]`)} ${
            isCurrent ? chalk.green("*") : " "
          } ${chalk.bold(m.id)} ${m.size ? `(${m.size})` : ""}`
        );
      });
    } else {
      // Set model
      let targetModel = parts[1];
      if (targetModel) {
        // Resolve index if numeric
        const index = parseInt(targetModel, 10);
        if (!isNaN(index)) {
          const backend = getDetectedBackend();
          const models = await fetchModelsForBackend(
            getCurrentBaseURL(),
            backend
          );
          if (index >= 1 && index <= models.length) {
            targetModel = models[index - 1].id;
          } else {
            console.log(chalk.red("❌ Índice de modelo no válido."));
            return "handled";
          }
        }

        setModel(targetModel);
        console.log(chalk.green(`Modelo cambiado a: ${targetModel}`));
        return "reload_agent"; 
      }
    }
    return "handled";
  }

  if (input.startsWith("/system")) {
    const parts = input.split(" ");
    if (parts.length === 1) {
      console.log(chalk.cyan("System Prompt actual:"));
      console.log(chalk.italic(config.systemPrompt));
    } else {
      const newPrompt = parts.slice(1).join(" ");
      orchestrator.setSystemPrompt(newPrompt);
      console.log(chalk.green("System Prompt actualizado."));
    }
    return "handled";
  }

  return "none";
}

async function main() {
  console.log(chalk.gray("Comprobando estado del servidor LLM..."));
  const backend = await detectBackend(getCurrentBaseURL());
  if (!backend) {
    console.log(
      chalk.red(
        "\n⚠️  No se detectó ningún backend de LLM (LM Studio u Ollama).\n" +
          "Asegúrate de que está ejecutándose y accesible en " +
          getCurrentBaseURL()
      )
    );
  } else {
    console.log(chalk.green(`✅ Conectado a ${backend}`));
  }

  rl.prompt();

  for await (const line of rl) {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      continue;
    }

    const commandResult = await handleCommand(input);
    if (commandResult === "exit") {
      break;
    }
    if (commandResult === "reload_agent") {
      const newConfig = getConfig();
      orchestrator = new OrchestratorAgent(newConfig);
      rl.prompt();
      continue;
    }
    if (commandResult === "handled") {
      rl.prompt();
      continue;
    }

    rl.pause();
    process.stdout.write(chalk.gray("Pensando..."));
    const reply = await orchestrator.sendMessage(input);
    process.stdout.write("\r\x1b[K");
    rl.resume();
    if (reply) {
      process.stdout.write(chalk.blue("agente > ") + reply + "\n");
    } else {
      process.stdout.write(
        chalk.yellow("No se recibió respuesta del modelo.\n")
      );
    }
    rl.prompt();
  }
}

main().catch((err) => {
  console.error(chalk.red("Fallo inesperado:"), err);
  process.exit(1);
});
