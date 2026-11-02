import { DatePipe } from '@angular/common';
import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { Invoice, LineItem, Part } from '../core/models';
import { ToastService } from '../core/toast.service';
import { UI, toDateInput } from '../shared/ui';

@Component({
  imports: [FormsModule, RouterLink, DatePipe, ...UI],
  styles: `
    .doc-head { display: flex; justify-content: space-between; gap: 24px; flex-wrap: wrap; }
    .doc-title { font-size: 26px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
    .totals { margin-left: auto; width: min(100%, 320px); }
    .totals .row { justify-content: space-between; padding: 4px 0; }
    @media print { .doc { padding: 0 !important; } }
  `,
  template: `
    @if (inv(); as i) {
      <div class="page-head no-print">
        <div>
          <div class="muted small"><a routerLink="/app/invoices">Invoices & quotes</a></div>
          <h1>{{ i.type === 'quote' ? 'Quote' : 'Invoice' }} {{ i.number }}</h1>
        </div>
        <app-status [value]="i.status" />
        <span class="spacer"></span>
        @if (i.jobCard) {<a class="btn btn-ghost" [routerLink]="['/app/jobs', i.jobCard]">Job card</a>}
        <button class="btn btn-ghost" (click)="print()">Print / PDF</button>
        @if (i.type === 'quote' && i.status !== 'converted' && i.status !== 'cancelled') {
          <button class="btn" [disabled]="busy()" (click)="convert()">Convert to invoice</button>
        }
        @if (i.type === 'invoice' && i.balance > 0 && i.status !== 'cancelled') {
          <button class="btn" (click)="openPayment()">Record payment</button>
        }
      </div>

      <div class="card card-pad doc" style="padding: 28px">
        <div class="doc-head">
          <div>
            <div class="doc-title">{{ i.type === 'quote' ? 'Quotation' : 'Invoice' }}</div>
            <div class="mono">{{ i.number }}</div>
            <div class="muted small" style="margin-top: 6px">Issued {{ i.issueDate | date: 'mediumDate' }} @if (i.dueDate) {· Due {{ i.dueDate | date: 'mediumDate' }}}</div>
          </div>
          <div class="right">
            <strong>{{ tenant()?.name }}</strong>
            <div class="small">{{ tenant()?.address }}</div>
            <div class="small">{{ tenant()?.phone }} {{ tenant()?.email }}</div>
            @if (tenant()?.registrationNo) {<div class="small muted">Reg. {{ tenant()?.registrationNo }}</div>}
          </div>
        </div>

        <div class="grid-2" style="margin: 22px 0">
          <div>
            <div class="muted small">Bill to</div>
            <strong>{{ i.customer.name }}</strong>
            <div class="small">{{ i.customer.phone }} {{ i.customer.email }}</div>
            <div class="small">{{ i.customer.address }}</div>
          </div>
          @if (i.vehicle) {
            <div>
              <div class="muted small">Vehicle</div>
              <strong>{{ i.vehicle.registrationNo }}</strong>
              <div class="small">{{ i.vehicle.make }} {{ i.vehicle.model }} · {{ i.vehicle.mileage }} km</div>
            </div>
          }
        </div>

        <div class="table-wrap"><table>
          <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Discount</th><th class="num">Amount</th>@if (editable()) {<th class="no-print"></th>}</tr></thead>
          <tbody>
            @for (it of items; track $index) {
              <tr>
                @if (editable()) {
                  <td><input [(ngModel)]="it.description" /></td>
                  <td><input type="number" min="0" step="any" class="right" style="width: 80px" [(ngModel)]="it.quantity" /></td>
                  <td><input type="number" min="0" step="any" class="right" style="width: 120px" [(ngModel)]="it.unitPrice" /></td>
                  <td><input type="number" min="0" step="any" class="right" style="width: 100px" [(ngModel)]="it.discount" /></td>
                  <td class="num">{{ line(it) | money }}</td>
                  <td class="no-print"><button class="btn btn-ghost btn-sm" aria-label="Remove" (click)="items.splice($index, 1)">✕</button></td>
                } @else {
                  <td>{{ it.description }} @if (it.kind === 'part') {<span class="muted small">(part)</span>}</td>
                  <td class="num">{{ it.quantity }}</td>
                  <td class="num">{{ it.unitPrice | money }}</td>
                  <td class="num">{{ it.discount ? (it.discount | money) : '' }}</td>
                  <td class="num">{{ it.total | money }}</td>
                }
              </tr>
            } @empty {
              <tr><td colspan="6" class="empty">No line items.</td></tr>
            }
          </tbody>
        </table></div>

        @if (editable()) {
          <div class="row no-print" style="margin-top: 10px">
            <button class="btn btn-ghost btn-sm" (click)="items.push({ kind: 'labor', description: '', quantity: 1, unitPrice: 0, discount: 0 })">+ Line</button>
            @if (auth.has('inventory')) {
              <input placeholder="Add part (SKU or name)" style="max-width: 280px" [(ngModel)]="partSearch" (ngModelChange)="findParts()" />
              @for (p of parts(); track p._id) {
                <button class="btn btn-ghost btn-sm" (click)="addPart(p)">{{ p.sku }} · {{ p.sellPrice | money }}</button>
              }
            }
          </div>
        }

        <div class="totals" style="margin-top: 18px">
          <div class="row"><span class="muted">Subtotal</span><span>{{ editable() ? (subtotal() | money) : (i.subtotal | money) }}</span></div>
          <div class="row"><span class="muted">Discount</span>
            @if (editable()) {<input type="number" min="0" step="any" class="right" style="width: 140px" [(ngModel)]="discount" />} @else {<span>{{ i.discount | money }}</span>}
          </div>
          <div class="row"><span class="muted">Tax @if (!editable()) {({{ i.taxRate }}%)}</span>
            @if (editable()) {<span class="row" style="gap: 4px"><input type="number" min="0" max="100" step="any" class="right" style="width: 80px" [(ngModel)]="taxRate" />%</span>} @else {<span>{{ i.tax | money }}</span>}
          </div>
          <div class="row" style="border-top: 1px solid var(--border); margin-top: 6px; padding-top: 8px; font-size: 17px"><strong>Total</strong><strong>{{ editable() ? (previewTotal() | money) : (i.total | money) }}</strong></div>
          @if (i.type === 'invoice') {
            <div class="row"><span class="muted">Paid</span><span>{{ i.paid | money }}</span></div>
            <div class="row"><strong>Balance due</strong><strong [style.color]="i.balance > 0 ? 'var(--danger)' : 'var(--success)'">{{ i.balance | money }}</strong></div>
          }
        </div>

        @if (editable()) {
          <div class="grid-2 no-print" style="margin-top: 16px">
            <label class="field">Due date<input type="date" [(ngModel)]="dueDate" /></label>
            <label class="field">Notes<input [(ngModel)]="notes" /></label>
          </div>
          <div class="form-actions no-print">
            @if (i.status === 'draft') {<button class="btn btn-ghost" [disabled]="busy()" (click)="save('sent')">Save & mark sent</button>}
            <button class="btn" [disabled]="busy()" (click)="save()">Save</button>
          </div>
        } @else if (i.notes) {
          <p style="margin-top: 16px"><span class="muted">Notes:</span> {{ i.notes }}</p>
        }
        @if (tenant()?.settings?.invoiceFooter) {<p class="muted small" style="margin-top: 24px; text-align: center">{{ tenant()?.settings?.invoiceFooter }}</p>}
      </div>

      @if (i.payments.length) {
        <section class="card no-print" style="margin-top: 16px">
          <div class="card-head"><h2>Payments</h2></div>
          <div class="table-wrap"><table>
            <thead><tr><th>Date</th><th>Method</th><th>Reference</th><th class="num">Amount</th></tr></thead>
            <tbody>
              @for (p of i.payments; track p._id) {
                <tr><td>{{ p.paidAt | date: 'medium' }}</td><td>{{ p.method | label }} @if (p.refund) {<span class="badge badge-cancelled">Refund</span>}</td><td>{{ p.reference }}</td><td class="num">{{ (p.refund ? -p.amount : p.amount) | money }}</td></tr>
              }
            </tbody>
          </table></div>
        </section>
      }
      @if (i.status !== 'cancelled' && i.paid === 0 && auth.can('owner', 'manager')) {
        <div class="no-print" style="margin-top: 12px"><button class="btn btn-ghost btn-sm" (click)="save('cancelled')">Cancel this {{ i.type }}</button></div>
      }

      <app-modal [open]="paying()" title="Record payment" (close)="paying.set(false)">
        <form class="stack" (ngSubmit)="pay()">
          <div class="grid-2">
            <label class="field">Amount<input type="number" min="0.01" step="any" [(ngModel)]="payment.amount" name="amount" required /></label>
            <label class="field">Method
              <select [(ngModel)]="payment.method" name="method">
                <option value="cash">Cash</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option><option value="cheque">Cheque</option><option value="online">Online</option><option value="other">Other</option>
              </select>
            </label>
            <label class="field span-all">Reference<input [(ngModel)]="payment.reference" name="ref" placeholder="Receipt / cheque / transaction no." /></label>
          </div>
          <div class="form-actions">
            <button type="button" class="btn btn-ghost" (click)="paying.set(false)">Cancel</button>
            <button class="btn" [disabled]="!payment.amount || busy()">Record {{ payment.amount | money }}</button>
          </div>
        </form>
      </app-modal>
    }
  `,
})
export class InvoiceDetailPage implements OnInit {
  @Input() id!: string;
  auth = inject(AuthService);
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private router = inject(Router);

  inv = signal<Invoice | null>(null);
  tenant = this.auth.tenant;
  busy = signal(false);
  paying = signal(false);
  parts = signal<Part[]>([]);
  items: LineItem[] = [];
  discount = 0;
  taxRate = 0;
  dueDate = '';
  notes = '';
  partSearch = '';
  payment = { amount: 0, method: 'cash', reference: '' };
  private timer?: ReturnType<typeof setTimeout>;

  editable = computed(() => {
    const i = this.inv();
    return !!i && i.paid === 0 && ['draft', 'sent'].includes(i.status);
  });

  ngOnInit() {
    this.load();
  }

  load() {
    this.api.get<Invoice>(`/invoices/${this.id}`).subscribe({
      next: (i) => {
        this.inv.set(i);
        this.items = i.items.map((x) => ({ ...x }));
        this.discount = i.discount;
        this.taxRate = i.taxRate;
        this.dueDate = toDateInput(i.dueDate);
        this.notes = i.notes ?? '';
      },
      error: (e) => {
        this.toast.error(e);
        this.router.navigateByUrl('/app/invoices');
      },
    });
  }

  line(it: LineItem) {
    return Math.max(Number(it.quantity || 0) * Number(it.unitPrice || 0) - Number(it.discount || 0), 0);
  }

  subtotal() {
    return this.items.reduce((s, it) => s + this.line(it), 0);
  }

  previewTotal() {
    const after = Math.max(this.subtotal() - Number(this.discount || 0), 0);
    return after + (after * Number(this.taxRate || 0)) / 100;
  }

  findParts() {
    clearTimeout(this.timer);
    if (this.partSearch.length < 2) return this.parts.set([]);
    this.timer = setTimeout(() => this.api.list<Part>('/parts', { search: this.partSearch, limit: 5 }).subscribe((r) => this.parts.set(r.items)), 200);
  }

  addPart(p: Part) {
    this.items.push({ kind: 'part', description: p.name, part: p._id, quantity: 1, unitPrice: p.sellPrice, discount: 0 });
    this.partSearch = '';
    this.parts.set([]);
  }

  private run<T>(req: Observable<T>, ok: string, after?: (r: T) => void) {
    this.busy.set(true);
    req.subscribe({
      next: (r) => {
        this.busy.set(false);
        this.toast.success(ok);
        after ? after(r) : this.load();
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.error(e);
      },
    });
  }

  save(status?: string) {
    if (status === 'cancelled') {
      if (!confirm('Cancel this document?')) return;
      return this.run(this.api.patch(`/invoices/${this.id}`, { status }), 'Cancelled');
    }
    const body: Record<string, unknown> = {
      items: this.items
        .filter((i) => i.description.trim())
        .map(({ total: _t, ...i }) => ({ ...i, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice), discount: Number(i.discount || 0), part: i.part || undefined })),
      discount: Number(this.discount || 0),
      taxRate: Number(this.taxRate || 0),
      notes: this.notes,
    };
    if (this.dueDate) body['dueDate'] = new Date(this.dueDate).toISOString();
    if (status) body['status'] = status;
    this.run(this.api.patch(`/invoices/${this.id}`, body), 'Saved');
  }

  convert() {
    this.run(this.api.post<Invoice>(`/invoices/${this.id}/convert`), 'Invoice created from quote', (inv) => {
      this.id = inv._id;
      this.router.navigate(['/app/invoices', inv._id]);
      this.load();
    });
  }

  openPayment() {
    this.payment = { amount: this.inv()?.balance ?? 0, method: 'cash', reference: '' };
    this.paying.set(true);
  }

  pay() {
    const body: Record<string, unknown> = { amount: Number(this.payment.amount), method: this.payment.method };
    if (this.payment.reference) body['reference'] = this.payment.reference;
    this.run(this.api.post(`/invoices/${this.id}/payments`, body), 'Payment recorded', () => {
      this.paying.set(false);
      this.load();
    });
  }

  print() {
    window.print();
  }
}
