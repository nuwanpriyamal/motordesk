import { DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { Appointment, Customer, JobCard, Vehicle } from '../core/models';
import { RealtimeService } from '../core/realtime.service';
import { ToastService } from '../core/toast.service';
import { UI, toDateInput } from '../shared/ui';

@Component({
  imports: [FormsModule, DatePipe, ...UI],
  template: `
    <div class="page-head">
      <div><h1>Appointments</h1><p class="muted">Bays: {{ auth.tenant()?.settings?.bays }} · {{ auth.tenant()?.settings?.openTime }}–{{ auth.tenant()?.settings?.closeTime }}</p></div>
      <span class="spacer"></span>
      @if (auth.has('onlineBooking')) {
        <button class="btn btn-ghost" (click)="copyLink()">Copy booking link</button>
      }
      <button class="btn" (click)="openNew()">+ Book appointment</button>
    </div>

    <div class="card">
      <div class="card-head">
        <button class="btn btn-ghost btn-sm" aria-label="Previous day" (click)="shift(-1)">‹</button>
        <input type="date" style="max-width: 180px" [(ngModel)]="day" (ngModelChange)="load()" />
        <button class="btn btn-ghost btn-sm" aria-label="Next day" (click)="shift(1)">›</button>
        <button class="btn btn-ghost btn-sm" (click)="day = today(); load()">Today</button>
        <span class="spacer"></span>
        <span class="muted small">{{ items().length }} booked</span>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Time</th><th>Customer</th><th>Vehicle</th><th>Service</th><th>Source</th><th>Status</th><th></th></tr></thead>
        <tbody>
          @for (a of items(); track a._id) {
            <tr>
              <td class="nowrap"><strong>{{ a.start | date: 'shortTime' }}</strong> <span class="muted small">– {{ a.end | date: 'shortTime' }}</span></td>
              <td>{{ a.customer?.name || a.guestName }}<div class="muted small">{{ a.customer?.phone || a.guestPhone }}</div></td>
              <td>{{ a.vehicle?.registrationNo || a.guestVehicleNo }}</td>
              <td>{{ a.serviceType }}</td>
              <td><span class="badge">{{ a.source | label }}</span></td>
              <td><app-status [value]="a.status" /></td>
              <td class="right nowrap">
                @if (a.status === 'booked') {<button class="btn btn-ghost btn-sm" (click)="set(a, 'confirmed')">Confirm</button>}
                @if (a.status === 'booked' || a.status === 'confirmed') {
                  <button class="btn btn-sm" (click)="checkIn(a)">Check in</button>
                  <button class="btn btn-ghost btn-sm" (click)="set(a, 'no_show')">No-show</button>
                  <button class="btn btn-ghost btn-sm" (click)="set(a, 'cancelled')">Cancel</button>
                }
              </td>
            </tr>
          } @empty {
            <tr><td colspan="7" class="empty">No appointments on this day.</td></tr>
          }
        </tbody>
      </table></div>
    </div>

    <app-modal [open]="creating()" title="Book appointment" (close)="creating.set(false)">
      <form class="stack" (ngSubmit)="create()">
        <label class="field">Customer
          <input placeholder="Search existing customer" [(ngModel)]="customerSearch" name="cs" (ngModelChange)="findCustomers()" autocomplete="off" />
        </label>
        @for (c of customers(); track c._id) {
          <label class="check"><input type="radio" name="cust" [value]="c._id" [(ngModel)]="f.customer" (ngModelChange)="loadVehicles()" /> {{ c.name }} <span class="muted">{{ c.phone }}</span></label>
        }
        @if (vehicles().length) {
          <label class="field">Vehicle
            <select [(ngModel)]="f.vehicle" name="veh"><option value="">—</option>@for (v of vehicles(); track v._id) {<option [value]="v._id">{{ v.registrationNo }} {{ v.make }} {{ v.model }}</option>}</select>
          </label>
        }
        @if (!f.customer) {
          <div class="grid-2">
            <label class="field">Or walk-in name<input [(ngModel)]="f.guestName" name="gn" /></label>
            <label class="field">Phone<input [(ngModel)]="f.guestPhone" name="gp" /></label>
            <label class="field">Vehicle no.<input [(ngModel)]="f.guestVehicleNo" name="gv" /></label>
          </div>
        }
        <div class="grid-2">
          <label class="field">Date<input type="date" [(ngModel)]="f.date" name="date" (ngModelChange)="loadSlots()" /></label>
          <label class="field">Service<input [(ngModel)]="f.serviceType" name="svc" /></label>
        </div>
        <div>
          <div class="field" style="margin-bottom: 6px">Time slot</div>
          <div class="row" style="gap: 6px">
            @for (s of slots(); track s.start) {
              <button type="button" class="btn btn-sm" [class.btn-ghost]="f.start !== s.start" [disabled]="!s.available" (click)="f.start = s.start">{{ s.start | date: 'shortTime' }}</button>
            } @empty {<span class="muted small">No free slots on this day.</span>}
          </div>
        </div>
        <label class="field">Notes<textarea [(ngModel)]="f.notes" name="notes"></textarea></label>
        <div class="form-actions">
          <button type="button" class="btn btn-ghost" (click)="creating.set(false)">Cancel</button>
          <button class="btn" [disabled]="!f.start || (!f.customer && !f.guestName)">Book</button>
        </div>
      </form>
    </app-modal>
  `,
})
export class AppointmentsPage implements OnInit, OnDestroy {
  auth = inject(AuthService);
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private router = inject(Router);
  private realtime = inject(RealtimeService);
  private sub?: Subscription;

  day = this.today();
  items = signal<Appointment[]>([]);
  creating = signal(false);
  customers = signal<Customer[]>([]);
  vehicles = signal<Vehicle[]>([]);
  slots = signal<{ start: string; available: number }[]>([]);
  customerSearch = '';
  f = this.blank();
  private timer?: ReturnType<typeof setTimeout>;

  ngOnInit() {
    this.load();
    this.sub = this.realtime.on('appointment.').subscribe(() => this.load());
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }

  today() {
    return toDateInput(new Date());
  }

  blank() {
    return { customer: '', vehicle: '', guestName: '', guestPhone: '', guestVehicleNo: '', date: this.day, start: '', serviceType: '', notes: '' };
  }

  shift(days: number) {
    const d = new Date(`${this.day}T12:00:00`);
    d.setDate(d.getDate() + days);
    this.day = toDateInput(d);
    this.load();
  }

  load() {
    const from = new Date(`${this.day}T00:00:00`);
    const to = new Date(`${this.day}T23:59:59`);
    this.api
      .list<Appointment>('/appointments', { from: from.toISOString(), to: to.toISOString(), sort: 'start', limit: 100 })
      .subscribe({ next: (r) => this.items.set(r.items), error: (e) => this.toast.error(e) });
  }

  copyLink() {
    const url = `${location.origin}/book/${this.auth.tenant()?.slug}`;
    navigator.clipboard?.writeText(url).then(
      () => this.toast.success('Booking link copied'),
      () => this.toast.show(url),
    );
  }

  openNew() {
    this.f = this.blank();
    this.customerSearch = '';
    this.customers.set([]);
    this.vehicles.set([]);
    this.loadSlots();
    this.creating.set(true);
  }

  findCustomers() {
    clearTimeout(this.timer);
    this.timer = setTimeout(
      () => this.api.list<Customer>('/customers', { search: this.customerSearch, limit: 5 }).subscribe((r) => this.customers.set(r.items)),
      250,
    );
  }

  loadVehicles() {
    this.api.list<Vehicle>('/vehicles', { customer: this.f.customer, limit: 20 }).subscribe((r) => {
      this.vehicles.set(r.items);
      this.f.vehicle = r.items[0]?._id ?? '';
    });
  }

  loadSlots() {
    this.f.start = '';
    this.api.get<{ start: string; available: number }[]>('/appointments/views/availability', { date: this.f.date }).subscribe({
      next: (s) => this.slots.set(s),
      error: () => this.slots.set([]),
    });
  }

  create() {
    const body: Record<string, unknown> = { start: this.f.start, source: 'staff' };
    for (const k of ['customer', 'vehicle', 'guestName', 'guestPhone', 'guestVehicleNo', 'serviceType', 'notes'] as const) {
      if (this.f[k]) body[k] = this.f[k];
    }
    this.api.post('/appointments', body).subscribe({
      next: () => {
        this.creating.set(false);
        this.toast.success('Appointment booked');
        this.day = this.f.date;
        this.load();
      },
      error: (e) => this.toast.error(e),
    });
  }

  set(a: Appointment, status: string) {
    this.api.patch(`/appointments/${a._id}/status/${status}`).subscribe({ next: () => this.load(), error: (e) => this.toast.error(e) });
  }

  /** Arrival: open a job card for registered customers, otherwise just mark arrived. */
  checkIn(a: Appointment) {
    if (!a.customer || !a.vehicle || !this.auth.has('jobCards')) {
      if (!a.customer) this.toast.show('Walk-in: add them as a customer to open a job card.');
      return this.set(a, 'arrived');
    }
    this.api
      .post<JobCard>('/job-cards', { customer: a.customer._id, vehicle: a.vehicle._id, appointment: a._id, serviceType: a.serviceType || undefined, complaint: a.notes || undefined })
      .subscribe({
        next: (j) => {
          this.api.patch(`/appointments/${a._id}`, { status: 'arrived', jobCard: j._id }).subscribe();
          this.router.navigate(['/app/jobs', j._id]);
        },
        error: (e) => this.toast.error(e),
      });
  }
}
