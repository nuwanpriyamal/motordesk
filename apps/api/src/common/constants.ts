export enum Role {
  SUPER_ADMIN = 'super_admin',
  OWNER = 'owner',
  MANAGER = 'manager',
  TECHNICIAN = 'technician',
  CASHIER = 'cashier',
}

/**
 * Feature keys that a subscription plan can switch on or off.
 * Each tenant-facing module is guarded by one of these.
 */
export enum Feature {
  CUSTOMERS = 'customers',
  VEHICLES = 'vehicles',
  JOB_CARDS = 'jobCards',
  INVENTORY = 'inventory',
  INVOICING = 'invoicing',
  SCHEDULING = 'scheduling',
  ONLINE_BOOKING = 'onlineBooking',
  EXPENSES = 'expenses',
  REMINDERS = 'reminders',
  ANALYTICS = 'analytics',
  SMS = 'sms',
  EMAIL = 'email',
  REALTIME = 'realtime',
}

export const ALL_FEATURES = Object.values(Feature);

export enum TenantStatus {
  TRIAL = 'trial',
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  SUSPENDED = 'suspended',
}

export enum JobStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  WAITING_PARTS = 'waiting_parts',
  COMPLETED = 'completed',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
}

export enum InvoiceType {
  QUOTE = 'quote',
  INVOICE = 'invoice',
}

export enum InvoiceStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  PARTIAL = 'partial',
  PAID = 'paid',
  ACCEPTED = 'accepted',
  CONVERTED = 'converted',
  CANCELLED = 'cancelled',
}

export enum AppointmentStatus {
  BOOKED = 'booked',
  CONFIRMED = 'confirmed',
  ARRIVED = 'arrived',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  NO_SHOW = 'no_show',
}
