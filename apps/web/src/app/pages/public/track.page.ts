import { DatePipe } from '@angular/common';
import { Component, Input, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { UI } from '../../shared/ui';
import { PublicHeaderComponent } from './public-header';

interface TrackResult {
  number: string;
  status: string;
  vehicle?: { registrationNo: string; make?: string; model?: string };
  serviceType?: string;
  estimatedCompletion?: string;
  startedAt?: string;
  completedAt?: string;
  deliveredAt?: string;
  total: number;
  checklist: { label: string; done: boolean }[];
}

const STEPS = [
  { key: 'pending', label: 'Received' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'completed', label: 'Ready for pickup' },
  { key: 'delivered', label: 'Delivered' },
];

@Component({
  selector: 'app-track',
  imports: [FormsModule, DatePipe, RouterLink, PublicHeaderComponent, ...UI],
  styles: `
    .wrap { max-width: 640px; margin: 32px auto; padding: 0 16px; display: flex; flex-direction: column; gap: 16px; }
    .steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin: 16px 0 8px; }
    .step { text-align: center; font-size: 12px; color: var(--muted); }
    .step .dot { height: 6px; border-radius: 3px; background: var(--surface-2); margin-bottom: 6px; }
    .step.done .dot { background: var(--success); }
    .step.done { color: var(--text); font-weight: 600; }
    ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 4px; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
    li.done::before { content: '✓ '; color: var(--success); font-weight: 700; }
    li:not(.done)::before { content: '○ '; color: var(--muted); }
  `,
  template: `
    <app-public-header />
    <div class="wrap">
      <form class="card card-pad stack" (ngSubmit)="lookup()">
        <h1>Track your vehicle</h1>
        <p class="muted" style="margin: 0">Enter the job number on your receipt and the phone number you gave the service center.</p>
        <div class="grid-2">
          <label class="field">Job number<input name="number" [(ngModel)]="number" required placeholder="JC-00012" /></label>
          <label class="field">Phone<input name="phone" [(ngModel)]="phone" required type="tel" /></label>
        </div>
        <div class="form-actions">
          <button class="btn" type="submit" [disabled]="busy() || !number.trim() || !phone.trim()">{{ busy() ? 'Looking up…' : 'Track' }}</button>
        </div>
      </form>

      @if (result(); as r) {
        @if (r.status === 'cancelled') {
          <div class="alert alert-danger">Job {{ r.number }} was cancelled. Please contact the service center.</div>
        } @else {
          <div class="card card-pad">
            <div class="row">
              <h2>{{ r.number }}</h2>
              <app-status [value]="r.status" />
              <span class="spacer"></span>
              <strong>{{ r.total | money }}</strong>
            </div>
            @if (r.vehicle) {
              <div class="muted">{{ r.vehicle.registrationNo }} · {{ r.vehicle.make }} {{ r.vehicle.model }}@if (r.serviceType) { · {{ r.serviceType }}}</div>
            }
            <div class="steps">
              @for (s of steps; track s.key; let i = $index) {
                <div class="step" [class.done]="i <= stepIndex(r.status)"><div class="dot"></div>{{ s.label }}</div>
              }
            </div>
            <div class="small muted">
              @if (r.deliveredAt) { Delivered {{ r.deliveredAt | date: 'medium' }} }
              @else if (r.completedAt) { Completed {{ r.completedAt | date: 'medium' }} }
              @else if (r.estimatedCompletion) { Estimated completion {{ r.estimatedCompletion | date: 'medium' }} }
              @else if (r.startedAt) { Work started {{ r.startedAt | date: 'medium' }} }
            </div>
          </div>
          @if (r.checklist.length) {
            <div class="card card-pad">
              <h3 style="margin-bottom: 10px">Inspection checklist</h3>
              <ul>
                @for (c of r.checklist; track c.label) {<li [class.done]="c.done">{{ c.label }}</li>}
              </ul>
            </div>
          }
        }
      }
      <div class="small muted">Want to book a service? <a [routerLink]="['/book', slug]">Book online</a></div>
    </div>
  `,
})
export class TrackPage {
  @Input() slug = '';
  private api = inject(ApiService);
  private toast = inject(ToastService);

  steps = STEPS;
  number = '';
  phone = '';
  busy = signal(false);
  result = signal<TrackResult | null>(null);

  stepIndex(status: string) {
    const i = STEPS.findIndex((s) => s.key === status);
    return status === 'waiting_parts' ? 1 : i;
  }

  lookup() {
    this.busy.set(true);
    this.api
      .get<TrackResult>(`/public/centers/${this.slug}/track/${encodeURIComponent(this.number.trim().toUpperCase())}`, { phone: this.phone.trim() })
      .subscribe({
        next: (r) => {
          this.busy.set(false);
          this.result.set(r);
        },
        error: (e) => {
          this.busy.set(false);
          this.result.set(null);
          this.toast.error(e);
        },
      });
  }
}
