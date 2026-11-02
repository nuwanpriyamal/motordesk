import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { Role } from '../common/constants';

@Schema({ timestamps: true })
export class User {
  /** Null for platform super admins. */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Tenant', default: null, index: true })
  tenantId!: Types.ObjectId | null;

  @Prop({ required: true }) name!: string;
  @Prop({ required: true, unique: true, lowercase: true, trim: true }) email!: string;
  @Prop() phone?: string;
  @Prop({ required: true, select: false }) passwordHash!: string;
  @Prop({ enum: Role, default: Role.TECHNICIAN }) role!: Role;
  @Prop({ default: true }) active!: boolean;
  @Prop() hourlyRate?: number;
  @Prop() lastLoginAt?: Date;
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);
