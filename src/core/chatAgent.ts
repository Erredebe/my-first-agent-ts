import { OpenAI } from "openai";
import { API_KEY, BASE_URL, MODEL, SYSTEM_PROMPT } from "../config/index.js";
import { fileTools, executeFileToolCall } from "../tools/fileTools.js";
import { MessageParam, ToolCall } from "./types.js";

export class ChatAgent {
  private client = new OpenAI({ apiKey: API_KEY, baseURL: BASE_URL });
  private conversation: MessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT }
  ];

  async sendMessage(prompt: string): Promise<string | null> {
    this.conversation.push({ role: "user", content: prompt });

    const first = await this.createCompletion(this.conversation, true);
    const firstMessage = first.choices[0]?.message;

    if (!firstMessage) {
      return null;
    }

    if (firstMessage.tool_calls?.length) {
      this.conversation.push({
        role: "assistant",
        content: firstMessage.content ?? null,
        tool_calls: firstMessage.tool_calls
      });

      const toolOutputs: string[] = [];
      for (const call of firstMessage.tool_calls) {
        const toolResult = await executeFileToolCall(call as ToolCall);
        if (typeof toolResult.content === "string") {
          toolOutputs.push(toolResult.content);
        }
        this.conversation.push(toolResult);
      }

      const second = await this.createCompletion(this.conversation, false);
      const finalMessage = second.choices[0]?.message;
      if (finalMessage?.content) {
        const reply = appendToolFallback(finalMessage.content, toolOutputs);
        this.conversation.push({ role: "assistant", content: reply });
        return reply;
      }

      if (toolOutputs.length) {
        const fallback = toolOutputs.join("\n\n");
        this.conversation.push({ role: "assistant", content: fallback });
        return fallback;
      }
      return null;
    }

    if (firstMessage.content) {
      this.conversation.push({ role: "assistant", content: firstMessage.content });
      return firstMessage.content;
    }

    return null;
  }

  resetContext(): void {
    this.conversation = [{ role: "system", content: SYSTEM_PROMPT }];
  }

  private async createCompletion(messages: MessageParam[], allowTools: boolean) {
    return this.client.chat.completions.create({
      model: MODEL,
      messages,
      tools: allowTools ? fileTools : undefined,
      tool_choice: allowTools ? "auto" : undefined
    });
  }
}

function appendToolFallback(finalContent: string, toolOutputs: string[]): string {
  if (!toolOutputs.length) return finalContent;
  const hasDownload = /\/api\/download\//.test(finalContent) || /<a\s/i.test(finalContent);
  if (hasDownload) return finalContent;
  return `${finalContent}\n\n${toolOutputs.join("\n\n")}`;
}
