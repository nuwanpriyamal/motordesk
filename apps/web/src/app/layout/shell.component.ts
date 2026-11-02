import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from '../core/auth.service';
import { RealtimeService } from '../core/realtime.service';
import { ToastService } from '../core/toast.service';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  feature?: string;
  roles?: string[];
}

const TENANT_NAV: NavItem[] = [
  { path: '/app', label: 'Dashboard', icon: '▦', feature: 'analytics' },
  { path: '/app/jobs', label: 'Job cards', icon: '🔧', feature: 'jobCards' },
  { path: '/app/appointments', label: 'Appointments', icon: '📅', feature: 'scheduling' },
  { path: '/app/customers', label: 'Customers', icon: '👤', feature: 'customers' },
  { path: '/app/vehicles', label: 'Vehicles', icon: '🚗', feature: 'vehicles' },
  { path: '/app/invoices', label: 'Invoices & quotes', icon: '🧾', feature: 'invoicing' },
  { path: '/app/inventory', label: 'Inventory', icon: '📦', feature: 'inventory' },
  { path: '/app/expenses', label: 'Expenses', icon: '💸', feature: 'expenses' },
  { path: '/app/reminders', label: 'Reminders', icon: '🔔', feature: 'reminders' },
  { path: '/app/staff', label: 'Staff', icon: '👥', roles: ['owner', 'manager'] },
  { path: '/app/settings', label: 'Settings', icon: '⚙', roles: ['owner'] },
];

const ADMIN_NAV: NavItem[] = [
  { path: '/admin', label: 'Overview', icon: '▦' },
  { path: '/admin/tenants', label: 'Vendors', icon: '🏢' },
  { path: '/admin/plans', label: 'Plans & pricing', icon: '💳' },
];

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  styles: `
    :host { display: flex; min-height: 100vh; }
    .sidebar { width: 232px; flex-shrink: 0; overflow-x: hidden; background: var(--sidebar); color: var(--sidebar-text); display: flex; flex-direction: column; position: sticky; top: 0; height: 100vh; }
    .brand { padding: 18px 18px 14px; font-weight: 700; font-size: 17px; color: #fff; display: flex; align-items: center; gap: 8px; }
    .brand .logo { flex-shrink: 0; width: 28px; height: 28px; border-radius: 7px; background: var(--primary); display: grid; place-items: center; font-size: 14px; }
    .tenant { padding: 0 18px 14px; font-size: 12px; color: var(--sidebar-text); opacity: 0.85; }
    nav { flex: 1; overflow-y: auto; padding: 4px 10px; }
    nav a { display: flex; gap: 10px; align-items: center; padding: 8px 10px; border-radius: 7px; color: var(--sidebar-text); font-weight: 500; margin-bottom: 2px; }
    nav a:hover { background: var(--sidebar-active); text-decoration: none; color: #fff; }
    nav a.active { background: var(--sidebar-active); color: #fff; }
    nav .ico { width: 20px; text-align: center; font-size: 14px; }
    .foot { padding: 14px 18px; border-top: 1px solid rgba(255,255,255,0.08); font-size: 12px; }
    .foot button { background: none; border: none; color: var(--sidebar-text); cursor: pointer; padding: 0; font: inherit; text-decoration: underline; }
    .content { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .topbar { display: none; }
    .main { padding: 24px 28px; max-width: 1400px; width: 100%; }
    .env { display: inline-block; background: #e3a33b; color: #1a1a1a; border-radius: 4px; padding: 0 6px; font-size: 11px; font-weight: 700; margin-left: 6px; }
    .live { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: #4cc38a; margin-right: 6px; }
    @media (max-width: 900px) {
      .sidebar { position: fixed; z-index: 40; transform: translateX(-100%); transition: transform 0.2s; }
      .sidebar.open { transform: none; }
      .topbar { display: flex; align-items: center; gap: 10px; padding: 10px 16px; background: var(--surface); border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 30; }
      .main { padding: 16px; }
      .scrim { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 35; }
    }
  `,
  template: `
    <aside class="sidebar" [class.open]="menuOpen()">
      <div class="brand"><span class="logo">M</span>{{ appName }}@if (envName !== 'production') {<span class="env">{{ envName }}</span>}</div>
      @if (auth.tenant(); as t) {
        <div class="tenant">{{ t.name }} · {{ t.entitlements?.planName }}</div>
      } @else if (auth.isSuperAdmin()) {
        <div class="tenant">Platform administration</div>
      }
      <nav>
        @for (item of nav(); track item.path) {
          <a [routerLink]="item.path" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: item.path === '/app' || item.path === '/admin' }">
            <span class="ico" aria-hidden="true">{{ item.icon }}</span>{{ item.label }}
          </a>
        }
      </nav>
      <div class="foot">
        <div>{{ auth.user()?.name }}</div>
        <div class="row" style="gap: 8px; margin-top: 4px">
          @if (realtime.mode() !== 'off') {<span title="Live updates on ({{ realtime.mode() }})"><span class="live"></span>Live</span>}
          <span class="spacer"></span>
          <button (click)="auth.logout()">Sign out</button>
        </div>
      </div>
    </aside>
    @if (menuOpen()) {<div class="scrim" (click)="menuOpen.set(false)"></div>}
    <div class="content">
      <div class="topbar">
        <button class="btn btn-ghost btn-icon" aria-label="Menu" (click)="menuOpen.set(true)">☰</button>
        <strong>{{ appName }}</strong>
      </div>
      @if (banner(); as b) {
        <div class="alert alert-warning" style="border-radius: 0">{{ b }}</div>
      }
      <main class="main"><router-outlet /></main>
    </div>
  `,
})
export class ShellComponent implements OnInit, OnDestroy {
  auth = inject(AuthService);
  realtime = inject(RealtimeService);
  private toast = inject(ToastService);
  private router = inject(Router);
  private subs = new Subscription();

  appName = environment.appName;
  envName = environment.name;
  menuOpen = signal(false);

  nav = computed(() => {
    if (this.auth.isSuperAdmin()) return ADMIN_NAV;
    const role = this.auth.user()?.role ?? '';
    return TENANT_NAV.filter(
      (n) => (!n.feature || this.auth.features().has(n.feature)) && (!n.roles || n.roles.includes(role)),
    );
  });

  banner = computed(() => {
    const ent = this.auth.tenant()?.entitlements;
    if (!ent) return null;
    if (!ent.active) return 'Your subscription is inactive. The system is read-only until it is renewed. Contact the platform team to renew.';
    if (ent.status === 'trial' && ent.trialEndsAt) {
      const days = Math.ceil((new Date(ent.trialEndsAt).getTime() - Date.now()) / 86400000);
      if (days <= 7) return `Your free trial ends in ${Math.max(days, 0)} day(s).`;
    }
    return null;
  });

  ngOnInit() {
    this.subs.add(
      this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => this.menuOpen.set(false)),
    );
    if (this.auth.tenant()) {
      this.realtime.connect();
      this.subs.add(
        this.realtime.on('appointment.created').subscribe((e) => {
          if (e.payload['source'] === 'online') this.toast.show('New online booking received', 'info');
        }),
      );
      this.subs.add(
        this.realtime.on('inventory.low').subscribe((e) => this.toast.show(`Low stock: ${e.payload['name']} (${e.payload['quantity']} left)`)),
      );
    }
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
    this.realtime.disconnect();
  }
}
