import { Routes } from '@angular/router';
import { adminGuard, featureGuard, guestGuard, tenantGuard } from './core/guards';
import { ShellComponent } from './layout/shell.component';

const page = (feature?: string) => ({ canActivate: [featureGuard], data: { feature } });

export const routes: Routes = [
  // Public site
  { path: '', pathMatch: 'full', loadComponent: () => import('./pages/public/landing.page').then((m) => m.LandingPage) },
  { path: 'login', canActivate: [guestGuard], loadComponent: () => import('./pages/public/login.page').then((m) => m.LoginPage) },
  { path: 'register', canActivate: [guestGuard], loadComponent: () => import('./pages/public/register.page').then((m) => m.RegisterPage) },
  { path: 'book/:slug', loadComponent: () => import('./pages/public/book.page').then((m) => m.BookPage) },
  { path: 'track/:slug', loadComponent: () => import('./pages/public/track.page').then((m) => m.TrackPage) },

  // Service center app
  {
    path: 'app',
    component: ShellComponent,
    canActivate: [tenantGuard],
    children: [
      { path: '', ...page('analytics'), data: { feature: 'analytics', fallback: '/app/jobs' }, loadComponent: () => import('./pages/dashboard.page').then((m) => m.DashboardPage) },
      { path: 'jobs', ...page('jobCards'), loadComponent: () => import('./pages/jobs.page').then((m) => m.JobsPage) },
      { path: 'jobs/:id', ...page('jobCards'), loadComponent: () => import('./pages/job-detail.page').then((m) => m.JobDetailPage) },
      { path: 'appointments', ...page('scheduling'), loadComponent: () => import('./pages/appointments.page').then((m) => m.AppointmentsPage) },
      { path: 'customers', ...page('customers'), loadComponent: () => import('./pages/customers.page').then((m) => m.CustomersPage) },
      { path: 'customers/:id', ...page('customers'), loadComponent: () => import('./pages/customer-detail.page').then((m) => m.CustomerDetailPage) },
      { path: 'vehicles', ...page('vehicles'), loadComponent: () => import('./pages/vehicles.page').then((m) => m.VehiclesPage) },
      { path: 'invoices', ...page('invoicing'), loadComponent: () => import('./pages/invoices.page').then((m) => m.InvoicesPage) },
      { path: 'invoices/:id', ...page('invoicing'), loadComponent: () => import('./pages/invoice-detail.page').then((m) => m.InvoiceDetailPage) },
      { path: 'inventory', ...page('inventory'), loadComponent: () => import('./pages/inventory.page').then((m) => m.InventoryPage) },
      { path: 'expenses', ...page('expenses'), loadComponent: () => import('./pages/expenses.page').then((m) => m.ExpensesPage) },
      { path: 'reminders', ...page('reminders'), loadComponent: () => import('./pages/reminders.page').then((m) => m.RemindersPage) },
      { path: 'staff', loadComponent: () => import('./pages/staff.page').then((m) => m.StaffPage) },
      { path: 'settings', loadComponent: () => import('./pages/settings.page').then((m) => m.SettingsPage) },
      { path: 'upgrade', loadComponent: () => import('./pages/upgrade.page').then((m) => m.UpgradePage) },
    ],
  },

  // Platform administration
  {
    path: 'admin',
    component: ShellComponent,
    canActivate: [adminGuard],
    children: [
      { path: '', loadComponent: () => import('./pages/admin/overview.page').then((m) => m.AdminOverviewPage) },
      { path: 'tenants', loadComponent: () => import('./pages/admin/tenants.page').then((m) => m.AdminTenantsPage) },
      { path: 'tenants/:id', loadComponent: () => import('./pages/admin/tenant-detail.page').then((m) => m.AdminTenantDetailPage) },
      { path: 'plans', loadComponent: () => import('./pages/admin/plans.page').then((m) => m.AdminPlansPage) },
    ],
  },

  { path: '**', redirectTo: '' },
];
