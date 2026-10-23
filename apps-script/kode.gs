/**
 * GOOGLE APPS SCRIPT - SALES TERPADU
 * Terikat pada Google Spreadsheet database.
 * Melakukan penulisan transaksi atomik dengan LockService, setup awal, PDF generator, dan daily backup.
 */

const APP_CONFIG = {
  TIMEZONE: 'Asia/Jakarta',
  DATE_FORMAT: 'yyyy-MM-dd',
  DATETIME_FORMAT: 'yyyy-MM-dd HH:mm:ss',
  APP_SECRET: 'rh_frozen_secret_app_key_2026_secure'
};

/**
 * Menu Kustom di Google Spreadsheet UI
 * Mempermudah admin menjalankan setup database langsung dari Spreadsheet
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🚀 RH Frozen System')
    .addItem('⚙️ Inisialisasi Database & Data Awal', 'manualSetupDatabase')
    .addItem('📦 Masukkan / Reset Data Produk & Pelanggan Riil', 'manualForceFillMasterData')
    .addToUi();
}

function manualSetupDatabase() {
  const res = setupDatabase();
  SpreadsheetApp.getUi().alert('Sukses: ' + res.message);
}

function manualForceFillMasterData() {
  const res = forceFillMasterData();
  SpreadsheetApp.getUi().alert(res.message);
}

/**
 * doPost Web App Handler
 * Menerima body JSON: { secret: string, action: string, payload: any }
 */
function doPost(e) {
  try {
    const rawData = e.postData.contents;
    const body = JSON.parse(rawData);

    // Verifikasi Secret
    const scriptSecret = PropertiesService.getScriptProperties().getProperty('APP_SECRET') || APP_CONFIG.APP_SECRET;
    if (!scriptSecret || body.secret !== scriptSecret) {
      return responseJson({ ok: false, error: 'UNAUTHORIZED', message: 'Kunci otorisasi tidak valid' });
    }

    const action = body.action;
    const payload = body.payload || {};

    // Routing aksi
    switch (action) {
      case 'setup':
        return responseJson(setupDatabase());
      case 'createOrder':
        return responseJson(createOrder(payload));
      case 'setShipped':
        return responseJson(setShipped(payload));
      case 'cancelOrder':
        return responseJson(cancelOrder(payload));
      case 'createInvoice':
        return responseJson(createInvoice(payload));
      case 'receivePayment':
        return responseJson(receivePayment(payload));
      case 'createReturn':
        return responseJson(createReturn(payload));
      case 'adjustStock':
        return responseJson(adjustStock(payload));
      case 'stockOpname':
        return responseJson(stockOpname(payload));
      case 'createPurchase':
        return responseJson(createPurchase(payload));
      case 'invoicePdf':
        return responseJson(generateInvoicePdf(payload));
      case 'returnPdf':
        return responseJson(generateReturnPdf(payload));
      case 'appendRow': {
        const { tabName, rowObject, headers } = payload;
        appendSheetRow(tabName, rowObject, headers);
        return responseJson({ ok: true, message: 'Baris berhasil ditambahkan ke ' + tabName });
      }
      case 'updateRow': {
        const { tabName, rowIndex, rowObject, headers } = payload;
        updateSheetRow(tabName, rowIndex, rowObject, headers);
        return responseJson({ ok: true, message: 'Baris ' + rowIndex + ' berhasil diperbarui di ' + tabName });
      }
      default:
        return responseJson({ ok: false, error: 'UNKNOWN_ACTION', message: 'Aksi tidak dikenali: ' + action });
    }
  } catch (err) {
    return responseJson({ ok: false, error: 'SERVER_ERROR', message: err.message });
  }
}

function responseJson(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// -------------------------------------------------------------
// HELPER FUNCTIONS & SHEET MAPPERS
// -------------------------------------------------------------

function getSpreadsheet() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function sanitizeText(val) {
  if (typeof val === 'string') {
    if (val.startsWith('=') || val.startsWith('+') || val.startsWith('-') || val.startsWith('@')) {
      return "'" + val;
    }
    // Cegah angka nol di depan (misal: nomor telepon 08xxx) diubah menjadi angka otomatis oleh Google Sheets
    if (/^0\d+$/.test(val)) {
      return "'" + val;
    }
  }
  return val;
}

function desanitizeText(val) {
  if (typeof val === 'string' && val.startsWith("'")) {
    return val.substring(1);
  }
  return val;
}

function getSheetData(sheetName) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];
  const headers = rows[0];
  const items = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const item = { _rowIndex: i + 1 };
    for (let j = 0; j < headers.length; j++) {
      item[headers[j]] = desanitizeText(row[j]);
    }
    items.push(item);
  }
  return items;
}

function appendSheetRow(sheetName, obj, headers) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  const row = headers.map(h => sanitizeText(obj[h] !== undefined ? obj[h] : ''));
  sheet.appendRow(row);
}

function updateSheetRow(sheetName, rowIndex, obj, headers) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  const row = headers.map(h => sanitizeText(obj[h] !== undefined ? obj[h] : ''));
  sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
}

function getNextCounter(prefix) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName('Counters');
  if (!sheet) {
    sheet = ss.insertSheet('Counters');
    sheet.appendRow(['key', 'value']);
  }
  const data = sheet.getDataRange().getValues();
  let currentVal = 0;
  let rowIndex = -1;

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === prefix) {
      currentVal = parseInt(data[i][1], 10) || 0;
      rowIndex = i + 1;
      break;
    }
  }

  const nextVal = currentVal + 1;
  if (rowIndex > 0) {
    sheet.getRange(rowIndex, 2).setValue(nextVal);
  } else {
    sheet.appendRow([prefix, nextVal]);
  }

  const pad = String(nextVal).padStart(3, '0');
  return `${prefix}-${pad}`;
}

function writeAuditLog(userId, action, detail) {
  try {
    const now = Utilities.formatDate(new Date(), APP_CONFIG.TIMEZONE, APP_CONFIG.DATETIME_FORMAT);
    const id = Utilities.getUuid();
    const headers = ['id', 'date_time', 'user_id', 'action', 'detail_json'];
    appendSheetRow('AuditLog', {
      id: id,
      date_time: now,
      user_id: userId || 'SYSTEM',
      action: action,
      detail_json: typeof detail === 'string' ? detail : JSON.stringify(detail)
    }, headers);
  } catch (e) {
    // Audit failure should not break primary flow
    Logger.log('Audit log error: ' + e.message);
  }
}

// -------------------------------------------------------------
// SETUP AWAL
// -------------------------------------------------------------

function setupDatabase() {
  const ss = getSpreadsheet();
  const schema = {
    Users: ['id', 'username', 'full_name', 'role', 'branch_id', 'password_hash', 'active', 'must_change_password', 'token_version', 'failed_count', 'locked_until', 'created_at', 'last_login_at'],
    Branches: ['id', 'name', 'active', 'paper_width'],
    Customers: ['id', 'name', 'address', 'phone', 'branch_id', 'sales_id', 'balance', 'credit_limit', 'term_days', 'active'],
    CustomerPrices: ['customer_id', 'product_id', 'price'],
    Products: ['id', 'name', 'category', 'price', 'cost_price', 'stock', 'emoji', 'image', 'active'],
    Suppliers: ['id', 'name', 'phone', 'address', 'active'],
    Purchases: ['id', 'purchase_no', 'date', 'supplier_id', 'branch_id', 'total', 'note', 'user_id'],
    PurchaseItems: ['id', 'purchase_id', 'product_id', 'name', 'qty', 'cost_price'],
    Orders: ['id', 'order_no', 'order_date', 'order_time', 'customer_id', 'sales_id', 'branch_id', 'status', 'note', 'invoice_id', 'client_key', 'created_at'],
    OrderItems: ['id', 'order_id', 'product_id', 'name', 'qty', 'price', 'discount', 'cost_price'],
    Invoices: ['id', 'invoice_no', 'order_id', 'invoice_date', 'invoice_time', 'due_date', 'customer_id', 'customer_name', 'customer_address', 'branch_id', 'sales_id', 'total_qty', 'subtotal', 'discount_total', 'previous_balance', 'total_due', 'paid_amount', 'remaining', 'pay_method', 'note', 'approved_by', 'created_by'],
    Payments: ['id', 'payment_date', 'payment_time', 'customer_id', 'invoice_id', 'type', 'amount', 'method', 'note', 'created_by'],
    Returns: ['id', 'return_no', 'invoice_id', 'customer_id', 'date', 'reason', 'total', 'user_id'],
    ReturnItems: ['id', 'return_id', 'product_id', 'name', 'qty', 'price'],
    StockMovements: ['id', 'date_time', 'product_id', 'change', 'reason', 'ref', 'balance_after', 'user_id'],
    SalesTargets: ['sales_id', 'month', 'target'],
    AuditLog: ['id', 'date_time', 'user_id', 'action', 'detail_json'],
    Counters: ['key', 'value'],
    Config: ['key', 'value'],
    Idempotency: ['key', 'response_json', 'created_at']
  };

  for (const sheetName in schema) {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }
    const headers = schema[sheetName];
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
    } else {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
    sheet.setFrozenRows(1);
  }

  // Isi data awal jika kosong
  const users = getSheetData('Users');
  if (users.length === 0) {
    const defaultUsers = [
      { id: 'USR-ADMIN-01', username: 'admin', full_name: 'Administrator RH Frozen', role: 'admin', branch_id: 'BR-GBG', password_hash: '$2a$10$0NtiL1b6DrAeEFdFB2YuWuI1IHwFAmqMSpQMClRA78jluOh91Y4TW', active: 'TRUE', must_change_password: 'FALSE', token_version: 1, failed_count: 0, locked_until: '', created_at: new Date().toISOString(), last_login_at: '' },
      { id: 'USR-SLS-01', username: 'noval', full_name: 'Noval (Sales Kertek)', role: 'sales', branch_id: 'BR-KERTEK', password_hash: '$2a$10$0NtiL1b6DrAeEFdFB2YuWuI1IHwFAmqMSpQMClRA78jluOh91Y4TW', active: 'TRUE', must_change_password: 'FALSE', token_version: 1, failed_count: 0, locked_until: '', created_at: new Date().toISOString() },
      { id: 'USR-SLS-02', username: 'yakub', full_name: 'Yakub (Sales Wonosobo)', role: 'sales', branch_id: 'BR-WSB', password_hash: '$2a$10$0NtiL1b6DrAeEFdFB2YuWuI1IHwFAmqMSpQMClRA78jluOh91Y4TW', active: 'TRUE', must_change_password: 'FALSE', token_version: 1, failed_count: 0, locked_until: '', created_at: new Date().toISOString() },
      { id: 'USR-SLS-03', username: 'mihrom', full_name: 'Mihrom (Sales Banjarnegara)', role: 'sales', branch_id: 'BR-BNA', password_hash: '$2a$10$0NtiL1b6DrAeEFdFB2YuWuI1IHwFAmqMSpQMClRA78jluOh91Y4TW', active: 'TRUE', must_change_password: 'FALSE', token_version: 1, failed_count: 0, locked_until: '', created_at: new Date().toISOString() },
      { id: 'USR-SLS-04', username: 'salam', full_name: 'Salam (Sales Wonodadi)', role: 'sales', branch_id: 'BR-WND', password_hash: '$2a$10$0NtiL1b6DrAeEFdFB2YuWuI1IHwFAmqMSpQMClRA78jluOh91Y4TW', active: 'TRUE', must_change_password: 'FALSE', token_version: 1, failed_count: 0, locked_until: '', created_at: new Date().toISOString() },
      { id: 'USR-SLS-05', username: 'huda', full_name: 'Huda (Sales Kejobong)', role: 'sales', branch_id: 'BR-KJB', password_hash: '$2a$10$0NtiL1b6DrAeEFdFB2YuWuI1IHwFAmqMSpQMClRA78jluOh91Y4TW', active: 'TRUE', must_change_password: 'FALSE', token_version: 1, failed_count: 0, locked_until: '', created_at: new Date().toISOString() },
      { id: 'USR-SLS-06', username: 'eka', full_name: 'Eka (Sales Mandiraja)', role: 'sales', branch_id: 'BR-MDR', password_hash: '$2a$10$0NtiL1b6DrAeEFdFB2YuWuI1IHwFAmqMSpQMClRA78jluOh91Y4TW', active: 'TRUE', must_change_password: 'FALSE', token_version: 1, failed_count: 0, locked_until: '', created_at: new Date().toISOString() },
      { id: 'USR-SLS-07', username: 'tefri', full_name: 'Tefri (Sales Purwokerto)', role: 'sales', branch_id: 'BR-PWT', password_hash: '$2a$10$0NtiL1b6DrAeEFdFB2YuWuI1IHwFAmqMSpQMClRA78jluOh91Y4TW', active: 'TRUE', must_change_password: 'FALSE', token_version: 1, failed_count: 0, locked_until: '', created_at: new Date().toISOString() },
      { id: 'USR-DRV-01', username: 'driver1', full_name: 'Armada Driver 1 (Kertek - Wonosobo)', role: 'driver', branch_id: 'BR-KERTEK', password_hash: '$2a$10$0NtiL1b6DrAeEFdFB2YuWuI1IHwFAmqMSpQMClRA78jluOh91Y4TW', active: 'TRUE', must_change_password: 'FALSE', token_version: 1, failed_count: 0, locked_until: '', created_at: new Date().toISOString() },
      { id: 'USR-DRV-02', username: 'driver2', full_name: 'Armada Driver 2 (Banjarnegara - Mandiraja)', role: 'driver', branch_id: 'BR-BNA', password_hash: '$2a$10$0NtiL1b6DrAeEFdFB2YuWuI1IHwFAmqMSpQMClRA78jluOh91Y4TW', active: 'TRUE', must_change_password: 'FALSE', token_version: 1, failed_count: 0, locked_until: '', created_at: new Date().toISOString() },
      { id: 'USR-DRV-03', username: 'driver3', full_name: 'Armada Driver 3 (Purwokerto - Kejobong)', role: 'driver', branch_id: 'BR-PWT', password_hash: '$2a$10$0NtiL1b6DrAeEFdFB2YuWuI1IHwFAmqMSpQMClRA78jluOh91Y4TW', active: 'TRUE', must_change_password: 'FALSE', token_version: 1, failed_count: 0, locked_until: '', created_at: new Date().toISOString() }
    ];
    defaultUsers.forEach(u => appendSheetRow('Users', u, schema.Users));
  }

  const branches = getSheetData('Branches');
  if (branches.length === 0) {
    const defaultBranches = [
      { id: 'BR-KERTEK', name: 'Cabang Kertek', active: 'TRUE', paper_width: 58 },
      { id: 'BR-WSB', name: 'Cabang Wonosobo', active: 'TRUE', paper_width: 80 },
      { id: 'BR-BNA', name: 'Cabang Banjarnegara', active: 'TRUE', paper_width: 80 },
      { id: 'BR-WND', name: 'Cabang Wonodadi', active: 'TRUE', paper_width: 58 },
      { id: 'BR-KJB', name: 'Cabang Kejobong', active: 'TRUE', paper_width: 58 },
      { id: 'BR-MDR', name: 'Cabang Mandiraja', active: 'TRUE', paper_width: 58 },
      { id: 'BR-PWT', name: 'Cabang Purwokerto', active: 'TRUE', paper_width: 80 },
      { id: 'BR-GBG', name: 'Pusat / Gabungan', active: 'TRUE', paper_width: 80 },
      { id: 'BR-FRZ', name: 'Outlet Frozen Express', active: 'TRUE', paper_width: 58 }
    ];
    defaultBranches.forEach(b => appendSheetRow('Branches', b, schema.Branches));
  }

  const products = getSheetData('Products');
  if (products.length === 0) {
    const defaultProducts = [
      { id: 'p1', name: 'Candi Cm', category: 'Bakso & Daging', price: 4500, cost_price: 3500, stock: 2600, emoji: '🥩', active: 'TRUE' },
      { id: 'p2', name: 'Candi Cs', category: 'Bakso & Daging', price: 11000, cost_price: 9000, stock: 475, emoji: '🥩', active: 'TRUE' },
      { id: 'p3', name: 'Candi Bc', category: 'Bakso & Daging', price: 5500, cost_price: 4500, stock: 2600, emoji: '🥩', active: 'TRUE' },
      { id: 'p4', name: 'Candi CJ', category: 'Bakso & Daging', price: 21000, cost_price: 17500, stock: 150, emoji: '🥩', active: 'TRUE' },
      { id: 'p5', name: 'Candi Tenis', category: 'Bakso & Daging', price: 17500, cost_price: 14000, stock: 0, emoji: '🥩', active: 'TRUE' },
      { id: 'p6', name: 'Candi Kg', category: 'Bakso & Daging', price: 30000, cost_price: 25000, stock: 50, emoji: '🥩', active: 'TRUE' },
      { id: 'p7', name: 'Mie Bulat', category: 'Mie & Pasta', price: 19500, cost_price: 16000, stock: 120, emoji: '🍜', active: 'TRUE' },
      { id: 'p8', name: 'Mie Kriting', category: 'Mie & Pasta', price: 13000, cost_price: 10000, stock: 0, emoji: '🍜', active: 'TRUE' },
      { id: 'p9', name: 'And Oren k', category: 'Frozen Food', price: 4500, cost_price: 3500, stock: 2000, emoji: '❄️', active: 'TRUE' },
      { id: 'p10', name: 'And Merah b', category: 'Frozen Food', price: 13000, cost_price: 10000, stock: 0, emoji: '❄️', active: 'TRUE' },
      { id: 'p11', name: 'And Merah k', category: 'Frozen Food', price: 13000, cost_price: 10000, stock: 0, emoji: '❄️', active: 'TRUE' },
      { id: 'p12', name: 'And Jumbo', category: 'Frozen Food', price: 13000, cost_price: 10000, stock: 0, emoji: '❄️', active: 'TRUE' },
      { id: 'p13', name: 'Taso', category: 'Camilan & Gorengan', price: 8500, cost_price: 6500, stock: 40, emoji: '🍘', active: 'TRUE' },
      { id: 'p14', name: 'Gelatin', category: 'Camilan & Gorengan', price: 4500, cost_price: 3500, stock: 25, emoji: '🍘', active: 'TRUE' },
      { id: 'p15', name: 'Men Ijo', category: 'Frozen Food', price: 13000, cost_price: 10000, stock: 0, emoji: '❄️', active: 'TRUE' },
      { id: 'p16', name: 'Men oren', category: 'Frozen Food', price: 13000, cost_price: 10000, stock: 0, emoji: '❄️', active: 'TRUE' },
      { id: 'p17', name: 'Yuda Besar', category: 'Frozen Food', price: 13000, cost_price: 10000, stock: 0, emoji: '❄️', active: 'TRUE' },
      { id: 'p18', name: 'Yuda Kecil', category: 'Frozen Food', price: 13000, cost_price: 10000, stock: 0, emoji: '❄️', active: 'TRUE' },
      { id: 'p19', name: 'Bakso Krikil', category: 'Bakso & Daging', price: 13000, cost_price: 10000, stock: 0, emoji: '🥩', active: 'TRUE' },
      { id: 'p20', name: 'Bogem', category: 'Bakso & Daging', price: 13000, cost_price: 10000, stock: 0, emoji: '🥩', active: 'TRUE' },
      { id: 'p21', name: 'NR isi 10', category: 'Frozen Food', price: 13000, cost_price: 10000, stock: 0, emoji: '❄️', active: 'TRUE' },
      { id: 'p22', name: 'Pangsit Kotak', category: 'Dimsum & Pangsit', price: 13000, cost_price: 10000, stock: 0, emoji: '🥟', active: 'TRUE' },
      { id: 'p23', name: 'Pangsit kecil', category: 'Dimsum & Pangsit', price: 13000, cost_price: 10000, stock: 0, emoji: '🥟', active: 'TRUE' },
      { id: 'p24', name: 'Pangsit Bunder', category: 'Dimsum & Pangsit', price: 13000, cost_price: 10000, stock: 0, emoji: '🥟', active: 'TRUE' },
      { id: 'p25', name: 'Pangsit siomay', category: 'Dimsum & Pangsit', price: 13000, cost_price: 10000, stock: 0, emoji: '🥟', active: 'TRUE' },
      { id: 'p26', name: 'Taso NR', category: 'Camilan & Gorengan', price: 13000, cost_price: 10000, stock: 0, emoji: '🍘', active: 'TRUE' },
      { id: 'p27', name: 'Mie ayam SR', category: 'Mie & Pasta', price: 13000, cost_price: 10000, stock: 0, emoji: '🍜', active: 'TRUE' },
      { id: 'p28', name: 'Rizky 20', category: 'Frozen Food', price: 5500, cost_price: 4500, stock: 600, emoji: '❄️', active: 'TRUE' },
      { id: 'p29', name: 'Rizky 10', category: 'Frozen Food', price: 13000, cost_price: 10000, stock: 0, emoji: '❄️', active: 'TRUE' },
      { id: 'p30', name: 'Asoy  cireng', category: 'Camilan & Gorengan', price: 13000, cost_price: 10000, stock: 0, emoji: '🍘', active: 'TRUE' },
      { id: 'p31', name: 'Sejati 10', category: 'Frozen Food', price: 13000, cost_price: 10000, stock: 0, emoji: '❄️', active: 'TRUE' },
      { id: 'p32', name: 'Sejati 20', category: 'Frozen Food', price: 5500, cost_price: 4500, stock: 1500, emoji: '❄️', active: 'TRUE' },
      { id: 'p33', name: 'Cetatul', category: 'Frozen Food', price: 7500, cost_price: 5500, stock: 10, emoji: '❄️', active: 'TRUE' },
      { id: 'p34', name: 'Hemato', category: 'Nugget & Ayam', price: 13000, cost_price: 10000, stock: 0, emoji: '🍗', active: 'TRUE' },
      { id: 'p35', name: 'Chic chic', category: 'Nugget & Ayam', price: 13000, cost_price: 10000, stock: 0, emoji: '🍗', active: 'TRUE' },
      { id: 'p36', name: 'Suri', category: 'Nugget & Ayam', price: 13000, cost_price: 10000, stock: 0, emoji: '🍗', active: 'TRUE' },
      { id: 'p37', name: 'So eco Crspy', category: 'Nugget & Ayam', price: 13000, cost_price: 10000, stock: 0, emoji: '🍗', active: 'TRUE' },
      { id: 'p38', name: 'Sobat', category: 'Nugget & Ayam', price: 13000, cost_price: 10000, stock: 0, emoji: '🍗', active: 'TRUE' },
      { id: 'p39', name: 'Chic" sosis', category: 'Sosis', price: 13000, cost_price: 10000, stock: 0, emoji: '🌭', active: 'TRUE' },
      { id: 'p40', name: 'Hemto somer', category: 'Dimsum & Pangsit', price: 13000, cost_price: 10000, stock: 0, emoji: '🥟', active: 'TRUE' },
      { id: 'p41', name: 'Belfood', category: 'Nugget & Ayam', price: 13000, cost_price: 10000, stock: 0, emoji: '🍗', active: 'TRUE' },
      { id: 'p42', name: 'Sonice', category: 'Sosis', price: 13000, cost_price: 10000, stock: 0, emoji: '🌭', active: 'TRUE' },
      { id: 'p43', name: 'Toples sosis', category: 'Sosis', price: 13000, cost_price: 10000, stock: 0, emoji: '🌭', active: 'TRUE' },
      { id: 'p44', name: 'Rakit otak"', category: 'Camilan & Gorengan', price: 13000, cost_price: 10000, stock: 0, emoji: '🍘', active: 'TRUE' },
      { id: 'p45', name: 'Jogya kwetio', category: 'Mie & Pasta', price: 13000, cost_price: 10000, stock: 0, emoji: '🍜', active: 'TRUE' },
      { id: 'p46', name: 'Kuning', category: 'Frozen Food', price: 13000, cost_price: 10000, stock: 0, emoji: '❄️', active: 'TRUE' },
      { id: 'p47', name: 'Lumpia B', category: 'Dimsum & Pangsit', price: 13000, cost_price: 10000, stock: 0, emoji: '🥟', active: 'TRUE' },
      { id: 'p48', name: 'Lumpia k', category: 'Dimsum & Pangsit', price: 13000, cost_price: 10000, stock: 0, emoji: '🥟', active: 'TRUE' },
      { id: 'p49', name: 'Rakit cireng', category: 'Camilan & Gorengan', price: 13000, cost_price: 10000, stock: 0, emoji: '🍘', active: 'TRUE' },
      { id: 'p50', name: 'Salam Somer', category: 'Dimsum & Pangsit', price: 13000, cost_price: 10000, stock: 0, emoji: '🥟', active: 'TRUE' },
      { id: 'p51', name: 'Salam Bakar', category: 'Frozen Food', price: 13000, cost_price: 10000, stock: 0, emoji: '❄️', active: 'TRUE' },
      { id: 'p52', name: 'Salam Ori', category: 'Frozen Food', price: 13000, cost_price: 10000, stock: 0, emoji: '❄️', active: 'TRUE' },
      { id: 'p53', name: 'Salam Stik', category: 'Frozen Food', price: 13000, cost_price: 10000, stock: 0, emoji: '❄️', active: 'TRUE' },
      { id: 'p54', name: 'Salam Hati', category: 'Frozen Food', price: 13000, cost_price: 10000, stock: 0, emoji: '❄️', active: 'TRUE' },
      { id: 'p55', name: 'salam crispy', category: 'Frozen Food', price: 13000, cost_price: 10000, stock: 0, emoji: '❄️', active: 'TRUE' },
      { id: 'p56', name: 'Pangsit intan', category: 'Dimsum & Pangsit', price: 13000, cost_price: 10000, stock: 0, emoji: '🥟', active: 'TRUE' },
      { id: 'p57', name: 'Asoy henza', category: 'Frozen Food', price: 13000, cost_price: 10000, stock: 0, emoji: '❄️', active: 'TRUE' },
      { id: 'p58', name: 'Asin B', category: 'Camilan & Gorengan', price: 13000, cost_price: 10000, stock: 0, emoji: '🍘', active: 'TRUE' },
      { id: 'p59', name: 'Asin K', category: 'Camilan & Gorengan', price: 13000, cost_price: 10000, stock: 0, emoji: '🍘', active: 'TRUE' },
      { id: 'p60', name: 'Balok coklat', category: 'Kue & Roti', price: 13000, cost_price: 10000, stock: 0, emoji: '🍞', active: 'TRUE' },
      { id: 'p61', name: 'Balok pandan', category: 'Kue & Roti', price: 13000, cost_price: 10000, stock: 0, emoji: '🍞', active: 'TRUE' },
      { id: 'p62', name: 'Balok Taro', category: 'Kue & Roti', price: 13000, cost_price: 10000, stock: 0, emoji: '🍞', active: 'TRUE' },
      { id: 'p63', name: 'Lapis legit', category: 'Kue & Roti', price: 13000, cost_price: 10000, stock: 0, emoji: '🍞', active: 'TRUE' },
      { id: 'p64', name: 'Bronis coklat', category: 'Kue & Roti', price: 4300, cost_price: 3300, stock: 0, emoji: '🍞', active: 'TRUE' },
      { id: 'p65', name: 'Bronis Pandan', category: 'Kue & Roti', price: 4300, cost_price: 3300, stock: 0, emoji: '🍞', active: 'TRUE' },
      { id: 'p66', name: 'Bronis tape', category: 'Kue & Roti', price: 4300, cost_price: 3300, stock: 0, emoji: '🍞', active: 'TRUE' },
      { id: 'p67', name: 'Bronis Lumer', category: 'Kue & Roti', price: 4300, cost_price: 3300, stock: 0, emoji: '🍞', active: 'TRUE' },
      { id: 'p68', name: 'Mantap B', category: 'Frozen Food', price: 28500, cost_price: 23500, stock: 0, emoji: '❄️', active: 'TRUE' }
    ];
    defaultProducts.forEach(p => appendSheetRow('Products', p, schema.Products));
  }

  const customers = getSheetData('Customers');
  if (customers.length === 0) {
    const defaultCustomers = [
      { id: 'c1', name: 'Toko Kertek Frozen (Noval)', address: 'Jl. Kertek - Wonosobo Km 3', phone: '081223344551', branch_id: 'BR-KERTEK', balance: 0, credit_limit: 15000000, term_days: 14, active: true },
      { id: 'c2', name: 'Toko Wonosobo Frozen (Yakub)', address: 'Pasar Induk Wonosobo Blok B', phone: '081223344552', branch_id: 'BR-WSB', balance: 0, credit_limit: 20000000, term_days: 14, active: true },
      { id: 'c3', name: 'Toko Banjarnegara Frozen (Mihrom)', address: 'Jl. Pemuda No. 45, Banjarnegara', phone: '081223344553', branch_id: 'BR-BNA', balance: 0, credit_limit: 25000000, term_days: 14, active: true },
      { id: 'c4', name: 'Toko Wonodadi Frozen (Salam)', address: 'Jl. Raya Wonodadi No. 18', phone: '081223344554', branch_id: 'BR-WND', balance: 0, credit_limit: 10000000, term_days: 7, active: true },
      { id: 'c5', name: 'Toko Kejobong Frozen (Huda)', address: 'Pasar Kejobong Kios 12', phone: '081223344555', branch_id: 'BR-KJB', balance: 0, credit_limit: 8000000, term_days: 7, active: true },
      { id: 'c6', name: 'Toko Mandiraja Frozen (Eka)', address: 'Jl. Raya Mandiraja No. 88', phone: '081223344556', branch_id: 'BR-MDR', balance: 0, credit_limit: 10000000, term_days: 14, active: true },
      { id: 'c7', name: 'Toko Purwokerto Frozen (Tefri)', address: 'Jl. Jenderal Soedirman No. 120, Purwokerto', phone: '081223344557', branch_id: 'BR-PWT', balance: 0, credit_limit: 30000000, term_days: 21, active: true },
      { id: 'c8', name: 'Distributor Gabungan Pusat', address: 'Kompleks Pergudangan RH Frozen', phone: '081223344558', branch_id: 'BR-GBG', balance: 0, credit_limit: 50000000, term_days: 30, active: true },
      { id: 'c9', name: 'Outlet RH Frozen Express', address: 'Jl. Raya Dieng No. 14, Wonosobo', phone: '081223344559', branch_id: 'BR-FRZ', balance: 0, credit_limit: 15000000, term_days: 7, active: true }
    ];
    defaultCustomers.forEach(c => appendSheetRow('Customers', c, schema.Customers));
  }

  const configs = getSheetData('Config');
  if (configs.length === 0) {
    const defaultConfigs = [
      ['business_name', 'RH FROZEN FOOD'],
      ['business_address', 'Jl. Transito No. 15, Surakarta | Telp: 0812-3456-7890'],
      ['business_phone', '081234567890'],
      ['invoice_footer', 'Terima kasih telah berbelanja di RH Frozen. Barang yang sudah dibeli tidak dapat ditukar/dikembalikan kecuali ada perjanjian retur.'],
      ['low_stock_threshold', '100'],
      ['max_discount_percent', '10'],
      ['commission_percent', '0']
    ];
    const sheetCfg = ss.getSheetByName('Config');
    defaultConfigs.forEach(pair => sheetCfg.appendRow(pair));
  }

  return { ok: true, message: 'Setup database berhasil' };
}

/**
 * Memaksa pengisian data Produk & Pelanggan riil ke Spreadsheet
 * Mengatasi masalah jika sheet Products / Customers sebelumnya terbuat tapi kosong
 */
function forceFillMasterData() {
  const ss = getSpreadsheet();
  
  // 1. ISI TAB PRODUCTS
  const prodHeaders = ['id', 'name', 'category', 'price', 'cost_price', 'stock', 'emoji', 'image', 'active'];
  let sheetProd = ss.getSheetByName('Products');
  if (!sheetProd) {
    sheetProd = ss.insertSheet('Products');
  }
  sheetProd.clearContents();
  sheetProd.appendRow(prodHeaders);
  sheetProd.setFrozenRows(1);

  const defaultProducts = [
    { id: 'p1', name: 'Candi Cm', category: 'Bakso & Daging', price: 4500, cost_price: 3500, stock: 2600, emoji: '🥩', active: 'TRUE' },
    { id: 'p2', name: 'Candi Cs', category: 'Bakso & Daging', price: 11000, cost_price: 9000, stock: 475, emoji: '🥩', active: 'TRUE' },
    { id: 'p3', name: 'Candi Bc', category: 'Bakso & Daging', price: 5500, cost_price: 4500, stock: 2600, emoji: '🥩', active: 'TRUE' },
    { id: 'p4', name: 'Candi CJ', category: 'Bakso & Daging', price: 21000, cost_price: 17500, stock: 150, emoji: '🥩', active: 'TRUE' },
    { id: 'p5', name: 'Candi Tenis', category: 'Bakso & Daging', price: 17500, cost_price: 14000, stock: 0, emoji: '🥩', active: 'TRUE' },
    { id: 'p6', name: 'Candi Kg', category: 'Bakso & Daging', price: 30000, cost_price: 25000, stock: 50, emoji: '🥩', active: 'TRUE' },
    { id: 'p7', name: 'Mie Bulat', category: 'Mie & Pasta', price: 19500, cost_price: 16000, stock: 120, emoji: '🍜', active: 'TRUE' },
    { id: 'p8', name: 'Mie Kriting', category: 'Mie & Pasta', price: 13000, cost_price: 10000, stock: 0, emoji: '🍜', active: 'TRUE' },
    { id: 'p9', name: 'And Oren k', category: 'Frozen Food', price: 4500, cost_price: 3500, stock: 2000, emoji: '❄️', active: 'TRUE' },
    { id: 'p10', name: 'And Merah b', category: 'Frozen Food', price: 13000, cost_price: 10000, stock: 0, emoji: '❄️', active: 'TRUE' },
    { id: 'p11', name: 'And Merah k', category: 'Frozen Food', price: 13000, cost_price: 10000, stock: 0, emoji: '❄️', active: 'TRUE' },
    { id: 'p12', name: 'And Jumbo', category: 'Frozen Food', price: 13000, cost_price: 10000, stock: 0, emoji: '❄️', active: 'TRUE' },
    { id: 'p13', name: 'Taso', category: 'Camilan & Gorengan', price: 8500, cost_price: 6500, stock: 40, emoji: '🍘', active: 'TRUE' },
    { id: 'p14', name: 'Gelatin', category: 'Camilan & Gorengan', price: 4500, cost_price: 3500, stock: 25, emoji: '🍘', active: 'TRUE' },
    { id: 'p15', name: 'Men Ijo', category: 'Frozen Food', price: 13000, cost_price: 10000, stock: 0, emoji: '❄️', active: 'TRUE' },
    { id: 'p16', name: 'Men oren', category: 'Frozen Food', price: 13000, cost_price: 10000, stock: 0, emoji: '❄️', active: 'TRUE' },
    { id: 'p17', name: 'Yuda Besar', category: 'Frozen Food', price: 13000, cost_price: 10000, stock: 0, emoji: '❄️', active: 'TRUE' },
    { id: 'p18', name: 'Yuda Kecil', category: 'Frozen Food', price: 13000, cost_price: 10000, stock: 0, emoji: '❄️', active: 'TRUE' },
    { id: 'p19', name: 'Bakso Krikil', category: 'Bakso & Daging', price: 13000, cost_price: 10000, stock: 0, emoji: '🥩', active: 'TRUE' },
    { id: 'p20', name: 'Bogem', category: 'Bakso & Daging', price: 13000, cost_price: 10000, stock: 0, emoji: '🥩', active: 'TRUE' },
    { id: 'p21', name: 'NR isi 10', category: 'Frozen Food', price: 13000, cost_price: 10000, stock: 0, emoji: '❄️', active: 'TRUE' },
    { id: 'p22', name: 'Pangsit Kotak', category: 'Dimsum & Pangsit', price: 13000, cost_price: 10000, stock: 0, emoji: '🥟', active: 'TRUE' },
    { id: 'p23', name: 'Pangsit kecil', category: 'Dimsum & Pangsit', price: 13000, cost_price: 10000, stock: 0, emoji: '🥟', active: 'TRUE' },
    { id: 'p24', name: 'Pangsit Bunder', category: 'Dimsum & Pangsit', price: 13000, cost_price: 10000, stock: 0, emoji: '🥟', active: 'TRUE' },
    { id: 'p25', name: 'Pangsit siomay', category: 'Dimsum & Pangsit', price: 13000, cost_price: 10000, stock: 0, emoji: '🥟', active: 'TRUE' },
    { id: 'p26', name: 'Taso NR', category: 'Camilan & Gorengan', price: 13000, cost_price: 10000, stock: 0, emoji: '🍘', active: 'TRUE' },
    { id: 'p27', name: 'Mie ayam SR', category: 'Mie & Pasta', price: 13000, cost_price: 10000, stock: 0, emoji: '🍜', active: 'TRUE' },
    { id: 'p28', name: 'Rizky 20', category: 'Frozen Food', price: 5500, cost_price: 4500, stock: 600, emoji: '❄️', active: 'TRUE' },
    { id: 'p29', name: 'Rizky 10', category: 'Frozen Food', price: 13000, cost_price: 10000, stock: 0, emoji: '❄️', active: 'TRUE' },
    { id: 'p30', name: 'Asoy  cireng', category: 'Camilan & Gorengan', price: 13000, cost_price: 10000, stock: 0, emoji: '🍘', active: 'TRUE' },
    { id: 'p31', name: 'Sejati 10', category: 'Frozen Food', price: 13000, cost_price: 10000, stock: 0, emoji: '❄️', active: 'TRUE' },
    { id: 'p32', name: 'Sejati 20', category: 'Frozen Food', price: 5500, cost_price: 4500, stock: 1500, emoji: '❄️', active: 'TRUE' },
    { id: 'p33', name: 'Cetatul', category: 'Frozen Food', price: 7500, cost_price: 5500, stock: 10, emoji: '❄️', active: 'TRUE' },
    { id: 'p34', name: 'Hemato', category: 'Nugget & Ayam', price: 13000, cost_price: 10000, stock: 0, emoji: '🍗', active: 'TRUE' },
    { id: 'p35', name: 'Chic chic', category: 'Nugget & Ayam', price: 13000, cost_price: 10000, stock: 0, emoji: '🍗', active: 'TRUE' },
    { id: 'p36', name: 'Suri', category: 'Nugget & Ayam', price: 13000, cost_price: 10000, stock: 0, emoji: '🍗', active: 'TRUE' },
    { id: 'p37', name: 'So eco Crspy', category: 'Nugget & Ayam', price: 13000, cost_price: 10000, stock: 0, emoji: '🍗', active: 'TRUE' },
    { id: 'p38', name: 'Sobat', category: 'Nugget & Ayam', price: 13000, cost_price: 10000, stock: 0, emoji: '🍗', active: 'TRUE' },
    { id: 'p39', name: 'Chic" sosis', category: 'Sosis', price: 13000, cost_price: 10000, stock: 0, emoji: '🌭', active: 'TRUE' },
    { id: 'p40', name: 'Hemto somer', category: 'Dimsum & Pangsit', price: 13000, cost_price: 10000, stock: 0, emoji: '🥟', active: 'TRUE' },
    { id: 'p41', name: 'Belfood', category: 'Nugget & Ayam', price: 13000, cost_price: 10000, stock: 0, emoji: '🍗', active: 'TRUE' },
    { id: 'p42', name: 'Sonice', category: 'Sosis', price: 13000, cost_price: 10000, stock: 0, emoji: '🌭', active: 'TRUE' },
    { id: 'p43', name: 'Toples sosis', category: 'Sosis', price: 13000, cost_price: 10000, stock: 0, emoji: '🌭', active: 'TRUE' },
    { id: 'p44', name: 'Rakit otak"', category: 'Camilan & Gorengan', price: 13000, cost_price: 10000, stock: 0, emoji: '🍘', active: 'TRUE' },
    { id: 'p45', name: 'Jogya kwetio', category: 'Mie & Pasta', price: 13000, cost_price: 10000, stock: 0, emoji: '🍜', active: 'TRUE' },
    { id: 'p46', name: 'Kuning', category: 'Frozen Food', price: 13000, cost_price: 10000, stock: 0, emoji: '❄️', active: 'TRUE' },
    { id: 'p47', name: 'Lumpia B', category: 'Dimsum & Pangsit', price: 13000, cost_price: 10000, stock: 0, emoji: '🥟', active: 'TRUE' },
    { id: 'p48', name: 'Lumpia k', category: 'Dimsum & Pangsit', price: 13000, cost_price: 10000, stock: 0, emoji: '🥟', active: 'TRUE' },
    { id: 'p49', name: 'Rakit cireng', category: 'Camilan & Gorengan', price: 13000, cost_price: 10000, stock: 0, emoji: '🍘', active: 'TRUE' },
    { id: 'p50', name: 'Salam Somer', category: 'Dimsum & Pangsit', price: 13000, cost_price: 10000, stock: 0, emoji: '🥟', active: 'TRUE' },
    { id: 'p51', name: 'Salam Bakar', category: 'Frozen Food', price: 13000, cost_price: 10000, stock: 0, emoji: '❄️', active: 'TRUE' },
    { id: 'p52', name: 'Salam Ori', category: 'Frozen Food', price: 13000, cost_price: 10000, stock: 0, emoji: '❄️', active: 'TRUE' },
    { id: 'p53', name: 'Salam Stik', category: 'Frozen Food', price: 13000, cost_price: 10000, stock: 0, emoji: '❄️', active: 'TRUE' },
    { id: 'p54', name: 'Salam Hati', category: 'Frozen Food', price: 13000, cost_price: 10000, stock: 0, emoji: '❄️', active: 'TRUE' },
    { id: 'p55', name: 'salam crispy', category: 'Frozen Food', price: 13000, cost_price: 10000, stock: 0, emoji: '❄️', active: 'TRUE' },
    { id: 'p56', name: 'Pangsit intan', category: 'Dimsum & Pangsit', price: 13000, cost_price: 10000, stock: 0, emoji: '🥟', active: 'TRUE' },
    { id: 'p57', name: 'Asoy henza', category: 'Frozen Food', price: 13000, cost_price: 10000, stock: 0, emoji: '❄️', active: 'TRUE' },
    { id: 'p58', name: 'Asin B', category: 'Camilan & Gorengan', price: 13000, cost_price: 10000, stock: 0, emoji: '🍘', active: 'TRUE' },
    { id: 'p59', name: 'Asin K', category: 'Camilan & Gorengan', price: 13000, cost_price: 10000, stock: 0, emoji: '🍘', active: 'TRUE' },
    { id: 'p60', name: 'Balok coklat', category: 'Kue & Roti', price: 13000, cost_price: 10000, stock: 0, emoji: '🍞', active: 'TRUE' },
    { id: 'p61', name: 'Balok pandan', category: 'Kue & Roti', price: 13000, cost_price: 10000, stock: 0, emoji: '🍞', active: 'TRUE' },
    { id: 'p62', name: 'Balok Taro', category: 'Kue & Roti', price: 13000, cost_price: 10000, stock: 0, emoji: '🍞', active: 'TRUE' },
    { id: 'p63', name: 'Lapis legit', category: 'Kue & Roti', price: 13000, cost_price: 10000, stock: 0, emoji: '🍞', active: 'TRUE' },
    { id: 'p64', name: 'Bronis coklat', category: 'Kue & Roti', price: 4300, cost_price: 3300, stock: 0, emoji: '🍞', active: 'TRUE' },
    { id: 'p65', name: 'Bronis Pandan', category: 'Kue & Roti', price: 4300, cost_price: 3300, stock: 0, emoji: '🍞', active: 'TRUE' },
    { id: 'p66', name: 'Bronis tape', category: 'Kue & Roti', price: 4300, cost_price: 3300, stock: 0, emoji: '🍞', active: 'TRUE' },
    { id: 'p67', name: 'Bronis Lumer', category: 'Kue & Roti', price: 4300, cost_price: 3300, stock: 0, emoji: '🍞', active: 'TRUE' },
    { id: 'p68', name: 'Mantap B', category: 'Frozen Food', price: 28500, cost_price: 23500, stock: 0, emoji: '❄️', active: 'TRUE' }
  ];

  const prodRows = defaultProducts.map(p => prodHeaders.map(h => sanitizeText(p[h] !== undefined ? p[h] : '')));
  if (prodRows.length > 0) {
    sheetProd.getRange(2, 1, prodRows.length, prodHeaders.length).setValues(prodRows);
  }

  // 2. ISI TAB CUSTOMERS
  const custHeaders = ['id', 'name', 'address', 'phone', 'branch_id', 'sales_id', 'balance', 'credit_limit', 'term_days', 'active'];
  let sheetCust = ss.getSheetByName('Customers');
  if (!sheetCust) {
    sheetCust = ss.insertSheet('Customers');
  }
  sheetCust.clearContents();
  sheetCust.appendRow(custHeaders);
  sheetCust.setFrozenRows(1);

  const defaultCustomers = [
    { id: 'c1', name: 'Toko Kertek Frozen (Noval)', address: 'Jl. Kertek - Wonosobo Km 3', phone: '081223344551', branch_id: 'BR-KERTEK', balance: 0, credit_limit: 15000000, term_days: 14, active: true },
    { id: 'c2', name: 'Toko Wonosobo Frozen (Yakub)', address: 'Pasar Induk Wonosobo Blok B', phone: '081223344552', branch_id: 'BR-WSB', balance: 0, credit_limit: 20000000, term_days: 14, active: true },
    { id: 'c3', name: 'Toko Banjarnegara Frozen (Mihrom)', address: 'Jl. Pemuda No. 45, Banjarnegara', phone: '081223344553', branch_id: 'BR-BNA', balance: 0, credit_limit: 25000000, term_days: 14, active: true },
    { id: 'c4', name: 'Toko Wonodadi Frozen (Salam)', address: 'Jl. Raya Wonodadi No. 18', phone: '081223344554', branch_id: 'BR-WND', balance: 0, credit_limit: 10000000, term_days: 7, active: true },
    { id: 'c5', name: 'Toko Kejobong Frozen (Huda)', address: 'Pasar Kejobong Kios 12', phone: '081223344555', branch_id: 'BR-KJB', balance: 0, credit_limit: 8000000, term_days: 7, active: true },
    { id: 'c6', name: 'Toko Mandiraja Frozen (Eka)', address: 'Jl. Raya Mandiraja No. 88', phone: '081223344556', branch_id: 'BR-MDR', balance: 0, credit_limit: 10000000, term_days: 14, active: true },
    { id: 'c7', name: 'Toko Purwokerto Frozen (Tefri)', address: 'Jl. Jenderal Soedirman No. 120, Purwokerto', phone: '081223344557', branch_id: 'BR-PWT', balance: 0, credit_limit: 30000000, term_days: 21, active: true },
    { id: 'c8', name: 'Distributor Gabungan Pusat', address: 'Kompleks Pergudangan RH Frozen', phone: '081223344558', branch_id: 'BR-GBG', balance: 0, credit_limit: 50000000, term_days: 30, active: true },
    { id: 'c9', name: 'Outlet RH Frozen Express', address: 'Jl. Raya Dieng No. 14, Wonosobo', phone: '081223344559', branch_id: 'BR-FRZ', balance: 0, credit_limit: 15000000, term_days: 7, active: true }
  ];

  const custRows = defaultCustomers.map(c => custHeaders.map(h => sanitizeText(c[h] !== undefined ? c[h] : '')));
  if (custRows.length > 0) {
    sheetCust.getRange(2, 1, custRows.length, custHeaders.length).setValues(custRows);
  }

  return { ok: true, message: `Berhasil mengisi ${prodRows.length} produk dan ${custRows.length} pelanggan ke Spreadsheet!` };
}

// -------------------------------------------------------------
// TRANSAKSI ATOMIK DENGAN LOCKSERVICE
// -------------------------------------------------------------

/**
 * 2. createOrder
 */
function createOrder(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const { customer_id, order_date, items, sales_id, branch_id, note, client_key, approved_by } = payload;
    const now = new Date();
    const nowStr = Utilities.formatDate(now, APP_CONFIG.TIMEZONE, APP_CONFIG.DATETIME_FORMAT);
    const timeStr = Utilities.formatDate(now, APP_CONFIG.TIMEZONE, 'HH:mm:ss');
    const ymd = Utilities.formatDate(now, APP_CONFIG.TIMEZONE, 'yyyyMMdd');

    // 1. Cek Idempotensi client_key di tab Orders
    const orders = getSheetData('Orders');
    if (client_key) {
      const existing = orders.find(o => o.client_key === client_key);
      if (existing) {
        return { ok: true, data: existing, message: 'Order sudah pernah dibuat (idempoten)' };
      }
    }

    // 2. Validasi Pelanggan
    const customers = getSheetData('Customers');
    const customer = customers.find(c => c.id === customer_id && (c.active === true || c.active === 'TRUE' || c.active === 'true'));
    if (!customer) {
      return { ok: false, error: 'CUSTOMER_NOT_FOUND', message: 'Pelanggan tidak ditemukan atau nonaktif' };
    }

    // 3. Validasi Barang & Stok
    const products = getSheetData('Products');
    const custPrices = getSheetData('CustomerPrices');
    const configs = getSheetData('Config');
    const maxDiscCfg = configs.find(c => c.key === 'max_discount_percent');
    const maxDiscountPercent = maxDiscCfg ? parseFloat(maxDiscCfg.value) : 10;

    const validatedItems = [];
    for (const item of items) {
      const product = products.find(p => p.id === item.product_id && (p.active === true || p.active === 'TRUE' || p.active === 'true'));
      if (!product) {
        return { ok: false, error: 'PRODUCT_NOT_FOUND', message: `Barang dengan ID ${item.product_id} tidak valid` };
      }

      const qty = parseInt(item.qty, 10);
      if (isNaN(qty) || qty <= 0) {
        return { ok: false, error: 'INVALID_QTY', message: `Qty untuk barang ${product.name} harus bilangan bulat positif` };
      }

      const currentStock = parseInt(product.stock, 10) || 0;
      if (currentStock < qty) {
        return { ok: false, error: 'OUT_OF_STOCK', message: `Stok barang ${product.name} tidak cukup (sisa: ${currentStock}, diminta: ${qty})` };
      }

      // Tentukan harga: CustomerPrices > Products.price
      let itemPrice = parseFloat(product.price);
      const customPrice = custPrices.find(cp => cp.customer_id === customer_id && cp.product_id === item.product_id);
      if (customPrice && customPrice.price !== '') {
        itemPrice = parseFloat(customPrice.price);
      }

      const discount = parseFloat(item.discount || 0);
      const lineTotal = itemPrice * qty;
      if (discount > lineTotal) {
        return { ok: false, error: 'INVALID_DISCOUNT', message: `Diskon barang ${product.name} melebihi subtotal` };
      }

      const discountPercent = (discount / lineTotal) * 100;
      if (discountPercent > maxDiscountPercent && !approved_by) {
        return { ok: false, error: 'NEED_APPROVAL', message: `Diskon barang ${product.name} (${discountPercent.toFixed(1)}%) melebihi batas maksimal ${maxDiscountPercent}% tanpa izin manajer` };
      }

      validatedItems.push({
        product_id: product.id,
        name: product.name,
        qty: qty,
        price: itemPrice,
        discount: discount,
        cost_price: parseFloat(product.cost_price || 0),
        productRef: product
      });
    }

    // 4. Update Stok & Tulis StockMovements
    const ss = getSpreadsheet();
    const prodSheet = ss.getSheetByName('Products');
    const prodHeaders = ['id', 'name', 'category', 'price', 'cost_price', 'stock', 'emoji', 'active'];

    const newOrderId = Utilities.getUuid();
    const orderNo = getNextCounter(`SO-${branch_id}-${ymd}`);

    for (const vItem of validatedItems) {
      const p = vItem.productRef;
      const newStock = (parseInt(p.stock, 10) || 0) - vItem.qty;
      p.stock = newStock;
      updateSheetRow('Products', p._rowIndex, p, prodHeaders);

      appendSheetRow('StockMovements', {
        id: Utilities.getUuid(),
        date_time: nowStr,
        product_id: p.id,
        change: -vItem.qty,
        reason: 'Order',
        ref: orderNo,
        balance_after: newStock,
        user_id: sales_id
      }, ['id', 'date_time', 'product_id', 'change', 'reason', 'ref', 'balance_after', 'user_id']);
    }

    // 5. Tulis Orders & OrderItems
    const newOrder = {
      id: newOrderId,
      order_no: orderNo,
      order_date: order_date || Utilities.formatDate(now, APP_CONFIG.TIMEZONE, APP_CONFIG.DATE_FORMAT),
      order_time: timeStr,
      customer_id: customer_id,
      sales_id: sales_id,
      branch_id: branch_id,
      status: 'Proses',
      note: note || '',
      invoice_id: '',
      client_key: client_key || '',
      created_at: nowStr
    };
    appendSheetRow('Orders', newOrder, ['id', 'order_no', 'order_date', 'order_time', 'customer_id', 'sales_id', 'branch_id', 'status', 'note', 'invoice_id', 'client_key', 'created_at']);

    for (const vItem of validatedItems) {
      appendSheetRow('OrderItems', {
        id: Utilities.getUuid(),
        order_id: newOrderId,
        product_id: vItem.product_id,
        name: vItem.name,
        qty: vItem.qty,
        price: vItem.price,
        discount: vItem.discount,
        cost_price: vItem.cost_price
      }, ['id', 'order_id', 'product_id', 'name', 'qty', 'price', 'discount', 'cost_price']);
    }

    writeAuditLog(sales_id, 'CREATE_ORDER', { order_no: orderNo, order_id: newOrderId, customer: customer.name });
    return { ok: true, data: newOrder, message: 'Order berhasil dibuat' };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 3. setShipped
 */
function setShipped(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const { order_id, user_id } = payload;
    const orders = getSheetData('Orders');
    const order = orders.find(o => o.id === order_id);
    if (!order) return { ok: false, error: 'NOT_FOUND', message: 'Order tidak ditemukan' };
    if (order.status !== 'Proses') {
      return { ok: false, error: 'INVALID_STATUS', message: 'Hanya order berstatus Proses yang dapat diubah ke Dikirim' };
    }

    // Kurangi Stok Produk saat orderan diubah menjadi Dikirim
    const orderItems = getSheetData('OrderItems').filter(oi => oi.order_id === order_id);
    const products = getSheetData('Products');
    const prodHeaders = ['id', 'name', 'category', 'price', 'cost_price', 'stock', 'emoji', 'active'];
    const nowStr = Utilities.formatDate(new Date(), APP_CONFIG.TIMEZONE, APP_CONFIG.DATETIME_FORMAT);

    for (const item of orderItems) {
      const prod = products.find(p => p.id === item.product_id);
      if (prod) {
        const currentStock = parseInt(prod.stock, 10) || 0;
        const qty = parseInt(item.qty, 10) || 0;
        const newStock = Math.max(0, currentStock - qty);
        prod.stock = newStock;
        updateSheetRow('Products', prod._rowIndex, prod, prodHeaders);

        appendSheetRow('StockMovements', {
          id: Utilities.getUuid(),
          date_time: nowStr,
          product_id: prod.id,
          change: -qty,
          reason: 'Kirim Order',
          ref: order.order_no || order.id,
          balance_after: newStock,
          user_id: user_id
        }, ['id', 'date_time', 'product_id', 'change', 'reason', 'ref', 'balance_after', 'user_id']);
      }
    }

    order.status = 'Dikirim';
    const headers = ['id', 'order_no', 'order_date', 'order_time', 'customer_id', 'sales_id', 'branch_id', 'status', 'note', 'invoice_id', 'client_key', 'created_at'];
    updateSheetRow('Orders', order._rowIndex, order, headers);

    writeAuditLog(user_id, 'SET_SHIPPED', { order_id: order_id, order_no: order.order_no });
    return { ok: true, data: order, message: 'Status order berhasil diubah menjadi Dikirim dan stok telah dikurangi' };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 4. cancelOrder
 */
function cancelOrder(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const { order_id, reason, user_id } = payload;
    const orders = getSheetData('Orders');
    const order = orders.find(o => o.id === order_id);
    if (!order) return { ok: false, error: 'NOT_FOUND', message: 'Order tidak ditemukan' };
    if (order.invoice_id) {
      return { ok: false, error: 'HAS_INVOICE', message: 'Order yang sudah memiliki invoice tidak dapat dibatalkan' };
    }
    if (order.status !== 'Proses' && order.status !== 'Dikirim') {
      return { ok: false, error: 'INVALID_STATUS', message: 'Order tidak dalam status Proses atau Dikirim' };
    }

    // Kembalikan Stok
    const orderItems = getSheetData('OrderItems').filter(oi => oi.order_id === order_id);
    const products = getSheetData('Products');
    const prodHeaders = ['id', 'name', 'category', 'price', 'cost_price', 'stock', 'emoji', 'active'];
    const nowStr = Utilities.formatDate(new Date(), APP_CONFIG.TIMEZONE, APP_CONFIG.DATETIME_FORMAT);

    for (const item of orderItems) {
      const prod = products.find(p => p.id === item.product_id);
      if (prod) {
        const newStock = (parseInt(prod.stock, 10) || 0) + parseInt(item.qty, 10);
        prod.stock = newStock;
        updateSheetRow('Products', prod._rowIndex, prod, prodHeaders);

        appendSheetRow('StockMovements', {
          id: Utilities.getUuid(),
          date_time: nowStr,
          product_id: prod.id,
          change: parseInt(item.qty, 10),
          reason: 'Batal',
          ref: order.order_no,
          balance_after: newStock,
          user_id: user_id
        }, ['id', 'date_time', 'product_id', 'change', 'reason', 'ref', 'balance_after', 'user_id']);
      }
    }

    order.status = 'Dibatalkan';
    order.note = (order.note ? order.note + ' | ' : '') + 'Batal: ' + (reason || '');
    const headers = ['id', 'order_no', 'order_date', 'order_time', 'customer_id', 'sales_id', 'branch_id', 'status', 'note', 'invoice_id', 'client_key', 'created_at'];
    updateSheetRow('Orders', order._rowIndex, order, headers);

    writeAuditLog(user_id, 'CANCEL_ORDER', { order_id: order_id, order_no: order.order_no, reason: reason });
    return { ok: true, data: order, message: 'Order berhasil dibatalkan dan stok telah dikembalikan' };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 5. createInvoice
 */
function createInvoice(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const { order_id, pay_method, paid_amount, note, user_id, approved_by } = payload;
    const orders = getSheetData('Orders');
    const order = orders.find(o => o.id === order_id);
    if (!order) return { ok: false, error: 'NOT_FOUND', message: 'Order tidak ditemukan' };
    if (order.status === 'Selesai' || order.status === 'Dibatalkan') {
      return { ok: false, error: 'INVALID_STATUS', message: `Order sudah dalam status ${order.status}` };
    }

    const customers = getSheetData('Customers');
    const customer = customers.find(c => c.id === order.customer_id);
    if (!customer) return { ok: false, error: 'CUSTOMER_NOT_FOUND', message: 'Data pelanggan tidak ditemukan' };

    const orderItems = getSheetData('OrderItems').filter(oi => oi.order_id === order_id);
    let subtotal = 0;
    let discount_total = 0;
    let total_qty = 0;

    for (const oi of orderItems) {
      const q = parseInt(oi.qty, 10) || 0;
      const p = parseFloat(oi.price) || 0;
      const d = parseFloat(oi.discount) || 0;
      subtotal += (q * p) - d;
      discount_total += d;
      total_qty += q;
    }

    const previous_balance = parseFloat(customer.balance || 0);
    const total_due = subtotal + previous_balance;

    let finalPaid = parseFloat(paid_amount || 0);
    if (pay_method === 'Tempo') {
      finalPaid = 0;
    } else {
      if (finalPaid < 0) finalPaid = 0;
      if (finalPaid > total_due) {
        return { ok: false, error: 'OVERPAID', message: 'Pembayaran melebihi total tagihan' };
      }
    }

    const remaining = total_due - finalPaid;
    const credit_limit = parseFloat(customer.credit_limit || 0);
    if (credit_limit > 0 && remaining > credit_limit && !approved_by) {
      return { ok: false, error: 'CREDIT_LIMIT_EXCEEDED', message: `Sisa tagihan Rp ${remaining.toLocaleString('id-ID')} melebihi batas kredit Rp ${credit_limit.toLocaleString('id-ID')} tanpa persetujuan manajer` };
    }

    const now = new Date();
    const nowStr = Utilities.formatDate(now, APP_CONFIG.TIMEZONE, APP_CONFIG.DATETIME_FORMAT);
    const invoiceDate = Utilities.formatDate(now, APP_CONFIG.TIMEZONE, APP_CONFIG.DATE_FORMAT);
    const invoiceTime = Utilities.formatDate(now, APP_CONFIG.TIMEZONE, 'HH:mm:ss');
    const ymd = Utilities.formatDate(now, APP_CONFIG.TIMEZONE, 'yyyyMMdd');

    const termDays = parseInt(customer.term_days, 10) || 14;
    const dueDateObj = new Date(now.getTime() + (termDays * 24 * 60 * 60 * 1000));
    const dueDateStr = Utilities.formatDate(dueDateObj, APP_CONFIG.TIMEZONE, APP_CONFIG.DATE_FORMAT);

    const invoiceNo = getNextCounter(`INV-${order.branch_id}-${ymd}`);
    const invoiceId = Utilities.getUuid();

    const newInvoice = {
      id: invoiceId,
      invoice_no: invoiceNo,
      order_id: order_id,
      invoice_date: invoiceDate,
      invoice_time: invoiceTime,
      due_date: dueDateStr,
      customer_id: customer.id,
      customer_name: customer.name,
      customer_address: customer.address,
      branch_id: order.branch_id,
      sales_id: order.sales_id,
      total_qty: total_qty,
      subtotal: subtotal,
      discount_total: discount_total,
      previous_balance: previous_balance,
      total_due: total_due,
      paid_amount: finalPaid,
      remaining: remaining,
      pay_method: pay_method,
      note: note || '',
      approved_by: approved_by || '',
      created_by: user_id
    };
    appendSheetRow('Invoices', newInvoice, ['id', 'invoice_no', 'order_id', 'invoice_date', 'invoice_time', 'due_date', 'customer_id', 'customer_name', 'customer_address', 'branch_id', 'sales_id', 'total_qty', 'subtotal', 'discount_total', 'previous_balance', 'total_due', 'paid_amount', 'remaining', 'pay_method', 'note', 'approved_by', 'created_by']);

    // Catat Pembayaran jika paid > 0
    if (finalPaid > 0) {
      appendSheetRow('Payments', {
        id: Utilities.getUuid(),
        payment_date: invoiceDate,
        payment_time: invoiceTime,
        customer_id: customer.id,
        invoice_id: invoiceId,
        type: 'Invoice',
        amount: finalPaid,
        method: pay_method,
        note: `Pembayaran ${invoiceNo}`,
        created_by: user_id
      }, ['id', 'payment_date', 'payment_time', 'customer_id', 'invoice_id', 'type', 'amount', 'method', 'note', 'created_by']);
    }

    // Update Saldo Pelanggan
    customer.balance = remaining;
    const custHeaders = ['id', 'name', 'address', 'phone', 'branch_id', 'sales_id', 'balance', 'credit_limit', 'term_days', 'active'];
    updateSheetRow('Customers', customer._rowIndex, customer, custHeaders);

    // Update Status Order Selesai
    order.status = 'Selesai';
    order.invoice_id = invoiceId;
    const orderHeaders = ['id', 'order_no', 'order_date', 'order_time', 'customer_id', 'sales_id', 'branch_id', 'status', 'note', 'invoice_id', 'client_key', 'created_at'];
    updateSheetRow('Orders', order._rowIndex, order, orderHeaders);

    writeAuditLog(user_id, 'CREATE_INVOICE', { invoice_no: invoiceNo, invoice_id: invoiceId, order_id: order_id, total_due: total_due, remaining: remaining });
    return { ok: true, data: newInvoice, message: 'Invoice berhasil dibuat' };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 6. receivePayment (Pelunasan Piutang)
 */
function receivePayment(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const { customer_id, amount, method, note, user_id } = payload;
    const customers = getSheetData('Customers');
    const customer = customers.find(c => c.id === customer_id);
    if (!customer) return { ok: false, error: 'NOT_FOUND', message: 'Pelanggan tidak ditemukan' };

    const currentBalance = parseFloat(customer.balance || 0);
    const payAmount = parseFloat(amount || 0);

    if (payAmount <= 0) {
      return { ok: false, error: 'INVALID_AMOUNT', message: 'Jumlah pembayaran harus lebih dari 0' };
    }
    if (payAmount > currentBalance) {
      return { ok: false, error: 'OVERPAID', message: `Pembayaran (Rp ${payAmount.toLocaleString('id-ID')}) melebihi saldo piutang (Rp ${currentBalance.toLocaleString('id-ID')})` };
    }

    const remaining = currentBalance - payAmount;
    customer.balance = remaining;
    const custHeaders = ['id', 'name', 'address', 'phone', 'branch_id', 'sales_id', 'balance', 'credit_limit', 'term_days', 'active'];
    updateSheetRow('Customers', customer._rowIndex, customer, custHeaders);

    const now = new Date();
    const dateStr = Utilities.formatDate(now, APP_CONFIG.TIMEZONE, APP_CONFIG.DATE_FORMAT);
    const timeStr = Utilities.formatDate(now, APP_CONFIG.TIMEZONE, 'HH:mm:ss');
    const paymentId = Utilities.getUuid();

    appendSheetRow('Payments', {
      id: paymentId,
      payment_date: dateStr,
      payment_time: timeStr,
      customer_id: customer_id,
      invoice_id: '',
      type: 'Piutang',
      amount: payAmount,
      method: method || 'Tunai',
      note: note || 'Pelunasan Piutang',
      created_by: user_id
    }, ['id', 'payment_date', 'payment_time', 'customer_id', 'invoice_id', 'type', 'amount', 'method', 'note', 'created_by']);

    const receipt = {
      payment_id: paymentId,
      customer_id: customer.id,
      customer_name: customer.name,
      previous_balance: currentBalance,
      paid_amount: payAmount,
      remaining_balance: remaining,
      method: method,
      date: dateStr,
      time: timeStr
    };

    writeAuditLog(user_id, 'RECEIVE_PAYMENT', receipt);
    return { ok: true, data: receipt, message: 'Pembayaran piutang berhasil diterima' };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 7. createReturn
 */
function createReturn(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const { invoice_id, items, reason, user_id } = payload;
    const invoices = getSheetData('Invoices');
    const invoice = invoices.find(inv => inv.id === invoice_id);
    if (!invoice) return { ok: false, error: 'NOT_FOUND', message: 'Invoice tidak ditemukan' };

    const orderItems = getSheetData('OrderItems').filter(oi => oi.order_id === invoice.order_id);
    const existingReturns = getSheetData('Returns').filter(r => r.invoice_id === invoice_id);
    const existingReturnItems = getSheetData('ReturnItems').filter(ri => existingReturns.some(r => r.id === ri.return_id));

    const products = getSheetData('Products');
    const prodHeaders = ['id', 'name', 'category', 'price', 'cost_price', 'stock', 'emoji', 'active'];

    let totalReturnValue = 0;
    const validatedReturnItems = [];

    for (const item of items) {
      const orderItem = orderItems.find(oi => oi.product_id === item.product_id);
      if (!orderItem) {
        return { ok: false, error: 'ITEM_NOT_IN_INVOICE', message: `Barang dengan ID ${item.product_id} tidak ada dalam transaksi invoice ini` };
      }

      const totalSoldQty = parseInt(orderItem.qty, 10);
      const alreadyReturnedQty = existingReturnItems
        .filter(ri => ri.product_id === item.product_id)
        .reduce((sum, ri) => sum + parseInt(ri.qty, 10), 0);

      const maxReturnableQty = totalSoldQty - alreadyReturnedQty;
      const requestedQty = parseInt(item.qty, 10);

      if (requestedQty <= 0 || requestedQty > maxReturnableQty) {
        return { ok: false, error: 'INVALID_RETURN_QTY', message: `Qty retur untuk ${orderItem.name} (${requestedQty}) melebihi sisa retur yang diizinkan (${maxReturnableQty})` };
      }

      // Hitung harga bersih per unit
      const origPrice = parseFloat(orderItem.price);
      const origDiscount = parseFloat(orderItem.discount || 0);
      const netUnitPrice = origPrice - (origDiscount / totalSoldQty);
      const itemReturnValue = netUnitPrice * requestedQty;
      totalReturnValue += itemReturnValue;

      validatedReturnItems.push({
        product_id: item.product_id,
        name: orderItem.name,
        qty: requestedQty,
        price: netUnitPrice
      });
    }

    const now = new Date();
    const nowStr = Utilities.formatDate(now, APP_CONFIG.TIMEZONE, APP_CONFIG.DATETIME_FORMAT);
    const dateStr = Utilities.formatDate(now, APP_CONFIG.TIMEZONE, APP_CONFIG.DATE_FORMAT);
    const ymd = Utilities.formatDate(now, APP_CONFIG.TIMEZONE, 'yyyyMMdd');

    const returnId = Utilities.getUuid();
    const returnNo = getNextCounter(`RET-${invoice.branch_id}-${ymd}`);

    // Tambah stok kembali
    for (const vItem of validatedReturnItems) {
      const prod = products.find(p => p.id === vItem.product_id);
      if (prod) {
        const newStock = (parseInt(prod.stock, 10) || 0) + vItem.qty;
        prod.stock = newStock;
        updateSheetRow('Products', prod._rowIndex, prod, prodHeaders);

        appendSheetRow('StockMovements', {
          id: Utilities.getUuid(),
          date_time: nowStr,
          product_id: prod.id,
          change: vItem.qty,
          reason: 'Retur',
          ref: returnNo,
          balance_after: newStock,
          user_id: user_id
        }, ['id', 'date_time', 'product_id', 'change', 'reason', 'ref', 'balance_after', 'user_id']);
      }
    }

    // Sesuaikan Saldo Pelanggan atau Refund
    const customers = getSheetData('Customers');
    const customer = customers.find(c => c.id === invoice.customer_id);
    let cashRefund = 0;

    if (customer) {
      const curBalance = parseFloat(customer.balance || 0);
      if (totalReturnValue <= curBalance) {
        customer.balance = curBalance - totalReturnValue;
      } else {
        cashRefund = totalReturnValue - curBalance;
        customer.balance = 0;
      }
      const custHeaders = ['id', 'name', 'address', 'phone', 'branch_id', 'sales_id', 'balance', 'credit_limit', 'term_days', 'active'];
      updateSheetRow('Customers', customer._rowIndex, customer, custHeaders);
    }

    // Jika ada pengembalian uang lebih, catat di Payments dengan amount negatif
    if (cashRefund > 0) {
      appendSheetRow('Payments', {
        id: Utilities.getUuid(),
        payment_date: dateStr,
        payment_time: Utilities.formatDate(now, APP_CONFIG.TIMEZONE, 'HH:mm:ss'),
        customer_id: invoice.customer_id,
        invoice_id: invoice.id,
        type: 'Retur',
        amount: -cashRefund,
        method: 'Tunai',
        note: `Pengembalian dana retur ${returnNo}`,
        created_by: user_id
      }, ['id', 'payment_date', 'payment_time', 'customer_id', 'invoice_id', 'type', 'amount', 'method', 'note', 'created_by']);
    }

    // Simpan Returns & ReturnItems
    const newReturn = {
      id: returnId,
      return_no: returnNo,
      invoice_id: invoice_id,
      customer_id: invoice.customer_id,
      date: dateStr,
      reason: reason || '',
      total: totalReturnValue,
      user_id: user_id
    };
    appendSheetRow('Returns', newReturn, ['id', 'return_no', 'invoice_id', 'customer_id', 'date', 'reason', 'total', 'user_id']);

    for (const vItem of validatedReturnItems) {
      appendSheetRow('ReturnItems', {
        id: Utilities.getUuid(),
        return_id: returnId,
        product_id: vItem.product_id,
        name: vItem.name,
        qty: vItem.qty,
        price: vItem.price
      }, ['id', 'return_id', 'product_id', 'name', 'qty', 'price']);
    }

    writeAuditLog(user_id, 'CREATE_RETURN', { return_no: returnNo, invoice_id: invoice_id, total: totalReturnValue, refund: cashRefund });
    return { ok: true, data: { ...newReturn, cash_refund: cashRefund }, message: 'Retur barang berhasil diproses' };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 8. adjustStock & stockOpname
 */
function adjustStock(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const { product_id, change, reason, note, user_id } = payload;
    const products = getSheetData('Products');
    const prod = products.find(p => p.id === product_id);
    if (!prod) return { ok: false, error: 'NOT_FOUND', message: 'Barang tidak ditemukan' };

    const currentStock = parseInt(prod.stock, 10) || 0;
    const changeInt = parseInt(change, 10);
    const newStock = currentStock + changeInt;

    if (newStock < 0) {
      return { ok: false, error: 'NEGATIVE_STOCK', message: 'Stok akhir tidak boleh negatif' };
    }

    prod.stock = newStock;
    const prodHeaders = ['id', 'name', 'category', 'price', 'cost_price', 'stock', 'emoji', 'active'];
    updateSheetRow('Products', prod._rowIndex, prod, prodHeaders);

    const nowStr = Utilities.formatDate(new Date(), APP_CONFIG.TIMEZONE, APP_CONFIG.DATETIME_FORMAT);
    appendSheetRow('StockMovements', {
      id: Utilities.getUuid(),
      date_time: nowStr,
      product_id: prod.id,
      change: changeInt,
      reason: reason || 'Koreksi',
      ref: note || '',
      balance_after: newStock,
      user_id: user_id
    }, ['id', 'date_time', 'product_id', 'change', 'reason', 'ref', 'balance_after', 'user_id']);

    writeAuditLog(user_id, 'ADJUST_STOCK', { product: prod.name, change: changeInt, new_stock: newStock, reason: reason });
    return { ok: true, data: { product_id: prod.id, stock: newStock }, message: 'Penyesuaian stok berhasil disimpan' };
  } finally {
    lock.releaseLock();
  }
}

function stockOpname(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const { items, note, user_id } = payload;
    const products = getSheetData('Products');
    const prodHeaders = ['id', 'name', 'category', 'price', 'cost_price', 'stock', 'emoji', 'active'];
    const nowStr = Utilities.formatDate(new Date(), APP_CONFIG.TIMEZONE, APP_CONFIG.DATETIME_FORMAT);

    const results = [];
    for (const item of items) {
      const prod = products.find(p => p.id === item.product_id);
      if (prod) {
        const sysStock = parseInt(prod.stock, 10) || 0;
        const countedStock = parseInt(item.counted, 10);
        const diff = countedStock - sysStock;

        if (diff !== 0) {
          prod.stock = countedStock;
          updateSheetRow('Products', prod._rowIndex, prod, prodHeaders);

          appendSheetRow('StockMovements', {
            id: Utilities.getUuid(),
            date_time: nowStr,
            product_id: prod.id,
            change: diff,
            reason: 'Opname',
            ref: note || 'Stock Opname',
            balance_after: countedStock,
            user_id: user_id
          }, ['id', 'date_time', 'product_id', 'change', 'reason', 'ref', 'balance_after', 'user_id']);
        }
        results.push({ product_id: prod.id, name: prod.name, diff: diff, counted: countedStock });
      }
    }

    writeAuditLog(user_id, 'STOCK_OPNAME', { total_items: items.length, note: note });
    return { ok: true, data: results, message: 'Stock opname berhasil disimpan' };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 9. createPurchase
 */
function createPurchase(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const { supplier_id, branch_id, date, items, note, user_id } = payload;
    const now = new Date();
    const nowStr = Utilities.formatDate(now, APP_CONFIG.TIMEZONE, APP_CONFIG.DATETIME_FORMAT);
    const ymd = Utilities.formatDate(now, APP_CONFIG.TIMEZONE, 'yyyyMMdd');

    const purchaseId = Utilities.getUuid();
    const purchaseNo = getNextCounter(`PO-${branch_id}-${ymd}`);

    const products = getSheetData('Products');
    const prodHeaders = ['id', 'name', 'category', 'price', 'cost_price', 'stock', 'emoji', 'active'];

    let totalPurchase = 0;
    const validatedItems = [];

    for (const it of items) {
      const prod = products.find(p => p.id === it.product_id);
      if (!prod) continue;

      const qty = parseInt(it.qty, 10);
      const costPrice = parseFloat(it.cost_price);
      totalPurchase += (qty * costPrice);

      // Tambah stok & perbarui cost_price
      const newStock = (parseInt(prod.stock, 10) || 0) + qty;
      prod.stock = newStock;
      prod.cost_price = costPrice;
      updateSheetRow('Products', prod._rowIndex, prod, prodHeaders);

      appendSheetRow('StockMovements', {
        id: Utilities.getUuid(),
        date_time: nowStr,
        product_id: prod.id,
        change: qty,
        reason: 'Pembelian',
        ref: purchaseNo,
        balance_after: newStock,
        user_id: user_id
      }, ['id', 'date_time', 'product_id', 'change', 'reason', 'ref', 'balance_after', 'user_id']);

      validatedItems.push({
        product_id: prod.id,
        name: prod.name,
        qty: qty,
        cost_price: costPrice
      });
    }

    const newPurchase = {
      id: purchaseId,
      purchase_no: purchaseNo,
      date: date || Utilities.formatDate(now, APP_CONFIG.TIMEZONE, APP_CONFIG.DATE_FORMAT),
      supplier_id: supplier_id,
      branch_id: branch_id,
      total: totalPurchase,
      note: note || '',
      user_id: user_id
    };
    appendSheetRow('Purchases', newPurchase, ['id', 'purchase_no', 'date', 'supplier_id', 'branch_id', 'total', 'note', 'user_id']);

    for (const vItem of validatedItems) {
      appendSheetRow('PurchaseItems', {
        id: Utilities.getUuid(),
        purchase_id: purchaseId,
        product_id: vItem.product_id,
        name: vItem.name,
        qty: vItem.qty,
        cost_price: vItem.cost_price
      }, ['id', 'purchase_id', 'product_id', 'name', 'qty', 'cost_price']);
    }

    writeAuditLog(user_id, 'CREATE_PURCHASE', { purchase_no: purchaseNo, total: totalPurchase });
    return { ok: true, data: newPurchase, message: 'Pembelian berhasil dicatat dan stok bertambah' };
  } finally {
    lock.releaseLock();
  }
}

// -------------------------------------------------------------
// PDF GENERATOR
// -------------------------------------------------------------

function generateInvoicePdf(payload) {
  const { invoice_id } = payload;
  const invoices = getSheetData('Invoices');
  const invoice = invoices.find(inv => inv.id === invoice_id);
  if (!invoice) return { ok: false, error: 'NOT_FOUND', message: 'Invoice tidak ditemukan' };

  const orderItems = getSheetData('OrderItems').filter(oi => oi.order_id === invoice.order_id);
  const configs = getSheetData('Config');
  const getCfg = k => {
    const item = configs.find(c => c.key === k);
    return item ? item.value : '';
  };

  const businessName = getCfg('business_name') || 'RH FROZEN';
  const businessAddress = getCfg('business_address') || '';
  const invoiceFooter = getCfg('invoice_footer') || '';

  const formatRp = num => 'Rp' + Math.round(num || 0).toLocaleString('id-ID');

  let itemsHtml = '';
  for (const it of orderItems) {
    const lineTotal = (parseInt(it.qty, 10) * parseFloat(it.price)) - parseFloat(it.discount || 0);
    itemsHtml += `
      <tr>
        <td style="padding:6px 0;">${it.name}${parseFloat(it.discount) > 0 ? `<br><small style="color:#666">Diskon: ${formatRp(it.discount)}</small>` : ''}</td>
        <td style="text-align:right;padding:6px 0;">${it.qty}</td>
        <td style="text-align:right;padding:6px 0;">${formatRp(it.price)}</td>
        <td style="text-align:right;padding:6px 0;">${formatRp(lineTotal)}</td>
      </tr>
    `;
  }

  const isLunas = parseFloat(invoice.remaining) <= 0;
  const badgeColor = isLunas ? '#16a34a' : '#dc2626';
  const badgeText = isLunas ? 'LUNAS' : 'BELUM LUNAS';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 13px; color: #1e293b; margin: 20px; }
        .header { border-bottom: 2px solid #1d4ed8; padding-bottom: 10px; margin-bottom: 15px; }
        .biz-name { font-size: 18px; font-weight: bold; color: #1d4ed8; }
        .title-row { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }
        .badge { background: ${badgeColor}; color: white; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 11px; }
        .info-table td { padding: 2px 0; }
        .items-table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        .items-table th { border-bottom: 1px solid #cbd5e1; text-align: left; padding: 6px 0; font-size: 12px; }
        .items-table td { border-bottom: 1px dashed #e2e8f0; }
        .summary-row { display: flex; justify-content: space-between; padding: 4px 0; }
        .divider { border-top: 1px solid #94a3b8; margin: 10px 0; }
        .huge-balance { font-size: 18px; font-weight: bold; color: ${isLunas ? '#16a34a' : '#dc2626'}; text-align: right; }
        .footer { margin-top: 25px; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 8px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="biz-name">${businessName}</div>
        <div style="font-size:11px;color:#64748b;">${businessAddress}</div>
        <div class="title-row">
          <div><strong style="font-size:15px;">INVOICE ${invoice.invoice_no}</strong></div>
          <span class="badge">${badgeText}</span>
        </div>
      </div>

      <table class="info-table" style="width:100%;margin-bottom:10px;">
        <tr><td style="width:120px;font-weight:bold;">Tanggal:</td><td>${invoice.invoice_date}</td></tr>
        <tr><td style="font-weight:bold;">Nama Pelanggan:</td><td>${invoice.customer_name}</td></tr>
        <tr><td style="font-weight:bold;">Alamat:</td><td>${invoice.customer_address}</td></tr>
        ${!isLunas ? `<tr><td style="font-weight:bold;">Jatuh Tempo:</td><td>${invoice.due_date}</td></tr>` : ''}
      </table>

      <div class="divider"></div>
      <div style="font-weight:bold;margin-bottom:5px;">Rincian barang:</div>
      <table class="items-table">
        <thead>
          <tr>
            <th>Nama Barang</th>
            <th style="text-align:right;">Qty</th>
            <th style="text-align:right;">Harga</th>
            <th style="text-align:right;">Jumlah</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
          <tr style="font-weight:bold;">
            <td style="padding-top:10px;">Total belanja</td>
            <td style="text-align:right;padding-top:10px;">${invoice.total_qty}</td>
            <td></td>
            <td style="text-align:right;padding-top:10px;">${formatRp(invoice.subtotal)}</td>
          </tr>
        </tbody>
      </table>

      <div class="divider"></div>
      <table style="width:100%;font-size:13px;">
        <tr><td style="color:#64748b;">Bon sebelumnya:</td><td style="text-align:right;font-weight:bold;">${formatRp(invoice.previous_balance)}</td></tr>
        <tr><td style="color:#64748b;">Total tagihan:</td><td style="text-align:right;font-weight:bold;">${formatRp(invoice.total_due)}</td></tr>
        <tr><td style="color:#64748b;">Total pembayaran:</td><td style="text-align:right;font-weight:bold;">${formatRp(invoice.paid_amount)}</td></tr>
      </table>

      <div class="divider"></div>
      <table style="width:100%;">
        <tr>
          <td style="font-size:11px;color:#64748b;">Sisa kekurangan / hutang:</td>
          <td class="huge-balance">${formatRp(invoice.remaining)}</td>
        </tr>
      </table>

      <div style="margin-top:10px;font-size:12px;">
        Metode Pembayaran: <strong>${invoice.pay_method}</strong>
        ${invoice.note ? `<br>Keterangan: ${invoice.note}` : ''}
      </div>

      <div class="footer">${invoiceFooter}</div>
    </body>
    </html>
  `;

  const blob = HtmlService.createHtmlOutput(html).getBlob().getAs('application/pdf');
  const base64 = Utilities.base64Encode(blob.getBytes());
  return {
    ok: true,
    data: {
      filename: `${invoice.invoice_no}.pdf`,
      content_type: 'application/pdf',
      base64: base64
    }
  };
}

function generateReturnPdf(payload) {
  const { return_id } = payload;
  const returns = getSheetData('Returns');
  const ret = returns.find(r => r.id === return_id);
  if (!ret) return { ok: false, error: 'NOT_FOUND', message: 'Retur tidak ditemukan' };

  const returnItems = getSheetData('ReturnItems').filter(ri => ri.return_id === return_id);
  const customers = getSheetData('Customers');
  const customer = customers.find(c => c.id === ret.customer_id) || {};
  const configs = getSheetData('Config');
  const getCfg = k => {
    const item = configs.find(c => c.key === k);
    return item ? item.value : '';
  };

  const businessName = getCfg('business_name') || 'RH FROZEN';
  const formatRp = num => 'Rp' + Math.round(num || 0).toLocaleString('id-ID');

  let itemsHtml = '';
  for (const it of returnItems) {
    const total = parseInt(it.qty, 10) * parseFloat(it.price);
    itemsHtml += `
      <tr>
        <td style="padding:6px 0;">${it.name}</td>
        <td style="text-align:right;padding:6px 0;">${it.qty}</td>
        <td style="text-align:right;padding:6px 0;">${formatRp(it.price)}</td>
        <td style="text-align:right;padding:6px 0;">${formatRp(total)}</td>
      </tr>
    `;
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 13px; color: #1e293b; margin: 20px; }
        .header { border-bottom: 2px solid #dc2626; padding-bottom: 10px; margin-bottom: 15px; }
        .biz-name { font-size: 18px; font-weight: bold; color: #dc2626; }
        .items-table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        .items-table th { border-bottom: 1px solid #cbd5e1; text-align: left; padding: 6px 0; }
        .items-table td { border-bottom: 1px dashed #e2e8f0; }
        .divider { border-top: 1px solid #94a3b8; margin: 10px 0; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="biz-name">${businessName}</div>
        <div style="font-size:16px;font-weight:bold;margin-top:5px;">NOTA RETUR PENJUALAN: ${ret.return_no}</div>
      </div>
      <div><strong>Tanggal:</strong> ${ret.date}</div>
      <div><strong>Pelanggan:</strong> ${customer.name || '-'}</div>
      <div><strong>Alasan:</strong> ${ret.reason || '-'}</div>

      <div class="divider"></div>
      <table class="items-table">
        <thead>
          <tr>
            <th>Barang</th>
            <th style="text-align:right;">Qty</th>
            <th style="text-align:right;">Harga Satuan</th>
            <th style="text-align:right;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <div class="divider"></div>
      <div style="font-size:16px;font-weight:bold;text-align:right;color:#dc2626;">
        Total Nilai Retur: ${formatRp(ret.total)}
      </div>
    </body>
    </html>
  `;

  const blob = HtmlService.createHtmlOutput(html).getBlob().getAs('application/pdf');
  const base64 = Utilities.base64Encode(blob.getBytes());
  return {
    ok: true,
    data: {
      filename: `${ret.return_no}.pdf`,
      content_type: 'application/pdf',
      base64: base64
    }
  };
}

// -------------------------------------------------------------
// BACKUP HARIAN & TRIGGERS
// -------------------------------------------------------------

function dailyBackup() {
  const ss = getSpreadsheet();
  const folderName = 'Backup Sales Terpadu';
  const folders = DriveApp.getFoldersByName(folderName);
  let folder;

  if (folders.hasNext()) {
    folder = folders.next();
  } else {
    folder = DriveApp.createFolder(folderName);
  }

  const ymd = Utilities.formatDate(new Date(), APP_CONFIG.TIMEZONE, 'yyyy-MM-dd_HHmmss');
  const backupName = `${ss.getName()} - Backup ${ymd}`;
  const file = DriveApp.getFileById(ss.getId());
  file.makeCopy(backupName, folder);

  // Bersihkan sisa backup sehingga hanya tersisa 14 file terbaru
  const files = folder.getFiles();
  const fileList = [];
  while (files.hasNext()) {
    const f = files.next();
    fileList.push({ file: f, date: f.getDateCreated() });
  }

  fileList.sort((a, b) => b.date.getTime() - a.date.getTime());
  if (fileList.length > 14) {
    for (let i = 14; i < fileList.length; i++) {
      fileList[i].file.setTrashed(true);
    }
  }
}

function installTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('dailyBackup')
    .timeBased()
    .atHour(1)
    .everyDays(1)
    .inTimezone(APP_CONFIG.TIMEZONE)
    .create();

  Logger.log('Trigger harian dailyBackup berhasil dipasang untuk pukul 01:00 WIB');
}
