import chalk from "chalk";
import { OpenAI } from "openai";
import { API_KEY, BASE_URL, MODEL, SYSTEM_PROMPT } from "./config.js";
import { executeToolCall, tools, ToolCall } from "./tools.js";

type MessageParam = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export class ChatAgent {
  private client = new OpenAI({ apiKey: API_KEY, baseURL: BASE_URL });
  private conversation: MessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT }
  ];

  async handleUserMessage(prompt: string): Promise<void> {
    this.conversation.push({ role: "user", content: prompt });

    const first = await this.createCompletion(this.conversation, true);
    const firstMessage = first.choices[0]?.message;

    if (!firstMessage) {
      console.error(chalk.red("Respuesta vacía del modelo."));
      return;
    }

    if (firstMessage.tool_calls?.length) {
      this.conversation.push({
        role: "assistant",
        content: firstMessage.content ?? null,
        tool_calls: firstMessage.tool_calls
      });

      for (const call of firstMessage.tool_calls) {
        const toolResult = await executeToolCall(call as ToolCall);
        this.conversation.push(toolResult);
      }

      const second = await this.createCompletion(this.conversation, false);
      const finalMessage = second.choices[0]?.message;
      if (finalMessage?.content) {
        this.conversation.push({ role: "assistant", content: finalMessage.content });
        this.printAssistant(finalMessage.content);
      }
      return;
    }

    if (firstMessage.content) {
      this.conversation.push({ role: "assistant", content: firstMessage.content });
      this.printAssistant(firstMessage.content);
    }
  }

  resetContext(): void {
    this.conversation = [{ role: "system", content: SYSTEM_PROMPT }];
  }

  private async createCompletion(messages: MessageParam[], allowTools: boolean) {
    return this.client.chat.completions.create({
      model: MODEL,
      messages,
      tools: allowTools ? tools : undefined,
      tool_choice: allowTools ? "auto" : undefined
    });
  }

  private printAssistant(text: string) {
    process.stdout.write(chalk.blue("agente > ") + text + "\n");
  }
}
