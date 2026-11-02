import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { switchMap, of } from 'rxjs';
import { ApiService } from '../core/api.service';
import { Customer } from '../core/models';
import { ToastService } from '../core/toast.service';
import { toDateInput } from '../shared/ui';
import { VEHICLE_TYPES } from './vehicle-form.component';

/** Create or edit a customer; on create it can also register their first vehicle. */
@Component({
  selector: 'app-customer-form',
  imports: [FormsModule],
  template: `
    <form class="stack" (ngSubmit)="submit()">
      <div class="grid-2">
        <label class="field">Full name *<input [(ngModel)]="f.name" name="name" required /></label>
        <label class="field">Mobile<input [(ngModel)]="f.phone" name="phone" placeholder="07X XXX XXXX" /></label>
        <label class="field">Email<input type="email" [(ngModel)]="f.email" name="email" /></label>
        <label class="field">NIC<input [(ngModel)]="f.nic" name="nic" /></label>
        <label class="field">Birthday<input type="date" [(ngModel)]="f.birthday" name="birthday" /></label>
        <label class="field">Preferred contact
          <select [(ngModel)]="f.preferredChannel" name="channel">
            <option value="sms">SMS</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="none">Do not contact</option>
          </select>
        </label>
        <label class="field span-all">Address<input [(ngModel)]="f.address" name="address" /></label>
        <label class="field">Tags <span class="hint">Comma separated, e.g. fleet, VIP</span><input [(ngModel)]="tags" name="tags" /></label>
        <label class="check" style="align-self: end"><input type="checkbox" [(ngModel)]="f.marketingOptIn" name="optin" /> Receives promotions & wishes</label>
      </div>
      @if (withVehicle && !customer) {
        <h3 style="margin-top: 4px">First vehicle <span class="muted small" style="font-weight: 400">(optional)</span></h3>
        <div class="grid-2">
          <label class="field">Registration no.<input [(ngModel)]="v.registrationNo" name="reg" placeholder="CAB-1234" /></label>
          <label class="field">Type
            <select [(ngModel)]="v.type" name="vtype">@for (t of types; track t.value) {<option [value]="t.value">{{ t.label }}</option>}</select>
          </label>
          <label class="field">Make<input [(ngModel)]="v.make" name="make" placeholder="Toyota" /></label>
          <label class="field">Model<input [(ngModel)]="v.model" name="model" placeholder="Aqua" /></label>
        </div>
      }
      <label class="field">Notes<textarea [(ngModel)]="f.notes" name="notes"></textarea></label>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" (click)="cancel.emit()">Cancel</button>
        <button class="btn" [disabled]="!f.name || saving()">{{ customer ? 'Save' : 'Add customer' }}</button>
      </div>
    </form>
  `,
})
export class CustomerFormComponent implements OnInit {
  @Input() customer?: Customer;
  @Input() withVehicle = false;
  @Output() saved = new EventEmitter<Customer>();
  @Output() cancel = new EventEmitter<void>();

  private api = inject(ApiService);
  private toast = inject(ToastService);
  types = VEHICLE_TYPES;
  saving = signal(false);
  f = { name: '', phone: '', email: '', nic: '', birthday: '', preferredChannel: 'sms', address: '', marketingOptIn: true, notes: '' };
  tags = '';
  v = { registrationNo: '', type: 'car', make: '', model: '' };

  ngOnInit() {
    const c = this.customer;
    if (c) {
      this.f = {
        name: c.name,
        phone: c.phone ?? '',
        email: c.email ?? '',
        nic: c.nic ?? '',
        birthday: toDateInput(c.birthday),
        preferredChannel: c.preferredChannel,
        address: c.address ?? '',
        marketingOptIn: c.marketingOptIn,
        notes: c.notes ?? '',
      };
      this.tags = c.tags.join(', ');
    }
  }

  submit() {
    const body: Record<string, unknown> = { ...this.f, tags: this.tags.split(',').map((t) => t.trim()).filter(Boolean) };
    for (const k of ['email', 'birthday', 'phone', 'nic', 'address', 'notes']) if (!body[k]) delete body[k];
    this.saving.set(true);
    const req = this.customer
      ? this.api.patch<Customer>(`/customers/${this.customer._id}`, body)
      : this.api.post<Customer>('/customers', body).pipe(
          switchMap((c) =>
            this.v.registrationNo
              ? this.api.post('/vehicles', { ...this.v, customer: c._id, make: this.v.make || undefined, model: this.v.model || undefined }).pipe(switchMap(() => of(c)))
              : of(c),
          ),
        );
    req.subscribe({
      next: (c) => {
        this.saving.set(false);
        this.toast.success(this.customer ? 'Customer updated' : 'Customer added');
        this.saved.emit(c);
      },
      error: (e) => {
        this.saving.set(false);
        this.toast.error(e);
      },
    });
  }
}
