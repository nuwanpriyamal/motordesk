export type Role = 'super_admin' | 'owner' | 'manager' | 'technician' | 'cashier';

export interface AuthUser {
  sub: string;
  email: string;
  name: string;
  role: Role;
  tenantId: string | null;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface Plan {
  _id: string;
  code: string;
  name: string;
  description?: string;
  currency: string;
  monthlyPrice: number;
  yearlyPrice: number;
  trialDays: number;
  features: string[];
  limits: { maxUsers: number; maxVehicles: number; maxJobCardsPerMonth: number; smsPerMonth: number };
  isPublic: boolean;
  active: boolean;
  sortOrder: number;
}

export interface Entitlements {
  status: string;
  active: boolean;
  features: string[];
  limits: Plan['limits'];
  planName: string;
  trialEndsAt?: string;
}

export interface TenantSettings {
  currency: string;
  taxRate: number;
  timezone: string;
  invoiceFooter?: string;
  serviceIntervalKm: number;
  serviceIntervalDays: number;
  slotMinutes: number;
  bays: number;
  openTime: string;
  closeTime: string;
}

export interface Tenant {
  _id: string;
  name: string;
  slug: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  logoUrl?: string;
  registrationNo?: string;
  plan: Plan;
  status: string;
  billingCycle: 'monthly' | 'yearly';
  customPrice?: number;
  discountPercent: number;
  trialEndsAt?: string;
  currentPeriodEnd?: string;
  extraFeatures: string[];
  disabledFeatures: string[];
  payments?: { amount: number; paidAt: string; method?: string; reference?: string; periodEnd?: string }[];
  notes?: string;
  settings: TenantSettings;
  effectivePrice: number;
  entitlements?: Entitlements;
  createdAt: string;
}

export interface Customer {
  _id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  nic?: string;
  birthday?: string;
  preferredChannel: string;
  marketingOptIn: boolean;
  tags: string[];
  loyaltyPoints: number;
  notes?: string;
  createdAt: string;
}

export interface Vehicle {
  _id: string;
  customer: Customer | string;
  registrationNo: string;
  type: string;
  make?: string;
  model?: string;
  year?: number;
  color?: string;
  vin?: string;
  engineNo?: string;
  fuelType?: string;
  mileage: number;
  lastServiceAt?: string;
  nextServiceDue?: string;
  nextServiceMileage?: number;
  insuranceExpiry?: string;
  licenseExpiry?: string;
  notes?: string;
}

export interface LineItem {
  kind: 'labor' | 'part' | 'other';
  description: string;
  part?: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total?: number;
}

export interface User {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  active: boolean;
  hourlyRate?: number;
  lastLoginAt?: string;
}

export interface JobCard {
  _id: string;
  number: string;
  status: string;
  priority: string;
  customer: Customer;
  vehicle: Vehicle;
  serviceType?: string;
  complaint?: string;
  diagnosis?: string;
  mileageIn?: number;
  fuelLevel?: string;
  assignedTo: User[];
  items: LineItem[];
  checklist: { label: string; done: boolean; note?: string }[];
  timeLogs: { _id: string; user: string; startedAt: string; endedAt?: string; minutes: number }[];
  subtotal: number;
  discount: number;
  total: number;
  estimatedCompletion?: string;
  startedAt?: string;
  completedAt?: string;
  invoice?: string;
  stockDeducted: boolean;
  notes?: string;
  createdAt: string;
}

export interface Part {
  _id: string;
  sku: string;
  name: string;
  category?: string;
  brand?: string;
  barcode?: string;
  unit: string;
  costPrice: number;
  sellPrice: number;
  quantity: number;
  reorderLevel: number;
  location?: string;
  supplierName?: string;
  supplierPhone?: string;
}

export interface Invoice {
  _id: string;
  type: 'quote' | 'invoice';
  number: string;
  status: string;
  customer: Customer;
  vehicle?: Vehicle;
  jobCard?: string;
  items: LineItem[];
  subtotal: number;
  discount: number;
  taxRate: number;
  tax: number;
  total: number;
  paid: number;
  balance: number;
  payments: { _id: string; amount: number; method: string; paidAt: string; reference?: string; refund: boolean }[];
  issueDate: string;
  dueDate?: string;
  notes?: string;
}

export interface Appointment {
  _id: string;
  customer?: Customer;
  vehicle?: Vehicle;
  guestName?: string;
  guestPhone?: string;
  guestVehicleNo?: string;
  start: string;
  end: string;
  serviceType?: string;
  status: string;
  source: string;
  notes?: string;
}

export interface Expense {
  _id: string;
  category: string;
  amount: number;
  date: string;
  vendor?: string;
  description?: string;
  reference?: string;
  method: string;
}

export interface Reminder {
  _id: string;
  type: string;
  title: string;
  message?: string;
  dueDate: string;
  customer?: Customer;
  vehicle?: Vehicle;
  channel: string;
  status: string;
  sentAt?: string;
  error?: string;
}
