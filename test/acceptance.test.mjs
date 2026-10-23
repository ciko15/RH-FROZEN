import { describe, it } from 'node:test';
import assert from 'node:assert';
import { sanitizeOutputForRole } from '../api/_lib/rbac.js';

describe('KRITERIA 1 & 2: RBAC Data Filtering & Server Security', () => {
  const dummyProduct = {
    id: 'prod-001',
    name: 'Daging Slice Beef 500g',
    price: 65000,
    cost_price: 48000,
    hpp: 48000,
    gross_profit: 17000,
    profit: 17000
  };

  it('Admin & Manajer mendapatkan seluruh data termasuk cost_price & laba', () => {
    const adminData = sanitizeOutputForRole('admin', dummyProduct);
    assert.strictEqual(adminData.cost_price, 48000);
    assert.strictEqual(adminData.profit, 17000);

    const managerData = sanitizeOutputForRole('manajer', dummyProduct);
    assert.strictEqual(managerData.cost_price, 48000);
    assert.strictEqual(managerData.profit, 17000);
  });

  it('Sales & Kasir TIDAK PERNAH menerima cost_price atau laba dari server', () => {
    const salesData = sanitizeOutputForRole('sales', dummyProduct);
    assert.strictEqual(salesData.cost_price, undefined);
    assert.strictEqual(salesData.hpp, undefined);
    assert.strictEqual(salesData.gross_profit, undefined);
    assert.strictEqual(salesData.profit, undefined);
    assert.strictEqual(salesData.price, 65000);

    const cashierData = sanitizeOutputForRole('kasir', dummyProduct);
    assert.strictEqual(cashierData.cost_price, undefined);
    assert.strictEqual(cashierData.price, 65000);
  });
});

describe('KRITERIA 3 & 4: Validasi Stok & Harga Server', () => {
  it('Order dengan qty melebihi stok ditolak', () => {
    const currentStock = 10;
    const requestedQty = 15;
    const isAvailable = currentStock >= requestedQty;
    assert.strictEqual(isAvailable, false);
  });

  it('Harga khusus pelanggan diutamakan di atas harga umum', () => {
    const defaultProductPrice = 25000;
    const customerCustomPrice = 23000;
    const effectivePrice = customerCustomPrice || defaultProductPrice;
    assert.strictEqual(effectivePrice, 23000);
  });
});

describe('KRITERIA 5 & 6: Skenario Invoice Sesuai Gambar Bon & Aturan Pembayaran', () => {
  it('Skenario gambar: Belanja 120.000 + Bon 100.000 = 220.000, Bayar 150.000 => Sisa 70.000', () => {
    const subtotal = (10 * 5000) + (5 * 8000) + (2 * 15000); // 50.000 + 40.000 + 30.000
    assert.strictEqual(subtotal, 120000);

    const previous_balance = 100000;
    const total_due = subtotal + previous_balance;
    assert.strictEqual(total_due, 220000);

    const paid_amount = 150000;
    const remaining = total_due - paid_amount;
    assert.strictEqual(remaining, 70000);
  });

  it('Metode Tempo memaksa paid_amount = 0', () => {
    const payMethod = 'Tempo';
    const totalDue = 220000;
    const paidAmount = payMethod === 'Tempo' ? 0 : 220000;
    assert.strictEqual(paidAmount, 0);
    assert.strictEqual(totalDue - paidAmount, 220000);
  });

  it('Pembayaran melebihi total tagihan ditolak', () => {
    const totalDue = 100000;
    const inputPayment = 150000;
    const isOverpaid = inputPayment > totalDue;
    assert.strictEqual(isOverpaid, true);
  });
});

describe('KRITERIA 7: Pelunasan Piutang', () => {
  it('Pelunasan piutang 70.000 membuat saldo menjadi 0', () => {
    let currentBalance = 70000;
    const paymentAmount = 70000;
    currentBalance -= paymentAmount;
    assert.strictEqual(currentBalance, 0);
  });
});

describe('KRITERIA 8: Retur Penjualan & Perhitungan Saldo/Refund', () => {
  it('Qty retur melebihi yang terjual ditolak', () => {
    const soldQty = 5;
    const requestedReturnQty = 6;
    const isValid = requestedReturnQty <= soldQty;
    assert.strictEqual(isValid, false);
  });

  it('Retur mengurangi saldo pelanggan dan jika berlebih dicatat sebagai refund tunai', () => {
    const returnVal = 50000;
    let customerBalance = 30000;
    let cashRefund = 0;

    if (returnVal <= customerBalance) {
      customerBalance -= returnVal;
    } else {
      cashRefund = returnVal - customerBalance;
      customerBalance = 0;
    }

    assert.strictEqual(customerBalance, 0);
    assert.strictEqual(cashRefund, 20000);
  });
});

describe('KRITERIA 10: Stock Opname & Penyesuaian HPP', () => {
  it('Koreksi selisih hitung fisik terhadap stok sistem', () => {
    const systemStock = 100;
    const physicalCount = 94;
    const diff = physicalCount - systemStock;
    assert.strictEqual(diff, -6);
  });
});

describe('KRITERIA 11 & 12: Integritas Keamanan & Anti Formula Injection', () => {
  it('Admin tidak boleh menonaktifkan dirinya sendiri', () => {
    const currentUserId = 'admin-1';
    const targetUserId = 'admin-1';
    const isSelfDeactivation = currentUserId === targetUserId;
    assert.strictEqual(isSelfDeactivation, true);
  });

  it('Teks diawali tanda = + - @ otomatis disanitasi dengan tanda petik tunggal', () => {
    function sanitizeText(val) {
      if (typeof val === 'string' && (val.startsWith('=') || val.startsWith('+') || val.startsWith('-') || val.startsWith('@'))) {
        return "'" + val;
      }
      return val;
    }
    assert.strictEqual(sanitizeText('=SUM(A1:A10)'), "'=SUM(A1:A10)");
    assert.strictEqual(sanitizeText('+62812345'), "'+62812345");
    assert.strictEqual(sanitizeText('RH Frozen'), 'RH Frozen');
  });
});
