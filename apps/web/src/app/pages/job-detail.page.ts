import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, Input, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Observable, Subscription } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { Invoice, JobCard, LineItem, Part, User } from '../core/models';
import { RealtimeService } from '../core/realtime.service';
import { ToastService } from '../core/toast.service';
import { UI, toDateTimeInput } from '../shared/ui';

const NEXT: Record<string, { to: string; label: string; ghost?: boolean }[]> = {
  pending: [{ to: 'in_progress', label: 'Start work' }, { to: 'cancelled', label: 'Cancel job', ghost: true }],
  in_progress: [{ to: 'completed', label: 'Mark completed' }, { to: 'waiting_parts', label: 'Waiting for parts', ghost: true }],
  waiting_parts: [{ to: 'in_progress', label: 'Resume work' }],
  completed: [{ to: 'delivered', label: 'Deliver to customer' }, { to: 'in_progress', label: 'Reopen', ghost: true }],
  delivered: [{ to: 'in_progress', label: 'Reopen', ghost: true }],
  cancelled: [{ to: 'pending', label: 'Restore', ghost: true }],
};

@Component({
  imports: [FormsModule, RouterLink, DatePipe, DecimalPipe, ...UI],
  template: `
    @if (job(); as j) {
      <div class="page-head">
        <div>
          <div class="muted small"><a routerLink="/app/jobs">Job cards</a> / {{ j.number }}</div>
          <h1>{{ j.vehicle.registrationNo }} <span class="muted" style="font-weight: 450">{{ j.vehicle.make }} {{ j.vehicle.model }}</span></h1>
          <p class="muted"><a [routerLink]="['/app/customers', j.customer._id]">{{ j.customer.name }}</a> · {{ j.customer.phone }} · opened {{ j.createdAt | date: 'medium' }}</p>
        </div>
        <span class="spacer"></span>
        <app-status [value]="j.status" />
        @for (a of actions(); track a.to) {
          <button class="btn" [class.btn-ghost]="a.ghost" [disabled]="busy()" (click)="setStatus(a.to)">{{ a.label }}</button>
        }
      </div>

      <div class="split">
        <div class="stack">
          <section class="card">
            <div class="card-head">
              <h2>Labour & parts</h2><span class="spacer"></span>
              @if (j.stockDeducted) {<span class="muted small">Parts issued from stock</span>}
            </div>
            <div class="table-wrap"><table>
              <thead><tr><th style="width: 120px">Type</th><th>Description</th><th class="num" style="width: 80px">Qty</th><th class="num" style="width: 120px">Unit price</th><th class="num" style="width: 110px">Discount</th><th class="num">Total</th><th></th></tr></thead>
              <tbody>
                @for (it of items; track $index) {
                  <tr>
                    <td><select [(ngModel)]="it.kind" [disabled]="locked()"><option value="labor">Labour</option><option value="part">Part</option><option value="other">Other</option></select></td>
                    <td><input [(ngModel)]="it.description" [disabled]="locked()" /></td>
                    <td><input type="number" min="0" step="any" class="right" [(ngModel)]="it.quantity" [disabled]="locked()" /></td>
                    <td><input type="number" min="0" step="any" class="right" [(ngModel)]="it.unitPrice" [disabled]="locked()" /></td>
                    <td><input type="number" min="0" step="any" class="right" [(ngModel)]="it.discount" [disabled]="locked()" /></td>
                    <td class="num nowrap">{{ line(it) | money }}</td>
                    <td>@if (!locked()) {<button class="btn btn-ghost btn-sm" aria-label="Remove line" (click)="items.splice($index, 1)">✕</button>}</td>
                  </tr>
                } @empty {
                  <tr><td colspan="7" class="empty">No items yet. Add labour or parts below.</td></tr>
                }
              </tbody>
            </table></div>
            @if (!locked()) {
              <div class="card-pad row" style="border-top: 1px solid var(--border)">
                <button class="btn btn-ghost btn-sm" (click)="addLabour()">+ Labour</button>
                @if (auth.has('inventory')) {
                  <div style="position: relative; flex: 1; min-width: 220px">
                    <input placeholder="Add part from inventory (SKU or name)" [(ngModel)]="partSearch" (ngModelChange)="findParts()" />
                    @if (partMatches().length) {
                      <div class="card" style="position: absolute; z-index: 5; left: 0; right: 0; top: 40px; max-height: 240px; overflow: auto">
                        @for (p of partMatches(); track p._id) {
                          <button class="btn btn-ghost btn-block" style="justify-content: space-between; border: none; border-radius: 0" (click)="addPart(p)">
                            <span>{{ p.name }} <span class="muted mono small">{{ p.sku }}</span></span>
                            <span class="muted small">{{ p.quantity }} in stock · {{ p.sellPrice | money }}</span>
                          </button>
                        }
                      </div>
                    }
                  </div>
                } @else {
                  <button class="btn btn-ghost btn-sm" (click)="addOther()">+ Part / other</button>
                }
              </div>
            }
            <div class="card-pad" style="border-top: 1px solid var(--border)">
              <div class="row"><span class="spacer"></span><span class="muted">Subtotal</span><strong style="min-width: 140px" class="right">{{ subtotal() | money }}</strong></div>
              <div class="row" style="margin-top: 6px"><span class="spacer"></span><span class="muted">Discount</span>
                <input type="number" min="0" step="any" style="width: 140px" class="right" [(ngModel)]="discount" [disabled]="locked()" /></div>
              <div class="row" style="margin-top: 6px"><span class="spacer"></span><span>Total</span><strong style="min-width: 140px; font-size: 18px" class="right">{{ subtotal() - (discount || 0) | money }}</strong></div>
            </div>
          </section>

          <section class="card card-pad stack">
            <h2>Inspection & notes</h2>
            <div class="grid-2">
              <label class="field">Service type<input [(ngModel)]="form.serviceType" /></label>
              <label class="field">Priority
                <select [(ngModel)]="form.priority"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select>
              </label>
              <label class="field">Mileage in (km)<input type="number" min="0" [(ngModel)]="form.mileageIn" /></label>
              <label class="field">Promised by<input type="datetime-local" [(ngModel)]="form.estimatedCompletion" /></label>
            </div>
            <label class="field">Customer complaint<textarea [(ngModel)]="form.complaint"></textarea></label>
            <label class="field">Diagnosis / work done<textarea [(ngModel)]="form.diagnosis"></textarea></label>
            <label class="field">Internal notes<textarea [(ngModel)]="form.notes"></textarea></label>
            <div class="form-actions"><button class="btn" [disabled]="busy()" (click)="save()">Save changes</button></div>
          </section>
        </div>

        <div class="stack">
          <section class="card card-pad stack">
            <h2>Billing</h2>
            @if (j.invoice) {
              <a class="btn btn-ghost" [routerLink]="['/app/invoices', j.invoice]">View invoice</a>
            } @else if (auth.has('invoicing')) {
              <button class="btn" [disabled]="busy() || !j.items.length" (click)="bill('invoice')">Create invoice</button>
              <button class="btn btn-ghost" [disabled]="busy() || !j.items.length" (click)="bill('quote')">Send quote / estimate</button>
              @if (!j.items.length) {<p class="muted small" style="margin: 0">Save at least one item first.</p>}
            }
          </section>

          <section class="card card-pad stack">
            <div class="row"><h2>Technicians</h2><span class="spacer"></span>
              @if (myTimer()) {
                <button class="btn btn-danger btn-sm" (click)="timer('stop')">Stop my timer</button>
              } @else {
                <button class="btn btn-ghost btn-sm" [disabled]="j.status === 'delivered' || j.status === 'cancelled'" (click)="timer('start')">▶ Start my timer</button>
              }
            </div>
            @for (u of staff(); track u._id) {
              <label class="check"><input type="checkbox" [checked]="assigned.has(u._id)" (change)="toggleAssign(u._id)" /> {{ u.name }} <span class="muted small">{{ u.role | label }}</span></label>
            }
            @if (j.timeLogs.length) {
              <div class="small muted">Time logged: {{ totalMinutes() }} min</div>
            }
          </section>

          <section class="card card-pad stack">
            <h2>Checklist</h2>
            @for (c of checklist; track $index) {
              <label class="check"><input type="checkbox" [(ngModel)]="c.done" (ngModelChange)="saveChecklist()" /> {{ c.label }}</label>
            }
            <div class="row">
              <input placeholder="Add check item" [(ngModel)]="newCheck" (keydown.enter)="addCheck()" style="flex: 1" />
              <button class="btn btn-ghost btn-sm" (click)="addCheck()">Add</button>
            </div>
          </section>

          <section class="card card-pad stack small">
            <h2>Vehicle</h2>
            <div>Mileage on file: {{ j.vehicle.mileage | number }} km</div>
            @if (j.vehicle.nextServiceDue) {<div>Next service due: {{ j.vehicle.nextServiceDue | date: 'mediumDate' }}</div>}
            <div class="muted">Customer can track this job at <a [href]="trackUrl()" target="_blank">{{ trackUrl() }}</a> with job number {{ j.number }} and their phone.</div>
          </section>
        </div>
      </div>
    } @else {
      <div class="card empty">Loading…</div>
    }
  `,
})
export class JobDetailPage implements OnInit, OnDestroy {
  @Input() id!: string;

  auth = inject(AuthService);
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private router = inject(Router);
  private realtime = inject(RealtimeService);
  private sub?: Subscription;

  job = signal<JobCard | null>(null);
  staff = signal<User[]>([]);
  busy = signal(false);
  partMatches = signal<Part[]>([]);
  items: LineItem[] = [];
  checklist: JobCard['checklist'] = [];
  assigned = new Set<string>();
  discount = 0;
  partSearch = '';
  newCheck = '';
  form = { serviceType: '', priority: 'normal', mileageIn: null as number | null, estimatedCompletion: '', complaint: '', diagnosis: '', notes: '' };
  private partTimer?: ReturnType<typeof setTimeout>;

  actions = computed(() => NEXT[this.job()?.status ?? ''] ?? []);
  locked = computed(() => !!this.job()?.stockDeducted || !!this.job()?.invoice);
  myTimer = computed(() => this.job()?.timeLogs.some((l) => !l.endedAt && l.user === this.auth.user()?.sub));
  totalMinutes = computed(() => this.job()?.timeLogs.reduce((s, l) => s + (l.minutes || 0), 0) ?? 0);

  subtotal() {
    return this.items.reduce((s, it) => s + this.line(it), 0);
  }

  ngOnInit() {
    this.load();
    this.api.get<User[]>('/users').subscribe((u) => this.staff.set(u.filter((x) => x.active)));
    this.sub = this.realtime.on('job.').subscribe((e) => {
      if (e.payload['id'] === this.id && !this.busy()) this.load(false);
    });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }

  trackUrl() {
    return `${location.origin}/track/${this.auth.tenant()?.slug}`;
  }

  load(resetForm = true) {
    this.api.get<JobCard>(`/job-cards/${this.id}`).subscribe({
      next: (j) => {
        this.job.set(j);
        this.checklist = j.checklist.map((c) => ({ ...c }));
        this.assigned = new Set(j.assignedTo.map((u) => u._id));
        if (resetForm) {
          this.items = j.items.map((i) => ({ ...i }));
          this.discount = j.discount;
          this.form = {
            serviceType: j.serviceType ?? '',
            priority: j.priority,
            mileageIn: j.mileageIn ?? null,
            estimatedCompletion: toDateTimeInput(j.estimatedCompletion),
            complaint: j.complaint ?? '',
            diagnosis: j.diagnosis ?? '',
            notes: j.notes ?? '',
          };
        }
      },
      error: (e) => {
        this.toast.error(e);
        this.router.navigateByUrl('/app/jobs');
      },
    });
  }

  line(it: LineItem) {
    return Math.max(Number(it.quantity || 0) * Number(it.unitPrice || 0) - Number(it.discount || 0), 0);
  }

  addLabour() {
    this.items.push({ kind: 'labor', description: '', quantity: 1, unitPrice: 0, discount: 0 });
  }

  addOther() {
    this.items.push({ kind: 'other', description: '', quantity: 1, unitPrice: 0, discount: 0 });
  }

  findParts() {
    clearTimeout(this.partTimer);
    if (this.partSearch.length < 2) return this.partMatches.set([]);
    this.partTimer = setTimeout(
      () => this.api.list<Part>('/parts', { search: this.partSearch, limit: 8 }).subscribe((r) => this.partMatches.set(r.items)),
      200,
    );
  }

  addPart(p: Part) {
    this.items.push({ kind: 'part', description: p.name, part: p._id, quantity: 1, unitPrice: p.sellPrice, discount: 0 });
    this.partSearch = '';
    this.partMatches.set([]);
  }

  private run<T>(req: Observable<T>, ok: string, after?: (r: T) => void) {
    this.busy.set(true);
    req.subscribe({
      next: (r) => {
        this.busy.set(false);
        if (ok) this.toast.success(ok);
        after ? after(r) : this.load();
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.error(e);
      },
    });
  }

  save() {
    const body: Record<string, unknown> = {
      serviceType: this.form.serviceType || undefined,
      priority: this.form.priority,
      complaint: this.form.complaint,
      diagnosis: this.form.diagnosis,
      notes: this.form.notes,
      mileageIn: this.form.mileageIn ? Number(this.form.mileageIn) : undefined,
      estimatedCompletion: this.form.estimatedCompletion ? new Date(this.form.estimatedCompletion).toISOString() : undefined,
    };
    if (!this.locked()) {
      body['discount'] = Number(this.discount || 0);
      body['items'] = this.items
        .filter((i) => i.description.trim())
        .map(({ total: _t, ...i }) => ({
          ...i,
          quantity: Number(i.quantity || 0),
          unitPrice: Number(i.unitPrice || 0),
          discount: Number(i.discount || 0),
          part: i.part || undefined,
        }));
    }
    this.run(this.api.patch(`/job-cards/${this.id}`, body), 'Job card saved');
  }

  setStatus(status: string) {
    this.run(this.api.patch(`/job-cards/${this.id}/status`, { status }), `Status: ${status.replace('_', ' ')}`);
  }

  timer(action: 'start' | 'stop') {
    this.run(this.api.post(`/job-cards/${this.id}/timer/${action}`), action === 'start' ? 'Timer started' : 'Timer stopped');
  }

  toggleAssign(userId: string) {
    this.assigned.has(userId) ? this.assigned.delete(userId) : this.assigned.add(userId);
    this.run(this.api.patch(`/job-cards/${this.id}`, { assignedTo: [...this.assigned] }), '');
  }

  addCheck() {
    if (!this.newCheck.trim()) return;
    this.checklist.push({ label: this.newCheck.trim(), done: false });
    this.newCheck = '';
    this.saveChecklist();
  }

  saveChecklist() {
    this.api.patch(`/job-cards/${this.id}`, { checklist: this.checklist.map(({ label, done, note }) => ({ label, done, note })) }).subscribe({
      error: (e) => this.toast.error(e),
    });
  }

  bill(type: 'invoice' | 'quote') {
    this.run(this.api.post<Invoice>(`/job-cards/${this.id}/${type}`), type === 'invoice' ? 'Invoice created' : 'Quote created', (inv) =>
      this.router.navigate(['/app/invoices', inv._id]),
    );
  }
}
