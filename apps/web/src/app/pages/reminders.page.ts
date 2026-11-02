import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { Customer, Paginated, Reminder } from '../core/models';
import { ToastService } from '../core/toast.service';
import { UI, toDateInput } from '../shared/ui';

@Component({
  imports: [FormsModule, DatePipe, ...UI],
  template: `
    <div class="page-head">
      <div><h1>Reminders</h1><p class="muted">Service due, insurance & licence expiry, overdue payments and birthdays.</p></div>
      <span class="spacer"></span>
      <button class="btn btn-ghost" [disabled]="busy()" (click)="generate()">Scan for due reminders</button>
      <button class="btn" (click)="open()">+ Custom reminder</button>
    </div>
    @if (!auth.has('sms')) {
      <div class="alert" style="margin-bottom: 14px">SMS sending is not in your plan. Reminders can still be tracked and sent by email if enabled.</div>
    }
    <div class="card">
      <div class="tabs" style="padding: 0 10px; margin: 0">
        @for (s of tabs; track s) {<button [class.active]="status === s" (click)="status = s; page = 1; load()">{{ s | label }}</button>}
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Due</th><th>Reminder</th><th>Customer</th><th>Channel</th><th>Status</th><th></th></tr></thead>
        <tbody>
          @for (r of data().items; track r._id) {
            <tr>
              <td class="nowrap">{{ r.dueDate | date: 'mediumDate' }}</td>
              <td><strong>{{ r.title }}</strong><div class="muted small">{{ r.message }}</div>@if (r.error) {<div class="small" style="color: var(--danger)">{{ r.error }}</div>}</td>
              <td>{{ r.customer?.name }}<div class="muted small">{{ r.customer?.phone }}</div></td>
              <td>{{ r.channel | label }}</td>
              <td><app-status [value]="r.status" />@if (r.sentAt) {<div class="muted small">{{ r.sentAt | date: 'short' }}</div>}</td>
              <td class="right nowrap">
                @if (r.status === 'pending' || r.status === 'failed') {
                  <button class="btn btn-sm" [disabled]="busy()" (click)="send(r)">Send</button>
                  <button class="btn btn-ghost btn-sm" (click)="dismiss(r)">Dismiss</button>
                }
              </td>
            </tr>
          } @empty {
            <tr><td colspan="6" class="empty">Nothing here. Use "Scan for due reminders" to find vehicles due for service.</td></tr>
          }
        </tbody>
      </table></div>
      <app-pager [page]="page" [limit]="data().limit" [total]="data().total" (go)="page = $event; load()" />
    </div>

    <app-modal [open]="creating()" title="Custom reminder" (close)="creating.set(false)">
      <form class="stack" (ngSubmit)="create()">
        <label class="field">Customer<input placeholder="Search customer" [(ngModel)]="customerSearch" name="cs" (ngModelChange)="findCustomers()" autocomplete="off" /></label>
        @for (c of customers(); track c._id) {
          <label class="check"><input type="radio" name="cust" [value]="c._id" [(ngModel)]="f.customer" /> {{ c.name }} <span class="muted">{{ c.phone }}</span></label>
        }
        <div class="grid-2">
          <label class="field">Title<input [(ngModel)]="f.title" name="title" required /></label>
          <label class="field">Due date<input type="date" [(ngModel)]="f.dueDate" name="due" /></label>
          <label class="field">Channel<select [(ngModel)]="f.channel" name="ch"><option value="sms">SMS</option><option value="email">Email</option><option value="none">Internal only</option></select></label>
          <label class="field">Type<select [(ngModel)]="f.type" name="type"><option value="follow_up">Follow-up</option><option value="custom">Custom</option><option value="service_due">Service due</option><option value="payment">Payment</option></select></label>
        </div>
        <label class="field">Message<textarea [(ngModel)]="f.message" name="msg" maxlength="480"></textarea><span class="hint">{{ f.message.length }} characters ({{ smsParts() }} SMS)</span></label>
        <div class="form-actions">
          <button type="button" class="btn btn-ghost" (click)="creating.set(false)">Cancel</button>
          <button class="btn" [disabled]="!f.title || !f.dueDate">Save</button>
        </div>
      </form>
    </app-modal>
  `,
})
export class RemindersPage implements OnInit {
  auth = inject(AuthService);
  private api = inject(ApiService);
  private toast = inject(ToastService);

  tabs = ['pending', 'sent', 'failed', 'dismissed'];
  status = 'pending';
  page = 1;
  data = signal<Paginated<Reminder>>({ items: [], total: 0, page: 1, limit: 20 });
  busy = signal(false);
  creating = signal(false);
  customers = signal<Customer[]>([]);
  customerSearch = '';
  f = this.blank();
  private timer?: ReturnType<typeof setTimeout>;

  ngOnInit() {
    this.load();
  }

  blank() {
    return { customer: '', title: '', message: '', dueDate: toDateInput(new Date()), channel: 'sms', type: 'follow_up' };
  }

  smsParts() {
    return Math.max(1, Math.ceil(this.f.message.length / 160));
  }

  load() {
    this.api
      .list<Reminder>('/reminders', { page: this.page, status: this.status, sort: this.status === 'pending' ? 'dueDate' : '-updatedAt' })
      .subscribe({ next: (d) => this.data.set(d), error: (e) => this.toast.error(e) });
  }

  generate() {
    this.busy.set(true);
    this.api.post<{ created: number }>('/reminders/actions/generate').subscribe({
      next: (r) => {
        this.busy.set(false);
        this.toast.success(r.created ? `${r.created} new reminder(s) found` : 'No new reminders due');
        this.load();
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.error(e);
      },
    });
  }

  send(r: Reminder) {
    this.busy.set(true);
    this.api.post<Reminder>(`/reminders/${r._id}/send`).subscribe({
      next: (res) => {
        this.busy.set(false);
        res.status === 'sent' ? this.toast.success('Reminder sent') : this.toast.error(res.error || 'Sending failed');
        this.load();
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.error(e);
      },
    });
  }

  dismiss(r: Reminder) {
    this.api.patch(`/reminders/${r._id}`, { status: 'dismissed' }).subscribe({ next: () => this.load(), error: (e) => this.toast.error(e) });
  }

  open() {
    this.f = this.blank();
    this.customerSearch = '';
    this.customers.set([]);
    this.creating.set(true);
  }

  findCustomers() {
    clearTimeout(this.timer);
    this.timer = setTimeout(
      () => this.api.list<Customer>('/customers', { search: this.customerSearch, limit: 5 }).subscribe((r) => this.customers.set(r.items)),
      250,
    );
  }

  create() {
    const body: Record<string, unknown> = { ...this.f, dueDate: new Date(`${this.f.dueDate}T09:00:00`).toISOString() };
    for (const [k, v] of Object.entries(body)) if (v === '') delete body[k];
    this.api.post('/reminders', body).subscribe({
      next: () => {
        this.creating.set(false);
        this.toast.success('Reminder saved');
        this.load();
      },
      error: (e) => this.toast.error(e),
    });
  }
}
