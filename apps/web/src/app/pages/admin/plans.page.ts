import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { Plan } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { UI } from '../../shared/ui';
import { FEATURE_KEYS } from './tenant-detail.page';

type PlanForm = Omit<Plan, '_id'> & { _id?: string };

const blank = (): PlanForm => ({
  code: '',
  name: '',
  description: '',
  currency: 'LKR',
  monthlyPrice: 0,
  yearlyPrice: 0,
  trialDays: 14,
  features: [],
  limits: { maxUsers: 3, maxVehicles: 500, maxJobCardsPerMonth: 1000, smsPerMonth: 100 },
  isPublic: true,
  active: true,
  sortOrder: 0,
});

@Component({
  selector: 'app-admin-plans',
  imports: [FormsModule, ...UI],
  styles: `
    .plans { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
    .plan { padding: 18px; display: flex; flex-direction: column; gap: 10px; }
    .plan.archived { opacity: 0.6; }
    .price { font-size: 22px; font-weight: 650; }
    .chips { display: flex; flex-wrap: wrap; gap: 4px; }
    .features { display: grid; gap: 6px 14px; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
  `,
  template: `
    <div class="page-head">
      <div>
        <h1>Plans & pricing</h1>
        <p class="muted">Packages sold to vendors. Per-vendor prices and overrides are set on each vendor.</p>
      </div>
      <span class="spacer"></span>
      <button class="btn" (click)="edit()">New plan</button>
    </div>

    <div class="plans">
      @for (p of plans(); track p._id) {
        <div class="card plan" [class.archived]="!p.active">
          <div class="row">
            <h2>{{ p.name }}</h2>
            <span class="badge mono">{{ p.code }}</span>
            <span class="spacer"></span>
            @if (!p.active) {<span class="badge badge-cancelled">Archived</span>}
            @else if (!p.isPublic) {<span class="badge">Hidden</span>}
          </div>
          <div class="muted">{{ p.description }}</div>
          <div class="price">{{ p.monthlyPrice | money: p.currency }} <span class="muted small">/ month</span></div>
          <div class="muted small">{{ p.yearlyPrice | money: p.currency }} / year · {{ p.trialDays }}-day trial</div>
          <div class="small">
            {{ p.limits.maxUsers }} users · {{ p.limits.maxVehicles }} vehicles · {{ p.limits.maxJobCardsPerMonth }} jobs/mo · {{ p.limits.smsPerMonth }} SMS/mo
          </div>
          <div class="chips">
            @for (f of p.features; track f) {<span class="badge">{{ f | label }}</span>}
          </div>
          <div class="row" style="margin-top: auto">
            <button class="btn btn-ghost btn-sm" (click)="edit(p)">Edit</button>
            @if (p.active) {<button class="btn btn-ghost btn-sm" (click)="archive(p)">Archive</button>}
          </div>
        </div>
      } @empty {
        <div class="card empty">No plans yet.</div>
      }
    </div>

    <app-modal [open]="open()" [title]="form._id ? 'Edit plan' : 'New plan'" (close)="open.set(false)">
      <form class="stack" (ngSubmit)="save()">
        <div class="grid-2">
          <label class="field">Code <span class="hint">Used in sign-up links, e.g. "starter"</span>
            <input name="code" [(ngModel)]="form.code" required />
          </label>
          <label class="field">Name<input name="name" [(ngModel)]="form.name" required /></label>
          <label class="field span-all">Description<input name="description" [(ngModel)]="form.description" /></label>
          <label class="field">Currency<input name="currency" [(ngModel)]="form.currency" /></label>
          <label class="field">Trial days<input type="number" min="0" name="trialDays" [(ngModel)]="form.trialDays" /></label>
          <label class="field">Monthly price<input type="number" min="0" name="monthlyPrice" [(ngModel)]="form.monthlyPrice" /></label>
          <label class="field">Yearly price<input type="number" min="0" name="yearlyPrice" [(ngModel)]="form.yearlyPrice" /></label>
          <label class="field">Max users<input type="number" min="0" name="maxUsers" [(ngModel)]="form.limits.maxUsers" /></label>
          <label class="field">Max vehicles<input type="number" min="0" name="maxVehicles" [(ngModel)]="form.limits.maxVehicles" /></label>
          <label class="field">Job cards / month<input type="number" min="0" name="maxJobs" [(ngModel)]="form.limits.maxJobCardsPerMonth" /></label>
          <label class="field">SMS / month<input type="number" min="0" name="sms" [(ngModel)]="form.limits.smsPerMonth" /></label>
          <label class="field">Sort order<input type="number" name="sortOrder" [(ngModel)]="form.sortOrder" /></label>
          <div class="field" style="justify-content: flex-end; gap: 8px">
            <label class="check"><input type="checkbox" name="isPublic" [(ngModel)]="form.isPublic" /> Show on pricing page</label>
            <label class="check"><input type="checkbox" name="active" [(ngModel)]="form.active" /> Active</label>
          </div>
        </div>
        <div>
          <h3 style="margin-bottom: 8px">Features</h3>
          <div class="features">
            @for (f of featureKeys; track f) {
              <label class="check"><input type="checkbox" [checked]="form.features.includes(f)" (change)="toggle(f)" /> {{ f | label }}</label>
            }
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-ghost" (click)="open.set(false)">Cancel</button>
          <button class="btn" type="submit" [disabled]="busy() || !form.code.trim() || !form.name.trim()">{{ busy() ? 'Saving…' : 'Save plan' }}</button>
        </div>
      </form>
    </app-modal>
  `,
})
export class AdminPlansPage implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  featureKeys = FEATURE_KEYS;
  plans = signal<Plan[]>([]);
  open = signal(false);
  busy = signal(false);
  form: PlanForm = blank();

  ngOnInit() {
    this.load();
  }

  load() {
    this.api.get<Plan[]>('/plans/all').subscribe({ next: (p) => this.plans.set(p), error: (e) => this.toast.error(e) });
  }

  edit(p?: Plan) {
    this.form = p ? { ...structuredClone(p) } : blank();
    this.open.set(true);
  }

  toggle(f: string) {
    this.form.features = this.form.features.includes(f) ? this.form.features.filter((x) => x !== f) : [...this.form.features, f];
  }

  save() {
    const f = this.form;
    const num = (v: unknown) => Number(v) || 0;
    const body = {
      code: f.code.trim().toLowerCase(),
      name: f.name.trim(),
      description: f.description?.trim() || undefined,
      currency: f.currency.trim() || 'LKR',
      monthlyPrice: num(f.monthlyPrice),
      yearlyPrice: num(f.yearlyPrice),
      trialDays: Math.round(num(f.trialDays)),
      features: f.features,
      limits: {
        maxUsers: Math.round(num(f.limits.maxUsers)),
        maxVehicles: Math.round(num(f.limits.maxVehicles)),
        maxJobCardsPerMonth: Math.round(num(f.limits.maxJobCardsPerMonth)),
        smsPerMonth: Math.round(num(f.limits.smsPerMonth)),
      },
      isPublic: f.isPublic,
      active: f.active,
      sortOrder: Math.round(num(f.sortOrder)),
    };
    this.busy.set(true);
    const req = f._id ? this.api.patch<Plan>(`/plans/${f._id}`, body) : this.api.post<Plan>('/plans', body);
    req.subscribe({
      next: () => {
        this.busy.set(false);
        this.open.set(false);
        this.toast.success('Plan saved');
        this.load();
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.error(e);
      },
    });
  }

  archive(p: Plan) {
    if (!confirm(`Archive the ${p.name} plan? Existing vendors keep it, but it is hidden from sign-up.`)) return;
    this.api.delete(`/plans/${p._id}`).subscribe({
      next: () => {
        this.toast.success('Plan archived');
        this.load();
      },
      error: (e) => this.toast.error(e),
    });
  }
}
