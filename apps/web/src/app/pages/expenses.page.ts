import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { Expense, Paginated } from '../core/models';
import { ToastService } from '../core/toast.service';
import { UI, toDateInput } from '../shared/ui';

const CATEGORIES = ['parts_purchase', 'salaries', 'rent', 'utilities', 'equipment', 'marketing', 'transport', 'maintenance', 'taxes', 'other'];

@Component({
  imports: [FormsModule, DatePipe, ...UI],
  template: `
    <div class="page-head">
      <div><h1>Expenses</h1><p class="muted">This month: {{ monthTotal() | money }}</p></div>
      <span class="spacer"></span>
      <button class="btn" (click)="open()">+ Add expense</button>
    </div>

    @if (byCategory().length) {
      <div class="stats" style="margin-bottom: 16px">
        @for (c of byCategory(); track c.category) {
          <div class="card stat"><div class="label">{{ c.category | label }}</div><div class="value" style="font-size: 18px">{{ c.total | money }}</div></div>
        }
      </div>
    }

    <div class="card">
      <div class="card-head">
        <input class="search" placeholder="Search vendor, description, reference" [(ngModel)]="search" (ngModelChange)="reload()" />
        <label class="field" style="flex-direction: row; align-items: center">From <input type="date" [(ngModel)]="from" (ngModelChange)="reload()" /></label>
        <label class="field" style="flex-direction: row; align-items: center">To <input type="date" [(ngModel)]="to" (ngModelChange)="reload()" /></label>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Date</th><th>Category</th><th>Vendor</th><th>Description</th><th>Method</th><th class="num">Amount</th></tr></thead>
        <tbody>
          @for (e of data().items; track e._id) {
            <tr class="clickable" (click)="open(e)">
              <td class="nowrap">{{ e.date | date: 'mediumDate' }}</td>
              <td><span class="badge">{{ e.category | label }}</span></td>
              <td>{{ e.vendor }}</td>
              <td>{{ e.description }}</td>
              <td>{{ e.method | label }}</td>
              <td class="num">{{ e.amount | money }}</td>
            </tr>
          } @empty {
            <tr><td colspan="6" class="empty">No expenses recorded.</td></tr>
          }
        </tbody>
      </table></div>
      <app-pager [page]="page" [limit]="data().limit" [total]="data().total" (go)="page = $event; load()" />
    </div>

    <app-modal [open]="editing()" [title]="editId ? 'Edit expense' : 'Add expense'" (close)="editing.set(false)">
      <form class="stack" (ngSubmit)="save()">
        <div class="grid-2">
          <label class="field">Category<select [(ngModel)]="f.category" name="cat">@for (c of categories; track c) {<option [value]="c">{{ c | label }}</option>}</select></label>
          <label class="field">Amount<input type="number" min="0" step="any" [(ngModel)]="f.amount" name="amt" required /></label>
          <label class="field">Date<input type="date" [(ngModel)]="f.date" name="date" /></label>
          <label class="field">Paid by<select [(ngModel)]="f.method" name="m"><option value="cash">Cash</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option><option value="cheque">Cheque</option><option value="other">Other</option></select></label>
          <label class="field">Vendor / payee<input [(ngModel)]="f.vendor" name="vendor" /></label>
          <label class="field">Reference<input [(ngModel)]="f.reference" name="ref" /></label>
        </div>
        <label class="field">Description<input [(ngModel)]="f.description" name="desc" /></label>
        <div class="form-actions">
          @if (editId) {<button type="button" class="btn btn-ghost" (click)="remove()">Delete</button>}
          <span class="spacer"></span>
          <button type="button" class="btn btn-ghost" (click)="editing.set(false)">Cancel</button>
          <button class="btn" [disabled]="!f.amount">Save</button>
        </div>
      </form>
    </app-modal>
  `,
})
export class ExpensesPage implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  categories = CATEGORIES;
  data = signal<Paginated<Expense>>({ items: [], total: 0, page: 1, limit: 20 });
  byCategory = signal<{ category: string; total: number }[]>([]);
  monthTotal = signal(0);
  search = '';
  from = '';
  to = '';
  page = 1;
  editing = signal(false);
  editId = '';
  f = this.blank();
  private timer?: ReturnType<typeof setTimeout>;

  ngOnInit() {
    this.load();
  }

  blank() {
    return { category: 'other', amount: 0, date: toDateInput(new Date()), method: 'cash', vendor: '', reference: '', description: '' };
  }

  reload() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.page = 1;
      this.load();
    }, 250);
  }

  load() {
    this.api
      .list<Expense>('/expenses', {
        page: this.page,
        search: this.search,
        sort: '-date',
        from: this.from ? new Date(`${this.from}T00:00:00`).toISOString() : undefined,
        to: this.to ? new Date(`${this.to}T23:59:59`).toISOString() : undefined,
      })
      .subscribe({ next: (d) => this.data.set(d), error: (e) => this.toast.error(e) });
    this.api.get<{ category: string; total: number }[]>('/expenses/reports/by-category').subscribe((r) => {
      this.byCategory.set(r);
      this.monthTotal.set(r.reduce((s, x) => s + x.total, 0));
    });
  }

  open(e?: Expense) {
    this.editId = e?._id ?? '';
    this.f = e
      ? { category: e.category, amount: e.amount, date: toDateInput(e.date), method: e.method, vendor: e.vendor ?? '', reference: e.reference ?? '', description: e.description ?? '' }
      : this.blank();
    this.editing.set(true);
  }

  save() {
    const body: Record<string, unknown> = { ...this.f, amount: Number(this.f.amount) };
    if (this.f.date) body['date'] = new Date(`${this.f.date}T12:00:00`).toISOString();
    for (const [k, v] of Object.entries(body)) if (v === '') delete body[k];
    const req = this.editId ? this.api.patch(`/expenses/${this.editId}`, body) : this.api.post('/expenses', body);
    req.subscribe({
      next: () => {
        this.editing.set(false);
        this.toast.success('Expense saved');
        this.load();
      },
      error: (e) => this.toast.error(e),
    });
  }

  remove() {
    if (!confirm('Delete this expense?')) return;
    this.api.delete(`/expenses/${this.editId}`).subscribe({
      next: () => {
        this.editing.set(false);
        this.load();
      },
      error: (e) => this.toast.error(e),
    });
  }
}
