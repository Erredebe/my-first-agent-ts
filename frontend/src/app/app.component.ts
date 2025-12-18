import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { ChatInputComponent } from './chat-input.component';
import { ChatToolbarComponent } from './chat-toolbar.component';
import { MessageListComponent } from './message-list.component';
import { UploadCardComponent } from './upload-card.component';
import { AttachmentInfo, ChatMessage, ModelInfo, formatBytes } from './types';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, ChatToolbarComponent, UploadCardComponent, MessageListComponent, ChatInputComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  readonly title = 'Agente RDB';
  readonly apiUrl = (globalThis as any).API_URL ?? 'http://localhost:3000';

  sessionId = signal<string | null>(localStorage.getItem('agent-session'));
  model = signal<string | null>(localStorage.getItem('agent-model'));
  models = signal<ModelInfo[]>([]);
  defaultModel = signal<string | null>(null);
  isConnected = signal(false);
  isThinking = signal(false);
  toolbarCollapsed = signal(localStorage.getItem('toolbar-collapsed') === 'true');
  systemPrompt = signal('');
  messages = signal<ChatMessage[]>([]);
  attachments = signal<AttachmentInfo[]>([]);

  modelStatus = signal('Cargando modelos...');
  promptStatus = signal('Cargando system prompt...');
  statusText = signal('Conectando...');

  ngOnInit(): void {
    this.loadModels();
    this.loadSystemPrompt();
  }

  toggleToolbar(): void {
    const next = !this.toolbarCollapsed();
    this.toolbarCollapsed.set(next);
    localStorage.setItem('toolbar-collapsed', String(next));
  }

  async loadModels(): Promise<void> {
    this.modelStatus.set('Cargando modelos...');
    try {
      const response = await fetch(`${this.apiUrl}/api/models`);
      if (!response.ok) throw new Error('No se pudieron cargar los modelos');
      const payload = await response.json();
      const models: ModelInfo[] = Array.isArray(payload.models)
        ? payload.models.map((m: any) => ({ id: m.id ?? m, size: m.size, family: m.family }))
        : [];
      this.models.set(models);
      const ids = models.map((m) => m.id);
      const defaultModel = typeof payload.defaultModel === 'string' ? payload.defaultModel : null;
      this.defaultModel.set(defaultModel);

      const candidate = this.model() && ids.includes(this.model()!) ? this.model() : null;
      const fallback = defaultModel && ids.includes(defaultModel) ? defaultModel : ids[0] ?? null;
      const pick = candidate || fallback;
      if (pick) {
        this.setModel(pick, false);
        this.updateConnection(true);
      } else {
        this.modelStatus.set('No hay modelos disponibles. Verifica que LM Studio u Ollama estén corriendo.');
        this.updateConnection(false);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al obtener modelos';
      this.modelStatus.set(message);
      this.updateConnection(false);
    }
  }

  async loadSystemPrompt(): Promise<void> {
    this.promptStatus.set('Cargando system prompt...');
    try {
      const response = await fetch(`${this.apiUrl}/api/system-prompt`);
      if (!response.ok) throw new Error('No se pudo cargar el system prompt');
      const data = await response.json();
      this.systemPrompt.set(data.systemPrompt ?? '');
      this.promptStatus.set('System prompt listo');
    } catch (error) {
      this.promptStatus.set(error instanceof Error ? error.message : 'No se pudo cargar el system prompt');
    }
  }

  async saveSystemPrompt(): Promise<void> {
    const value = this.systemPrompt().trim();
    if (!value) return;
    this.promptStatus.set('Guardando...');
    try {
      const response = await fetch(`${this.apiUrl}/api/system-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemPrompt: value })
      });
      if (!response.ok) throw new Error('No se pudo guardar el system prompt');
      const data = await response.json();
      this.systemPrompt.set(data.systemPrompt ?? value);
      this.promptStatus.set('System prompt guardado');
    } catch (error) {
      this.promptStatus.set(error instanceof Error ? error.message : 'No se pudo guardar el system prompt');
    }
  }

  onModelChange(value: string): void {
    if (!value || value === this.model()) return;
    this.setModel(value, true);
  }

  private setModel(value: string, announce: boolean): void {
    this.model.set(value);
    localStorage.setItem('agent-model', value);
    this.modelStatus.set(`Modelo activo: ${value}`);
    if (announce) {
      this.sessionId.set(null);
      localStorage.removeItem('agent-session');
      this.appendMessage({
        role: 'assistant',
        content: `Modelo cambiado a ${value}. Se reinicia el contexto.`
      });
    }
  }

  toggleConnectionIndicator(connected: boolean): void {
    this.updateConnection(connected);
  }

  private updateConnection(connected: boolean): void {
    this.isConnected.set(connected);
    this.statusText.set(connected ? 'Listo' : 'Sin conexión');
  }

  async submitMessage(text: string): Promise<void> {
    if (this.isThinking()) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    const attachments = [...this.attachments()];
    const message = this.buildMessageWithAttachments(trimmed, attachments);

    this.appendMessage({ role: 'user', content: trimmed, attachments });
    this.isThinking.set(true);

    try {
      const reply = await this.sendMessage(message);
      this.appendMessage({ role: 'assistant', content: reply ?? '(sin respuesta)' });
      if (attachments.length) {
        this.attachments.set([]);
      }
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Error desconocido';
      this.appendMessage({ role: 'assistant', content: `Error: ${messageText}` });
    } finally {
      this.isThinking.set(false);
    }
  }

  private async sendMessage(message: string): Promise<string | null> {
    const payload = {
      message,
      sessionId: this.sessionId() ?? undefined,
      model: this.model() ?? undefined
    };
    const response = await fetch(`${this.apiUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'No se pudo enviar el mensaje');
    }
    const data = await response.json();
    const sid = typeof data.sessionId === 'string' ? data.sessionId : null;
    if (sid) {
      this.sessionId.set(sid);
      localStorage.setItem('agent-session', sid);
    }
    return data.reply ?? null;
  }

  appendMessage(message: ChatMessage): void {
    this.messages.set([...this.messages(), message]);
  }

  async handleUpload(files: FileList | null): Promise<void> {
    if (!files?.length) return;
    const file = files[0];
    if (file.size > 10 * 1024 * 1024) {
      this.appendMessage({ role: 'assistant', content: 'El archivo es demasiado grande (máximo 10MB).' });
      return;
    }
    const allowed = new Set([
      'text/plain',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/png',
      'image/jpeg',
      'image/gif'
    ]);
    if (!allowed.has(file.type)) {
      this.appendMessage({ role: 'assistant', content: 'Tipo de archivo no permitido.' });
      return;
    }
    const base64 = await this.fileToBase64(file);
    const response = await fetch(`${this.apiUrl}/api/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: file.name,
        type: file.type,
        size: file.size,
        content: base64
      })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'No se pudo subir el archivo');
    }
    const attachment = await response.json();
    this.attachments.set([...this.attachments(), attachment]);
  }

  removeAttachment(index: number): void {
    const next = [...this.attachments()];
    next.splice(index, 1);
    this.attachments.set(next);
  }

  private buildMessageWithAttachments(text: string, attachments: AttachmentInfo[]): string {
    if (!attachments.length) return text;
    const files = attachments
      .map((file) => {
        const label = file.relativePath || file.filePath || file.originalName || file.name || 'archivo';
        const type = file.mimeType || 'tipo desconocido';
        const sizeLabel = formatBytes(file.size ?? 0);
        const download = file.downloadUrl ? ` [descarga: ${file.downloadUrl}]` : '';
        return `- ${label} (${type}, ${sizeLabel})${download}`;
      })
      .join('\n');
    return `${text}\n\nArchivos disponibles para el asistente (usa read_file o convert_file_to_base64 si los necesitas):\n${files}`;
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
