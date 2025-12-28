import {
  setBackendType,
  setBaseURL,
  type BackendType,
} from "../config/index.js";

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
export async function detectBackend(
  baseURL: string
): Promise<BackendType | null> {
  const normalized = baseURL.replace(/\/$/, "");

  // Detect Groq (OpenAI-compatible) based on host
  try {
    const url = new URL(normalized);
    if (url.hostname.endsWith("groq.com")) {
      console.log(`[LLM] Groq detectado por hostname: ${url.hostname}`);
      setBackendType("groq");
      // Groq typical endpoint is https://api.groq.com/openai/v1
      if (!normalized.includes("/openai/v1")) {
        // If it was just api.groq.com or api.groq.com/v1, fix it
        const base = normalized.split("/v1")[0].replace(/\/$/, "");
        const corrected = `${base}/openai/v1`;
        console.log(`[LLM] Corrigiendo URL de Groq: ${normalized} -> ${corrected}`);
        setBaseURL(corrected);
      }
      return "groq";
    }
  } catch (e) {
    // URL constructor failed? Try to fix if it looks like groq
    if (normalized.includes("groq.com")) {
       const corrected = normalized.startsWith("http") ? normalized : `https://${normalized}`;
       console.log(`[LLM] URL de Groq mal formada, intentando corregir: ${normalized} -> ${corrected}`);
       return detectBackend(corrected);
    }
  }

  // Try LM Studio first (OpenAI-compatible /v1/models)
  try {
    const modelsBase = normalized.includes("/v1") ? normalized : `${normalized}/v1`;
    const lmStudioUrl = `${modelsBase.replace(/\/$/, "")}/models`;
    
    const resp = await fetch(lmStudioUrl, {
      signal: AbortSignal.timeout(2000),
    });
    if (resp.ok) {
      const body = await resp.json();
      if (body.data || body.models || Array.isArray(body)) {
        console.log(`[LLM] LM Studio (u compatible OpenAI) detectado en ${normalized}`);
        setBackendType("lm-studio");
        // Ensure baseURL includes /v1 for LM Studio
        if (!normalized.includes("/v1")) {
          setBaseURL(normalized + "/v1");
        }
        return "lm-studio";
      }
    }
  } catch (e) {
    // ignore
  }

  // Try Ollama (/api/tags)
  try {
    const host = normalized.startsWith("http") ? new URL(normalized).hostname : normalized;
    const ollamaUrl = `http://${host}:11434/api/tags`;
    const resp = await fetch(ollamaUrl, {
      signal: AbortSignal.timeout(2000),
    });
    if (resp.ok) {
      const body = await resp.json();
      if (body.models && Array.isArray(body.models)) {
        console.log(`[LLM] Ollama detectado en ${host}`);
        setBackendType("ollama");
        // Set Ollama's OpenAI-compatible endpoint
        setBaseURL(`http://${host}:11434/v1`);
        return "ollama";
      }
    }
  } catch (e) {
    // ignore
  }

  console.log(`[LLM] No se detectó ningún backend en ${normalized}`);
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
    // LM Studio or Groq (OpenAI-compatible)
    try {
      // Construction for Groq/OpenAI: /models endpoint
      // If it's Groq and lacks /openai/v1, we should add it if we want to use the OpenAI compatible endpoint
      let apiUrl = normalized;
      if (backend === "groq" && !apiUrl.includes("/openai/v1")) {
        apiUrl = apiUrl.replace(/\/$/, "") + "/openai/v1";
      }

      const modelsBase = apiUrl.includes("/v1") ? apiUrl : `${apiUrl}/v1`;
      const modelsUrl = `${modelsBase.replace(/\/$/, "")}/models`;

      const headers: Record<string, string> = {};
      if (backend === "groq") {
        // Use the same logic as getConfig to find the right key
        const apiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
        if (apiKey) {
          headers["Authorization"] = `Bearer ${apiKey}`;
        }
      }
      const resp = await fetch(modelsUrl, { headers });
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
          const id = typeof m === "string" ? m : m.id || m.name || m;
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
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
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
