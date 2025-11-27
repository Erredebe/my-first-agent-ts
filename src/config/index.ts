/**
 * Configuración centralizada de modelo y API.
 * Todos los valores pueden sobrescribirse con variables de entorno para
 * probar distintos backends y prompts sin tocar el código fuente.
 */
const DEFAULT_MODEL = "openai/gpt-oss-20b";
const DEFAULT_BASE_URL = "http://127.0.0.1:1234/v1";
const DEFAULT_SYSTEM_PROMPT = "Eres un asistente útil y conciso.";
const DEFAULT_API_KEY = "not-needed";

export interface Config {
  model: string;
  baseURL: string;
  apiKey: string;
  systemPrompt: string;
}

// Modelo a usar; acepta rutas tipo "proveedor/modelo".
export const MODEL = process.env.MODEL ?? DEFAULT_MODEL;

// URL base compatible con la API de OpenAI (p. ej. LM Studio, llama.cpp HTTP).
export const BASE_URL = process.env.OPENAI_BASE_URL ?? DEFAULT_BASE_URL;

// En entornos locales suele bastar con una cadena de relleno.
export const API_KEY = process.env.OPENAI_API_KEY ?? DEFAULT_API_KEY;

// Prompt de arranque que marca el tono de las respuestas.
export const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT ?? DEFAULT_SYSTEM_PROMPT;

// Límite de lectura para herramientas de archivo (evita archivos enormes).
export const DEFAULT_MAX_READ_BYTES = 200_000;

export function getConfig(): Config {
  return {
    model: MODEL,
    baseURL: BASE_URL,
    apiKey: API_KEY,
    systemPrompt: SYSTEM_PROMPT,
  };
}
