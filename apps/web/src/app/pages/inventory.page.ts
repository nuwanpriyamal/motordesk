import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { Paginated, Part } from '../core/models';
import { ToastService } from '../core/toast.service';
import { UI } from '../shared/ui';

interface Movement {
  _id: string;
  type: string;
  quantity: number;
  reason?: string;
  reference?: string;
  createdAt: string;
  user?: { name: string };
}

interface Valuation {
  items: number;
  units: number;
  costValue: number;
  retailValue: number;
}

const BLANK_PART = {
  sku: '',
  name: '',
  category: '',
  brand: '',
  barcode: '',
  unit: 'pcs',
  costPrice: 0,
  sellPrice: 0,
  quantity: 0,
  reorderLevel: 5,
  location: '',
  supplierName: '',
  supplierPhone: '',
};

@Component({
  imports: [FormsModule, DatePipe, ...UI],
  template: `
    <div class="page-head">
      <div><h1>Inventory</h1><p class="muted">Parts, stock levels and movements</p></div>
      <span class="spacer"></span>
      <button class="btn" (click)="openPart()">+ Add part</button>
    </div>

    @if (value(); as v) {
      <div class="stats" style="margin-bottom: 16px">
        <div class="card stat"><div class="label">Parts</div><div class="value">{{ v.items }}</div><div class="sub">{{ v.units }} units</div></div>
        <div class="card stat"><div class="label">Stock value (cost)</div><div class="value" style="font-size: 20px">{{ v.costValue | money }}</div></div>
        <div class="card stat"><div class="label">Stock value (retail)</div><div class="value" style="font-size: 20px">{{ v.retailValue | money }}</div></div>
        <div class="card stat"><div class="label">Low stock</div><div class="value" [style.color]="lowCount() ? 'var(--danger)' : null">{{ lowCount() }}</div></div>
      </div>
    }

    <div class="card">
      <div class="card-head">
        <input class="search" placeholder="Search SKU, name, brand, barcode" [(ngModel)]="search" (ngModelChange)="reload()" />
        <label class="check small"><input type="checkbox" [(ngModel)]="lowOnly" (ngModelChange)="load()" /> Low stock only</label>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>SKU</th><th>Part</th><th>Category</th><th class="num">In stock</th><th class="num">Cost</th><th class="num">Price</th><th>Location</th><th></th></tr></thead>
        <tbody>
          @for (p of data().items; track p._id) {
            <tr>
              <td class="mono">{{ p.sku }}</td>
              <td><strong>{{ p.name }}</strong> <span class="muted small">{{ p.brand }}</span></td>
              <td>{{ p.category }}</td>
              <td class="num" [style.color]="p.quantity <= p.reorderLevel ? 'var(--danger)' : null"><strong>{{ p.quantity }}</strong> <span class="muted small">{{ p.unit }}</span></td>
              <td class="num">{{ p.costPrice | money }}</td>
              <td class="num">{{ p.sellPrice | money }}</td>
              <td>{{ p.location }}</td>
              <td class="right nowrap">
                <button class="btn btn-sm" (click)="openAdjust(p, 'in')">Receive</button>
                <button class="btn btn-ghost btn-sm" (click)="openAdjust(p, 'adjust')">Count</button>
                <button class="btn btn-ghost btn-sm" (click)="openHistory(p)">History</button>
                <button class="btn btn-ghost btn-sm" (click)="openPart(p)">Edit</button>
              </td>
            </tr>
          } @empty {
            <tr><td colspan="8" class="empty">No parts found.</td></tr>
          }
        </tbody>
      </table></div>
      @if (!lowOnly) {<app-pager [page]="page" [limit]="data().limit" [total]="data().total" (go)="page = $event; load()" />}
    </div>

    <app-modal [open]="editing()" [title]="editId ? 'Edit part' : 'Add part'" (close)="editing.set(false)">
      <form class="stack" (ngSubmit)="savePart()">
        <div class="grid-2">
          <label class="field">SKU *<input [(ngModel)]="f.sku" name="sku" required /></label>
          <label class="field">Name *<input [(ngModel)]="f.name" name="name" required /></label>
          <label class="field">Category<input [(ngModel)]="f.category" name="cat" list="cats" /></label>
          <datalist id="cats"><option value="Lubricants"></option><option value="Filters"></option><option value="Brakes"></option><option value="Ignition"></option><option value="Electrical"></option><option value="Suspension"></option><option value="Tyres"></option><option value="Body"></option></datalist>
          <label class="field">Brand<input [(ngModel)]="f.brand" name="brand" /></label>
          <label class="field">Barcode<input [(ngModel)]="f.barcode" name="barcode" /></label>
          <label class="field">Unit<input [(ngModel)]="f.unit" name="unit" /></label>
          <label class="field">Cost price<input type="number" min="0" step="any" [(ngModel)]="f.costPrice" name="cost" /></label>
          <label class="field">Selling price<input type="number" min="0" step="any" [(ngModel)]="f.sellPrice" name="price" /></label>
          @if (!editId) {<label class="field">Opening stock<input type="number" min="0" step="any" [(ngModel)]="f.quantity" name="qty" /></label>}
          <label class="field">Reorder level<input type="number" min="0" [(ngModel)]="f.reorderLevel" name="reorder" /></label>
          <label class="field">Shelf / location<input [(ngModel)]="f.location" name="loc" /></label>
          <label class="field">Supplier<input [(ngModel)]="f.supplierName" name="sup" /></label>
          <label class="field">Supplier phone<input [(ngModel)]="f.supplierPhone" name="supp" /></label>
        </div>
        <div class="form-actions">
          @if (editId) {<button type="button" class="btn btn-ghost" (click)="removePart()">Delete</button>}
          <span class="spacer"></span>
          <button type="button" class="btn btn-ghost" (click)="editing.set(false)">Cancel</button>
          <button class="btn" [disabled]="!f.sku || !f.name">Save</button>
        </div>
      </form>
    </app-modal>

    <app-modal [open]="!!adjusting()" [title]="(adj.type === 'in' ? 'Receive stock: ' : 'Stock count: ') + (adjusting()?.name ?? '')" (close)="adjusting.set(null)">
      <form class="stack" (ngSubmit)="saveAdjust()">
        <p class="muted" style="margin: 0">Currently {{ adjusting()?.quantity }} {{ adjusting()?.unit }} in stock.</p>
        <div class="grid-2">
          <label class="field">{{ adj.type === 'in' ? 'Quantity received' : 'Counted quantity' }}<input type="number" min="0" step="any" [(ngModel)]="adj.quantity" name="q" required /></label>
          @if (adj.type === 'in') {<label class="field">Unit cost<input type="number" min="0" step="any" [(ngModel)]="adj.unitCost" name="uc" /></label>}
          <label class="field">Reference<input [(ngModel)]="adj.reference" name="ref" placeholder="GRN / supplier invoice" /></label>
          <label class="field">Reason<input [(ngModel)]="adj.reason" name="reason" /></label>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-ghost" (click)="adjusting.set(null)">Cancel</button>
          <button class="btn">Save</button>
        </div>
      </form>
    </app-modal>

    <app-modal [open]="!!history()" [title]="'Stock history: ' + (historyPart()?.name ?? '')" (close)="history.set(null)">
      <div class="table-wrap"><table>
        <thead><tr><th>Date</th><th>Type</th><th class="num">Change</th><th>Reference</th><th>By</th></tr></thead>
        <tbody>
          @for (m of history() ?? []; track m._id) {
            <tr><td class="nowrap">{{ m.createdAt | date: 'short' }}</td><td>{{ m.type | label }} <span class="muted small">{{ m.reason }}</span></td>
              <td class="num" [style.color]="m.quantity < 0 ? 'var(--danger)' : 'var(--success)'">{{ m.quantity > 0 ? '+' : '' }}{{ m.quantity }}</td>
              <td class="mono small">{{ m.reference }}</td><td>{{ m.user?.name }}</td></tr>
          } @empty {
            <tr><td colspan="5" class="empty">No movements yet.</td></tr>
          }
        </tbody>
      </table></div>
    </app-modal>
  `,
})
export class InventoryPage implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  data = signal<Paginated<Part>>({ items: [], total: 0, page: 1, limit: 20 });
  value = signal<Valuation | null>(null);
  lowCount = signal(0);
  search = '';
  lowOnly = false;
  page = 1;

  editing = signal(false);
  editId = '';
  f = { ...BLANK_PART };
  adjusting = signal<Part | null>(null);
  adj = { type: 'in' as 'in' | 'adjust', quantity: 0, unitCost: null as number | null, reference: '', reason: '' };
  history = signal<Movement[] | null>(null);
  historyPart = signal<Part | null>(null);
  private timer?: ReturnType<typeof setTimeout>;

  ngOnInit() {
    this.load();
  }

  reload() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.page = 1;
      this.load();
    }, 250);
  }

  load() {
    this.api.get<Valuation>('/parts/reports/valuation').subscribe((v) => this.value.set(v));
    this.api.get<Part[]>('/parts/reports/low-stock').subscribe((low) => {
      this.lowCount.set(low.length);
      if (this.lowOnly) this.data.set({ items: low, total: low.length, page: 1, limit: low.length || 20 });
    });
    if (this.lowOnly) return;
    this.api.list<Part>('/parts', { page: this.page, search: this.search, sort: 'name' }).subscribe({
      next: (d) => this.data.set(d),
      error: (e) => this.toast.error(e),
    });
  }

  openPart(p?: Part) {
    this.editId = p?._id ?? '';
    this.f = p
      ? {
          sku: p.sku,
          name: p.name,
          category: p.category ?? '',
          brand: p.brand ?? '',
          barcode: p.barcode ?? '',
          unit: p.unit,
          costPrice: p.costPrice,
          sellPrice: p.sellPrice,
          quantity: p.quantity,
          reorderLevel: p.reorderLevel,
          location: p.location ?? '',
          supplierName: p.supplierName ?? '',
          supplierPhone: p.supplierPhone ?? '',
        }
      : { ...BLANK_PART };
    this.editing.set(true);
  }

  savePart() {
    const body: Record<string, unknown> = { ...this.f };
    for (const [k, v] of Object.entries(body)) if (v === '') delete body[k];
    for (const k of ['costPrice', 'sellPrice', 'quantity', 'reorderLevel']) body[k] = Number(body[k] ?? 0);
    if (this.editId) delete body['quantity'];
    const req = this.editId ? this.api.patch(`/parts/${this.editId}`, body) : this.api.post('/parts', body);
    req.subscribe({
      next: () => {
        this.editing.set(false);
        this.toast.success('Part saved');
        this.load();
      },
      error: (e) => this.toast.error(e),
    });
  }

  removePart() {
    if (!confirm('Delete this part?')) return;
    this.api.delete(`/parts/${this.editId}`).subscribe({
      next: () => {
        this.editing.set(false);
        this.load();
      },
      error: (e) => this.toast.error(e),
    });
  }

  openAdjust(p: Part, type: 'in' | 'adjust') {
    this.adj = { type, quantity: type === 'adjust' ? p.quantity : 0, unitCost: type === 'in' ? p.costPrice : null, reference: '', reason: type === 'adjust' ? 'Stock count' : 'Purchase' };
    this.adjusting.set(p);
  }

  saveAdjust() {
    const p = this.adjusting();
    if (!p) return;
    const body: Record<string, unknown> = { type: this.adj.type, quantity: Number(this.adj.quantity) };
    if (this.adj.unitCost) body['unitCost'] = Number(this.adj.unitCost);
    if (this.adj.reference) body['reference'] = this.adj.reference;
    if (this.adj.reason) body['reason'] = this.adj.reason;
    this.api.post<Part>(`/parts/${p._id}/adjust`, body).subscribe({
      next: (r) => {
        this.adjusting.set(null);
        this.toast.success(`${r.name}: ${r.quantity} in stock`);
        this.load();
      },
      error: (e) => this.toast.error(e),
    });
  }

  openHistory(p: Part) {
    this.historyPart.set(p);
    this.api.get<Movement[]>(`/parts/${p._id}/movements`).subscribe((m) => this.history.set(m));
  }
}
