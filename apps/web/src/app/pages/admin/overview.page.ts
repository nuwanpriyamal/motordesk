import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { Paginated, Tenant } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { UI } from '../../shared/ui';

interface PlatformStats {
  tenantsByStatus: Record<string, number>;
  totalTenants: number;
  mrr: number;
  collectedLast30Days: number;
}

@Component({
  selector: 'app-admin-overview',
  imports: [RouterLink, DatePipe, ...UI],
  template: `
    <div class="page-head">
      <div>
        <h1>Platform overview</h1>
        <p class="muted">Vendors subscribed to the platform and their revenue.</p>
      </div>
    </div>

    @if (stats(); as s) {
      <div class="stats" style="margin-bottom: 18px">
        <div class="card stat"><div class="label">Vendors</div><div class="value">{{ s.totalTenants }}</div></div>
        <div class="card stat"><div class="label">Active</div><div class="value">{{ (s.tenantsByStatus['active'] || 0) }}</div></div>
        <div class="card stat"><div class="label">On trial</div><div class="value">{{ (s.tenantsByStatus['trial'] || 0) }}</div></div>
        <div class="card stat">
          <div class="label">Past due / suspended</div>
          <div class="value">{{ ((s.tenantsByStatus['past_due'] || 0)) + ((s.tenantsByStatus['suspended'] || 0)) }}</div>
        </div>
        <div class="card stat"><div class="label">MRR</div><div class="value">{{ s.mrr | money: 'LKR' }}</div><div class="sub">Active vendors, monthly equivalent</div></div>
        <div class="card stat"><div class="label">Collected (30 days)</div><div class="value">{{ s.collectedLast30Days | money: 'LKR' }}</div></div>
      </div>
    }

    <div class="card">
      <div class="card-head">
        <h2>Recent vendors</h2>
        <span class="spacer"></span>
        <a class="btn btn-ghost btn-sm" routerLink="/admin/tenants">View all</a>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Vendor</th><th>Plan</th><th>Status</th><th class="num">Price</th><th>Joined</th></tr></thead>
          <tbody>
            @for (t of recent(); track t._id) {
              <tr class="clickable" [routerLink]="['/admin/tenants', t._id]">
                <td><strong>{{ t.name }}</strong><div class="muted small">{{ t.city }}</div></td>
                <td>{{ t.plan.name }}</td>
                <td><app-status [value]="t.status" /></td>
                <td class="num">{{ t.effectivePrice | money: t.plan.currency }}</td>
                <td class="nowrap">{{ t.createdAt | date: 'mediumDate' }}</td>
              </tr>
            } @empty {
              <tr><td colspan="5" class="empty">No vendors yet.</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class AdminOverviewPage implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);

  stats = signal<PlatformStats | null>(null);
  recent = signal<Tenant[]>([]);

  ngOnInit() {
    this.api.get<PlatformStats>('/admin/tenants/stats').subscribe({ next: (s) => this.stats.set(s), error: (e) => this.toast.error(e) });
    this.api.list<Tenant>('/admin/tenants', { limit: 5 }).subscribe({
      next: (r: Paginated<Tenant>) => this.recent.set(r.items),
      error: (e) => this.toast.error(e),
    });
  }
}
