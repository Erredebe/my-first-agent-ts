export const MODEL = process.env.MODEL ?? "openai/gpt-oss-20b";
export const BASE_URL = process.env.OPENAI_BASE_URL ?? "http://127.0.0.1:1234/v1";
export const API_KEY = process.env.OPENAI_API_KEY ?? "not-needed";

export const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT ?? "Eres un asistente útil y conciso.";
export const DEFAULT_MAX_READ_BYTES = 200_000;
