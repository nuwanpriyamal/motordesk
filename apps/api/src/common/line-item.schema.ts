import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';

/** A labour or part line used by job cards, quotes and invoices. */
@Schema({ _id: false })
export class LineItem {
  @Prop({ enum: ['labor', 'part', 'other'], default: 'labor' })
  kind!: string;

  @Prop({ required: true })
  description!: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Part' })
  part?: Types.ObjectId;

  @Prop({ default: 1 })
  quantity!: number;

  @Prop({ default: 0 })
  unitPrice!: number;

  @Prop({ default: 0 })
  discount!: number;

  @Prop({ default: 0 })
  total!: number;
}

export const LineItemSchema = SchemaFactory.createForClass(LineItem);

export interface Totals {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Computes per-line totals in place and returns the document totals. */
export function computeTotals(
  items: Partial<LineItem>[],
  discount = 0,
  taxRate = 0,
): Totals {
  let subtotal = 0;
  for (const it of items) {
    const qty = Number(it.quantity ?? 1);
    const price = Number(it.unitPrice ?? 0);
    const lineDiscount = Number(it.discount ?? 0);
    it.total = round(Math.max(qty * price - lineDiscount, 0));
    subtotal += it.total;
  }
  subtotal = round(subtotal);
  const afterDiscount = Math.max(subtotal - discount, 0);
  const tax = round((afterDiscount * taxRate) / 100);
  return { subtotal, discount: round(discount), tax, total: round(afterDiscount + tax) };
}
