
import { setBackendType, setBaseURL, type BackendType } from "../config/index.js";

/**
 * Model information interface
 */
export interface ModelInfo {
  id: string;
  name: string;
  size?: string;
  family?: string;
  modified?: string;
  digest?: string;
}

/**
 * Detect which backend is available (LM Studio, Ollama, or Groq)
 */
export async function detectBackend(baseURL: string): Promise<BackendType | null> {
  const normalized = baseURL.replace(/\/$/, "");

  // Detect Groq (OpenAI-compatible) based on host
  try {
    const url = new URL(normalized);
    if (url.hostname.endsWith("groq.com")) {
      setBackendType("groq");
      if (!normalized.includes("/openai/v1")) {
        setBaseURL(`${normalized}/openai/v1`);
      }
      return "groq";
    }
  } catch (e) {
    // Ignore Groq detection errors
  }

  // Try LM Studio first (OpenAI-compatible /v1/models)
  try {
    const lmStudioUrl = normalized.includes("/v1")
      ? normalized + "/models"
      : normalized + "/v1/models";
    const resp = await fetch(lmStudioUrl, {
      signal: AbortSignal.timeout(2000),
    });
    if (resp.ok) {
      const body = await resp.json();
      if (body.data || body.models || Array.isArray(body)) {
        setBackendType("lm-studio");
        // Ensure baseURL includes /v1 for LM Studio
        if (!normalized.includes("/v1")) {
          setBaseURL(normalized + "/v1");
        }
        return "lm-studio";
      }
    }
  } catch (e) {
    // Ignore LM Studio detection errors
  }

  // Try Ollama (/api/tags)
  try {
    const url = new URL(normalized);
    const host = url.hostname;
    const ollamaUrl = `http://${host}:11434/api/tags`;
    const resp = await fetch(ollamaUrl, {
      signal: AbortSignal.timeout(2000),
    });
    if (resp.ok) {
      const body = await resp.json();
      if (body.models && Array.isArray(body.models)) {
        setBackendType("ollama");
        // Set Ollama's OpenAI-compatible endpoint
        setBaseURL(`http://${host}:11434/v1`);
        return "ollama";
      }
    }
  } catch (e) {
    // Ignore Ollama detection errors
  }

  return null;
}

/**
 * Fetch available models from the detected backend
 */
export async function fetchModelsForBackend(
  baseURL: string,
  backend: BackendType | null
): Promise<ModelInfo[]> {
  const normalized = baseURL.replace(/\/$/, "");

  if (backend === "ollama") {
    try {
      const url = new URL(normalized);
      const host = url.hostname;
      const ollamaUrl = `http://${host}:11434/api/tags`;
      const resp = await fetch(ollamaUrl);
      if (resp.ok) {
        const body = await resp.json();
        if (body.models && Array.isArray(body.models)) {
          return body.models.map((m: any) => ({
            id: m.name || m.model || m,
            name: m.name || m.model || m,
            size: m.size ? formatBytes(m.size) : undefined,
            family: m.details?.family || extractFamily(m.name),
            modified: m.modified_at,
            digest: m.digest,
          }));
        }
      }
    } catch (err) {
      // ignore
    }
  } else {
    // LM Studio (OpenAI-compatible)
    try {
      const lmStudioUrl = normalized.includes("/v1")
        ? normalized + "/models"
        : normalized + "/v1/models";
      const resp = await fetch(lmStudioUrl);
      if (resp.ok) {
        const body = await resp.json();
        let models: any[] = [];
        
        if (Array.isArray(body)) {
          models = body;
        } else if (body.data && Array.isArray(body.data)) {
          models = body.data;
        } else if (body.models && Array.isArray(body.models)) {
          models = body.models;
        }
        
        return models.map((m: any) => {
          const id = typeof m === "string" ? m : (m.id || m.name || m);
          return {
            id,
            name: id,
            size: m.size ? formatBytes(m.size) : undefined,
            family: extractFamily(id),
          };
        });
      }
    } catch (err) {
      // ignore
    }
  }

  return [];
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
}

/**
 * Extract model family from model name
 */
export function extractFamily(modelName: string): string | undefined {
  const name = modelName.toLowerCase();
  if (name.includes("llama")) return "llama";
  if (name.includes("gpt")) return "gpt";
  if (name.includes("mistral")) return "mistral";
  if (name.includes("deepseek")) return "deepseek";
  if (name.includes("phi")) return "phi";
  if (name.includes("gemma")) return "gemma";
  if (name.includes("qwen")) return "qwen";
  return undefined;
}
