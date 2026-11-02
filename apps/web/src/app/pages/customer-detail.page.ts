import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { Customer, Invoice, JobCard, Vehicle } from '../core/models';
import { ToastService } from '../core/toast.service';
import { UI } from '../shared/ui';
import { CustomerFormComponent } from './customer-form.component';
import { VehicleFormComponent } from './vehicle-form.component';

@Component({
  imports: [RouterLink, DatePipe, DecimalPipe, CustomerFormComponent, VehicleFormComponent, ...UI],
  template: `
    @if (c(); as c) {
      <div class="page-head">
        <div>
          <div class="muted small"><a routerLink="/app/customers">Customers</a></div>
          <h1>{{ c.name }}</h1>
          <p class="muted">{{ c.phone }} @if (c.email) {· {{ c.email }}} · {{ c.loyaltyPoints }} loyalty points</p>
        </div>
        <span class="spacer"></span>
        <button class="btn btn-ghost" (click)="editing.set(true)">Edit</button>
        @if (auth.can('owner', 'manager')) {<button class="btn btn-ghost" (click)="remove()">Delete</button>}
        <button class="btn" (click)="addingVehicle.set(true)">+ Add vehicle</button>
      </div>

      <div class="stack">
        <section class="card">
          <div class="card-head"><h2>Vehicles</h2></div>
          <div class="table-wrap"><table>
            <thead><tr><th>Registration</th><th>Vehicle</th><th class="num">Mileage</th><th>Last service</th><th>Next service</th><th></th></tr></thead>
            <tbody>
              @for (v of vehicles(); track v._id) {
                <tr>
                  <td><strong>{{ v.registrationNo }}</strong></td>
                  <td>{{ v.make }} {{ v.model }} {{ v.year }} <span class="muted small">{{ v.type | label }}</span></td>
                  <td class="num">{{ v.mileage | number }}</td>
                  <td>{{ v.lastServiceAt | date: 'mediumDate' }}</td>
                  <td>{{ v.nextServiceDue | date: 'mediumDate' }}</td>
                  <td class="right nowrap">
                    <button class="btn btn-ghost btn-sm" (click)="editVehicle.set(v)">Edit</button>
                    @if (auth.has('jobCards')) {<button class="btn btn-sm" (click)="newJob(v)">New job</button>}
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="6" class="empty">No vehicles registered.</td></tr>
              }
            </tbody>
          </table></div>
        </section>

        <section class="card">
          <div class="card-head"><h2>Service history</h2></div>
          <div class="table-wrap"><table>
            <thead><tr><th>Job</th><th>Vehicle</th><th>Service</th><th>Status</th><th class="num">Total</th><th>Date</th></tr></thead>
            <tbody>
              @for (j of jobs(); track j._id) {
                <tr class="clickable" [routerLink]="['/app/jobs', j._id]">
                  <td class="mono">{{ j.number }}</td><td>{{ j.vehicle.registrationNo }}</td><td>{{ j.serviceType }}</td>
                  <td><app-status [value]="j.status" /></td><td class="num">{{ j.total | money }}</td><td>{{ j.createdAt | date: 'mediumDate' }}</td>
                </tr>
              } @empty {
                <tr><td colspan="6" class="empty">No jobs yet.</td></tr>
              }
            </tbody>
          </table></div>
        </section>

        @if (auth.has('invoicing')) {
          <section class="card">
            <div class="card-head"><h2>Invoices & quotes</h2></div>
            <div class="table-wrap"><table>
              <thead><tr><th>Number</th><th>Status</th><th class="num">Total</th><th class="num">Balance</th><th>Date</th></tr></thead>
              <tbody>
                @for (i of invoices(); track i._id) {
                  <tr class="clickable" [routerLink]="['/app/invoices', i._id]">
                    <td class="mono">{{ i.number }}</td><td><app-status [value]="i.status" /></td>
                    <td class="num">{{ i.total | money }}</td><td class="num">{{ i.balance | money }}</td><td>{{ i.issueDate | date: 'mediumDate' }}</td>
                  </tr>
                } @empty {
                  <tr><td colspan="5" class="empty">No invoices yet.</td></tr>
                }
              </tbody>
            </table></div>
          </section>
        }
        @if (c.notes) {<section class="card card-pad"><h3>Notes</h3><p style="white-space: pre-wrap">{{ c.notes }}</p></section>}
      </div>

      <app-modal [open]="editing()" title="Edit customer" (close)="editing.set(false)">
        @if (editing()) {<app-customer-form [customer]="c" (saved)="editing.set(false); load()" (cancel)="editing.set(false)" />}
      </app-modal>
      <app-modal [open]="addingVehicle()" title="Add vehicle" (close)="addingVehicle.set(false)">
        @if (addingVehicle()) {<app-vehicle-form [customerId]="c._id" (saved)="addingVehicle.set(false); loadVehicles()" (cancel)="addingVehicle.set(false)" />}
      </app-modal>
      <app-modal [open]="!!editVehicle()" title="Edit vehicle" (close)="editVehicle.set(null)">
        @if (editVehicle(); as v) {<app-vehicle-form [vehicle]="v" (saved)="editVehicle.set(null); loadVehicles()" (cancel)="editVehicle.set(null)" />}
      </app-modal>
    }
  `,
})
export class CustomerDetailPage implements OnInit {
  @Input() id!: string;
  auth = inject(AuthService);
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private router = inject(Router);

  c = signal<Customer | null>(null);
  vehicles = signal<Vehicle[]>([]);
  jobs = signal<JobCard[]>([]);
  invoices = signal<Invoice[]>([]);
  editing = signal(false);
  addingVehicle = signal(false);
  editVehicle = signal<Vehicle | null>(null);

  ngOnInit() {
    this.load();
    this.loadVehicles();
    if (this.auth.has('jobCards')) this.api.list<JobCard>('/job-cards', { customer: this.id, limit: 50 }).subscribe((r) => this.jobs.set(r.items));
    if (this.auth.has('invoicing')) this.api.list<Invoice>('/invoices', { customer: this.id, limit: 50 }).subscribe((r) => this.invoices.set(r.items));
  }

  load() {
    this.api.get<Customer>(`/customers/${this.id}`).subscribe({ next: (c) => this.c.set(c), error: (e) => this.toast.error(e) });
  }

  loadVehicles() {
    this.api.list<Vehicle>('/vehicles', { customer: this.id, limit: 50 }).subscribe((r) => this.vehicles.set(r.items));
  }

  newJob(v: Vehicle) {
    this.api.post<JobCard>('/job-cards', { customer: this.id, vehicle: v._id, mileageIn: v.mileage || undefined }).subscribe({
      next: (j) => this.router.navigate(['/app/jobs', j._id]),
      error: (e) => this.toast.error(e),
    });
  }

  remove() {
    if (!confirm('Delete this customer? Their vehicles and history stay on record.')) return;
    this.api.delete(`/customers/${this.id}`).subscribe({
      next: () => {
        this.toast.success('Customer deleted');
        this.router.navigateByUrl('/app/customers');
      },
      error: (e) => this.toast.error(e),
    });
  }
}
