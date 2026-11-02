import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CacheService } from '../cache/cache.service';
import { TenantStatus } from '../common/constants';
import { ListQueryDto } from '../common/list-query.dto';
import { Plan } from '../plans/plan.schema';
import { PlansService } from '../plans/plans.service';
import { AdminUpdateTenantDto, RecordSubscriptionPaymentDto, UpdateMyTenantDto } from './tenant.dto';
import { Tenant } from './tenant.schema';

export interface Entitlements {
  tenantId: string;
  status: TenantStatus;
  active: boolean;
  features: string[];
  limits: Plan['limits'];
  planName: string;
  trialEndsAt?: Date;
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'garage';

const addPeriod = (from: Date, cycle: string, periods: number) => {
  const d = new Date(from);
  if (cycle === 'yearly') d.setFullYear(d.getFullYear() + periods);
  else d.setMonth(d.getMonth() + periods);
  return d;
};

@Injectable()
export class TenantsService {
  constructor(
    @InjectModel(Tenant.name) private readonly model: Model<Tenant>,
    private readonly plans: PlansService,
    private readonly cache: CacheService,
  ) {}

  async create(data: { name: string; email?: string; phone?: string; city?: string; planCode?: string }) {
    const plan =
      (data.planCode && (await this.plans.findByCode(data.planCode))) ||
      (await this.plans.findByCode('starter')) ||
      (await this.plans.listPublic())[0];
    if (!plan) throw new BadRequestException('No subscription plans configured');
    let slug = slugify(data.name);
    while (await this.model.exists({ slug })) slug = `${slugify(data.name)}-${Math.random().toString(36).slice(2, 6)}`;
    const trialEndsAt = new Date(Date.now() + (plan.trialDays ?? 14) * 86400000);
    return this.model.create({
      name: data.name,
      email: data.email,
      phone: data.phone,
      city: data.city,
      slug,
      plan: plan._id,
      status: TenantStatus.TRIAL,
      trialEndsAt,
    });
  }

  async findById(id: string) {
    const t = await this.model.findById(id).populate('plan').lean().exec();
    if (!t) throw new NotFoundException('Tenant not found');
    return t;
  }

  async findBySlug(slug: string) {
    const t = await this.model.findOne({ slug: slug.toLowerCase() }).lean().exec();
    if (!t) throw new NotFoundException('Service center not found');
    return t;
  }

  /** Price this vendor actually pays per billing cycle. */
  effectivePrice(tenant: Pick<Tenant, 'customPrice' | 'discountPercent' | 'billingCycle'>, plan: Plan) {
    const base =
      tenant.customPrice ?? (tenant.billingCycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice);
    return Math.round(base * (1 - (tenant.discountPercent || 0) / 100) * 100) / 100;
  }

  async getEntitlements(tenantId: string): Promise<Entitlements> {
    const tenant = await this.cache.wrap(`tenant:${tenantId}`, 60, () =>
      this.model.findById(tenantId).lean().exec(),
    );
    if (!tenant) throw new NotFoundException('Tenant not found');
    const planId = String(tenant.plan);
    const plan = await this.cache.wrap(`plan:${planId}`, 300, () => this.plans.findById(planId));
    const features = new Set([...plan.features, ...(tenant.extraFeatures || [])]);
    (tenant.disabledFeatures || []).forEach((f) => features.delete(f));
    const trialExpired =
      tenant.status === TenantStatus.TRIAL && !!tenant.trialEndsAt && new Date(tenant.trialEndsAt) < new Date();
    const active = tenant.status !== TenantStatus.SUSPENDED && !trialExpired;
    return {
      tenantId,
      status: trialExpired ? TenantStatus.PAST_DUE : tenant.status,
      active,
      features: [...features],
      limits: plan.limits,
      planName: plan.name,
      trialEndsAt: tenant.trialEndsAt,
    };
  }

  async updateMine(tenantId: string, dto: UpdateMyTenantDto) {
    const set: Record<string, unknown> = { ...dto };
    if (dto.settings) {
      delete set.settings;
      for (const [k, v] of Object.entries(dto.settings)) set[`settings.${k}`] = v;
    }
    await this.model.updateOne({ _id: tenantId }, { $set: set }).exec();
    await this.cache.del(`tenant:${tenantId}`);
    return this.findById(tenantId);
  }

  // ---- super admin ----

  async adminList(q: ListQueryDto) {
    const filter: Record<string, unknown> = {};
    if (q.search) {
      const rx = new RegExp(q.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: rx }, { slug: rx }, { email: rx }];
    }
    if (q.status) filter.status = { $in: q.status.split(',') };
    const page = q.page || 1;
    const limit = q.limit || 20;
    const [items, total] = await Promise.all([
      this.model
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('plan')
        .lean()
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);
    return {
      items: items.map((t) => ({
        ...t,
        payments: undefined,
        effectivePrice: this.effectivePrice(t, t.plan as unknown as Plan),
      })),
      total,
      page,
      limit,
    };
  }

  async adminGet(id: string) {
    const t = await this.findById(id);
    return { ...t, effectivePrice: this.effectivePrice(t, t.plan as unknown as Plan) };
  }

  async adminUpdate(id: string, dto: AdminUpdateTenantDto) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException();
    const { customPrice, ...rest } = dto;
    const update: Record<string, unknown> = { $set: rest };
    if (customPrice === null) update.$unset = { customPrice: 1 };
    else if (customPrice !== undefined) (update.$set as Record<string, unknown>).customPrice = customPrice;
    const res = await this.model.updateOne({ _id: id }, update).exec();
    if (!res.matchedCount) throw new NotFoundException();
    await this.cache.del(`tenant:${id}`);
    return this.adminGet(id);
  }

  async recordPayment(id: string, dto: RecordSubscriptionPaymentDto) {
    const t = await this.model.findById(id).exec();
    if (!t) throw new NotFoundException();
    const start = t.currentPeriodEnd && t.currentPeriodEnd > new Date() ? t.currentPeriodEnd : new Date();
    const periodEnd = addPeriod(start, t.billingCycle, dto.periods ?? 1);
    t.payments.push({ amount: dto.amount, method: dto.method, reference: dto.reference, paidAt: new Date(), periodEnd });
    t.currentPeriodEnd = periodEnd;
    t.status = TenantStatus.ACTIVE;
    await t.save();
    await this.cache.del(`tenant:${id}`);
    return this.adminGet(id);
  }

  async platformStats() {
    const [byStatus, tenants] = await Promise.all([
      this.model.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]).exec(),
      this.model.find({ status: TenantStatus.ACTIVE }).populate('plan').lean().exec(),
    ]);
    const mrr = tenants.reduce((sum, t) => {
      const price = this.effectivePrice(t, t.plan as unknown as Plan);
      return sum + (t.billingCycle === 'yearly' ? price / 12 : price);
    }, 0);
    const since = new Date(Date.now() - 30 * 86400000);
    const [collected] = await this.model
      .aggregate([
        { $unwind: '$payments' },
        { $match: { 'payments.paidAt': { $gte: since } } },
        { $group: { _id: null, total: { $sum: '$payments.amount' } } },
      ])
      .exec();
    return {
      tenantsByStatus: Object.fromEntries(byStatus.map((s) => [s._id, s.count])),
      totalTenants: byStatus.reduce((s, x) => s + x.count, 0),
      mrr: Math.round(mrr),
      collectedLast30Days: collected?.total ?? 0,
    };
  }

}
