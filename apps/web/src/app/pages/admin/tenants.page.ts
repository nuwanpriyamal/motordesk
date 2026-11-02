import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, debounceTime } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { Tenant } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { UI } from '../../shared/ui';

@Component({
  selector: 'app-admin-tenants',
  imports: [FormsModule, DatePipe, ...UI],
  template: `
    <div class="page-head">
      <div>
        <h1>Vendors</h1>
        <p class="muted">Service centers subscribed to the platform. Open one to change its plan, price or status.</p>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <input class="search" type="search" placeholder="Search name, slug or email" [ngModel]="search" (ngModelChange)="search$.next($event)" aria-label="Search vendors" />
        <select style="max-width: 180px" [(ngModel)]="status" (ngModelChange)="load(1)" aria-label="Filter by status">
          <option value="">All statuses</option>
          @for (s of statuses; track s) {<option [value]="s">{{ s | label }}</option>}
        </select>
        <span class="spacer"></span>
        <span class="muted small">{{ total() }} vendor(s)</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Vendor</th><th>Plan</th><th>Status</th><th>Billing</th><th class="num">Effective price</th><th>Trial / period ends</th><th>Joined</th></tr>
          </thead>
          <tbody>
            @for (t of items(); track t._id) {
              <tr class="clickable" (click)="open(t)">
                <td><strong>{{ t.name }}</strong><div class="muted small mono">{{ t.slug }}</div></td>
                <td>{{ t.plan.name }}</td>
                <td><app-status [value]="t.status" /></td>
                <td>{{ t.billingCycle | label }}</td>
                <td class="num nowrap">
                  {{ t.effectivePrice | money: t.plan.currency }}
                  @if (t.customPrice != null || t.discountPercent) {<div class="muted small">custom</div>}
                </td>
                <td class="nowrap">{{ (t.status === 'trial' ? t.trialEndsAt : t.currentPeriodEnd) | date: 'mediumDate' }}</td>
                <td class="nowrap">{{ t.createdAt | date: 'mediumDate' }}</td>
              </tr>
            } @empty {
              <tr><td colspan="7" class="empty">{{ loading() ? 'Loading…' : 'No vendors match.' }}</td></tr>
            }
          </tbody>
        </table>
      </div>
      <app-pager [page]="page()" [limit]="limit" [total]="total()" (go)="load($event)" />
    </div>
  `,
})
export class AdminTenantsPage implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private router = inject(Router);

  statuses = ['trial', 'active', 'past_due', 'suspended'];
  search = '';
  status = '';
  limit = 20;
  search$ = new Subject<string>();
  items = signal<Tenant[]>([]);
  total = signal(0);
  page = signal(1);
  loading = signal(true);

  ngOnInit() {
    this.search$.pipe(debounceTime(300)).subscribe((s) => {
      this.search = s;
      this.load(1);
    });
    this.load(1);
  }

  load(page: number) {
    this.loading.set(true);
    this.api.list<Tenant>('/admin/tenants', { page, limit: this.limit, search: this.search, status: this.status }).subscribe({
      next: (r) => {
        this.items.set(r.items);
        this.total.set(r.total);
        this.page.set(r.page);
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.toast.error(e);
      },
    });
  }

  open(t: Tenant) {
    this.router.navigate(['/admin/tenants', t._id]);
  }
}
