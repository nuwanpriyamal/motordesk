import { DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription, debounceTime, merge } from 'rxjs';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { Appointment, Part } from '../core/models';
import { RealtimeService } from '../core/realtime.service';
import { ToastService } from '../core/toast.service';
import { UI } from '../shared/ui';

interface Dashboard {
  counts: Record<string, number>;
  jobsByStatus: Partial<Record<string, number>>;
  finance: {
    invoicedThisMonth: number;
    collectedThisMonth: number;
    outstanding: number;
    expensesThisMonth: number;
    profitThisMonth: number;
    expensesByCategory: { category: string; total: number }[];
  };
  inventory: { items: number; units: number; costValue: number; retailValue: number; lowStock: Part[] };
  appointmentsToday: Appointment[];
  revenueByMonth: { month: string; revenue: number; collected: number }[];
  topServices: { service: string; count: number; revenue: number }[];
  technicians: { name: string; minutes: number; jobs: number }[];
}

@Component({
  imports: [RouterLink, DatePipe, ...UI],
  template: `
    <div class="page-head">
      <div>
        <h1>Good {{ greeting }}, {{ auth.user()?.name?.split(' ')?.[0] }}</h1>
        <p class="muted">Here is what is happening at {{ auth.tenant()?.name }} today.</p>
      </div>
      <span class="spacer"></span>
      <a class="btn" routerLink="/app/jobs" [queryParams]="{ new: 1 }">+ New job card</a>
    </div>

    @if (d(); as d) {
      <div class="stats">
        <div class="card stat"><div class="label">Active jobs</div><div class="value">{{ d.counts['activeJobs'] }}</div><div class="sub">{{ d.counts['jobsCreatedToday'] }} opened today</div></div>
        <div class="card stat"><div class="label">Completed today</div><div class="value">{{ d.counts['jobsCompletedToday'] }}</div><div class="sub">{{ d.jobsByStatus['completed'] ?? 0 }} awaiting delivery</div></div>
        <div class="card stat"><div class="label">Appointments today</div><div class="value">{{ d.counts['appointmentsToday'] }}</div></div>
        <div class="card stat"><div class="label">Collected this month</div><div class="value" style="font-size: 20px">{{ d.finance.collectedThisMonth | money }}</div><div class="sub">{{ d.finance.outstanding | money }} outstanding</div></div>
        <div class="card stat"><div class="label">Profit this month</div><div class="value" style="font-size: 20px" [style.color]="d.finance.profitThisMonth < 0 ? 'var(--danger)' : null">{{ d.finance.profitThisMonth | money }}</div><div class="sub">{{ d.finance.expensesThisMonth | money }} expenses</div></div>
        <div class="card stat"><div class="label">Customers / vehicles</div><div class="value">{{ d.counts['customers'] }} / {{ d.counts['vehicles'] }}</div></div>
      </div>

      <div class="grid-2" style="margin-top: 16px">
        <section class="card">
          <div class="card-head"><h2>Revenue, last 6 months</h2></div>
          <div class="card-pad">
            <div class="bars" role="img" [attr.aria-label]="'Monthly revenue chart'">
              @for (m of d.revenueByMonth; track m.month) {
                <div class="bar" [title]="m.month + ': ' + (m.revenue | money)">
                  <span class="cap">{{ m.revenue ? (m.revenue / 1000).toFixed(0) + 'k' : '' }}</span>
                  <div class="fill" [style.height.%]="(m.revenue / maxRevenue()) * 100"></div>
                  <span class="cap">{{ monthLabel(m.month) }}</span>
                </div>
              }
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card-head"><h2>Today's appointments</h2><span class="spacer"></span><a routerLink="/app/appointments" class="small">View all</a></div>
          @if (d.appointmentsToday.length) {
            <div class="table-wrap"><table>
              <tbody>
                @for (a of d.appointmentsToday; track a._id) {
                  <tr>
                    <td class="nowrap">{{ a.start | date: 'shortTime' }}</td>
                    <td>{{ a.customer?.name || a.guestName }}<div class="muted small">{{ a.vehicle?.registrationNo || a.guestVehicleNo }} · {{ a.serviceType }}</div></td>
                    <td class="right"><app-status [value]="a.status" /></td>
                  </tr>
                }
              </tbody>
            </table></div>
          } @else {
            <div class="empty">No appointments today.</div>
          }
        </section>

        <section class="card">
          <div class="card-head"><h2>Top services</h2></div>
          @if (d.topServices.length) {
            <div class="table-wrap"><table>
              <thead><tr><th>Service</th><th class="num">Jobs</th><th class="num">Revenue</th></tr></thead>
              <tbody>
                @for (s of d.topServices; track s.service) {
                  <tr><td>{{ s.service }}</td><td class="num">{{ s.count }}</td><td class="num">{{ s.revenue | money }}</td></tr>
                }
              </tbody>
            </table></div>
          } @else {
            <div class="empty">Set a service type on job cards to see this.</div>
          }
        </section>

        <section class="card">
          <div class="card-head"><h2>Low stock</h2><span class="spacer"></span><a routerLink="/app/inventory" class="small">Inventory</a></div>
          @if (d.inventory.lowStock.length) {
            <div class="table-wrap"><table>
              <thead><tr><th>Part</th><th class="num">In stock</th><th class="num">Reorder at</th></tr></thead>
              <tbody>
                @for (p of d.inventory.lowStock; track p._id) {
                  <tr><td>{{ p.name }}<div class="muted small mono">{{ p.sku }}</div></td><td class="num" style="color: var(--danger)">{{ p.quantity }}</td><td class="num">{{ p.reorderLevel }}</td></tr>
                }
              </tbody>
            </table></div>
          } @else {
            <div class="empty">All parts are above their reorder level.</div>
          }
        </section>

        @if (d.technicians.length) {
          <section class="card span-all">
            <div class="card-head"><h2>Technician time this month</h2></div>
            <div class="table-wrap"><table>
              <thead><tr><th>Technician</th><th class="num">Jobs</th><th class="num">Hours logged</th></tr></thead>
              <tbody>
                @for (t of d.technicians; track t.name) {
                  <tr><td>{{ t.name }}</td><td class="num">{{ t.jobs }}</td><td class="num">{{ (t.minutes / 60).toFixed(1) }}</td></tr>
                }
              </tbody>
            </table></div>
          </section>
        }
      </div>
    } @else {
      <div class="card empty">Loading dashboard…</div>
    }
  `,
})
export class DashboardPage implements OnInit, OnDestroy {
  auth = inject(AuthService);
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private realtime = inject(RealtimeService);
  private sub?: Subscription;

  d = signal<Dashboard | null>(null);
  maxRevenue = computed(() => Math.max(1, ...(this.d()?.revenueByMonth.map((m) => m.revenue) ?? [1])));
  greeting = new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening';

  ngOnInit() {
    this.load();
    // Server caches the dashboard for 60s; refresh after activity settles.
    this.sub = merge(this.realtime.on('job.'), this.realtime.on('invoice.'), this.realtime.on('appointment.'))
      .pipe(debounceTime(3000))
      .subscribe(() => this.load());
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }

  load() {
    this.api.get<Dashboard>('/dashboard').subscribe({ next: (d) => this.d.set(d), error: (e) => this.toast.error(e) });
  }

  monthLabel(ym: string) {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleString('en', { month: 'short' });
  }
}
