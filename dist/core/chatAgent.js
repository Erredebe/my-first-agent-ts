import chalk from "chalk";
import { OpenAI } from "openai";
import { API_KEY, BASE_URL, MODEL, SYSTEM_PROMPT } from "../config/index.js";
import { fileTools, executeFileToolCall } from "../tools/fileTools.js";
export class ChatAgent {
    client = new OpenAI({ apiKey: API_KEY, baseURL: BASE_URL });
    conversation = [
        { role: "system", content: SYSTEM_PROMPT }
    ];
    async handleUserMessage(prompt) {
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
                const toolResult = await executeFileToolCall(call);
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
    resetContext() {
        this.conversation = [{ role: "system", content: SYSTEM_PROMPT }];
    }
    async createCompletion(messages, allowTools) {
        return this.client.chat.completions.create({
            model: MODEL,
            messages,
            tools: allowTools ? fileTools : undefined,
            tool_choice: allowTools ? "auto" : undefined
        });
    }
    printAssistant(text) {
        process.stdout.write(chalk.blue("agente > ") + text + "\n");
    }
}
