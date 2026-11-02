import { NotFoundException } from '@nestjs/common';
import { FilterQuery, Model, SortOrder, Types } from 'mongoose';
import { ListQueryDto, Paginated } from './list-query.dto';

export type Doc<T> = T & { _id: Types.ObjectId };

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Shared CRUD for documents that belong to a tenant.
 * Every query is scoped by tenantId so vendors can never see each other's data.
 */
export abstract class TenantCrudService<T> {
  protected abstract searchFields: string[];
  protected populate: string[] = [];
  protected dateField = 'createdAt';

  constructor(protected readonly model: Model<T>) {}

  protected buildFilter(tenantId: string, q: ListQueryDto): FilterQuery<T> {
    const filter: Record<string, unknown> = { tenantId: new Types.ObjectId(tenantId) };
    if (q.search && this.searchFields.length) {
      const rx = new RegExp(escapeRegex(q.search), 'i');
      filter.$or = this.searchFields.map((f) => ({ [f]: rx }));
    }
    if (q.status) filter.status = { $in: q.status.split(',') };
    if (q.customer && Types.ObjectId.isValid(q.customer)) filter.customer = new Types.ObjectId(q.customer);
    if (q.vehicle && Types.ObjectId.isValid(q.vehicle)) filter.vehicle = new Types.ObjectId(q.vehicle);
    if (q.from || q.to) {
      const range: Record<string, Date> = {};
      if (q.from) range.$gte = new Date(q.from);
      if (q.to) range.$lte = new Date(q.to);
      filter[this.dateField] = range;
    }
    return filter as FilterQuery<T>;
  }

  async list(tenantId: string, q: ListQueryDto, extra: FilterQuery<T> = {}): Promise<Paginated<Doc<T>>> {
    const filter = { ...this.buildFilter(tenantId, q), ...extra };
    const sort: Record<string, SortOrder> = {};
    const sortKey = q.sort || '-createdAt';
    sort[sortKey.replace(/^-/, '')] = sortKey.startsWith('-') ? -1 : 1;
    const page = q.page || 1;
    const limit = q.limit || 20;
    const [items, total] = await Promise.all([
      this.model
        .find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .populate(this.populate)
        .lean<Doc<T>[]>()
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);
    return { items, total, page, limit };
  }

  async findOne(tenantId: string, id: string): Promise<Doc<T>> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException();
    const doc = await this.model
      .findOne({ _id: id, tenantId } as FilterQuery<T>)
      .populate(this.populate)
      .lean<Doc<T>>()
      .exec();
    if (!doc) throw new NotFoundException();
    return doc;
  }

  async create(tenantId: string, dto: Partial<T>): Promise<Doc<T>> {
    const doc = await this.model.create({ ...dto, tenantId });
    return this.findOne(tenantId, String(doc._id));
  }

  async update(tenantId: string, id: string, dto: Partial<T>): Promise<Doc<T>> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException();
    const res = await this.model
      .updateOne({ _id: id, tenantId } as FilterQuery<T>, { $set: dto })
      .exec();
    if (!res.matchedCount) throw new NotFoundException();
    return this.findOne(tenantId, id);
  }

  async remove(tenantId: string, id: string): Promise<{ deleted: boolean }> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException();
    const res = await this.model.deleteOne({ _id: id, tenantId } as FilterQuery<T>).exec();
    if (!res.deletedCount) throw new NotFoundException();
    return { deleted: true };
  }

  count(tenantId: string, extra: FilterQuery<T> = {}) {
    return this.model.countDocuments({ tenantId, ...extra } as FilterQuery<T>).exec();
  }
}
