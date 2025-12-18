export interface ModelInfo {
  id: string;
  size?: string;
  family?: string;
}

export interface AttachmentInfo {
  filePath?: string;
  relativePath?: string;
  downloadUrl?: string;
  mimeType?: string;
  originalName?: string;
  name?: string;
  size?: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments?: AttachmentInfo[];
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[exponent]}`;
}
