import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ApiTags } from '@nestjs/swagger';
import { Model, Types } from 'mongoose';
import { CacheService } from '../cache/cache.service';
import { AppointmentStatus, Feature, InvoiceStatus, InvoiceType, JobStatus } from '../common/constants';
import { RequireFeature, TenantId } from '../common/decorators';
import { Customer, CustomersModule } from '../customers/customers';
import { ExpensesModule, ExpensesService } from '../expenses/expenses';
import { InventoryModule, InventoryService } from '../inventory/inventory';
import { Invoice, InvoicesModule, InvoicesService } from '../invoices/invoices';
import { JobCard, JobCardsModule, JobCardsService } from '../job-cards/job-cards';
import { Vehicle, VehiclesModule } from '../vehicles/vehicles';
import { AppointmentsModule, AppointmentsService } from '../appointments/appointments';

const startOfDay = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(JobCard.name) private readonly jobs: Model<JobCard>,
    @InjectModel(Invoice.name) private readonly invoiceModel: Model<Invoice>,
    @InjectModel(Vehicle.name) private readonly vehicles: Model<Vehicle>,
    @InjectModel(Customer.name) private readonly customers: Model<Customer>,
    private readonly invoices: InvoicesService,
    private readonly expenses: ExpensesService,
    private readonly inventory: InventoryService,
    private readonly jobCards: JobCardsService,
    private readonly appointments: AppointmentsService,
    private readonly cache: CacheService,
  ) {}

  overview(tenantId: string) {
    return this.cache.wrap(`dash:${tenantId}`, 60, () => this.compute(tenantId));
  }

  private async compute(tenantId: string) {
    const tid = new Types.ObjectId(tenantId);
    const now = new Date();
    const today = startOfDay(now);
    const tomorrow = new Date(today.getTime() + 86400000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const [
      vehicles,
      customers,
      jobsByStatus,
      completedToday,
      createdToday,
      revenue,
      expenseRows,
      lowStock,
      stockValue,
      apptsToday,
      monthly,
      topServices,
      technicians,
    ] = await Promise.all([
      this.vehicles.countDocuments({ tenantId: tid }).exec(),
      this.customers.countDocuments({ tenantId: tid }).exec(),
      this.jobs.aggregate([{ $match: { tenantId: tid } }, { $group: { _id: '$status', count: { $sum: 1 } } }]).exec(),
      this.jobs.countDocuments({ tenantId: tid, completedAt: { $gte: today, $lt: tomorrow } }).exec(),
      this.jobs.countDocuments({ tenantId: tid, createdAt: { $gte: today, $lt: tomorrow } }).exec(),
      this.invoices.summary(tenantId, monthStart, now),
      this.expenses.byCategory(tenantId, monthStart, now),
      this.inventory.lowStock(tenantId),
      this.inventory.valuation(tenantId),
      this.appointments.list(
        tenantId,
        { from: today.toISOString(), to: tomorrow.toISOString(), page: 1, limit: 50, sort: 'start' },
        { status: { $nin: [AppointmentStatus.CANCELLED] } },
      ),
      this.invoiceModel
        .aggregate([
          {
            $match: {
              tenantId: tid,
              type: InvoiceType.INVOICE,
              status: { $ne: InvoiceStatus.CANCELLED },
              issueDate: { $gte: sixMonthsAgo },
            },
          },
          {
            $group: {
              _id: { y: { $year: '$issueDate' }, m: { $month: '$issueDate' } },
              revenue: { $sum: '$total' },
              collected: { $sum: '$paid' },
              invoices: { $sum: 1 },
            },
          },
          { $sort: { '_id.y': 1, '_id.m': 1 } },
        ])
        .exec(),
      this.jobs
        .aggregate([
          { $match: { tenantId: tid, createdAt: { $gte: sixMonthsAgo }, serviceType: { $nin: [null, ''] } } },
          { $group: { _id: '$serviceType', count: { $sum: 1 }, revenue: { $sum: '$total' } } },
          { $sort: { count: -1 } },
          { $limit: 6 },
        ])
        .exec(),
      this.jobCards.technicianStats(tenantId, monthStart),
    ]);

    const expensesTotal = expenseRows.reduce((s: number, r: { total: number }) => s + r.total, 0);
    const status = Object.fromEntries(jobsByStatus.map((j: { _id: string; count: number }) => [j._id, j.count]));
    const months = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(sixMonthsAgo.getFullYear(), sixMonthsAgo.getMonth() + i, 1);
      const row = monthly.find((m: { _id: { y: number; m: number } }) => m._id.y === d.getFullYear() && m._id.m === d.getMonth() + 1);
      months.push({
        month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        revenue: row?.revenue ?? 0,
        collected: row?.collected ?? 0,
        invoices: row?.invoices ?? 0,
      });
    }

    return {
      generatedAt: now,
      counts: {
        vehicles,
        customers,
        activeJobs: (status[JobStatus.PENDING] ?? 0) + (status[JobStatus.IN_PROGRESS] ?? 0) + (status[JobStatus.WAITING_PARTS] ?? 0),
        jobsCreatedToday: createdToday,
        jobsCompletedToday: completedToday,
        appointmentsToday: apptsToday.total,
        lowStock: lowStock.length,
      },
      jobsByStatus: status,
      finance: {
        invoicedThisMonth: revenue.invoiced,
        collectedThisMonth: revenue.collected,
        outstanding: revenue.outstanding,
        expensesThisMonth: expensesTotal,
        profitThisMonth: Math.round((revenue.collected - expensesTotal) * 100) / 100,
        expensesByCategory: expenseRows,
      },
      inventory: { ...stockValue, lowStock: lowStock.slice(0, 8) },
      appointmentsToday: apptsToday.items,
      revenueByMonth: months,
      topServices: topServices.map((s: { _id: string; count: number; revenue: number }) => ({
        service: s._id,
        count: s.count,
        revenue: s.revenue,
      })),
      technicians,
    };
  }
}

@ApiTags('dashboard')
@RequireFeature(Feature.ANALYTICS)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  overview(@TenantId() tenantId: string) {
    return this.dashboard.overview(tenantId);
  }
}

@Module({
  imports: [CustomersModule, VehiclesModule, InvoicesModule, ExpensesModule, InventoryModule, JobCardsModule, AppointmentsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
