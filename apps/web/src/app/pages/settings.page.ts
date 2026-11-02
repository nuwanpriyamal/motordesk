import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { TenantSettings } from '../core/models';
import { ToastService } from '../core/toast.service';
import { UI } from '../shared/ui';

@Component({
  imports: [FormsModule, DatePipe, ...UI],
  template: `
    <div class="page-head"><div><h1>Settings</h1></div></div>
    <div class="tabs">
      <button [class.active]="tab() === 'business'" (click)="tab.set('business')">Business</button>
      <button [class.active]="tab() === 'operations'" (click)="tab.set('operations')">Operations</button>
      <button [class.active]="tab() === 'subscription'" (click)="tab.set('subscription')">Subscription</button>
      <button [class.active]="tab() === 'account'" (click)="tab.set('account')">My account</button>
    </div>

    @if (tab() === 'business') {
      <form class="card card-pad stack" style="max-width: 760px" (ngSubmit)="save()">
        <div class="grid-2">
          <label class="field">Business name<input [(ngModel)]="b.name" name="name" /></label>
          <label class="field">Business registration no.<input [(ngModel)]="b.registrationNo" name="reg" /></label>
          <label class="field">Phone<input [(ngModel)]="b.phone" name="phone" /></label>
          <label class="field">Email<input type="email" [(ngModel)]="b.email" name="email" /></label>
          <label class="field span-all">Address<input [(ngModel)]="b.address" name="address" /></label>
          <label class="field">City<input [(ngModel)]="b.city" name="city" /></label>
          <label class="field">Logo URL<input [(ngModel)]="b.logoUrl" name="logo" /></label>
          <label class="field">Currency<input [(ngModel)]="s.currency" name="cur" /></label>
          <label class="field">Default tax rate (%)<input type="number" min="0" max="100" step="any" [(ngModel)]="s.taxRate" name="tax" /></label>
          <label class="field span-all">Invoice footer<input [(ngModel)]="s.invoiceFooter" name="footer" placeholder="Thank you for your business!" /></label>
        </div>
        <div class="form-actions"><button class="btn">Save</button></div>
      </form>
    }

    @if (tab() === 'operations') {
      <form class="card card-pad stack" style="max-width: 760px" (ngSubmit)="save()">
        <div class="grid-2">
          <label class="field">Opening time<input type="time" [(ngModel)]="s.openTime" name="open" /></label>
          <label class="field">Closing time<input type="time" [(ngModel)]="s.closeTime" name="close" /></label>
          <label class="field">Appointment slot (minutes)<input type="number" min="15" step="15" [(ngModel)]="s.slotMinutes" name="slot" /></label>
          <label class="field">Service bays <span class="hint">Appointments allowed at the same time</span><input type="number" min="1" [(ngModel)]="s.bays" name="bays" /></label>
          <label class="field">Service interval (km)<input type="number" min="0" [(ngModel)]="s.serviceIntervalKm" name="km" /></label>
          <label class="field">Service interval (days)<input type="number" min="0" [(ngModel)]="s.serviceIntervalDays" name="days" /></label>
          <label class="field">Time zone<input [(ngModel)]="s.timezone" name="tz" /></label>
        </div>
        <div class="alert small">Public pages: booking <a [href]="origin + '/book/' + auth.tenant()?.slug" target="_blank">{{ origin }}/book/{{ auth.tenant()?.slug }}</a> · job tracking <a [href]="origin + '/track/' + auth.tenant()?.slug" target="_blank">{{ origin }}/track/{{ auth.tenant()?.slug }}</a></div>
        <div class="form-actions"><button class="btn">Save</button></div>
      </form>
    }

    @if (tab() === 'subscription') {
      @if (auth.tenant(); as t) {
        <div class="card card-pad stack" style="max-width: 760px">
          <div class="row"><h2>{{ t.entitlements?.planName }} plan</h2><app-status [value]="t.entitlements?.status ?? t.status" /></div>
          <div class="grid-2">
            <div><div class="muted small">Price</div><strong>{{ t.effectivePrice | money: t.plan.currency }}</strong> / {{ t.billingCycle === 'yearly' ? 'year' : 'month' }}</div>
            @if (t.status === 'trial') {<div><div class="muted small">Trial ends</div><strong>{{ t.trialEndsAt | date: 'mediumDate' }}</strong></div>}
            @if (t.currentPeriodEnd) {<div><div class="muted small">Paid until</div><strong>{{ t.currentPeriodEnd | date: 'mediumDate' }}</strong></div>}
            <div><div class="muted small">Users</div><strong>{{ t.entitlements?.limits?.maxUsers }}</strong></div>
            <div><div class="muted small">Vehicles</div><strong>{{ t.entitlements?.limits?.maxVehicles }}</strong></div>
            <div><div class="muted small">SMS / month</div><strong>{{ t.entitlements?.limits?.smsPerMonth }}</strong></div>
          </div>
          <div>
            <div class="muted small" style="margin-bottom: 6px">Included modules</div>
            @for (f of t.entitlements?.features ?? []; track f) {<span class="badge badge-active" style="margin: 0 6px 6px 0">{{ f | label }}</span>}
          </div>
          <p class="muted small" style="margin: 0">To upgrade, change billing or renew, contact the platform team.</p>
        </div>
      }
    }

    @if (tab() === 'account') {
      <form class="card card-pad stack" style="max-width: 480px" (ngSubmit)="changePassword()">
        <h2>Change password</h2>
        <label class="field">Current password<input type="password" [(ngModel)]="pw.current" name="cur" autocomplete="current-password" /></label>
        <label class="field">New password<input type="password" minlength="8" [(ngModel)]="pw.next" name="next" autocomplete="new-password" /></label>
        <div class="form-actions"><button class="btn" [disabled]="!pw.current || pw.next.length < 8">Update password</button></div>
      </form>
    }
  `,
})
export class SettingsPage implements OnInit {
  auth = inject(AuthService);
  private api = inject(ApiService);
  private toast = inject(ToastService);

  origin = location.origin;
  tab = signal<'business' | 'operations' | 'subscription' | 'account'>('business');
  b = { name: '', registrationNo: '', phone: '', email: '', address: '', city: '', logoUrl: '' };
  s = {} as TenantSettings;
  pw = { current: '', next: '' };

  ngOnInit() {
    this.auth.loadTenant().subscribe((t) => {
      this.b = {
        name: t.name,
        registrationNo: t.registrationNo ?? '',
        phone: t.phone ?? '',
        email: t.email ?? '',
        address: t.address ?? '',
        city: t.city ?? '',
        logoUrl: t.logoUrl ?? '',
      };
      this.s = { ...t.settings };
    });
  }

  save() {
    const body: Record<string, unknown> = { ...this.b };
    for (const [k, v] of Object.entries(body)) if (v === '') delete body[k];
    const settings: Record<string, unknown> = { ...this.s };
    for (const k of ['taxRate', 'slotMinutes', 'bays', 'serviceIntervalKm', 'serviceIntervalDays']) settings[k] = Number(settings[k]);
    if (!settings['invoiceFooter']) delete settings['invoiceFooter'];
    body['settings'] = settings;
    this.api.patch('/tenant', body).subscribe({
      next: () => {
        this.toast.success('Settings saved');
        this.auth.loadTenant().subscribe();
      },
      error: (e) => this.toast.error(e),
    });
  }

  changePassword() {
    this.api.post('/auth/change-password', { currentPassword: this.pw.current, newPassword: this.pw.next }).subscribe({
      next: () => {
        this.pw = { current: '', next: '' };
        this.toast.success('Password updated');
      },
      error: (e) => this.toast.error(e),
    });
  }
}
