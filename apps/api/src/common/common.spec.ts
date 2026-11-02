import { computeTotals } from './line-item.schema';
import { zonedDate } from './time';

describe('computeTotals', () => {
  it('sums lines, applies discount then tax', () => {
    const items: { quantity: number; unitPrice: number; discount?: number; total?: number }[] = [
      { quantity: 2, unitPrice: 1000, discount: 100 },
      { quantity: 1, unitPrice: 500 },
    ];
    const t = computeTotals(items, 400, 10);
    expect(items[0].total).toBe(1900);
    expect(t).toEqual({ subtotal: 2400, discount: 400, tax: 200, total: 2200 });
  });

  it('never goes negative', () => {
    expect(computeTotals([{ quantity: 1, unitPrice: 100, discount: 500 }], 50, 0).total).toBe(0);
  });
});

describe('zonedDate', () => {
  it('converts Colombo wall-clock time to UTC', () => {
    expect(zonedDate('2026-11-03', '08:00', 'Asia/Colombo').toISOString()).toBe('2026-11-03T02:30:00.000Z');
  });

  it('handles UTC', () => {
    expect(zonedDate('2026-01-15', '18:30', 'UTC').toISOString()).toBe('2026-01-15T18:30:00.000Z');
  });
});
