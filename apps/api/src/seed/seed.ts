import { INestApplicationContext, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../app.module';
import { AppointmentsService } from '../appointments/appointments';
import { ALL_FEATURES, Feature, InvoiceType, JobStatus, Role } from '../common/constants';
import { CustomersService } from '../customers/customers';
import { ExpensesService } from '../expenses/expenses';
import { InventoryService } from '../inventory/inventory';
import { InvoicesService } from '../invoices/invoices';
import { JobCardsService } from '../job-cards/job-cards';
import { Plan } from '../plans/plan.schema';
import { Tenant } from '../tenants/tenant.schema';
import { TenantsService } from '../tenants/tenants.service';
import { User } from '../users/user.schema';
import { UsersService } from '../users/users.service';
import { VehiclesService } from '../vehicles/vehicles';

const log = new Logger('Seed');

export const DEFAULT_PLANS: Partial<Plan>[] = [
  {
    code: 'starter',
    name: 'Starter',
    description: 'For small garages getting organised',
    monthlyPrice: 2900,
    yearlyPrice: 29000,
    trialDays: 14,
    sortOrder: 1,
    features: [Feature.CUSTOMERS, Feature.VEHICLES, Feature.JOB_CARDS, Feature.INVOICING, Feature.SCHEDULING, Feature.REMINDERS],
    limits: { maxUsers: 3, maxVehicles: 300, maxJobCardsPerMonth: 300, smsPerMonth: 100 },
  },
  {
    code: 'professional',
    name: 'Professional',
    description: 'Inventory, analytics, online booking and SMS',
    monthlyPrice: 6900,
    yearlyPrice: 69000,
    trialDays: 14,
    sortOrder: 2,
    features: [
      Feature.CUSTOMERS,
      Feature.VEHICLES,
      Feature.JOB_CARDS,
      Feature.INVOICING,
      Feature.SCHEDULING,
      Feature.REMINDERS,
      Feature.INVENTORY,
      Feature.EXPENSES,
      Feature.ANALYTICS,
      Feature.ONLINE_BOOKING,
      Feature.SMS,
      Feature.REALTIME,
    ],
    limits: { maxUsers: 10, maxVehicles: 3000, maxJobCardsPerMonth: 3000, smsPerMonth: 1000 },
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    description: 'Everything, with high limits for busy service centers',
    monthlyPrice: 14900,
    yearlyPrice: 149000,
    trialDays: 30,
    sortOrder: 3,
    features: ALL_FEATURES,
    limits: { maxUsers: 50, maxVehicles: 100000, maxJobCardsPerMonth: 100000, smsPerMonth: 5000 },
  },
];

export async function seed(app: INestApplicationContext, opts: { demo: boolean }) {
  const planModel = app.get<Model<Plan>>(getModelToken(Plan.name));
  for (const p of DEFAULT_PLANS) {
    await planModel.updateOne({ code: p.code }, { $setOnInsert: p }, { upsert: true }).exec();
  }
  log.log(`Plans ready: ${DEFAULT_PLANS.map((p) => p.code).join(', ')}`);

  const users = app.get(UsersService);
  const userModel = app.get<Model<User>>(getModelToken(User.name));
  const adminEmail = process.env.SUPER_ADMIN_EMAIL || 'admin@motordesk.local';
  const isDev = (process.env.APP_ENV ?? 'development') === 'development';
  const adminPassword = process.env.SUPER_ADMIN_PASSWORD || (isDev ? 'ChangeMe123!' : '');
  if (!adminPassword) {
    log.warn('SUPER_ADMIN_PASSWORD not set, skipping super admin creation');
  } else if (!(await userModel.exists({ email: adminEmail.toLowerCase() }))) {
    await users.createRaw({ tenantId: null, name: 'Platform Admin', email: adminEmail, password: adminPassword, role: Role.SUPER_ADMIN });
    log.log(`Super admin created: ${adminEmail}`);
  }

  if (!opts.demo) return;
  const tenantModel = app.get<Model<Tenant>>(getModelToken(Tenant.name));
  if (await tenantModel.exists({ slug: 'demo-auto-care' })) {
    log.log('Demo tenant already exists');
    return;
  }

  const tenants = app.get(TenantsService);
  const tenant = await tenants.create({ name: 'Demo Auto Care', email: 'demo@motordesk.local', phone: '0771234567', city: 'Colombo', planCode: 'enterprise' });
  const tid = String(tenant._id);
  await tenantModel.updateOne({ _id: tid }, { slug: 'demo-auto-care', address: '123 Galle Road, Colombo 03', 'settings.taxRate': 0 }).exec();
  const owner = await users.createRaw({ tenantId: tid, name: 'Demo Owner', email: 'owner@demo.local', password: 'Demo1234!', role: Role.OWNER });
  const tech = await users.createRaw({ tenantId: tid, name: 'Kasun Perera', email: 'tech@demo.local', password: 'Demo1234!', role: Role.TECHNICIAN });

  const customers = app.get(CustomersService);
  const vehicles = app.get(VehiclesService);
  const inventory = app.get(InventoryService);
  const jobs = app.get(JobCardsService);
  const invoices = app.get(InvoicesService);
  const appts = app.get(AppointmentsService);
  const expenses = app.get(ExpensesService);

  const people = [
    ['Nimal Silva', '0712345678', 'CAB-1234', 'Toyota', 'Axio', 'car'],
    ['Amaya Fernando', '0779876543', 'KX-4521', 'Honda', 'Vezel', 'suv'],
    ['Ruwan Jayasinghe', '0765554433', 'BEE-7788', 'Bajaj', 'RE', 'three_wheeler'],
    ['Dilani Wickramasinghe', '0701112233', 'CAR-9090', 'Suzuki', 'Wagon R', 'car'],
  ] as const;
  const created: { c: string; v: string }[] = [];
  for (const [name, phone, reg, make, model, type] of people) {
    const c = await customers.create(tid, { name, phone });
    const v = await vehicles.create(tid, {
      customer: c._id as never,
      registrationNo: reg,
      make,
      model,
      type,
      mileage: 40000 + Math.floor(Math.random() * 60000),
      nextServiceDue: new Date(Date.now() + Math.floor(Math.random() * 10) * 86400000),
    });
    created.push({ c: String(c._id), v: String(v._id) });
  }

  const parts = [
    ['OIL-5W30', 'Engine Oil 5W-30 (4L)', 'Lubricants', 7200, 9500, 24],
    ['FLT-OIL-TY', 'Oil Filter - Toyota', 'Filters', 950, 1500, 30],
    ['FLT-AIR-HN', 'Air Filter - Honda', 'Filters', 1800, 2800, 4],
    ['BRK-PAD-F', 'Front Brake Pads', 'Brakes', 5200, 7800, 10],
    ['SPK-NGK', 'Spark Plug NGK', 'Ignition', 850, 1300, 3],
  ] as const;
  const partIds: string[] = [];
  for (const [sku, name, category, costPrice, sellPrice, quantity] of parts) {
    const p = await inventory.create(tid, { sku, name, category, costPrice, sellPrice, quantity, reorderLevel: 5 });
    partIds.push(String(p._id));
  }

  const services = ['Full Service', 'Oil Change', 'Brake Service', 'Engine Tune-up'];
  for (let i = 0; i < created.length; i++) {
    const job = await jobs.create(tid, {
      customer: created[i].c as never,
      vehicle: created[i].v as never,
      serviceType: services[i],
      complaint: 'Regular maintenance',
      assignedTo: [tech._id] as never,
      items: [
        { kind: 'labor', description: services[i], quantity: 1, unitPrice: 3500, discount: 0, total: 0 },
        { kind: 'part', description: parts[i][1], part: partIds[i] as never, quantity: 1, unitPrice: parts[i][4], discount: 0, total: 0 },
      ],
    });
    const id = String(job._id);
    if (i < 2) {
      await jobs.changeStatus(tid, id, JobStatus.COMPLETED);
      const inv = await jobs.createInvoice(tid, id, InvoiceType.INVOICE);
      const full = await invoices.findOne(tid, String(inv._id));
      await invoices.addPayment(tid, String(inv._id), { amount: full.total, method: 'cash' });
    } else if (i === 2) {
      await jobs.changeStatus(tid, id, JobStatus.IN_PROGRESS);
    }
  }

  const tomorrow = new Date(Date.now() + 86400000);
  tomorrow.setUTCHours(4, 30, 0, 0); // 10:00 in Colombo
  await appts.create(tid, { customer: created[3].c as never, vehicle: created[3].v as never, start: tomorrow, serviceType: 'Full Service' });
  await expenses.create(tid, { category: 'rent', amount: 85000, vendor: 'Landlord', description: 'Monthly rent' });
  await expenses.create(tid, { category: 'utilities', amount: 12500, vendor: 'CEB', description: 'Electricity' });

  log.log(`Demo tenant ready: owner@demo.local / Demo1234! (owner id ${owner._id})`);
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  try {
    await seed(app, { demo: process.argv.includes('--demo') });
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  main().catch((e) => {
    log.error(e);
    process.exit(1);
  });
}
