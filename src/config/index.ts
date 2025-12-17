/**
 * Configuración centralizada de modelo y API.
 * Todos los valores pueden sobrescribirse con variables de entorno para
 * probar distintos backends y prompts sin tocar el código fuente.
 */
export type BackendType = "lm-studio" | "ollama";

const DEFAULT_MODEL = "openai/gpt-oss-20b";
const DEFAULT_BASE_URL = "http://127.0.0.1:1234";
const DEFAULT_SYSTEM_PROMPT = "Eres un asistente útil y conciso.";
const DEFAULT_API_KEY = "not-needed";

export interface Config {
  model: string;
  baseURL: string;
  apiKey: string;
  systemPrompt: string;
}

// Modelo a usar; acepta rutas tipo "proveedor/modelo".
let CURRENT_MODEL = process.env.MODEL ?? DEFAULT_MODEL;

// URL base compatible con LM Studio, Ollama, etc.
let CURRENT_BASE_URL = process.env.OPENAI_BASE_URL ?? DEFAULT_BASE_URL;

// Backend detectado automáticamente
let DETECTED_BACKEND: BackendType | null = null;

// En entornos locales suele bastar con una cadena de relleno.
let CURRENT_API_KEY = process.env.OPENAI_API_KEY ?? DEFAULT_API_KEY;

// Prompt de arranque que marca el tono de las respuestas.
export const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT ?? DEFAULT_SYSTEM_PROMPT;

// Límite de lectura para herramientas de archivo (evita archivos enormes).
export const DEFAULT_MAX_READ_BYTES = 200_000;

export function getConfig(): Config {
  return {
    model: CURRENT_MODEL,
    baseURL: CURRENT_BASE_URL,
    apiKey: CURRENT_API_KEY,
    systemPrompt: SYSTEM_PROMPT,
  };
}

export function setModel(model: string) {
  CURRENT_MODEL = model;
}

export function setBaseURL(url: string) {
  CURRENT_BASE_URL = url;
}

export function setApiKey(key: string) {
  CURRENT_API_KEY = key;
}

export function setBackendType(backend: BackendType) {
  DETECTED_BACKEND = backend;
}

export function getCurrentModel(): string {
  return CURRENT_MODEL;
}

export function getCurrentBaseURL(): string {
  return CURRENT_BASE_URL;
}

export function getDetectedBackend(): BackendType | null {
  return DETECTED_BACKEND;
}
