import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: "./.env" });

import chalk from "chalk";
import readline from "readline";
import { ChatAgent } from "../core/chatAgent.js";
import {
  getConfig,
  getCurrentBaseURL,
  getCurrentModel,
  setModel,
  getDetectedBackend,
} from "../config/index.js";
import { detectBackend, fetchModelsForBackend } from "../core/llm.js";

const config = getConfig();
let agent = new ChatAgent(config);

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
    agent.resetContext();
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
        // Re-create agent with new config to ensure clean state or just update if supported (ChatAgent gets config by reference but constructor reads it once)
        // ChatAgent reads config in constructor. We might need to make sure it picks up the change or just create a new one.
        // The implementation in server/index.ts creates a new agent or updates, here we have a single agent.
        // Let's just create a new agent instance to be safe and simple.
        // But wait, 'agent' is const in global scope. We should change it to let or update it differently.
        // Inspecting file again: line 11: const agent = new ChatAgent(config);
        // We can't re-assign 'agent' if it is const.
        // We should just update the internal config of the agent if possible, or we need to change how agent is declared.
        // Checking ChatAgent: it has setSystemPrompt but not setModel.
        // However, config is passed by reference?
        // In ChatAgent constructor: this.config = config.
        // if we update config module's CURRENT_MODEL via setModel, getConfigs() returns a new object?
        // Server/index.ts: getConfig() returns { model: CURRENT_MODEL, ... } new object.
        // So modifying the global config doesn't affect the agent's copy used in constructor.
        // We need to allow updating the agent's model or re-create the agent.
        // For CLI, re-creating the agent is easiest.
        // I need to change 'const agent' to 'let agent'.
        console.log(chalk.green(`Modelo cambiado a: ${targetModel}`));
        // We will handle the agent update in the main loop or make agent a let.
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
      agent.setSystemPrompt(newPrompt);
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
        "\n⚠️  No se detectó ningún backend de LLM (LM Studio, Ollama o Groq).\n" +
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
      // Re-initialize agent with new settings
      const newConfig = getConfig();
      agent = new ChatAgent(newConfig);
      rl.prompt();
      continue;
    }
    if (commandResult === "handled") {
      rl.prompt();
      continue;
    }

    rl.pause();
    process.stdout.write(chalk.gray("Pensando..."));
    const reply = await agent.sendMessage(input);
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
