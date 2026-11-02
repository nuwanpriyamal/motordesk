import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { Customer, Invoice, Paginated } from '../core/models';
import { ToastService } from '../core/toast.service';
import { UI } from '../shared/ui';

@Component({
  imports: [FormsModule, RouterLink, DatePipe, ...UI],
  template: `
    <div class="page-head">
      <div><h1>Invoices & quotes</h1></div>
      <span class="spacer"></span>
      <button class="btn btn-ghost" (click)="openNew('quote')">+ New quote</button>
      <button class="btn" (click)="openNew('invoice')">+ New invoice</button>
    </div>

    @if (summary(); as s) {
      <div class="stats" style="margin-bottom: 16px">
        <div class="card stat"><div class="label">Invoiced this month</div><div class="value" style="font-size: 20px">{{ s.invoiced | money }}</div><div class="sub">{{ s.count }} invoices</div></div>
        <div class="card stat"><div class="label">Collected</div><div class="value" style="font-size: 20px">{{ s.collected | money }}</div></div>
        <div class="card stat"><div class="label">Outstanding</div><div class="value" style="font-size: 20px">{{ s.outstanding | money }}</div></div>
      </div>
    }

    <div class="card">
      <div class="tabs" style="padding: 0 10px; margin: 0">
        <button [class.active]="type === 'invoice'" (click)="type = 'invoice'; reload()">Invoices</button>
        <button [class.active]="type === 'quote'" (click)="type = 'quote'; reload()">Quotes</button>
      </div>
      <div class="card-head">
        <input class="search" placeholder="Search number or notes" [(ngModel)]="search" (ngModelChange)="reload()" />
        <select style="max-width: 180px" [(ngModel)]="status" (ngModelChange)="reload()">
          <option value="">All statuses</option>
          @for (s of statuses; track s) {<option [value]="s">{{ s | label }}</option>}
        </select>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Number</th><th>Customer</th><th>Vehicle</th><th>Status</th><th class="num">Total</th><th class="num">Balance</th><th>Date</th></tr></thead>
        <tbody>
          @for (i of data().items; track i._id) {
            <tr class="clickable" [routerLink]="['/app/invoices', i._id]">
              <td class="mono">{{ i.number }}</td>
              <td>{{ i.customer.name }}</td>
              <td>{{ i.vehicle?.registrationNo }}</td>
              <td><app-status [value]="i.status" /></td>
              <td class="num">{{ i.total | money }}</td>
              <td class="num">{{ i.balance | money }}</td>
              <td class="nowrap">{{ i.issueDate | date: 'mediumDate' }}</td>
            </tr>
          } @empty {
            <tr><td colspan="7" class="empty">Nothing here yet.</td></tr>
          }
        </tbody>
      </table></div>
      <app-pager [page]="page" [limit]="data().limit" [total]="data().total" (go)="page = $event; load()" />
    </div>

    <app-modal [open]="creating()" [title]="newType === 'quote' ? 'New quote' : 'New invoice'" (close)="creating.set(false)">
      <div class="stack">
        <label class="field">Customer
          <input placeholder="Search name or phone" [(ngModel)]="customerSearch" (ngModelChange)="findCustomers()" autocomplete="off" />
        </label>
        @for (c of customers(); track c._id) {
          <button class="btn btn-ghost" style="justify-content: flex-start" (click)="create(c)">{{ c.name }} <span class="muted">{{ c.phone }}</span></button>
        }
        <p class="muted small" style="margin: 0">Tip: invoices are usually created from a completed job card so labour and parts carry over.</p>
      </div>
    </app-modal>
  `,
})
export class InvoicesPage implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private router = inject(Router);

  data = signal<Paginated<Invoice>>({ items: [], total: 0, page: 1, limit: 20 });
  summary = signal<{ invoiced: number; collected: number; outstanding: number; count: number } | null>(null);
  statuses = ['draft', 'sent', 'partial', 'paid', 'accepted', 'converted', 'cancelled'];
  type: 'invoice' | 'quote' = 'invoice';
  search = '';
  status = '';
  page = 1;

  creating = signal(false);
  newType: 'invoice' | 'quote' = 'invoice';
  customerSearch = '';
  customers = signal<Customer[]>([]);
  private timer?: ReturnType<typeof setTimeout>;

  ngOnInit() {
    this.load();
    this.api.get<{ invoiced: number; collected: number; outstanding: number; count: number }>('/invoices/reports/summary').subscribe((s) => this.summary.set(s));
  }

  reload() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.page = 1;
      this.load();
    }, 200);
  }

  load() {
    this.api
      .list<Invoice>('/invoices', { page: this.page, status: this.status, search: this.search, type: this.type })
      .subscribe({ next: (d) => this.data.set(d), error: (e) => this.toast.error(e) });
  }

  openNew(type: 'invoice' | 'quote') {
    this.newType = type;
    this.customerSearch = '';
    this.customers.set([]);
    this.creating.set(true);
  }

  findCustomers() {
    clearTimeout(this.timer);
    this.timer = setTimeout(
      () => this.api.list<Customer>('/customers', { search: this.customerSearch, limit: 6 }).subscribe((r) => this.customers.set(r.items)),
      250,
    );
  }

  create(c: Customer) {
    this.api.post<Invoice>('/invoices', { type: this.newType, customer: c._id, items: [] }).subscribe({
      next: (inv) => {
        this.creating.set(false);
        this.router.navigate(['/app/invoices', inv._id]);
      },
      error: (e) => this.toast.error(e),
    });
  }
}
