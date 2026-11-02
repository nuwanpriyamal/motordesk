import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { Customer, Paginated, Vehicle } from '../core/models';
import { ToastService } from '../core/toast.service';
import { UI } from '../shared/ui';
import { VehicleFormComponent } from './vehicle-form.component';

@Component({
  imports: [FormsModule, RouterLink, DatePipe, DecimalPipe, VehicleFormComponent, ...UI],
  template: `
    <div class="page-head">
      <div><h1>Vehicles</h1><p class="muted">{{ data().total }} vehicles on record</p></div>
      <span class="spacer"></span>
      <button class="btn" (click)="adding.set(true)">+ Add vehicle</button>
    </div>
    <div class="card">
      <div class="card-head">
        <input class="search" placeholder="Search registration, make, model, VIN" [(ngModel)]="search" (ngModelChange)="reload()" />
        <label class="check small"><input type="checkbox" [(ngModel)]="dueOnly" (ngModelChange)="reload()" /> Service due in 14 days</label>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Registration</th><th>Vehicle</th><th>Owner</th><th class="num">Mileage</th><th>Next service</th><th>Insurance</th><th>Licence</th></tr></thead>
        <tbody>
          @for (v of data().items; track v._id) {
            <tr class="clickable" (click)="editing.set(v)">
              <td><strong>{{ v.registrationNo }}</strong></td>
              <td>{{ v.make }} {{ v.model }} <span class="muted small">{{ v.type | label }}</span></td>
              <td><a [routerLink]="['/app/customers', owner(v)?._id]" (click)="$event.stopPropagation()">{{ owner(v)?.name }}</a></td>
              <td class="num">{{ v.mileage | number }}</td>
              <td [style.color]="isSoon(v.nextServiceDue) ? 'var(--warning)' : null">{{ v.nextServiceDue | date: 'mediumDate' }}</td>
              <td [style.color]="isSoon(v.insuranceExpiry) ? 'var(--danger)' : null">{{ v.insuranceExpiry | date: 'mediumDate' }}</td>
              <td [style.color]="isSoon(v.licenseExpiry) ? 'var(--danger)' : null">{{ v.licenseExpiry | date: 'mediumDate' }}</td>
            </tr>
          } @empty {
            <tr><td colspan="7" class="empty">No vehicles found.</td></tr>
          }
        </tbody>
      </table></div>
      <app-pager [page]="page" [limit]="data().limit" [total]="data().total" (go)="page = $event; load()" />
    </div>

    <app-modal [open]="adding()" title="Add vehicle" (close)="adding.set(false)">
      @if (adding()) {<app-vehicle-form (saved)="adding.set(false); load()" (cancel)="adding.set(false)" />}
    </app-modal>
    <app-modal [open]="!!editing()" title="Edit vehicle" (close)="editing.set(null)">
      @if (editing(); as v) {<app-vehicle-form [vehicle]="v" (saved)="editing.set(null); load()" (cancel)="editing.set(null)" />}
    </app-modal>
  `,
})
export class VehiclesPage implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  data = signal<Paginated<Vehicle>>({ items: [], total: 0, page: 1, limit: 20 });
  adding = signal(false);
  editing = signal<Vehicle | null>(null);
  search = '';
  dueOnly = false;
  page = 1;
  private timer?: ReturnType<typeof setTimeout>;

  ngOnInit() {
    this.load();
  }

  owner(v: Vehicle) {
    return typeof v.customer === 'object' ? (v.customer as Customer) : null;
  }

  isSoon(d?: string) {
    return !!d && new Date(d).getTime() - Date.now() < 14 * 86400000;
  }

  reload() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.page = 1;
      this.load();
    }, 250);
  }

  load() {
    const q: Record<string, string | number> = { page: this.page, search: this.search };
    if (this.dueOnly) {
      q['dueWithinDays'] = 14;
      q['sort'] = 'nextServiceDue';
    }
    this.api.list<Vehicle>('/vehicles', q).subscribe({
      next: (d) => this.data.set(d),
      error: (e) => this.toast.error(e),
    });
  }
}
