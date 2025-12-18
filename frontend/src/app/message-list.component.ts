import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { AttachmentInfo, ChatMessage, formatBytes } from './types';

@Component({
  selector: 'app-message-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './message-list.component.html'
})
export class MessageListComponent {
  @Input() messages: ChatMessage[] = [];

  formatAttachment(file: AttachmentInfo): string {
    const label = file.originalName || file.name || 'Archivo';
    return `${label} (${formatBytes(file.size ?? 0)})`;
  }
}
