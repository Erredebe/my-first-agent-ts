import { OpenAI } from "openai";
import { ChatAgent } from "../core/chatAgent.js";
import { Config } from "../config/index.js";
import { FileAgent } from "./fileAgent.js";
import { WebAgent } from "./webAgent.js";
import { Logger } from "../core/logger.js";

export type AgentRoute = "chat" | "file" | "web";

type OrchestratorHistory = {
  from: "user" | "orchestrator" | AgentRoute;
  content: string;
  route?: AgentRoute;
  timestamp: number;
};

type AgentDependencies = {
  createChatAgent?: (config: Config) => ChatAgent;
  fileAgent?: FileAgent;
  webAgent?: WebAgent;
};

/**
 * Agente orquestador: decide qué agente debe atender cada petición,
 * coordina los sub-agentes y mantiene un historial general.
 */
export class OrchestratorAgent {
  private config: Config;
  private chatAgent: ChatAgent;
  private fileAgent: FileAgent;
  private webAgent: WebAgent;
  private readonly history: OrchestratorHistory[] = [];
  private readonly deps: Required<AgentDependencies>;

  constructor(config: Config, deps: AgentDependencies = {}) {
    this.config = { ...config };
    this.deps = {
      createChatAgent: deps.createChatAgent ?? ((cfg) => new ChatAgent(cfg)),
      fileAgent: deps.fileAgent ?? new FileAgent(),
      webAgent: deps.webAgent ?? new WebAgent(),
    };

    this.chatAgent = this.deps.createChatAgent(this.config);
    this.fileAgent = this.deps.fileAgent;
    this.webAgent = this.deps.webAgent;
  }

  /**
   * Entrada principal para CLI/servidor. Devuelve una respuesta lista
   * para el usuario, delegando en el agente más apropiado.
   */
  async sendMessage(
    input: string | OpenAI.Chat.Completions.ChatCompletionContentPart[],
    hint?: AgentRoute
  ): Promise<string | null> {
    const route = this.decideRoute(input, hint);
    this.pushHistory("user", typeof input === "string" ? input : "[contenido estructurado]", route);

    try {
      let reply: string | null;
      switch (route) {
        case "file":
          if (typeof input !== "string") {
            reply = await this.chatAgent.sendMessage(input);
          } else {
            reply = await this.fileAgent.handleRequest(input);
          }
          break;
        case "web":
          if (typeof input !== "string") {
            reply = await this.chatAgent.sendMessage(input);
          } else {
            reply = await this.webAgent.handleRequest(input);
          }
          break;
        case "chat":
        default:
          reply = await this.chatAgent.sendMessage(input);
          break;
      }

      if (reply) {
        this.pushHistory(route, reply, route);
      }
      return reply;
    } catch (error) {
      Logger.error("Fallo en el orquestador", error, "Orchestrator");
      const message =
        "El orquestador tuvo un problema al procesar tu petición. Intenta de nuevo o usa un comando directo (/file o /web).";
      this.pushHistory("orchestrator", message, route);
      return message;
    }
  }

  resetContext(): void {
    this.chatAgent.resetContext();
    this.history.length = 0;
  }

  setSystemPrompt(systemPrompt: string): void {
    this.config.systemPrompt = systemPrompt;
    this.chatAgent.setSystemPrompt(systemPrompt);
  }

  getSystemPrompt(): string {
    return this.config.systemPrompt;
  }

  setModel(model: string): void {
    this.config.model = model;
    this.chatAgent = this.deps.createChatAgent(this.config);
    this.history.length = 0;
  }

  getModel(): string {
    return this.config.model;
  }

  getHistory(): OrchestratorHistory[] {
    return [...this.history];
  }

  private pushHistory(
    from: "user" | "orchestrator" | AgentRoute,
    content: string,
    route?: AgentRoute
  ) {
    this.history.push({ from, content, route, timestamp: Date.now() });
  }

  /**
   * Selecciona el agente más apropiado usando reglas simples.
   */
  private decideRoute(
    input: string | OpenAI.Chat.Completions.ChatCompletionContentPart[],
    hint?: AgentRoute
  ): AgentRoute {
    if (hint) return hint;
    if (Array.isArray(input)) return "chat";

    const text = input.trim();
    const lower = text.toLowerCase();

    const hasWebSignal =
      lower.startsWith("/web") ||
      /buscar en la web|busca en la web|web search|buscar en internet/.test(lower);
    if (hasWebSignal) return "web";

    const hasFileSignal =
      lower.startsWith("/file") ||
      lower.startsWith("/archivo") ||
      lower.startsWith("/fichero") ||
      /(leer|escribir|guardar|abrir|ver).*(archivo|fichero)/.test(lower);
    if (hasFileSignal) return "file";

    const containsUrl = /https?:\/\/\S+/i.test(text);
    if (containsUrl && /web/.test(lower)) return "web";

    return "chat";
  }
}
