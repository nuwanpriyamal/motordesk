import { Component, EventEmitter, Input, Output, Pipe, PipeTransform, inject } from '@angular/core';
import { AuthService } from '../core/auth.service';

/** Formats an amount in the tenant's currency, e.g. "LKR 12,500.00". */
@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  private auth = inject(AuthService);

  transform(value: number | null | undefined, currency?: string): string {
    const cur = currency ?? this.auth.tenant()?.settings?.currency ?? 'LKR';
    const n = Number(value ?? 0);
    return `${cur} ${n.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

/** snake_case or camelCase -> "Title case". */
@Pipe({ name: 'label' })
export class LabelPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) return '';
    const s = value.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
}

@Component({
  selector: 'app-status',
  template: `<span class="badge badge-{{ value }}">{{ value | label }}</span>`,
  imports: [LabelPipe],
})
export class StatusBadgeComponent {
  @Input() value = '';
}

@Component({
  selector: 'app-pager',
  template: `
    @if (total > limit) {
      <div class="pager">
        <button class="btn btn-ghost" [disabled]="page <= 1" (click)="go.emit(page - 1)">Previous</button>
        <span class="muted">Page {{ page }} of {{ pages }}</span>
        <button class="btn btn-ghost" [disabled]="page >= pages" (click)="go.emit(page + 1)">Next</button>
      </div>
    }
  `,
})
export class PagerComponent {
  @Input() page = 1;
  @Input() limit = 20;
  @Input() total = 0;
  @Output() go = new EventEmitter<number>();
  get pages() {
    return Math.max(1, Math.ceil(this.total / this.limit));
  }
}

@Component({
  selector: 'app-modal',
  template: `
    @if (open) {
      <div class="modal-backdrop" (click)="close.emit()">
        <div class="modal" role="dialog" [attr.aria-label]="title" (click)="$event.stopPropagation()">
          <header class="modal-head">
            <h2>{{ title }}</h2>
            <button class="btn btn-ghost btn-icon" aria-label="Close" (click)="close.emit()">✕</button>
          </header>
          <div class="modal-body"><ng-content /></div>
        </div>
      </div>
    }
  `,
})
export class ModalComponent {
  @Input() open = false;
  @Input() title = '';
  @Output() close = new EventEmitter<void>();
}

export const UI = [MoneyPipe, LabelPipe, StatusBadgeComponent, PagerComponent, ModalComponent];

/** "2026-11-03" from a Date/ISO string, for <input type="date">. */
export const toDateInput = (v?: string | Date | null) => {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** "2026-11-03T10:30" local, for <input type="datetime-local">. */
export const toDateTimeInput = (v?: string | Date | null) => {
  if (!v) return '';
  const d = new Date(v);
  return `${toDateInput(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
