import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ModelInfo } from './types';

@Component({
  selector: 'app-chat-toolbar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat-toolbar.component.html'
})
export class ChatToolbarComponent {
  @Input() collapsed = false;
  @Input() models: ModelInfo[] = [];
  @Input() modelValue: string | null = null;
  @Input() modelStatus = '';

  @Input() systemPrompt = '';
  @Input() promptStatus = '';

  @Output() refreshModels = new EventEmitter<void>();
  @Output() modelChange = new EventEmitter<string>();
  @Output() systemPromptChange = new EventEmitter<string>();
  @Output() saveSystemPrompt = new EventEmitter<void>();
}
