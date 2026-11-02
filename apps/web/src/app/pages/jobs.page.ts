import { DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { ApiService } from '../core/api.service';
import { Customer, JobCard, Paginated, Vehicle } from '../core/models';
import { RealtimeService } from '../core/realtime.service';
import { ToastService } from '../core/toast.service';
import { UI } from '../shared/ui';

const LANES = [
  { key: 'pending', label: 'Pending' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'waiting_parts', label: 'Waiting for parts' },
  { key: 'completed', label: 'Ready for pickup' },
];

@Component({
  imports: [FormsModule, RouterLink, DatePipe, ...UI],
  template: `
    <div class="page-head">
      <div><h1>Job cards</h1><p class="muted">Track every vehicle from check-in to delivery.</p></div>
      <span class="spacer"></span>
      <div class="tabs" style="margin: 0; border: none">
        <button [class.active]="view() === 'board'" (click)="setView('board')">Board</button>
        <button [class.active]="view() === 'list'" (click)="setView('list')">All jobs</button>
      </div>
      <button class="btn" (click)="openNew()">+ New job card</button>
    </div>

    @if (view() === 'board') {
      <div class="board">
        @for (lane of lanes; track lane.key) {
          <section class="lane">
            <div class="lane-head"><span>{{ lane.label }}</span><span class="badge">{{ board()[lane.key]?.length ?? 0 }}</span></div>
            @for (j of board()[lane.key] ?? []; track j._id) {
              <a class="job" [routerLink]="['/app/jobs', j._id]">
                <div class="row" style="gap: 6px">
                  <span class="reg">{{ j.vehicle.registrationNo }}</span>
                  <span class="spacer"></span>
                  @if (j.priority === 'urgent' || j.priority === 'high') {<app-status [value]="j.priority" />}
                </div>
                <div class="small">{{ j.vehicle.make }} {{ j.vehicle.model }} · {{ j.customer.name }}</div>
                <div class="small muted">{{ j.number }} · {{ j.serviceType || 'General' }}</div>
                @if (j.assignedTo.length) {<div class="small muted">👤 {{ names(j) }}</div>}
              </a>
            } @empty {
              <div class="muted small" style="padding: 8px 6px">Nothing here</div>
            }
          </section>
        }
      </div>
    } @else {
      <div class="card">
        <div class="card-head">
          <input class="search" placeholder="Search job no., complaint, service" [(ngModel)]="search" (ngModelChange)="reload()" />
          <select style="max-width: 200px" [(ngModel)]="status" (ngModelChange)="reload()">
            <option value="">All statuses</option>
            @for (s of statuses; track s) {<option [value]="s">{{ s | label }}</option>}
          </select>
        </div>
        <div class="table-wrap"><table>
          <thead><tr><th>Job</th><th>Vehicle</th><th>Customer</th><th>Service</th><th>Status</th><th class="num">Total</th><th>Opened</th></tr></thead>
          <tbody>
            @for (j of list().items; track j._id) {
              <tr class="clickable" [routerLink]="['/app/jobs', j._id]">
                <td class="mono">{{ j.number }}</td>
                <td><strong>{{ j.vehicle.registrationNo }}</strong></td>
                <td>{{ j.customer.name }}</td>
                <td>{{ j.serviceType }}</td>
                <td><app-status [value]="j.status" /></td>
                <td class="num">{{ j.total | money }}</td>
                <td class="nowrap">{{ j.createdAt | date: 'mediumDate' }}</td>
              </tr>
            } @empty {
              <tr><td colspan="7" class="empty">No job cards found.</td></tr>
            }
          </tbody>
        </table></div>
        <app-pager [page]="page" [limit]="list().limit" [total]="list().total" (go)="page = $event; loadList()" />
      </div>
    }

    <app-modal [open]="creating()" title="New job card" (close)="creating.set(false)">
      <form class="stack" (ngSubmit)="create()">
        <label class="field">Find customer or vehicle
          <input placeholder="Name, phone or registration no." [(ngModel)]="lookup" name="lookup" (ngModelChange)="findVehicles()" autocomplete="off" />
        </label>
        @if (vehicleMatches().length) {
          <div class="card">
            @for (v of vehicleMatches(); track v._id) {
              <label class="check" style="padding: 8px 12px; display: flex">
                <input type="radio" name="veh" [value]="v._id" [(ngModel)]="form.vehicle" (ngModelChange)="pickVehicle(v)" />
                <strong>{{ v.registrationNo }}</strong> {{ v.make }} {{ v.model }} <span class="muted">· {{ customerName(v) }}</span>
              </label>
            }
          </div>
        } @else if (lookup.length > 1) {
          <p class="muted small">No vehicle found. <a routerLink="/app/customers" [queryParams]="{ new: 1 }">Add the customer and vehicle first</a>.</p>
        }
        <div class="grid-2">
          <label class="field">Service type<input [(ngModel)]="form.serviceType" name="serviceType" list="services" /></label>
          <datalist id="services">@for (s of services; track s) {<option [value]="s"></option>}</datalist>
          <label class="field">Priority
            <select [(ngModel)]="form.priority" name="priority">
              <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
            </select>
          </label>
          <label class="field">Mileage in (km)<input type="number" min="0" [(ngModel)]="form.mileageIn" name="mileageIn" /></label>
          <label class="field">Promised by<input type="datetime-local" [(ngModel)]="form.estimatedCompletion" name="eta" /></label>
        </div>
        <label class="field">Customer complaint<textarea [(ngModel)]="form.complaint" name="complaint"></textarea></label>
        <div class="form-actions">
          <button type="button" class="btn btn-ghost" (click)="creating.set(false)">Cancel</button>
          <button class="btn" [disabled]="!form.vehicle || saving()">Create job card</button>
        </div>
      </form>
    </app-modal>
  `,
})
export class JobsPage implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private realtime = inject(RealtimeService);
  private sub?: Subscription;

  lanes = LANES;
  statuses = ['pending', 'in_progress', 'waiting_parts', 'completed', 'delivered', 'cancelled'];
  services = ['Full Service', 'Oil Change', 'Brake Service', 'Engine Tune-up', 'Wheel Alignment', 'AC Repair', 'Body Wash', 'Diagnostics', 'Hybrid Service'];

  view = signal<'board' | 'list'>('board');
  board = signal<Partial<Record<string, JobCard[]>>>({});
  list = signal<Paginated<JobCard>>({ items: [], total: 0, page: 1, limit: 20 });
  search = '';
  status = '';
  page = 1;

  creating = signal(false);
  saving = signal(false);
  lookup = '';
  vehicleMatches = signal<Vehicle[]>([]);
  form = this.blank();
  private lookupTimer?: ReturnType<typeof setTimeout>;

  ngOnInit() {
    this.loadBoard();
    if (this.route.snapshot.queryParamMap.get('new')) this.openNew();
    this.sub = this.realtime.on('job.').subscribe(() => (this.view() === 'board' ? this.loadBoard() : this.loadList()));
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }

  blank() {
    return { customer: '', vehicle: '', serviceType: '', priority: 'normal', mileageIn: null as number | null, estimatedCompletion: '', complaint: '' };
  }

  setView(v: 'board' | 'list') {
    this.view.set(v);
    v === 'board' ? this.loadBoard() : this.loadList();
  }

  loadBoard() {
    this.api.get<Partial<Record<string, JobCard[]>>>('/job-cards/views/board').subscribe({ next: (b) => this.board.set(b), error: (e) => this.toast.error(e) });
  }

  reload() {
    this.page = 1;
    this.loadList();
  }

  loadList() {
    this.api
      .list<JobCard>('/job-cards', { page: this.page, search: this.search, status: this.status })
      .subscribe({ next: (r) => this.list.set(r), error: (e) => this.toast.error(e) });
  }

  names(j: JobCard) {
    return j.assignedTo.map((u) => u.name.split(' ')[0]).join(', ');
  }

  customerName(v: Vehicle) {
    return typeof v.customer === 'object' ? (v.customer as Customer).name : '';
  }

  openNew() {
    this.form = this.blank();
    this.lookup = '';
    this.vehicleMatches.set([]);
    this.creating.set(true);
  }

  findVehicles() {
    clearTimeout(this.lookupTimer);
    if (this.lookup.length < 2) return this.vehicleMatches.set([]);
    this.lookupTimer = setTimeout(() => {
      // Search vehicles by registration first, then by customer name/phone.
      this.api.list<Vehicle>('/vehicles', { search: this.lookup, limit: 8 }).subscribe((r) => {
        if (r.items.length) return this.vehicleMatches.set(r.items);
        this.api.list<Customer>('/customers', { search: this.lookup, limit: 3 }).subscribe((c) => {
          if (!c.items.length) return this.vehicleMatches.set([]);
          this.api.list<Vehicle>('/vehicles', { customer: c.items[0]._id, limit: 8 }).subscribe((v) => this.vehicleMatches.set(v.items));
        });
      });
    }, 250);
  }

  pickVehicle(v: Vehicle) {
    this.form.customer = typeof v.customer === 'object' ? (v.customer as Customer)._id : (v.customer as string);
    if (!this.form.mileageIn) this.form.mileageIn = v.mileage || null;
  }

  create() {
    this.saving.set(true);
    const { estimatedCompletion, mileageIn, ...rest } = this.form;
    const body: Record<string, unknown> = { ...rest };
    if (mileageIn) body['mileageIn'] = Number(mileageIn);
    if (estimatedCompletion) body['estimatedCompletion'] = new Date(estimatedCompletion).toISOString();
    if (!body['serviceType']) delete body['serviceType'];
    if (!body['complaint']) delete body['complaint'];
    this.api.post<JobCard>('/job-cards', body).subscribe({
      next: (j) => {
        this.saving.set(false);
        this.creating.set(false);
        this.toast.success(`Job ${j.number} created`);
        this.router.navigate(['/app/jobs', j._id]);
      },
      error: (e) => {
        this.saving.set(false);
        this.toast.error(e);
      },
    });
  }
}
