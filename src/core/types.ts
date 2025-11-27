import { OpenAI } from "openai";

// Tipos abreviados usados en el agente para mantener el código legible.
export type MessageParam = OpenAI.Chat.Completions.ChatCompletionMessageParam;
export type ToolCall = OpenAI.Chat.Completions.ChatCompletionMessageToolCall;

export interface ChatOptions {
  model: string;
}
