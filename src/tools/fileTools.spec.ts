import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { executeFileToolCall } from "./fileTools.js";
import type { ToolCall } from "../core/types.js";

const tmpRoot = path.join(os.tmpdir(), "agente-ia-tests");

beforeAll(async () => {
  await fs.mkdir(tmpRoot, { recursive: true });
});

function buildToolCall(
  name: string,
  args: Record<string, unknown>
): ToolCall {
  return {
    id: `${name}-id`,
    type: "function",
    function: {
      name,
      arguments: JSON.stringify(args)
    }
  } as unknown as ToolCall;
}

describe("fileTools", () => {
  it("lee y trunca archivos grandes con read_file", async () => {
    const filePath = path.join(tmpRoot, "trunc.txt");
    await fs.writeFile(filePath, "abcdefghijk");

    const toolCall = buildToolCall("read_file", {
      file_path: filePath,
      max_bytes: 4
    });

    const result = await executeFileToolCall(toolCall);
    expect(result.content).toContain("Leídos 4 bytes");
    expect(result.content).toContain("abcd");
  });

  it("escribe y añade contenido con write_file", async () => {
    const filePath = path.join(tmpRoot, "write.txt");

    const replaceCall = buildToolCall("write_file", {
      file_path: filePath,
      content: "uno",
      mode: "replace"
    });
    await executeFileToolCall(replaceCall);

    const appendCall = buildToolCall("write_file", {
      file_path: filePath,
      content: " dos",
      mode: "append"
    });
    await executeFileToolCall(appendCall);

    const content = await fs.readFile(filePath, "utf8");
    expect(content).toBe("uno dos");
  });

  it("genera enlace de descarga para archivo existente", async () => {
    const filePath = path.join(tmpRoot, "download.txt");
    await fs.writeFile(filePath, "descarga");

    const toolCall = buildToolCall("prepare_download", { file_path: filePath });
    const result = await executeFileToolCall(toolCall);

    expect(result.content).toContain("/api/download/");
    expect(result.content).toContain("Descargar");
  });

  it("crea archivo y devuelve enlace de descarga con prepare_file_download", async () => {
    const filePath = path.join(tmpRoot, "prep-download.txt");
    const toolCall = buildToolCall("prepare_file_download", {
      file_path: filePath,
      content: "contenido"
    });

    const result = await executeFileToolCall(toolCall);
    expect(result.content).toContain("/api/download/");

    const content = await fs.readFile(filePath, "utf8");
    expect(content).toBe("contenido");
  });
});
