import { executeWebToolCall } from "../tools/webTools.js";
import { ToolCall } from "../core/types.js";

export class WebAgent {
  async handleRequest(rawInput: string): Promise<string> {
    const url = this.extractUrl(rawInput);
    if (!url) {
      return "No encontré una URL para buscar en la web. Especifica una dirección completa, por ejemplo: /web https://ejemplo.com";
    }

    const toolCall: ToolCall = {
      id: `web_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: "function",
      function: {
        name: "fetch_url",
        arguments: JSON.stringify({ url }),
      },
    };

    const result = await executeWebToolCall(toolCall);
    return typeof result.content === "string"
      ? result.content
      : JSON.stringify(result.content);
  }

  private extractUrl(text: string): string | null {
    const match = text.match(/https?:\/\/[^\s]+/i);
    if (match) return match[0];

    const tokens = text.trim().split(/\s+/);
    if (tokens[0] === "/web" && tokens[1]) {
      return tokens[1];
    }

    return null;
  }
}
