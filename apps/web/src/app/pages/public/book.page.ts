import { DatePipe } from '@angular/common';
import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, errorMessage } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { toDateInput } from '../../shared/ui';
import { PublicHeaderComponent } from './public-header';

interface CenterProfile {
  name: string;
  slug: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  openTime: string;
  closeTime: string;
  onlineBooking: boolean;
}

interface Slot {
  start: string;
  available: number;
}

@Component({
  selector: 'app-book',
  imports: [FormsModule, DatePipe, RouterLink, PublicHeaderComponent],
  styles: `
    .wrap { max-width: 760px; margin: 32px auto; padding: 0 16px; display: flex; flex-direction: column; gap: 16px; }
    .slots { display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); }
    .slot { height: 40px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--text); font: inherit; font-weight: 550; cursor: pointer; }
    .slot:hover:not(:disabled) { border-color: var(--primary); }
    .slot.on { background: var(--primary); border-color: var(--primary); color: #fff; }
    .slot:disabled { opacity: 0.4; cursor: not-allowed; text-decoration: line-through; }
    .done { text-align: center; padding: 32px 18px; }
    .done .tick { font-size: 40px; }
  `,
  template: `
    <app-public-header />
    <div class="wrap">
      @if (error()) {
        <div class="card empty">{{ error() }}</div>
      } @else if (!center()) {
        <div class="card empty">Loading…</div>
      } @else {
        @let c = center()!;
        <div class="card card-pad">
          <h1>{{ c.name }}</h1>
          <div class="muted">
            {{ c.address }}@if (c.city) {, {{ c.city }}} · Open {{ c.openTime }}–{{ c.closeTime }}
            @if (c.phone) { · {{ c.phone }} }
          </div>
          <div class="small" style="margin-top: 6px"><a [routerLink]="['/track', c.slug]">Track an existing job</a></div>
        </div>

        @if (!c.onlineBooking) {
          <div class="alert">Online booking is not available for this service center. Please call them to book.</div>
        } @else if (confirmed()) {
          <div class="card done">
            <div class="tick" aria-hidden="true">✅</div>
            <h2>Booking received</h2>
            <p class="muted">
              Your appointment at {{ c.name }} is booked for
              <strong>{{ confirmed()!.start | date: 'EEEE, d MMM y, h:mm a' }}</strong>. The team will contact you to confirm.
            </p>
            <button class="btn btn-ghost" (click)="reset()">Make another booking</button>
          </div>
        } @else {
          <div class="card card-pad stack">
            <h2>1. Pick a date and time</h2>
            <label class="field" style="max-width: 220px">Date
              <input type="date" [min]="today" [ngModel]="date()" (ngModelChange)="pickDate($event)" />
            </label>
            @if (loadingSlots()) {
              <div class="muted">Checking availability…</div>
            } @else if (!slots().length) {
              <div class="muted">No open slots on this day. Try another date.</div>
            } @else {
              <div class="slots">
                @for (s of slots(); track s.start) {
                  <button type="button" class="slot" [class.on]="slot() === s.start" [disabled]="s.available === 0" (click)="slot.set(s.start)">
                    {{ s.start | date: 'h:mm a' }}
                  </button>
                }
              </div>
            }
          </div>

          <form class="card card-pad stack" (ngSubmit)="submit()">
            <h2>2. Your details</h2>
            <div class="grid-2">
              <label class="field">Name<input name="name" [(ngModel)]="form.name" required /></label>
              <label class="field">Phone<input name="phone" [(ngModel)]="form.phone" required type="tel" placeholder="07X XXX XXXX" /></label>
              <label class="field">Email <span class="hint">Optional</span><input name="email" [(ngModel)]="form.email" type="email" /></label>
              <label class="field">Vehicle number<input name="vehicleNo" [(ngModel)]="form.vehicleNo" required placeholder="CAB-1234" /></label>
              <label class="field span-all">Service needed
                <select name="serviceType" [(ngModel)]="form.serviceType">
                  @for (s of services; track s) {<option [value]="s">{{ s }}</option>}
                </select>
              </label>
              <label class="field span-all">Notes <span class="hint">Optional</span><textarea name="notes" [(ngModel)]="form.notes"></textarea></label>
            </div>
            <div class="form-actions">
              <button class="btn" type="submit" [disabled]="busy() || !slot() || !form.name.trim() || !form.phone.trim() || !form.vehicleNo.trim()">
                {{ busy() ? 'Booking…' : 'Confirm booking' }}
              </button>
            </div>
          </form>
        }
      }
    </div>
  `,
})
export class BookPage implements OnInit {
  @Input() slug = '';
  private api = inject(ApiService);
  private toast = inject(ToastService);

  services = ['Full Service', 'Oil Change', 'Brake Service', 'Engine Tune-up', 'Wheel Alignment', 'AC Service', 'Body Wash', 'Inspection', 'Other'];
  today = toDateInput(new Date());
  center = signal<CenterProfile | null>(null);
  error = signal('');
  date = signal(this.today);
  slots = signal<Slot[]>([]);
  slot = signal('');
  loadingSlots = signal(false);
  busy = signal(false);
  confirmed = signal<{ start: string } | null>(null);
  form = { name: '', phone: '', email: '', vehicleNo: '', serviceType: 'Full Service', notes: '' };

  ngOnInit() {
    this.api.get<CenterProfile>(`/public/centers/${this.slug}`).subscribe({
      next: (c) => {
        this.center.set(c);
        if (c.onlineBooking) this.loadSlots();
      },
      error: (e) => this.error.set(errorMessage(e)),
    });
  }

  pickDate(d: string) {
    this.date.set(d);
    this.slot.set('');
    this.loadSlots();
  }

  loadSlots() {
    if (!this.date()) return;
    this.loadingSlots.set(true);
    this.api.get<Slot[]>(`/public/centers/${this.slug}/availability`, { date: this.date() }).subscribe({
      next: (s) => {
        this.slots.set(s);
        this.loadingSlots.set(false);
      },
      error: (e) => {
        this.slots.set([]);
        this.loadingSlots.set(false);
        this.toast.error(e);
      },
    });
  }

  submit() {
    this.busy.set(true);
    const f = this.form;
    const body: Record<string, string> = { name: f.name.trim(), phone: f.phone.trim(), vehicleNo: f.vehicleNo.trim(), start: this.slot(), serviceType: f.serviceType };
    if (f.email.trim()) body['email'] = f.email.trim();
    if (f.notes.trim()) body['notes'] = f.notes.trim();
    this.api.post<{ start: string }>(`/public/centers/${this.slug}/bookings`, body).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.confirmed.set(r);
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.error(e);
        this.loadSlots();
      },
    });
  }

  reset() {
    this.confirmed.set(null);
    this.slot.set('');
    this.form = { ...this.form, notes: '' };
    this.loadSlots();
  }
}
