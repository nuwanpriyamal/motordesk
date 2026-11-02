import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { AuthService } from '../core/auth.service';
import { User } from '../core/models';
import { ToastService } from '../core/toast.service';
import { UI } from '../shared/ui';

const ROLES = [
  { value: 'owner', label: 'Owner', hint: 'Everything, including settings and billing' },
  { value: 'manager', label: 'Manager', hint: 'Everything except business settings' },
  { value: 'technician', label: 'Technician', hint: 'Job cards, time tracking, inventory lookup' },
  { value: 'cashier', label: 'Cashier', hint: 'Invoices, payments, appointments' },
];

@Component({
  imports: [FormsModule, DatePipe, ...UI],
  template: `
    <div class="page-head">
      <div><h1>Staff</h1><p class="muted">{{ activeCount() }} of {{ auth.tenant()?.entitlements?.limits?.maxUsers }} user seats used on your plan</p></div>
      <span class="spacer"></span>
      <button class="btn" (click)="open()">+ Add staff member</button>
    </div>
    <div class="card">
      <div class="table-wrap"><table>
        <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Status</th><th>Last sign-in</th><th></th></tr></thead>
        <tbody>
          @for (u of users(); track u._id) {
            <tr>
              <td><strong>{{ u.name }}</strong></td><td>{{ u.email }}</td><td>{{ u.phone }}</td>
              <td>{{ u.role | label }}</td>
              <td><span class="badge" [class.badge-active]="u.active" [class.badge-cancelled]="!u.active">{{ u.active ? 'Active' : 'Disabled' }}</span></td>
              <td>{{ u.lastLoginAt | date: 'short' }}</td>
              <td class="right"><button class="btn btn-ghost btn-sm" (click)="open(u)">Edit</button></td>
            </tr>
          }
        </tbody>
      </table></div>
    </div>

    <app-modal [open]="editing()" [title]="editId ? 'Edit staff member' : 'Add staff member'" (close)="editing.set(false)">
      <form class="stack" (ngSubmit)="save()">
        <div class="grid-2">
          <label class="field">Name<input [(ngModel)]="f.name" name="name" required /></label>
          <label class="field">Email<input type="email" [(ngModel)]="f.email" name="email" required /></label>
          <label class="field">Phone<input [(ngModel)]="f.phone" name="phone" /></label>
          <label class="field">Hourly rate<input type="number" min="0" [(ngModel)]="f.hourlyRate" name="rate" /></label>
          <label class="field span-all">{{ editId ? 'New password (leave blank to keep)' : 'Password' }}<input type="password" minlength="8" [(ngModel)]="f.password" name="pw" autocomplete="new-password" /><span class="hint">At least 8 characters</span></label>
        </div>
        <div class="field">Role</div>
        @for (r of roles; track r.value) {
          <label class="check"><input type="radio" name="role" [value]="r.value" [(ngModel)]="f.role" [disabled]="r.value === 'owner' && !auth.can('owner')" /> <strong>{{ r.label }}</strong> <span class="muted small">{{ r.hint }}</span></label>
        }
        @if (editId && editId !== auth.user()?.sub) {
          <label class="check"><input type="checkbox" [(ngModel)]="f.active" name="active" /> Account active</label>
        }
        <div class="form-actions">
          <button type="button" class="btn btn-ghost" (click)="editing.set(false)">Cancel</button>
          <button class="btn" [disabled]="!f.name || !f.email || (!editId && f.password.length < 8)">Save</button>
        </div>
      </form>
    </app-modal>
  `,
})
export class StaffPage implements OnInit {
  auth = inject(AuthService);
  private api = inject(ApiService);
  private toast = inject(ToastService);

  roles = ROLES;
  users = signal<User[]>([]);
  activeCount = signal(0);
  editing = signal(false);
  editId = '';
  f = this.blank();

  ngOnInit() {
    this.load();
  }

  blank() {
    return { name: '', email: '', phone: '', role: 'technician', password: '', hourlyRate: null as number | null, active: true };
  }

  load() {
    this.api.get<User[]>('/users').subscribe((u) => {
      this.users.set(u);
      this.activeCount.set(u.filter((x) => x.active).length);
    });
  }

  open(u?: User) {
    this.editId = u?._id ?? '';
    this.f = u ? { name: u.name, email: u.email, phone: u.phone ?? '', role: u.role, password: '', hourlyRate: u.hourlyRate ?? null, active: u.active } : this.blank();
    this.editing.set(true);
  }

  save() {
    const body: Record<string, unknown> = { ...this.f };
    if (!body['password']) delete body['password'];
    if (!body['phone']) delete body['phone'];
    if (body['hourlyRate'] === null || body['hourlyRate'] === '') delete body['hourlyRate'];
    else body['hourlyRate'] = Number(body['hourlyRate']);
    if (!this.editId) delete body['active'];
    const req = this.editId ? this.api.patch(`/users/${this.editId}`, body) : this.api.post('/users', body);
    req.subscribe({
      next: () => {
        this.editing.set(false);
        this.toast.success('Staff member saved');
        this.load();
      },
      error: (e) => this.toast.error(e),
    });
  }
}
