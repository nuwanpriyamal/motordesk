import { Injectable, signal } from '@angular/core';
import { errorMessage } from './api.service';

export interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info';
  text: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private seq = 0;

  show(text: string, kind: Toast['kind'] = 'info', ms = 4000) {
    const id = ++this.seq;
    this.toasts.update((t) => [...t, { id, kind, text }]);
    setTimeout(() => this.dismiss(id), ms);
  }

  success(text: string) {
    this.show(text, 'success');
  }

  error(err: unknown) {
    this.show(typeof err === 'string' ? err : errorMessage(err), 'error', 6000);
  }

  dismiss(id: number) {
    this.toasts.update((t) => t.filter((x) => x.id !== id));
  }
}
