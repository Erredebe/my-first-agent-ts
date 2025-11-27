import { OpenAI } from "openai";

export type MessageParam = OpenAI.Chat.Completions.ChatCompletionMessageParam;
export type ToolCall = OpenAI.Chat.Completions.ChatCompletionMessageToolCall;

export interface ChatOptions {
  model: string;
}
