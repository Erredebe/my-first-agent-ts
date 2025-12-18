import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { AttachmentInfo, formatBytes } from './types';

@Component({
  selector: 'app-upload-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './upload-card.component.html'
})
export class UploadCardComponent {
  @Input() attachments: AttachmentInfo[] = [];
  @Output() upload = new EventEmitter<FileList | null>();
  @Output() remove = new EventEmitter<number>();

  readonly formatBytes = formatBytes;

  onFileChange(files: FileList | null): void {
    this.upload.emit(files);
  }

  triggerUpload(input: HTMLInputElement | null): void {
    this.upload.emit(input?.files ?? null);
  }
}
