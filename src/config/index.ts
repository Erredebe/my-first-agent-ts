/**
 * Configuración centralizada de modelo y API.
 * Todos los valores pueden sobrescribirse con variables de entorno para
 * probar distintos backends y prompts sin tocar el código fuente.
 */
export type BackendType = "lm-studio" | "ollama" | "groq";

const DEFAULT_MODEL = "openai/gpt-oss-20b";
const DEFAULT_BASE_URL = "http://127.0.0.1:1234/v1";
const DEFAULT_GROQ_MODEL = "llama3-8b-8192";
const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

const DEFAULT_SYSTEM_PROMPT = `Eres un asistente de IA avanzado capaz de ejecutar herramientas para ayudar al usuario. 
Si necesitas realizar una acción (leer/escribir archivos, buscar en la web, etc.), utiliza las herramientas disponibles. 
Si el modelo no soporta herramientas nativas, puedes solicitar una herramienta escribiendo:
TOOL_CALL: name="nombre_herramienta" arguments={"arg1": "valor"}

Responde siempre de forma clara y profesional.`;

const DEFAULT_API_KEY = "not-needed";

export interface Config {
  model: string;
  baseURL: string;
  apiKey: string;
  systemPrompt: string;
}

// Variables internas para estado dinámico
let _model: string | undefined;
let _baseURL: string | undefined;
let _manualApiKey: string | null = null;
let _detectedBackend: BackendType | null = null;

/**
 * Obtiene la API Key adecuada según la URL base y el entorno.
 */
function getApiKeyForUrl(url: string): string {
  if (url.includes("groq.com")) {
    return process.env.GROQ_API_KEY ?? process.env.OPENAI_API_KEY ?? DEFAULT_API_KEY;
  }
  return process.env.OPENAI_API_KEY ?? process.env.GROQ_API_KEY ?? DEFAULT_API_KEY;
}

export function getConfig(): Config {
  const model = getCurrentModel();
  const baseURL = getCurrentBaseURL();
  const apiKey = _manualApiKey ?? getApiKeyForUrl(baseURL);
  
  if (baseURL.includes("groq.com") && apiKey === DEFAULT_API_KEY) {
     console.warn("[Config] ADVERTENCIA: Usando Groq pero no se encontró GROQ_API_KEY ni OPENAI_API_KEY.");
  }

  return {
    model,
    baseURL,
    apiKey,
    systemPrompt: process.env.SYSTEM_PROMPT ?? DEFAULT_SYSTEM_PROMPT,
  };
}

export function getCurrentModel(): string {
  if (_model === undefined) {
    _model = process.env.MODEL ?? (process.env.GROQ_API_KEY ? DEFAULT_GROQ_MODEL : DEFAULT_MODEL);
  }
  return _model;
}

export function getCurrentBaseURL(): string {
  if (_baseURL === undefined) {
    _baseURL = process.env.OPENAI_BASE_URL ?? 
               process.env.GROQ_BASE_URL ?? 
               (process.env.GROQ_API_KEY ? GROQ_BASE_URL : DEFAULT_BASE_URL);
  }
  return _baseURL;
}

export function setModel(model: string) {
  _model = model;
}

export function setBaseURL(url: string) {
  _baseURL = url;
}

export function setApiKey(key: string) {
  _manualApiKey = key;
}

export function setBackendType(backend: BackendType) {
  _detectedBackend = backend;
}

export function getDetectedBackend(): BackendType | null {
  return _detectedBackend;
}

export const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT ?? DEFAULT_SYSTEM_PROMPT;
export const DEFAULT_MAX_READ_BYTES = 200_000;
