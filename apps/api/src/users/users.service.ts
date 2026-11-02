import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { Model, Types } from 'mongoose';
import { Role } from '../common/constants';
import { TenantsService } from '../tenants/tenants.service';
import { CreateUserDto, UpdateUserDto } from './user.dto';
import { User } from './user.schema';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly model: Model<User>,
    private readonly tenants: TenantsService,
  ) {}

  findByEmailWithPassword(email: string) {
    return this.model.findOne({ email: email.toLowerCase() }).select('+passwordHash').exec();
  }

  findById(id: string) {
    return this.model.findById(id).lean().exec();
  }

  async createRaw(data: {
    tenantId: string | null;
    name: string;
    email: string;
    password: string;
    role: Role;
    phone?: string;
    hourlyRate?: number;
  }) {
    if (await this.model.exists({ email: data.email.toLowerCase() })) {
      throw new ConflictException('Email already registered');
    }
    const { password, ...rest } = data;
    const user = await this.model.create({
      ...rest,
      tenantId: data.tenantId ? new Types.ObjectId(data.tenantId) : null,
      passwordHash: await bcrypt.hash(password, 10),
    });
    const { passwordHash: _omit, ...safe } = user.toObject();
    return safe;
  }

  list(tenantId: string) {
    return this.model.find({ tenantId }).sort({ name: 1 }).lean().exec();
  }

  async create(tenantId: string, dto: CreateUserDto) {
    const ent = await this.tenants.getEntitlements(tenantId);
    const count = await this.model.countDocuments({ tenantId, active: true }).exec();
    if (count >= ent.limits.maxUsers) {
      throw new ForbiddenException(`Your ${ent.planName} plan allows ${ent.limits.maxUsers} users. Upgrade to add more.`);
    }
    return this.createRaw({ ...dto, tenantId });
  }

  async update(tenantId: string, id: string, dto: UpdateUserDto) {
    const { password, ...rest } = dto;
    const set: Record<string, unknown> = { ...rest };
    if (password) set.passwordHash = await bcrypt.hash(password, 10);
    const user = await this.model
      .findOneAndUpdate({ _id: id, tenantId }, { $set: set }, { new: true })
      .lean()
      .exec();
    if (!user) throw new NotFoundException();
    return user;
  }

  async changePassword(userId: string, current: string, next: string) {
    const user = await this.model.findById(userId).select('+passwordHash').exec();
    if (!user || !(await bcrypt.compare(current, user.passwordHash))) {
      throw new ForbiddenException('Current password is incorrect');
    }
    user.passwordHash = await bcrypt.hash(next, 10);
    await user.save();
    return { changed: true };
  }

  touchLogin(id: string) {
    return this.model.updateOne({ _id: id }, { lastLoginAt: new Date() }).exec();
  }
}
