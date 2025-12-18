import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AttachmentInfo, ChatRequestPayload, ChatResponse, ModelInfo } from './types';

interface ModelsResponse {
  models?: Array<{ id?: string; size?: string; family?: string } | string>;
  defaultModel?: string;
}

@Injectable({ providedIn: 'root' })
export class AgentApiService {
  private readonly apiUrl = (globalThis as any).API_URL ?? 'http://localhost:3000';

  constructor(private readonly http: HttpClient) {}

  async fetchModels(): Promise<{ models: ModelInfo[]; defaultModel: string | null }> {
    try {
      const payload = await firstValueFrom(this.http.get<ModelsResponse>(`${this.apiUrl}/api/models`));
      const models = Array.isArray(payload.models)
        ? payload.models.map((m) => ({
            id: typeof m === 'string' ? m : m.id ?? '',
            size: typeof m === 'string' ? undefined : m.size,
            family: typeof m === 'string' ? undefined : m.family
          }))
        : [];

      const defaultModel = typeof payload.defaultModel === 'string' ? payload.defaultModel : null;
      return { models: models.filter((model) => Boolean(model.id)), defaultModel };
    } catch (error) {
      throw new Error(this.extractErrorMessage(error, 'No se pudieron cargar los modelos'));
    }
  }

  async fetchSystemPrompt(): Promise<string> {
    try {
      const data = await firstValueFrom(this.http.get<{ systemPrompt?: string }>(`${this.apiUrl}/api/system-prompt`));
      return data.systemPrompt ?? '';
    } catch (error) {
      throw new Error(this.extractErrorMessage(error, 'No se pudo cargar el system prompt'));
    }
  }

  async saveSystemPrompt(prompt: string): Promise<string> {
    try {
      const data = await firstValueFrom(
        this.http.post<{ systemPrompt?: string }>(`${this.apiUrl}/api/system-prompt`, {
          systemPrompt: prompt
        })
      );
      return data.systemPrompt ?? prompt;
    } catch (error) {
      throw new Error(this.extractErrorMessage(error, 'No se pudo guardar el system prompt'));
    }
  }

  async sendMessage(payload: ChatRequestPayload): Promise<ChatResponse> {
    try {
      const data = await firstValueFrom(this.http.post<ChatResponse>(`${this.apiUrl}/api/chat`, payload));
      return {
        reply: data?.reply ?? null,
        sessionId: typeof data?.sessionId === 'string' ? data.sessionId : null
      };
    } catch (error) {
      throw new Error(this.extractErrorMessage(error, 'No se pudo enviar el mensaje'));
    }
  }

  async uploadAttachment(file: File): Promise<AttachmentInfo> {
    try {
      const base64 = await this.fileToBase64(file);
      return await firstValueFrom(
        this.http.post<AttachmentInfo>(`${this.apiUrl}/api/upload`, {
          name: file.name,
          type: file.type,
          size: file.size,
          content: base64
        })
      );
    } catch (error) {
      throw new Error(this.extractErrorMessage(error, 'No se pudo subir el archivo'));
    }
  }

  private extractErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message) return error.message;
    if (typeof (error as any)?.error === 'string') return (error as any).error;
    return fallback;
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const buffer = reader.result;
        if (!(buffer instanceof ArrayBuffer)) {
          reject(new Error('No se pudo leer el archivo'));
          return;
        }
        const bytes = new Uint8Array(buffer);
        let binary = '';
        bytes.forEach((b) => {
          binary += String.fromCharCode(b);
        });
        resolve(btoa(binary));
      };
      reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
      reader.readAsArrayBuffer(file);
    });
  }
}
