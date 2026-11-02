import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { Customer, Vehicle } from '../core/models';
import { ToastService } from '../core/toast.service';
import { toDateInput } from '../shared/ui';

export const VEHICLE_TYPES = [
  { value: 'car', label: 'Car' },
  { value: 'van', label: 'Van' },
  { value: 'suv', label: 'SUV' },
  { value: 'jeep', label: 'Jeep' },
  { value: 'motorcycle', label: 'Motorcycle' },
  { value: 'three_wheeler', label: 'Three-wheeler' },
  { value: 'lorry', label: 'Lorry' },
  { value: 'bus', label: 'Bus' },
  { value: 'other', label: 'Other' },
];

@Component({
  selector: 'app-vehicle-form',
  imports: [FormsModule],
  template: `
    <form class="stack" (ngSubmit)="submit()">
      @if (!customerId && !vehicle) {
        <label class="field">Owner *
          <input placeholder="Search customer by name or phone" [(ngModel)]="ownerSearch" name="owner" (ngModelChange)="findOwners()" autocomplete="off" />
        </label>
        @for (c of owners(); track c._id) {
          <label class="check"><input type="radio" name="ownerId" [value]="c._id" [(ngModel)]="f.customer" /> {{ c.name }} <span class="muted">{{ c.phone }}</span></label>
        }
      }
      <div class="grid-2">
        <label class="field">Registration no. *<input [(ngModel)]="f.registrationNo" name="reg" required placeholder="CAB-1234" /></label>
        <label class="field">Type<select [(ngModel)]="f.type" name="type">@for (t of types; track t.value) {<option [value]="t.value">{{ t.label }}</option>}</select></label>
        <label class="field">Make<input [(ngModel)]="f.make" name="make" /></label>
        <label class="field">Model<input [(ngModel)]="f.model" name="model" /></label>
        <label class="field">Year<input type="number" [(ngModel)]="f.year" name="year" /></label>
        <label class="field">Colour<input [(ngModel)]="f.color" name="color" /></label>
        <label class="field">Fuel
          <select [(ngModel)]="f.fuelType" name="fuel"><option value="">—</option><option value="petrol">Petrol</option><option value="diesel">Diesel</option><option value="hybrid">Hybrid</option><option value="electric">Electric</option><option value="other">Other</option></select>
        </label>
        <label class="field">Mileage (km)<input type="number" min="0" [(ngModel)]="f.mileage" name="mileage" /></label>
        <label class="field">Chassis / VIN<input [(ngModel)]="f.vin" name="vin" /></label>
        <label class="field">Engine no.<input [(ngModel)]="f.engineNo" name="engine" /></label>
        <label class="field">Next service due<input type="date" [(ngModel)]="f.nextServiceDue" name="nsd" /></label>
        <label class="field">Insurance expiry<input type="date" [(ngModel)]="f.insuranceExpiry" name="ins" /></label>
        <label class="field">Revenue licence expiry<input type="date" [(ngModel)]="f.licenseExpiry" name="lic" /></label>
      </div>
      <label class="field">Notes<textarea [(ngModel)]="f.notes" name="notes"></textarea></label>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" (click)="cancel.emit()">Cancel</button>
        <button class="btn" [disabled]="!f.registrationNo || !f.customer || saving()">{{ vehicle ? 'Save' : 'Add vehicle' }}</button>
      </div>
    </form>
  `,
})
export class VehicleFormComponent implements OnInit {
  @Input() vehicle?: Vehicle;
  @Input() customerId?: string;
  @Output() saved = new EventEmitter<Vehicle>();
  @Output() cancel = new EventEmitter<void>();

  private api = inject(ApiService);
  private toast = inject(ToastService);
  types = VEHICLE_TYPES;
  saving = signal(false);
  owners = signal<Customer[]>([]);
  ownerSearch = '';
  f = {
    customer: '',
    registrationNo: '',
    type: 'car',
    make: '',
    model: '',
    year: null as number | null,
    color: '',
    fuelType: '',
    mileage: null as number | null,
    vin: '',
    engineNo: '',
    nextServiceDue: '',
    insuranceExpiry: '',
    licenseExpiry: '',
    notes: '',
  };
  private timer?: ReturnType<typeof setTimeout>;

  ngOnInit() {
    const v = this.vehicle;
    if (v) {
      this.f = {
        customer: typeof v.customer === 'object' ? v.customer._id : v.customer,
        registrationNo: v.registrationNo,
        type: v.type,
        make: v.make ?? '',
        model: v.model ?? '',
        year: v.year ?? null,
        color: v.color ?? '',
        fuelType: v.fuelType ?? '',
        mileage: v.mileage ?? null,
        vin: v.vin ?? '',
        engineNo: v.engineNo ?? '',
        nextServiceDue: toDateInput(v.nextServiceDue),
        insuranceExpiry: toDateInput(v.insuranceExpiry),
        licenseExpiry: toDateInput(v.licenseExpiry),
        notes: v.notes ?? '',
      };
    } else if (this.customerId) {
      this.f.customer = this.customerId;
    }
  }

  findOwners() {
    clearTimeout(this.timer);
    this.timer = setTimeout(
      () => this.api.list<Customer>('/customers', { search: this.ownerSearch, limit: 6 }).subscribe((r) => this.owners.set(r.items)),
      250,
    );
  }

  submit() {
    const body: Record<string, unknown> = { ...this.f };
    for (const [k, val] of Object.entries(body)) if (val === '' || val === null) delete body[k];
    if (body['year']) body['year'] = Number(body['year']);
    if (body['mileage'] !== undefined) body['mileage'] = Number(body['mileage']);
    this.saving.set(true);
    const req = this.vehicle ? this.api.patch<Vehicle>(`/vehicles/${this.vehicle._id}`, body) : this.api.post<Vehicle>('/vehicles', body);
    req.subscribe({
      next: (v) => {
        this.saving.set(false);
        this.toast.success(this.vehicle ? 'Vehicle updated' : 'Vehicle added');
        this.saved.emit(v);
      },
      error: (e) => {
        this.saving.set(false);
        this.toast.error(e);
      },
    });
  }
}
