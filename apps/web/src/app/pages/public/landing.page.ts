import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { ApiService } from '../../core/api.service';
import { Plan } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { UI } from '../../shared/ui';
import { PublicHeaderComponent } from './public-header';

@Component({
  selector: 'app-landing',
  imports: [RouterLink, PublicHeaderComponent, ...UI],
  styles: `
    .wrap { max-width: 1100px; margin: 0 auto; padding: 0 16px; }
    .hero { padding: 72px 0 56px; text-align: center; }
    .hero h1 { font-size: clamp(28px, 5vw, 44px); font-weight: 750; letter-spacing: -0.02em; max-width: 780px; margin: 0 auto; }
    .hero p { font-size: 17px; color: var(--muted); max-width: 640px; margin: 16px auto 28px; }
    .hero .row { justify-content: center; }
    .btn-lg { height: 44px; padding: 0 22px; font-size: 15px; }
    section { padding: 48px 0; }
    section > h2 { font-size: 26px; text-align: center; margin-bottom: 8px; }
    section > p.lead { text-align: center; color: var(--muted); margin: 0 auto 32px; max-width: 600px; }
    .features { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); }
    .feature { padding: 20px; }
    .feature .ico { font-size: 22px; }
    .feature h3 { margin: 10px 0 6px; font-size: 15px; }
    .feature p { margin: 0; color: var(--muted); }
    .toggle { display: flex; justify-content: center; margin-bottom: 24px; }
    .toggle .seg { display: inline-flex; border: 1px solid var(--border); border-radius: 999px; padding: 3px; background: var(--surface); }
    .toggle button { border: none; background: none; font: inherit; padding: 6px 16px; border-radius: 999px; cursor: pointer; color: var(--muted); font-weight: 550; }
    .toggle button.on { background: var(--primary); color: #fff; }
    .plans { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
    .plan { padding: 24px; display: flex; flex-direction: column; gap: 12px; }
    .plan.featured { border-color: var(--primary); border-width: 2px; }
    .price { font-size: 30px; font-weight: 750; font-variant-numeric: tabular-nums; }
    .price small { font-size: 14px; font-weight: 500; color: var(--muted); }
    .plan ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
    .plan li::before { content: '✓'; color: var(--success); font-weight: 700; margin-right: 8px; }
    .plan .btn { margin-top: auto; }
    footer { border-top: 1px solid var(--border); padding: 24px 0; color: var(--muted); font-size: 13px; }
    .cta { text-align: center; padding: 40px 20px; }
  `,
  template: `
    <app-public-header />
    <div class="wrap">
      <div class="hero">
        <h1>Run your whole service center from one screen</h1>
        <p>
          {{ appName }} brings job cards, parts, billing, bookings and customer reminders together,
          so your team spends less time on paperwork and more time on vehicles.
        </p>
        <div class="row">
          <a class="btn btn-lg" routerLink="/register">Start your free trial</a>
          <a class="btn btn-ghost btn-lg" href="#pricing">See pricing</a>
        </div>
      </div>

      <section>
        <h2>Everything a workshop needs</h2>
        <p class="lead">Built for garages, service stations and detailing centers of every size.</p>
        <div class="features">
          @for (f of features; track f.title) {
            <div class="card feature">
              <div class="ico" aria-hidden="true">{{ f.icon }}</div>
              <h3>{{ f.title }}</h3>
              <p>{{ f.text }}</p>
            </div>
          }
        </div>
      </section>

      <section id="pricing">
        <h2>Simple pricing</h2>
        <p class="lead">Every plan starts with a free trial. No setup fees.</p>
        <div class="toggle">
          <div class="seg" role="group" aria-label="Billing cycle">
            <button type="button" [class.on]="!yearly()" (click)="yearly.set(false)">Monthly</button>
            <button type="button" [class.on]="yearly()" (click)="yearly.set(true)">Yearly</button>
          </div>
        </div>
        @if (loading()) {
          <div class="empty">Loading plans…</div>
        } @else if (!plans().length) {
          <div class="empty">Plans will be published soon.</div>
        } @else {
          <div class="plans">
            @for (p of plans(); track p._id; let i = $index) {
              <div class="card plan" [class.featured]="i === 1">
                <div>
                  <h2>{{ p.name }}</h2>
                  <div class="muted">{{ p.description }}</div>
                </div>
                <div class="price">
                  {{ (yearly() ? p.yearlyPrice : p.monthlyPrice) | money: p.currency }}
                  <small>/ {{ yearly() ? 'year' : 'month' }}</small>
                </div>
                <div class="muted small">{{ p.trialDays }}-day free trial</div>
                <ul>
                  <li>Up to {{ p.limits.maxUsers }} staff users</li>
                  <li>{{ p.limits.maxVehicles.toLocaleString() }} vehicles</li>
                  <li>{{ p.limits.smsPerMonth.toLocaleString() }} SMS / month</li>
                  @for (f of p.features; track f) {
                    <li>{{ f | label }}</li>
                  }
                </ul>
                <a class="btn" routerLink="/register" [queryParams]="{ plan: p.code }">Start free trial</a>
              </div>
            }
          </div>
        }
      </section>

      <section class="card cta">
        <h2>Ready to get organised?</h2>
        <p class="muted">Create your service center account in under two minutes.</p>
        <a class="btn btn-lg" routerLink="/register">Create account</a>
      </section>

      <footer>
        <div class="row">
          <span>© {{ year }} {{ appName }}</span>
          <span class="spacer"></span>
          <a routerLink="/login">Log in</a>
          <a href="#pricing">Pricing</a>
        </div>
      </footer>
    </div>
  `,
})
export class LandingPage implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  appName = environment.appName;
  year = new Date().getFullYear();
  plans = signal<Plan[]>([]);
  loading = signal(true);
  yearly = signal(false);

  features = [
    { icon: '🔧', title: 'Digital job cards', text: 'Track every job from intake to delivery with checklists, technician timers and a live status board.' },
    { icon: '📦', title: 'Inventory control', text: 'Stock levels update automatically as parts are issued to jobs, with low-stock alerts and valuation.' },
    { icon: '🧾', title: 'Invoices & quotes', text: 'Turn a job into a quote or invoice in one click, take part payments and print professional bills.' },
    { icon: '📅', title: 'Scheduling & online booking', text: 'Bay-aware appointment calendar plus a public booking page your customers can use any time.' },
    { icon: '🔔', title: 'Reminders & SMS', text: 'Automatic service-due, insurance, licence and payment reminders sent by SMS or email.' },
    { icon: '📊', title: 'Analytics', text: 'Revenue, expenses, profit, top services and technician productivity on a single dashboard.' },
    { icon: '👥', title: 'Team roles', text: 'Owners, managers, technicians and cashiers each see exactly what they need.' },
    { icon: '⚡', title: 'Realtime updates', text: 'Job status changes, new bookings and stock alerts appear instantly across every device.' },
  ];

  ngOnInit() {
    this.api.get<Plan[]>('/plans').subscribe({
      next: (p) => {
        this.plans.set(p);
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.toast.error(e);
      },
    });
  }
}
