import { DatePipe } from '@angular/common';
import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { Plan, Tenant } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { UI, toDateInput } from '../../shared/ui';

export const FEATURE_KEYS = [
  'customers',
  'vehicles',
  'jobCards',
  'inventory',
  'invoicing',
  'scheduling',
  'onlineBooking',
  'expenses',
  'reminders',
  'analytics',
  'sms',
  'email',
  'realtime',
];

interface TenantForm {
  plan: string;
  status: string;
  billingCycle: string;
  customPrice: number | null;
  discountPercent: number;
  trialEndsAt: string;
  currentPeriodEnd: string;
  extraFeatures: string[];
  disabledFeatures: string[];
  notes: string;
}

@Component({
  selector: 'app-admin-tenant-detail',
  imports: [FormsModule, DatePipe, RouterLink, ...UI],
  styles: `
    .features { display: grid; gap: 6px 14px; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); }
    .layout { display: grid; gap: 16px; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); align-items: start; }
    @media (max-width: 1000px) { .layout { grid-template-columns: minmax(0, 1fr); } }
    dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; margin: 0; }
    dt { color: var(--muted); }
    dd { margin: 0; }
  `,
  template: `
    @if (tenant(); as t) {
      <div class="page-head">
        <a class="btn btn-ghost btn-sm" routerLink="/admin/tenants">← Vendors</a>
        <div>
          <h1>{{ t.name }}</h1>
          <p class="muted">{{ t.email }} · {{ t.phone }} · {{ t.city }}</p>
        </div>
        <app-status [value]="t.status" />
        <span class="spacer"></span>
        <button class="btn btn-ghost" (click)="openPayment()">Record payment</button>
        <button class="btn" (click)="save()" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Save changes' }}</button>
      </div>

      <div class="layout">
        <div class="stack">
          <div class="card card-pad stack">
            <h2>Subscription & pricing</h2>
            <div class="grid-2">
              <label class="field">Plan
                <select [(ngModel)]="form.plan">
                  @for (p of plans(); track p._id) {
                    <option [value]="p._id">{{ p.name }}{{ p.active ? '' : ' (archived)' }} — {{ p.monthlyPrice | money: p.currency }}/mo</option>
                  }
                </select>
              </label>
              <label class="field">Status
                <select [(ngModel)]="form.status">
                  @for (s of statuses; track s) {<option [value]="s">{{ s | label }}</option>}
                </select>
              </label>
              <label class="field">Billing cycle
                <select [(ngModel)]="form.billingCycle">
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </label>
              <label class="field">Custom price per cycle <span class="hint">Leave blank to use the plan price</span>
                <input type="number" min="0" [(ngModel)]="form.customPrice" placeholder="Plan price" />
              </label>
              <label class="field">Discount %
                <input type="number" min="0" max="100" [(ngModel)]="form.discountPercent" />
              </label>
              <div class="field">
                Vendor pays
                <div style="font-size: 20px; font-weight: 650">{{ preview() | money: selectedPlan()?.currency ?? 'LKR' }}</div>
                <span class="hint">per {{ form.billingCycle === 'yearly' ? 'year' : 'month' }} (saved: {{ t.effectivePrice | money: t.plan.currency }})</span>
              </div>
              <label class="field">Trial ends<input type="date" [(ngModel)]="form.trialEndsAt" /></label>
              <label class="field">Paid until<input type="date" [(ngModel)]="form.currentPeriodEnd" /></label>
            </div>
          </div>

          <div class="card card-pad stack">
            <div>
              <h2>Feature overrides</h2>
              <p class="muted small" style="margin: 4px 0 0">On top of the plan: add features for this vendor only, or switch plan features off.</p>
            </div>
            <div>
              <h3 style="margin-bottom: 8px">Extra features</h3>
              <div class="features">
                @for (f of featureKeys; track f) {
                  <label class="check" [class.muted]="inPlan(f)">
                    <input type="checkbox" [checked]="form.extraFeatures.includes(f)" [disabled]="inPlan(f)" (change)="toggle('extraFeatures', f)" />
                    {{ f | label }}@if (inPlan(f)) { <span class="small">(in plan)</span>}
                  </label>
                }
              </div>
            </div>
            <div>
              <h3 style="margin-bottom: 8px">Disabled features</h3>
              <div class="features">
                @for (f of featureKeys; track f) {
                  <label class="check">
                    <input type="checkbox" [checked]="form.disabledFeatures.includes(f)" (change)="toggle('disabledFeatures', f)" />
                    {{ f | label }}
                  </label>
                }
              </div>
            </div>
          </div>

          <div class="card card-pad">
            <label class="field">Internal notes<textarea [(ngModel)]="form.notes"></textarea></label>
          </div>
        </div>

        <div class="stack">
          <div class="card card-pad stack">
            <h2>Vendor</h2>
            <dl>
              <dt>Slug</dt><dd class="mono">{{ t.slug }}</dd>
              <dt>Address</dt><dd>{{ t.address || '—' }}</dd>
              <dt>Reg. no</dt><dd>{{ t.registrationNo || '—' }}</dd>
              <dt>Joined</dt><dd>{{ t.createdAt | date: 'mediumDate' }}</dd>
            </dl>
            <div class="small">
              <div class="muted">Public booking page</div>
              <a [href]="origin + '/book/' + t.slug" target="_blank" rel="noopener">{{ origin }}/book/{{ t.slug }}</a>
            </div>
          </div>

          <div class="card">
            <div class="card-head"><h2>Payments</h2></div>
            <div class="table-wrap">
              <table>
                <thead><tr><th>Date</th><th class="num">Amount</th><th>Until</th></tr></thead>
                <tbody>
                  @for (p of payments(); track $index) {
                    <tr>
                      <td class="nowrap">{{ p.paidAt | date: 'mediumDate' }}<div class="muted small">{{ p.method | label }} {{ p.reference }}</div></td>
                      <td class="num">{{ p.amount | money: t.plan.currency }}</td>
                      <td class="nowrap">{{ p.periodEnd | date: 'mediumDate' }}</td>
                    </tr>
                  } @empty {
                    <tr><td colspan="3" class="empty">No payments recorded.</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <app-modal [open]="payOpen()" title="Record subscription payment" (close)="payOpen.set(false)">
        <form class="stack" (ngSubmit)="recordPayment()">
          <div class="grid-2">
            <label class="field">Amount<input type="number" min="0" name="amount" [(ngModel)]="pay.amount" required /></label>
            <label class="field">Periods covered <span class="hint">{{ form.billingCycle === 'yearly' ? 'years' : 'months' }}</span>
              <input type="number" min="1" name="periods" [(ngModel)]="pay.periods" />
            </label>
            <label class="field">Method
              <select name="method" [(ngModel)]="pay.method">
                @for (m of methods; track m) {<option [value]="m">{{ m | label }}</option>}
              </select>
            </label>
            <label class="field">Reference<input name="reference" [(ngModel)]="pay.reference" /></label>
          </div>
          <p class="muted small" style="margin: 0">Recording a payment activates the vendor and extends their paid period.</p>
          <div class="form-actions">
            <button type="button" class="btn btn-ghost" (click)="payOpen.set(false)">Cancel</button>
            <button class="btn" type="submit" [disabled]="busy() || !(pay.amount > 0)">Record payment</button>
          </div>
        </form>
      </app-modal>
    } @else {
      <div class="card empty">Loading…</div>
    }
  `,
})
export class AdminTenantDetailPage implements OnInit {
  @Input() id = '';
  private api = inject(ApiService);
  private toast = inject(ToastService);

  featureKeys = FEATURE_KEYS;
  statuses = ['trial', 'active', 'past_due', 'suspended'];
  methods = ['bank_transfer', 'cash', 'card', 'cheque', 'online', 'other'];
  origin = typeof location !== 'undefined' ? location.origin : '';

  tenant = signal<Tenant | null>(null);
  plans = signal<Plan[]>([]);
  busy = signal(false);
  payOpen = signal(false);
  private formVersion = signal(0);

  form: TenantForm = this.emptyForm();
  pay = { amount: 0, periods: 1, method: 'bank_transfer', reference: '' };

  selectedPlan = computed(() => {
    this.formVersion();
    return this.plans().find((p) => p._id === this.form.plan);
  });

  payments = computed(() => [...(this.tenant()?.payments ?? [])].reverse());

  ngOnInit() {
    this.api.get<Plan[]>('/plans/all').subscribe({ next: (p) => this.plans.set(p), error: (e) => this.toast.error(e) });
    this.load();
  }

  private emptyForm(): TenantForm {
    return {
      plan: '',
      status: 'trial',
      billingCycle: 'monthly',
      customPrice: null,
      discountPercent: 0,
      trialEndsAt: '',
      currentPeriodEnd: '',
      extraFeatures: [],
      disabledFeatures: [],
      notes: '',
    };
  }

  load() {
    this.api.get<Tenant>(`/admin/tenants/${this.id}`).subscribe({
      next: (t) => this.apply(t),
      error: (e) => this.toast.error(e),
    });
  }

  private apply(t: Tenant) {
    this.tenant.set(t);
    this.form = {
      plan: t.plan?._id ?? '',
      status: t.status,
      billingCycle: t.billingCycle,
      customPrice: t.customPrice ?? null,
      discountPercent: t.discountPercent ?? 0,
      trialEndsAt: toDateInput(t.trialEndsAt),
      currentPeriodEnd: toDateInput(t.currentPeriodEnd),
      extraFeatures: [...(t.extraFeatures ?? [])],
      disabledFeatures: [...(t.disabledFeatures ?? [])],
      notes: t.notes ?? '',
    };
    this.formVersion.update((v) => v + 1);
  }

  inPlan(f: string) {
    return !!this.plans().find((p) => p._id === this.form.plan)?.features.includes(f);
  }

  toggle(list: 'extraFeatures' | 'disabledFeatures', f: string) {
    const cur = this.form[list];
    this.form[list] = cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f];
  }

  /** Live price preview mirroring the API's effectivePrice rule. */
  preview() {
    const plan = this.plans().find((p) => p._id === this.form.plan);
    if (!plan) return 0;
    const custom = this.form.customPrice;
    const base = custom !== null && custom !== undefined && String(custom) !== '' ? Number(custom) : this.form.billingCycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
    return Math.round(base * (1 - (Number(this.form.discountPercent) || 0) / 100) * 100) / 100;
  }

  save() {
    const f = this.form;
    const custom = f.customPrice !== null && f.customPrice !== undefined && String(f.customPrice) !== '' ? Number(f.customPrice) : null;
    // Plan features can't also be "extra".
    const extra = f.extraFeatures.filter((x) => !this.inPlan(x));
    const body: Record<string, unknown> = {
      plan: f.plan,
      status: f.status,
      billingCycle: f.billingCycle,
      customPrice: custom,
      discountPercent: Number(f.discountPercent) || 0,
      extraFeatures: extra,
      disabledFeatures: f.disabledFeatures,
      notes: f.notes,
    };
    if (f.trialEndsAt) body['trialEndsAt'] = new Date(`${f.trialEndsAt}T23:59:59`).toISOString();
    if (f.currentPeriodEnd) body['currentPeriodEnd'] = new Date(`${f.currentPeriodEnd}T23:59:59`).toISOString();
    this.busy.set(true);
    this.api.patch<Tenant>(`/admin/tenants/${this.id}`, body).subscribe({
      next: (t) => {
        this.busy.set(false);
        this.apply(t);
        this.toast.success('Vendor updated');
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.error(e);
      },
    });
  }

  openPayment() {
    this.pay = { amount: this.tenant()?.effectivePrice ?? 0, periods: 1, method: 'bank_transfer', reference: '' };
    this.payOpen.set(true);
  }

  recordPayment() {
    const body: Record<string, unknown> = { amount: Number(this.pay.amount), periods: Number(this.pay.periods) || 1, method: this.pay.method };
    if (this.pay.reference.trim()) body['reference'] = this.pay.reference.trim();
    this.busy.set(true);
    this.api.post<Tenant>(`/admin/tenants/${this.id}/payments`, body).subscribe({
      next: (t) => {
        this.busy.set(false);
        this.payOpen.set(false);
        this.apply(t);
        this.toast.success('Payment recorded');
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.error(e);
      },
    });
  }
}
