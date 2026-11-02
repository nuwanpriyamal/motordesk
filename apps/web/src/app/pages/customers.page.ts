import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../core/api.service';
import { Customer, Paginated } from '../core/models';
import { ToastService } from '../core/toast.service';
import { UI } from '../shared/ui';
import { CustomerFormComponent } from './customer-form.component';

@Component({
  imports: [FormsModule, RouterLink, DatePipe, CustomerFormComponent, ...UI],
  template: `
    <div class="page-head">
      <div><h1>Customers</h1><p class="muted">{{ data().total }} customers</p></div>
      <span class="spacer"></span>
      <button class="btn" (click)="adding.set(true)">+ Add customer</button>
    </div>
    <div class="card">
      <div class="card-head"><input class="search" placeholder="Search name, phone, email, NIC" [(ngModel)]="search" (ngModelChange)="reload()" /></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Tags</th><th class="num">Loyalty pts</th><th>Since</th></tr></thead>
        <tbody>
          @for (c of data().items; track c._id) {
            <tr class="clickable" [routerLink]="['/app/customers', c._id]">
              <td><strong>{{ c.name }}</strong></td>
              <td class="nowrap">{{ c.phone }}</td>
              <td>{{ c.email }}</td>
              <td>@for (t of c.tags; track t) {<span class="badge" style="margin-right: 4px">{{ t }}</span>}</td>
              <td class="num">{{ c.loyaltyPoints }}</td>
              <td class="nowrap">{{ c.createdAt | date: 'mediumDate' }}</td>
            </tr>
          } @empty {
            <tr><td colspan="6" class="empty">No customers yet.</td></tr>
          }
        </tbody>
      </table></div>
      <app-pager [page]="page" [limit]="data().limit" [total]="data().total" (go)="page = $event; load()" />
    </div>

    <app-modal [open]="adding()" title="Add customer" (close)="adding.set(false)">
      @if (adding()) {
        <app-customer-form [withVehicle]="true" (saved)="created($event)" (cancel)="adding.set(false)" />
      }
    </app-modal>
  `,
})
export class CustomersPage implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  data = signal<Paginated<Customer>>({ items: [], total: 0, page: 1, limit: 20 });
  adding = signal(false);
  search = '';
  page = 1;
  private timer?: ReturnType<typeof setTimeout>;

  ngOnInit() {
    this.load();
    if (this.route.snapshot.queryParamMap.get('new')) this.adding.set(true);
  }

  reload() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.page = 1;
      this.load();
    }, 250);
  }

  load() {
    this.api.list<Customer>('/customers', { page: this.page, search: this.search }).subscribe({
      next: (d) => this.data.set(d),
      error: (e) => this.toast.error(e),
    });
  }

  created(c: Customer) {
    this.adding.set(false);
    this.router.navigate(['/app/customers', c._id]);
  }
}
