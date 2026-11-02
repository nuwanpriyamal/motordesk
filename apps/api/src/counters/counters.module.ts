import { Global, Injectable, Module } from '@nestjs/common';
import { InjectModel, MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Model, SchemaTypes, Types } from 'mongoose';

@Schema({ collection: 'counters' })
export class Counter {
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  tenantId!: Types.ObjectId;

  @Prop({ required: true })
  key!: string;

  @Prop({ default: 0 })
  seq!: number;
}

const CounterSchema = SchemaFactory.createForClass(Counter);
CounterSchema.index({ tenantId: 1, key: 1 }, { unique: true });

/** Per-tenant sequential document numbers such as JC-00012 or INV-00007. */
@Injectable()
export class CountersService {
  constructor(@InjectModel(Counter.name) private readonly model: Model<Counter>) {}

  async next(tenantId: string, key: string, prefix: string): Promise<string> {
    const doc = await this.model
      .findOneAndUpdate(
        { tenantId: new Types.ObjectId(tenantId), key },
        { $inc: { seq: 1 } },
        { upsert: true, new: true },
      )
      .lean()
      .exec();
    return `${prefix}-${String(doc!.seq).padStart(5, '0')}`;
  }
}

@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: Counter.name, schema: CounterSchema }])],
  providers: [CountersService],
  exports: [CountersService],
})
export class CountersModule {}
