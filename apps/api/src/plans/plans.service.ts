import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CacheService } from '../cache/cache.service';
import { CreatePlanDto, UpdatePlanDto } from './plan.dto';
import { Plan } from './plan.schema';

@Injectable()
export class PlansService {
  constructor(
    @InjectModel(Plan.name) private readonly model: Model<Plan>,
    private readonly cache: CacheService,
  ) {}

  listPublic() {
    return this.model.find({ active: true, isPublic: true }).sort({ sortOrder: 1 }).lean().exec();
  }

  listAll() {
    return this.model.find().sort({ sortOrder: 1 }).lean().exec();
  }

  async findById(id: string) {
    const plan = await this.model.findById(id).lean().exec();
    if (!plan) throw new NotFoundException('Plan not found');
    return plan;
  }

  findByCode(code: string) {
    return this.model.findOne({ code }).lean().exec();
  }

  create(dto: CreatePlanDto) {
    return this.model.create(dto);
  }

  async update(id: string, dto: UpdatePlanDto) {
    const plan = await this.model.findByIdAndUpdate(id, { $set: dto }, { new: true }).lean().exec();
    if (!plan) throw new NotFoundException('Plan not found');
    await this.cache.del(`plan:${id}`);
    return plan;
  }

  async remove(id: string) {
    await this.model.findByIdAndUpdate(id, { active: false }).exec();
    return { archived: true };
  }
}
