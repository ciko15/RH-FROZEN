import { describe, it } from 'node:test';
import assert from 'node:assert';
import { sanitizeOutputForRole } from './api/_lib/rbac.js';

describe('Uji Sensor RBAC Harga Beli & Laba', () => {
  const dummyItem = {
    id: 'prod-1',
    name: 'Daging Slice',
    price: 50000,
    cost_price: 35000,
    hpp: 35000,
    profit: 15000
  };

  it('Admin dapat melihat harga beli dan laba', () => {
    const res = sanitizeOutputForRole('admin', dummyItem);
    assert.strictEqual(res.cost_price, 35000);
    assert.strictEqual(res.profit, 15000);
  });

  it('Manajer dapat melihat harga beli dan laba', () => {
    const res = sanitizeOutputForRole('manajer', dummyItem);
    assert.strictEqual(res.cost_price, 35000);
    assert.strictEqual(res.profit, 15000);
  });

  it('Sales TIDAK BOLEH melihat harga beli dan laba (disensor server)', () => {
    const res = sanitizeOutputForRole('sales', dummyItem);
    assert.strictEqual(res.cost_price, undefined);
    assert.strictEqual(res.hpp, undefined);
    assert.strictEqual(res.profit, undefined);
    assert.strictEqual(res.price, 50000);
  });

  it('Kasir TIDAK BOLEH melihat harga beli dan laba (disensor server)', () => {
    const res = sanitizeOutputForRole('kasir', dummyItem);
    assert.strictEqual(res.cost_price, undefined);
    assert.strictEqual(res.hpp, undefined);
    assert.strictEqual(res.profit, undefined);
    assert.strictEqual(res.price, 50000);
  });
});

describe('Uji Formula Perhitungan Invoice & Piutang Bertingkat Sesuai Contoh Gambar', () => {
  it('Kalkulasi subtotal belanja, bon sebelumnya, total tagihan, pembayaran, sisa hutang', () => {
    // Skenario sesuai contoh gambar:
    // 10 x Rp5.000 (50.000) + 5 x Rp8.000 (40.000) + 2 x Rp15.000 (30.000)
    // Total Belanja = 120.000
    // Bon Sebelumnya = 100.000
    // Total Tagihan = 220.000
    // Pembayaran = 150.000
    // Sisa Hutang = 70.000

    const items = [
      { qty: 10, price: 5000, discount: 0 },
      { qty: 5, price: 8000, discount: 0 },
      { qty: 2, price: 15000, discount: 0 }
    ];

    const subtotal = items.reduce((sum, it) => sum + (it.qty * it.price - it.discount), 0);
    assert.strictEqual(subtotal, 120000);

    const previous_balance = 100000;
    const total_due = subtotal + previous_balance;
    assert.strictEqual(total_due, 220000);

    const paid_amount = 150000;
    const remaining = total_due - paid_amount;
    assert.strictEqual(remaining, 70000);
  });
});
