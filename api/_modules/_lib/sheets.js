import { google } from 'googleapis';
import { getCached, setCached, clearCache } from './cache.js';
import { ApiError } from './errors.js';

const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1nq3PVJm0--u34XKWS4KzOchVPmXbQPcdW5EJzXWTF9Y';
const SA_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const SA_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

function getSheetsClient() {
  if (!SPREADSHEET_ID || !SA_EMAIL || !SA_KEY) {
    throw new ApiError(500, 'CONFIG_ERROR', 'Konfigurasi Google Service Account belum lengkap di server.');
  }
  const auth = new google.auth.JWT({
    email: SA_EMAIL,
    key: SA_KEY,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  return google.sheets({ version: 'v4', auth });
}

function desanitizeText(val) {
  if (typeof val === 'string' && val.startsWith("'")) {
    return val.substring(1);
  }
  return val;
}

function sanitizeText(val) {
  if (typeof val === 'string') {
    if (val.startsWith('=') || val.startsWith('+') || val.startsWith('-') || val.startsWith('@')) {
      return "'" + val;
    }
  }
  return val;
}

function parseCsvToObjects(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length <= 1) return [];

  function parseLine(line) {
    const row = [];
    let inQuotes = false;
    let field = '';
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        row.push(field);
        field = '';
      } else {
        field += char;
      }
    }
    row.push(field);
    return row;
  }

  const headers = parseLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    const item = { _rowIndex: i + 1 };
    for (let c = 0; c < headers.length; c++) {
      item[headers[c]] = desanitizeText(values[c] !== undefined ? values[c] : '');
    }
    rows.push(item);
  }
  return rows;
}

async function fetchTabRowsFromGoogle(tabName) {
  if (!SPREADSHEET_ID) return null;
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const text = await res.text();
    // Jika response HTML error google docs
    if (text.includes('<!DOCTYPE html>') || text.includes('google.visualization.Query.setResponse')) {
      return null;
    }
    return parseCsvToObjects(text);
  } catch (err) {
    console.error(`[LIVE SHEETS ERROR] Gagal membaca tab ${tabName} dari Google Spreadsheet:`, err.message);
    return null;
  }
}

/**
 * Membaca tab menjadi list of objects berdasarkan baris header
 */
export async function getTabRows(tabName, forceFresh = false) {
  if (!forceFresh) {
    const cached = getCached(tabName);
    if (cached) return cached;
  }

  // 1. Coba baca secara live dari Google Spreadsheet jika Service Account belum ada
  if (!SA_EMAIL || !SA_KEY) {
    const liveRows = await fetchTabRowsFromGoogle(tabName);
    if (liveRows !== null && liveRows.length > 0) {
      setCached(tabName, liveRows);
      return liveRows;
    }
  }

  // Jika Service Account belum diisi, sediakan akun admin awal, 6 sales, 4 driver, 6 cabang untuk demo & operasional
  if (!SA_EMAIL || !SA_KEY) {
        if (tabName === 'Users') {
      const defaultUsers = [
        {
                "_rowIndex": 2,
                "id": "USR-ADMIN-01",
                "username": "admin",
                "full_name": "Administrator RH Frozen",
                "role": "admin",
                "branch_id": "BR-GBG",
                "password_hash": "$2a$10$0NtiL1b6DrAeEFdFB2YuWuI1IHwFAmqMSpQMClRA78jluOh91Y4TW",
                "active": "TRUE",
                "must_change_password": "FALSE",
                "token_version": 1,
                "failed_count": 0,
                "locked_until": "",
                "created_at": "2026-10-15T00:00:00Z",
                "last_login_at": ""
        },
        {
                "_rowIndex": 3,
                "id": "USR-SLS-01",
                "username": "noval",
                "full_name": "Noval (Sales Kertek)",
                "role": "sales",
                "branch_id": "BR-KERTEK",
                "password_hash": "$2a$10$0NtiL1b6DrAeEFdFB2YuWuI1IHwFAmqMSpQMClRA78jluOh91Y4TW",
                "active": "TRUE",
                "must_change_password": "FALSE",
                "token_version": 1,
                "failed_count": 0,
                "locked_until": "",
                "created_at": "2026-10-15T00:00:00Z"
        },
        {
                "_rowIndex": 4,
                "id": "USR-SLS-02",
                "username": "yakub",
                "full_name": "Yakub (Sales Wonosobo)",
                "role": "sales",
                "branch_id": "BR-WSB",
                "password_hash": "$2a$10$0NtiL1b6DrAeEFdFB2YuWuI1IHwFAmqMSpQMClRA78jluOh91Y4TW",
                "active": "TRUE",
                "must_change_password": "FALSE",
                "token_version": 1,
                "failed_count": 0,
                "locked_until": "",
                "created_at": "2026-10-15T00:00:00Z"
        },
        {
                "_rowIndex": 5,
                "id": "USR-SLS-03",
                "username": "mihrom",
                "full_name": "Mihrom (Sales Banjarnegara)",
                "role": "sales",
                "branch_id": "BR-BNA",
                "password_hash": "$2a$10$0NtiL1b6DrAeEFdFB2YuWuI1IHwFAmqMSpQMClRA78jluOh91Y4TW",
                "active": "TRUE",
                "must_change_password": "FALSE",
                "token_version": 1,
                "failed_count": 0,
                "locked_until": "",
                "created_at": "2026-10-15T00:00:00Z"
        },
        {
                "_rowIndex": 6,
                "id": "USR-SLS-04",
                "username": "salam",
                "full_name": "Salam (Sales Wonodadi)",
                "role": "sales",
                "branch_id": "BR-WND",
                "password_hash": "$2a$10$0NtiL1b6DrAeEFdFB2YuWuI1IHwFAmqMSpQMClRA78jluOh91Y4TW",
                "active": "TRUE",
                "must_change_password": "FALSE",
                "token_version": 1,
                "failed_count": 0,
                "locked_until": "",
                "created_at": "2026-10-15T00:00:00Z"
        },
        {
                "_rowIndex": 7,
                "id": "USR-SLS-05",
                "username": "huda",
                "full_name": "Huda (Sales Kejobong)",
                "role": "sales",
                "branch_id": "BR-KJB",
                "password_hash": "$2a$10$0NtiL1b6DrAeEFdFB2YuWuI1IHwFAmqMSpQMClRA78jluOh91Y4TW",
                "active": "TRUE",
                "must_change_password": "FALSE",
                "token_version": 1,
                "failed_count": 0,
                "locked_until": "",
                "created_at": "2026-10-15T00:00:00Z"
        },
        {
                "_rowIndex": 8,
                "id": "USR-SLS-06",
                "username": "eka",
                "full_name": "Eka (Sales Mandiraja)",
                "role": "sales",
                "branch_id": "BR-MDR",
                "password_hash": "$2a$10$0NtiL1b6DrAeEFdFB2YuWuI1IHwFAmqMSpQMClRA78jluOh91Y4TW",
                "active": "TRUE",
                "must_change_password": "FALSE",
                "token_version": 1,
                "failed_count": 0,
                "locked_until": "",
                "created_at": "2026-10-15T00:00:00Z"
        },
        {
                "_rowIndex": 9,
                "id": "USR-SLS-07",
                "username": "tefri",
                "full_name": "Tefri (Sales Purwokerto)",
                "role": "sales",
                "branch_id": "BR-PWT",
                "password_hash": "$2a$10$0NtiL1b6DrAeEFdFB2YuWuI1IHwFAmqMSpQMClRA78jluOh91Y4TW",
                "active": "TRUE",
                "must_change_password": "FALSE",
                "token_version": 1,
                "failed_count": 0,
                "locked_until": "",
                "created_at": "2026-10-15T00:00:00Z"
        },
        {
                "_rowIndex": 10,
                "id": "USR-DRV-01",
                "username": "driver1",
                "full_name": "Armada Driver 1 (Kertek - Wonosobo)",
                "role": "driver",
                "branch_id": "BR-KERTEK",
                "password_hash": "$2a$10$0NtiL1b6DrAeEFdFB2YuWuI1IHwFAmqMSpQMClRA78jluOh91Y4TW",
                "active": "TRUE",
                "must_change_password": "FALSE",
                "token_version": 1,
                "failed_count": 0,
                "locked_until": "",
                "created_at": "2026-10-15T00:00:00Z"
        },
        {
                "_rowIndex": 11,
                "id": "USR-DRV-02",
                "username": "driver2",
                "full_name": "Armada Driver 2 (Banjarnegara - Mandiraja)",
                "role": "driver",
                "branch_id": "BR-BNA",
                "password_hash": "$2a$10$0NtiL1b6DrAeEFdFB2YuWuI1IHwFAmqMSpQMClRA78jluOh91Y4TW",
                "active": "TRUE",
                "must_change_password": "FALSE",
                "token_version": 1,
                "failed_count": 0,
                "locked_until": "",
                "created_at": "2026-10-15T00:00:00Z"
        },
        {
                "_rowIndex": 12,
                "id": "USR-DRV-03",
                "username": "driver3",
                "full_name": "Armada Driver 3 (Purwokerto - Kejobong)",
                "role": "driver",
                "branch_id": "BR-PWT",
                "password_hash": "$2a$10$0NtiL1b6DrAeEFdFB2YuWuI1IHwFAmqMSpQMClRA78jluOh91Y4TW",
                "active": "TRUE",
                "must_change_password": "FALSE",
                "token_version": 1,
                "failed_count": 0,
                "locked_until": "",
                "created_at": "2026-10-15T00:00:00Z"
        }
];
      setCached(tabName, defaultUsers);
      return defaultUsers;
    }
    // CABANG RH FROZEN (KERTEK, WONOSOBO, BANJARNEGARA, WONODADI, KEJOBONG, MANDIRAJA, PURWOKERTO, GABUNGAN, FROZEN)
    if (tabName === 'Branches') {
      const defaultBranches = [
        {
                "_rowIndex": 2,
                "id": "BR-KERTEK",
                "name": "Cabang Kertek",
                "active": "TRUE",
                "paper_width": 58
        },
        {
                "_rowIndex": 3,
                "id": "BR-WSB",
                "name": "Cabang Wonosobo",
                "active": "TRUE",
                "paper_width": 80
        },
        {
                "_rowIndex": 4,
                "id": "BR-BNA",
                "name": "Cabang Banjarnegara",
                "active": "TRUE",
                "paper_width": 80
        },
        {
                "_rowIndex": 5,
                "id": "BR-WND",
                "name": "Cabang Wonodadi",
                "active": "TRUE",
                "paper_width": 58
        },
        {
                "_rowIndex": 6,
                "id": "BR-KJB",
                "name": "Cabang Kejobong",
                "active": "TRUE",
                "paper_width": 58
        },
        {
                "_rowIndex": 7,
                "id": "BR-MDR",
                "name": "Cabang Mandiraja",
                "active": "TRUE",
                "paper_width": 58
        },
        {
                "_rowIndex": 8,
                "id": "BR-PWT",
                "name": "Cabang Purwokerto",
                "active": "TRUE",
                "paper_width": 80
        },
        {
                "_rowIndex": 9,
                "id": "BR-GBG",
                "name": "Pusat / Gabungan",
                "active": "TRUE",
                "paper_width": 80
        },
        {
                "_rowIndex": 10,
                "id": "BR-FRZ",
                "name": "Outlet Frozen Express",
                "active": "TRUE",
                "paper_width": 58
        }
];
      setCached(tabName, defaultBranches);
      return defaultBranches;
    }
    // PRODUK FROZEN FOOD RIIL DARI REKAP HARIAN RH FROZEN
    if (tabName === 'Products') {
      const defaultProducts = [
        {
                "_rowIndex": 2,
                "id": "p1",
                "name": "Candi Cm",
                "category": "Bakso & Daging",
                "price": 4500,
                "cost_price": 3500,
                "stock": 2600,
                "emoji": "\ud83e\udd69",
                "active": "TRUE"
        },
        {
                "_rowIndex": 3,
                "id": "p2",
                "name": "Candi Cs",
                "category": "Bakso & Daging",
                "price": 11000,
                "cost_price": 9000,
                "stock": 475,
                "emoji": "\ud83e\udd69",
                "active": "TRUE"
        },
        {
                "_rowIndex": 4,
                "id": "p3",
                "name": "Candi Bc",
                "category": "Bakso & Daging",
                "price": 5500,
                "cost_price": 4500,
                "stock": 2600,
                "emoji": "\ud83e\udd69",
                "active": "TRUE"
        },
        {
                "_rowIndex": 5,
                "id": "p4",
                "name": "Candi CJ",
                "category": "Bakso & Daging",
                "price": 21000,
                "cost_price": 17500,
                "stock": 150,
                "emoji": "\ud83e\udd69",
                "active": "TRUE"
        },
        {
                "_rowIndex": 6,
                "id": "p5",
                "name": "Candi Tenis",
                "category": "Bakso & Daging",
                "price": 17500,
                "cost_price": 14000,
                "stock": 0,
                "emoji": "\ud83e\udd69",
                "active": "TRUE"
        },
        {
                "_rowIndex": 7,
                "id": "p6",
                "name": "Candi Kg",
                "category": "Bakso & Daging",
                "price": 30000,
                "cost_price": 25000,
                "stock": 50,
                "emoji": "\ud83e\udd69",
                "active": "TRUE"
        },
        {
                "_rowIndex": 8,
                "id": "p7",
                "name": "Mie Bulat",
                "category": "Mie & Pasta",
                "price": 19500,
                "cost_price": 16000,
                "stock": 120,
                "emoji": "\ud83c\udf5c",
                "active": "TRUE"
        },
        {
                "_rowIndex": 9,
                "id": "p8",
                "name": "Mie Kriting",
                "category": "Mie & Pasta",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\ud83c\udf5c",
                "active": "TRUE"
        },
        {
                "_rowIndex": 10,
                "id": "p9",
                "name": "And Oren k",
                "category": "Frozen Food",
                "price": 4500,
                "cost_price": 3500,
                "stock": 2000,
                "emoji": "\u2744\ufe0f",
                "active": "TRUE"
        },
        {
                "_rowIndex": 11,
                "id": "p10",
                "name": "And Merah b",
                "category": "Frozen Food",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\u2744\ufe0f",
                "active": "TRUE"
        },
        {
                "_rowIndex": 12,
                "id": "p11",
                "name": "And Merah k",
                "category": "Frozen Food",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\u2744\ufe0f",
                "active": "TRUE"
        },
        {
                "_rowIndex": 13,
                "id": "p12",
                "name": "And Jumbo",
                "category": "Frozen Food",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\u2744\ufe0f",
                "active": "TRUE"
        },
        {
                "_rowIndex": 14,
                "id": "p13",
                "name": "Taso",
                "category": "Camilan & Gorengan",
                "price": 8500,
                "cost_price": 6500,
                "stock": 40,
                "emoji": "\ud83c\udf58",
                "active": "TRUE"
        },
        {
                "_rowIndex": 15,
                "id": "p14",
                "name": "Gelatin",
                "category": "Camilan & Gorengan",
                "price": 4500,
                "cost_price": 3500,
                "stock": 25,
                "emoji": "\ud83c\udf58",
                "active": "TRUE"
        },
        {
                "_rowIndex": 16,
                "id": "p15",
                "name": "Men Ijo",
                "category": "Frozen Food",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\u2744\ufe0f",
                "active": "TRUE"
        },
        {
                "_rowIndex": 17,
                "id": "p16",
                "name": "Men oren",
                "category": "Frozen Food",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\u2744\ufe0f",
                "active": "TRUE"
        },
        {
                "_rowIndex": 18,
                "id": "p17",
                "name": "Yuda Besar",
                "category": "Frozen Food",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\u2744\ufe0f",
                "active": "TRUE"
        },
        {
                "_rowIndex": 19,
                "id": "p18",
                "name": "Yuda Kecil",
                "category": "Frozen Food",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\u2744\ufe0f",
                "active": "TRUE"
        },
        {
                "_rowIndex": 20,
                "id": "p19",
                "name": "Bakso Krikil",
                "category": "Bakso & Daging",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\ud83e\udd69",
                "active": "TRUE"
        },
        {
                "_rowIndex": 21,
                "id": "p20",
                "name": "Bogem",
                "category": "Bakso & Daging",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\ud83e\udd69",
                "active": "TRUE"
        },
        {
                "_rowIndex": 22,
                "id": "p21",
                "name": "NR isi 10",
                "category": "Frozen Food",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\u2744\ufe0f",
                "active": "TRUE"
        },
        {
                "_rowIndex": 23,
                "id": "p22",
                "name": "Pangsit Kotak",
                "category": "Dimsum & Pangsit",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\ud83e\udd5f",
                "active": "TRUE"
        },
        {
                "_rowIndex": 24,
                "id": "p23",
                "name": "Pangsit kecil",
                "category": "Dimsum & Pangsit",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\ud83e\udd5f",
                "active": "TRUE"
        },
        {
                "_rowIndex": 25,
                "id": "p24",
                "name": "Pangsit Bunder",
                "category": "Dimsum & Pangsit",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\ud83e\udd5f",
                "active": "TRUE"
        },
        {
                "_rowIndex": 26,
                "id": "p25",
                "name": "Pangsit siomay",
                "category": "Dimsum & Pangsit",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\ud83e\udd5f",
                "active": "TRUE"
        },
        {
                "_rowIndex": 27,
                "id": "p26",
                "name": "Taso NR",
                "category": "Camilan & Gorengan",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\ud83c\udf58",
                "active": "TRUE"
        },
        {
                "_rowIndex": 28,
                "id": "p27",
                "name": "Mie ayam SR",
                "category": "Mie & Pasta",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\ud83c\udf5c",
                "active": "TRUE"
        },
        {
                "_rowIndex": 29,
                "id": "p28",
                "name": "Rizky 20",
                "category": "Frozen Food",
                "price": 5500,
                "cost_price": 4500,
                "stock": 600,
                "emoji": "\u2744\ufe0f",
                "active": "TRUE"
        },
        {
                "_rowIndex": 30,
                "id": "p29",
                "name": "Rizky 10",
                "category": "Frozen Food",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\u2744\ufe0f",
                "active": "TRUE"
        },
        {
                "_rowIndex": 31,
                "id": "p30",
                "name": "Asoy  cireng",
                "category": "Camilan & Gorengan",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\ud83c\udf58",
                "active": "TRUE"
        },
        {
                "_rowIndex": 32,
                "id": "p31",
                "name": "Sejati 10",
                "category": "Frozen Food",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\u2744\ufe0f",
                "active": "TRUE"
        },
        {
                "_rowIndex": 33,
                "id": "p32",
                "name": "Sejati 20",
                "category": "Frozen Food",
                "price": 5500,
                "cost_price": 4500,
                "stock": 1500,
                "emoji": "\u2744\ufe0f",
                "active": "TRUE"
        },
        {
                "_rowIndex": 34,
                "id": "p33",
                "name": "Cetatul",
                "category": "Frozen Food",
                "price": 7500,
                "cost_price": 5500,
                "stock": 10,
                "emoji": "\u2744\ufe0f",
                "active": "TRUE"
        },
        {
                "_rowIndex": 35,
                "id": "p34",
                "name": "Hemato",
                "category": "Nugget & Ayam",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\ud83c\udf57",
                "active": "TRUE"
        },
        {
                "_rowIndex": 36,
                "id": "p35",
                "name": "Chic chic",
                "category": "Nugget & Ayam",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\ud83c\udf57",
                "active": "TRUE"
        },
        {
                "_rowIndex": 37,
                "id": "p36",
                "name": "Suri",
                "category": "Nugget & Ayam",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\ud83c\udf57",
                "active": "TRUE"
        },
        {
                "_rowIndex": 38,
                "id": "p37",
                "name": "So eco Crspy",
                "category": "Nugget & Ayam",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\ud83c\udf57",
                "active": "TRUE"
        },
        {
                "_rowIndex": 39,
                "id": "p38",
                "name": "Sobat",
                "category": "Nugget & Ayam",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\ud83c\udf57",
                "active": "TRUE"
        },
        {
                "_rowIndex": 40,
                "id": "p39",
                "name": "Chic\" sosis",
                "category": "Sosis",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\ud83c\udf2d",
                "active": "TRUE"
        },
        {
                "_rowIndex": 41,
                "id": "p40",
                "name": "Hemto somer",
                "category": "Dimsum & Pangsit",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\ud83e\udd5f",
                "active": "TRUE"
        },
        {
                "_rowIndex": 42,
                "id": "p41",
                "name": "Belfood",
                "category": "Nugget & Ayam",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\ud83c\udf57",
                "active": "TRUE"
        },
        {
                "_rowIndex": 43,
                "id": "p42",
                "name": "Sonice",
                "category": "Sosis",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\ud83c\udf2d",
                "active": "TRUE"
        },
        {
                "_rowIndex": 44,
                "id": "p43",
                "name": "Toples sosis",
                "category": "Sosis",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\ud83c\udf2d",
                "active": "TRUE"
        },
        {
                "_rowIndex": 45,
                "id": "p44",
                "name": "Rakit otak\"",
                "category": "Camilan & Gorengan",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\ud83c\udf58",
                "active": "TRUE"
        },
        {
                "_rowIndex": 46,
                "id": "p45",
                "name": "Jogya kwetio",
                "category": "Mie & Pasta",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\ud83c\udf5c",
                "active": "TRUE"
        },
        {
                "_rowIndex": 47,
                "id": "p46",
                "name": "Kuning",
                "category": "Frozen Food",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\u2744\ufe0f",
                "active": "TRUE"
        },
        {
                "_rowIndex": 48,
                "id": "p47",
                "name": "Lumpia B",
                "category": "Dimsum & Pangsit",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\ud83e\udd5f",
                "active": "TRUE"
        },
        {
                "_rowIndex": 49,
                "id": "p48",
                "name": "Lumpia k",
                "category": "Dimsum & Pangsit",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\ud83e\udd5f",
                "active": "TRUE"
        },
        {
                "_rowIndex": 50,
                "id": "p49",
                "name": "Rakit cireng",
                "category": "Camilan & Gorengan",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\ud83c\udf58",
                "active": "TRUE"
        },
        {
                "_rowIndex": 51,
                "id": "p50",
                "name": "Salam Somer",
                "category": "Dimsum & Pangsit",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\ud83e\udd5f",
                "active": "TRUE"
        },
        {
                "_rowIndex": 52,
                "id": "p51",
                "name": "Salam Bakar",
                "category": "Frozen Food",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\u2744\ufe0f",
                "active": "TRUE"
        },
        {
                "_rowIndex": 53,
                "id": "p52",
                "name": "Salam Ori",
                "category": "Frozen Food",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\u2744\ufe0f",
                "active": "TRUE"
        },
        {
                "_rowIndex": 54,
                "id": "p53",
                "name": "Salam Stik",
                "category": "Frozen Food",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\u2744\ufe0f",
                "active": "TRUE"
        },
        {
                "_rowIndex": 55,
                "id": "p54",
                "name": "Salam Hati",
                "category": "Frozen Food",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\u2744\ufe0f",
                "active": "TRUE"
        },
        {
                "_rowIndex": 56,
                "id": "p55",
                "name": "salam crispy",
                "category": "Frozen Food",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\u2744\ufe0f",
                "active": "TRUE"
        },
        {
                "_rowIndex": 57,
                "id": "p56",
                "name": "Pangsit intan",
                "category": "Dimsum & Pangsit",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\ud83e\udd5f",
                "active": "TRUE"
        },
        {
                "_rowIndex": 58,
                "id": "p57",
                "name": "Asoy henza",
                "category": "Frozen Food",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\u2744\ufe0f",
                "active": "TRUE"
        },
        {
                "_rowIndex": 59,
                "id": "p58",
                "name": "Asin B",
                "category": "Camilan & Gorengan",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\ud83c\udf58",
                "active": "TRUE"
        },
        {
                "_rowIndex": 60,
                "id": "p59",
                "name": "Asin K",
                "category": "Camilan & Gorengan",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\ud83c\udf58",
                "active": "TRUE"
        },
        {
                "_rowIndex": 61,
                "id": "p60",
                "name": "Balok coklat",
                "category": "Kue & Roti",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\ud83c\udf5e",
                "active": "TRUE"
        },
        {
                "_rowIndex": 62,
                "id": "p61",
                "name": "Balok pandan",
                "category": "Kue & Roti",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\ud83c\udf5e",
                "active": "TRUE"
        },
        {
                "_rowIndex": 63,
                "id": "p62",
                "name": "Balok Taro",
                "category": "Kue & Roti",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\ud83c\udf5e",
                "active": "TRUE"
        },
        {
                "_rowIndex": 64,
                "id": "p63",
                "name": "Lapis legit",
                "category": "Kue & Roti",
                "price": 13000,
                "cost_price": 10000,
                "stock": 0,
                "emoji": "\ud83c\udf5e",
                "active": "TRUE"
        },
        {
                "_rowIndex": 65,
                "id": "p64",
                "name": "Bronis coklat",
                "category": "Kue & Roti",
                "price": 4300,
                "cost_price": 3300,
                "stock": 0,
                "emoji": "\ud83c\udf5e",
                "active": "TRUE"
        },
        {
                "_rowIndex": 66,
                "id": "p65",
                "name": "Bronis Pandan",
                "category": "Kue & Roti",
                "price": 4300,
                "cost_price": 3300,
                "stock": 0,
                "emoji": "\ud83c\udf5e",
                "active": "TRUE"
        },
        {
                "_rowIndex": 67,
                "id": "p66",
                "name": "Bronis tape",
                "category": "Kue & Roti",
                "price": 4300,
                "cost_price": 3300,
                "stock": 0,
                "emoji": "\ud83c\udf5e",
                "active": "TRUE"
        },
        {
                "_rowIndex": 68,
                "id": "p67",
                "name": "Bronis Lumer",
                "category": "Kue & Roti",
                "price": 4300,
                "cost_price": 3300,
                "stock": 0,
                "emoji": "\ud83c\udf5e",
                "active": "TRUE"
        },
        {
                "_rowIndex": 69,
                "id": "p68",
                "name": "Mantap B",
                "category": "Frozen Food",
                "price": 28500,
                "cost_price": 23500,
                "stock": 0,
                "emoji": "\u2744\ufe0f",
                "active": "TRUE"
        }
];
      setCached(tabName, defaultProducts);
      return defaultProducts;
    }
    // PELANGGAN / OUTLET TOKO PER AREA CABANG
    if (tabName === 'Customers') {
      const defaultCustomers = [
        {
                "_rowIndex": 2,
                "id": "c1",
                "name": "Toko Kertek Frozen (Noval)",
                "address": "Jl. Kertek - Wonosobo Km 3",
                "phone": "081223344551",
                "branch_id": "BR-KERTEK",
                "sales_id": "USR-SLS-01",
                "balance": 0,
                "credit_limit": 15000000,
                "term_days": 14,
                "active": "TRUE"
        },
        {
                "_rowIndex": 3,
                "id": "c2",
                "name": "Toko Wonosobo Frozen (Yakub)",
                "address": "Pasar Induk Wonosobo Blok B",
                "phone": "081223344552",
                "branch_id": "BR-WSB",
                "sales_id": "USR-SLS-02",
                "balance": 0,
                "credit_limit": 20000000,
                "term_days": 14,
                "active": "TRUE"
        },
        {
                "_rowIndex": 4,
                "id": "c3",
                "name": "Toko Banjarnegara Frozen (Mihrom)",
                "address": "Jl. Pemuda No. 45, Banjarnegara",
                "phone": "081223344553",
                "branch_id": "BR-BNA",
                "sales_id": "USR-SLS-03",
                "balance": 0,
                "credit_limit": 25000000,
                "term_days": 14,
                "active": "TRUE"
        },
        {
                "_rowIndex": 5,
                "id": "c4",
                "name": "Toko Wonodadi Frozen (Salam)",
                "address": "Jl. Raya Wonodadi No. 18",
                "phone": "081223344554",
                "branch_id": "BR-WND",
                "sales_id": "USR-SLS-04",
                "balance": 0,
                "credit_limit": 10000000,
                "term_days": 7,
                "active": "TRUE"
        },
        {
                "_rowIndex": 6,
                "id": "c5",
                "name": "Toko Kejobong Frozen (Huda)",
                "address": "Pasar Kejobong Kios 12",
                "phone": "081223344555",
                "branch_id": "BR-KJB",
                "sales_id": "USR-SLS-05",
                "balance": 0,
                "credit_limit": 8000000,
                "term_days": 7,
                "active": "TRUE"
        },
        {
                "_rowIndex": 7,
                "id": "c6",
                "name": "Toko Mandiraja Frozen (Eka)",
                "address": "Jl. Raya Mandiraja No. 88",
                "phone": "081223344556",
                "branch_id": "BR-MDR",
                "sales_id": "USR-SLS-06",
                "balance": 0,
                "credit_limit": 10000000,
                "term_days": 14,
                "active": "TRUE"
        },
        {
                "_rowIndex": 8,
                "id": "c7",
                "name": "Toko Purwokerto Frozen (Tefri)",
                "address": "Jl. Jenderal Soedirman No. 120, Purwokerto",
                "phone": "081223344557",
                "branch_id": "BR-PWT",
                "sales_id": "USR-SLS-07",
                "balance": 0,
                "credit_limit": 30000000,
                "term_days": 21,
                "active": "TRUE"
        },
        {
                "_rowIndex": 9,
                "id": "c8",
                "name": "Distributor Gabungan Pusat",
                "address": "Kompleks Pergudangan RH Frozen",
                "phone": "081223344558",
                "branch_id": "BR-GBG",
                "sales_id": "",
                "balance": 0,
                "credit_limit": 50000000,
                "term_days": 30,
                "active": "TRUE"
        },
        {
                "_rowIndex": 10,
                "id": "c9",
                "name": "Outlet RH Frozen Express",
                "address": "Jl. Raya Dieng No. 14, Wonosobo",
                "phone": "081223344559",
                "branch_id": "BR-FRZ",
                "sales_id": "",
                "balance": 0,
                "credit_limit": 15000000,
                "term_days": 7,
                "active": "TRUE"
        }
];
      setCached(tabName, defaultCustomers);
      return defaultCustomers;
    }

    // DATA TRANSAKSI: ORDERS RIIL
    if (tabName === 'Orders') {
      const defaultOrders = [
        {
                "_rowIndex": 2,
                "id": "ORD-001",
                "order_no": "ORD-2026-001",
                "customer_id": "c1",
                "branch_id": "BR-KERTEK",
                "sales_id": "USR-SLS-01",
                "order_date": "2026-10-15",
                "status": "Selesai",
                "note": "Order harian Cabang Kertek (Noval)",
                "created_at": "2026-10-15T08:15:00Z"
        },
        {
                "_rowIndex": 3,
                "id": "ORD-002",
                "order_no": "ORD-2026-002",
                "customer_id": "c2",
                "branch_id": "BR-WSB",
                "sales_id": "USR-SLS-02",
                "order_date": "2026-10-16",
                "status": "Selesai",
                "note": "Order harian Cabang Wonosobo (Yakub)",
                "created_at": "2026-10-16T08:20:00Z"
        },
        {
                "_rowIndex": 4,
                "id": "ORD-003",
                "order_no": "ORD-2026-003",
                "customer_id": "c3",
                "branch_id": "BR-BNA",
                "sales_id": "USR-SLS-03",
                "order_date": "2026-10-17",
                "status": "Selesai",
                "note": "Order harian Cabang Banjarnegara (Mihrom)",
                "created_at": "2026-10-17T08:25:00Z"
        },
        {
                "_rowIndex": 5,
                "id": "ORD-004",
                "order_no": "ORD-2026-004",
                "customer_id": "c4",
                "branch_id": "BR-WND",
                "sales_id": "USR-SLS-04",
                "order_date": "2026-10-18",
                "status": "Selesai",
                "note": "Order harian Cabang Wonodadi (Salam)",
                "created_at": "2026-10-18T08:30:00Z"
        },
        {
                "_rowIndex": 6,
                "id": "ORD-005",
                "order_no": "ORD-2026-005",
                "customer_id": "c5",
                "branch_id": "BR-KJB",
                "sales_id": "USR-SLS-05",
                "order_date": "2026-10-19",
                "status": "Selesai",
                "note": "Order harian Cabang Kejobong (Huda)",
                "created_at": "2026-10-19T08:35:00Z"
        },
        {
                "_rowIndex": 7,
                "id": "ORD-006",
                "order_no": "ORD-2026-006",
                "customer_id": "c6",
                "branch_id": "BR-MDR",
                "sales_id": "USR-SLS-06",
                "order_date": "2026-10-20",
                "status": "Selesai",
                "note": "Order harian Cabang Mandiraja (Eka)",
                "created_at": "2026-10-20T08:40:00Z"
        },
        {
                "_rowIndex": 8,
                "id": "ORD-007",
                "order_no": "ORD-2026-007",
                "customer_id": "c7",
                "branch_id": "BR-PWT",
                "sales_id": "USR-SLS-07",
                "order_date": "2026-10-21",
                "status": "Selesai",
                "note": "Order harian Cabang Purwokerto (Tefri)",
                "created_at": "2026-10-21T08:45:00Z"
        },
        {
                "_rowIndex": 9,
                "id": "ORD-008",
                "order_no": "ORD-2026-008",
                "customer_id": "c8",
                "branch_id": "BR-GBG",
                "sales_id": "USR-ADMIN-01",
                "order_date": "2026-10-15",
                "status": "Proses",
                "note": "Order harian Cabang Gabungan (Admin)",
                "created_at": "2026-10-15T08:50:00Z"
        },
        {
                "_rowIndex": 10,
                "id": "ORD-009",
                "order_no": "ORD-2026-009",
                "customer_id": "c9",
                "branch_id": "BR-FRZ",
                "sales_id": "USR-ADMIN-01",
                "order_date": "2026-10-16",
                "status": "Proses",
                "note": "Order harian Cabang Frozen (Admin)",
                "created_at": "2026-10-16T08:55:00Z"
        }
];
      setCached(tabName, defaultOrders);
      return defaultOrders;
    }

    // DATA TRANSAKSI: ORDER ITEMS RIIL
    if (tabName === 'OrderItems') {
      const defaultOrderItems = [
        {
                "_rowIndex": 2,
                "order_id": "ORD-001",
                "product_id": "p1",
                "qty": 600,
                "price": 4500,
                "discount": 0
        },
        {
                "_rowIndex": 3,
                "order_id": "ORD-001",
                "product_id": "p2",
                "qty": 100,
                "price": 11000,
                "discount": 0
        },
        {
                "_rowIndex": 4,
                "order_id": "ORD-001",
                "product_id": "p3",
                "qty": 350,
                "price": 5500,
                "discount": 0
        },
        {
                "_rowIndex": 5,
                "order_id": "ORD-001",
                "product_id": "p7",
                "qty": 20,
                "price": 19500,
                "discount": 0
        },
        {
                "_rowIndex": 6,
                "order_id": "ORD-002",
                "product_id": "p1",
                "qty": 800,
                "price": 4500,
                "discount": 0
        },
        {
                "_rowIndex": 7,
                "order_id": "ORD-002",
                "product_id": "p2",
                "qty": 200,
                "price": 11000,
                "discount": 0
        },
        {
                "_rowIndex": 8,
                "order_id": "ORD-002",
                "product_id": "p3",
                "qty": 325,
                "price": 5500,
                "discount": 0
        },
        {
                "_rowIndex": 9,
                "order_id": "ORD-002",
                "product_id": "p7",
                "qty": 45,
                "price": 19500,
                "discount": 0
        },
        {
                "_rowIndex": 10,
                "order_id": "ORD-003",
                "product_id": "p1",
                "qty": 1100,
                "price": 4500,
                "discount": 0
        },
        {
                "_rowIndex": 11,
                "order_id": "ORD-003",
                "product_id": "p2",
                "qty": 150,
                "price": 11000,
                "discount": 0
        },
        {
                "_rowIndex": 12,
                "order_id": "ORD-003",
                "product_id": "p3",
                "qty": 1350,
                "price": 5500,
                "discount": 0
        },
        {
                "_rowIndex": 13,
                "order_id": "ORD-003",
                "product_id": "p7",
                "qty": 35,
                "price": 19500,
                "discount": 0
        },
        {
                "_rowIndex": 14,
                "order_id": "ORD-004",
                "product_id": "p1",
                "qty": 50,
                "price": 4500,
                "discount": 0
        },
        {
                "_rowIndex": 15,
                "order_id": "ORD-004",
                "product_id": "p3",
                "qty": 20,
                "price": 5500,
                "discount": 0
        },
        {
                "_rowIndex": 16,
                "order_id": "ORD-005",
                "product_id": "p3",
                "qty": 100,
                "price": 5500,
                "discount": 0
        },
        {
                "_rowIndex": 17,
                "order_id": "ORD-005",
                "product_id": "p7",
                "qty": 3,
                "price": 19500,
                "discount": 0
        },
        {
                "_rowIndex": 18,
                "order_id": "ORD-005",
                "product_id": "p13",
                "qty": 10,
                "price": 8500,
                "discount": 0
        },
        {
                "_rowIndex": 19,
                "order_id": "ORD-005",
                "product_id": "p26",
                "qty": 60,
                "price": 13000,
                "discount": 0
        },
        {
                "_rowIndex": 20,
                "order_id": "ORD-006",
                "product_id": "p3",
                "qty": 50,
                "price": 5500,
                "discount": 0
        },
        {
                "_rowIndex": 21,
                "order_id": "ORD-006",
                "product_id": "p7",
                "qty": 2,
                "price": 19500,
                "discount": 0
        },
        {
                "_rowIndex": 22,
                "order_id": "ORD-006",
                "product_id": "p9",
                "qty": 30,
                "price": 4500,
                "discount": 0
        },
        {
                "_rowIndex": 23,
                "order_id": "ORD-006",
                "product_id": "p22",
                "qty": 1,
                "price": 13000,
                "discount": 0
        },
        {
                "_rowIndex": 24,
                "order_id": "ORD-007",
                "product_id": "p3",
                "qty": 50,
                "price": 5500,
                "discount": 0
        },
        {
                "_rowIndex": 25,
                "order_id": "ORD-007",
                "product_id": "p7",
                "qty": 5,
                "price": 19500,
                "discount": 0
        },
        {
                "_rowIndex": 26,
                "order_id": "ORD-007",
                "product_id": "p9",
                "qty": 100,
                "price": 4500,
                "discount": 0
        },
        {
                "_rowIndex": 27,
                "order_id": "ORD-007",
                "product_id": "p19",
                "qty": 60,
                "price": 13000,
                "discount": 0
        },
        {
                "_rowIndex": 28,
                "order_id": "ORD-008",
                "product_id": "p3",
                "qty": 50,
                "price": 5500,
                "discount": 0
        },
        {
                "_rowIndex": 29,
                "order_id": "ORD-008",
                "product_id": "p14",
                "qty": 10,
                "price": 4500,
                "discount": 0
        },
        {
                "_rowIndex": 30,
                "order_id": "ORD-008",
                "product_id": "p15",
                "qty": 75,
                "price": 13000,
                "discount": 0
        },
        {
                "_rowIndex": 31,
                "order_id": "ORD-008",
                "product_id": "p16",
                "qty": 75,
                "price": 13000,
                "discount": 0
        },
        {
                "_rowIndex": 32,
                "order_id": "ORD-009",
                "product_id": "p2",
                "qty": 25,
                "price": 11000,
                "discount": 0
        },
        {
                "_rowIndex": 33,
                "order_id": "ORD-009",
                "product_id": "p3",
                "qty": 50,
                "price": 5500,
                "discount": 0
        },
        {
                "_rowIndex": 34,
                "order_id": "ORD-009",
                "product_id": "p4",
                "qty": 150,
                "price": 21000,
                "discount": 0
        },
        {
                "_rowIndex": 35,
                "order_id": "ORD-009",
                "product_id": "p6",
                "qty": 50,
                "price": 30000,
                "discount": 0
        }
];
      setCached(tabName, defaultOrderItems);
      return defaultOrderItems;
    }

    // DATA TRANSAKSI: INVOICES (FAKTUR PENJUALAN) RIIL
    if (tabName === 'Invoices') {
      const defaultInvoices = [
        {
                "_rowIndex": 2,
                "id": "INV-001",
                "invoice_no": "INV-2026-001",
                "order_id": "ORD-001",
                "customer_id": "c1",
                "customer_name": "Toko Kertek Frozen (Noval)",
                "branch_id": "BR-KERTEK",
                "sales_id": "USR-SLS-01",
                "invoice_date": "2026-10-15",
                "invoice_time": "09:10:00",
                "subtotal": 6115000,
                "discount": 0,
                "total_amount": 6115000,
                "pay_method": "Tunai",
                "status": "Lunas",
                "driver_id": "USR-DRV-01"
        },
        {
                "_rowIndex": 3,
                "id": "INV-002",
                "invoice_no": "INV-2026-002",
                "order_id": "ORD-002",
                "customer_id": "c2",
                "customer_name": "Toko Wonosobo Frozen (Yakub)",
                "branch_id": "BR-WSB",
                "sales_id": "USR-SLS-02",
                "invoice_date": "2026-10-16",
                "invoice_time": "09:15:00",
                "subtotal": 8465000,
                "discount": 0,
                "total_amount": 8465000,
                "pay_method": "Transfer",
                "status": "Lunas",
                "driver_id": "USR-DRV-02"
        },
        {
                "_rowIndex": 4,
                "id": "INV-003",
                "invoice_no": "INV-2026-003",
                "order_id": "ORD-003",
                "customer_id": "c3",
                "customer_name": "Toko Banjarnegara Frozen (Mihrom)",
                "branch_id": "BR-BNA",
                "sales_id": "USR-SLS-03",
                "invoice_date": "2026-10-17",
                "invoice_time": "09:20:00",
                "subtotal": 14707500,
                "discount": 0,
                "total_amount": 14707500,
                "pay_method": "Tunai",
                "status": "Lunas",
                "driver_id": "USR-DRV-03"
        },
        {
                "_rowIndex": 5,
                "id": "INV-004",
                "invoice_no": "INV-2026-004",
                "order_id": "ORD-004",
                "customer_id": "c4",
                "customer_name": "Toko Wonodadi Frozen (Salam)",
                "branch_id": "BR-WND",
                "sales_id": "USR-SLS-04",
                "invoice_date": "2026-10-18",
                "invoice_time": "09:25:00",
                "subtotal": 335000,
                "discount": 0,
                "total_amount": 335000,
                "pay_method": "Transfer",
                "status": "Lunas",
                "driver_id": "USR-DRV-04"
        },
        {
                "_rowIndex": 6,
                "id": "INV-005",
                "invoice_no": "INV-2026-005",
                "order_id": "ORD-005",
                "customer_id": "c5",
                "customer_name": "Toko Kejobong Frozen (Huda)",
                "branch_id": "BR-KJB",
                "sales_id": "USR-SLS-05",
                "invoice_date": "2026-10-19",
                "invoice_time": "09:30:00",
                "subtotal": 1473500,
                "discount": 0,
                "total_amount": 1473500,
                "pay_method": "Tunai",
                "status": "Lunas",
                "driver_id": "USR-DRV-05"
        },
        {
                "_rowIndex": 7,
                "id": "INV-006",
                "invoice_no": "INV-2026-006",
                "order_id": "ORD-006",
                "customer_id": "c6",
                "customer_name": "Toko Mandiraja Frozen (Eka)",
                "branch_id": "BR-MDR",
                "sales_id": "USR-SLS-06",
                "invoice_date": "2026-10-20",
                "invoice_time": "09:35:00",
                "subtotal": 462000,
                "discount": 0,
                "total_amount": 462000,
                "pay_method": "Transfer",
                "status": "Lunas",
                "driver_id": "USR-DRV-01"
        },
        {
                "_rowIndex": 8,
                "id": "INV-007",
                "invoice_no": "INV-2026-007",
                "order_id": "ORD-007",
                "customer_id": "c7",
                "customer_name": "Toko Purwokerto Frozen (Tefri)",
                "branch_id": "BR-PWT",
                "sales_id": "USR-SLS-07",
                "invoice_date": "2026-10-21",
                "invoice_time": "09:40:00",
                "subtotal": 1602500,
                "discount": 0,
                "total_amount": 1602500,
                "pay_method": "Tunai",
                "status": "Belum Lunas",
                "driver_id": "USR-DRV-02"
        },
        {
                "_rowIndex": 9,
                "id": "INV-008",
                "invoice_no": "INV-2026-008",
                "order_id": "ORD-008",
                "customer_id": "c8",
                "customer_name": "Distributor Gabungan Pusat",
                "branch_id": "BR-GBG",
                "sales_id": "USR-ADMIN-01",
                "invoice_date": "2026-10-15",
                "invoice_time": "09:45:00",
                "subtotal": 2270000,
                "discount": 0,
                "total_amount": 2270000,
                "pay_method": "Transfer",
                "status": "Belum Lunas",
                "driver_id": "USR-DRV-03"
        },
        {
                "_rowIndex": 10,
                "id": "INV-009",
                "invoice_no": "INV-2026-009",
                "order_id": "ORD-009",
                "customer_id": "c9",
                "customer_name": "Outlet RH Frozen Express",
                "branch_id": "BR-FRZ",
                "sales_id": "USR-ADMIN-01",
                "invoice_date": "2026-10-16",
                "invoice_time": "09:50:00",
                "subtotal": 5200000,
                "discount": 0,
                "total_amount": 5200000,
                "pay_method": "Tunai",
                "status": "Belum Lunas",
                "driver_id": "USR-DRV-04"
        }
];
      setCached(tabName, defaultInvoices);
      return defaultInvoices;
    }

    // DATA TRANSAKSI: PAYMENTS RIIL
    if (tabName === 'Payments') {
      const defaultPayments = [
        {
                "_rowIndex": 2,
                "id": "PAY-001",
                "invoice_id": "INV-001",
                "customer_id": "c1",
                "amount": 6115000,
                "method": "Tunai",
                "payment_date": "2026-10-15"
        },
        {
                "_rowIndex": 3,
                "id": "PAY-002",
                "invoice_id": "INV-002",
                "customer_id": "c2",
                "amount": 8465000,
                "method": "Transfer",
                "payment_date": "2026-10-16"
        },
        {
                "_rowIndex": 4,
                "id": "PAY-003",
                "invoice_id": "INV-003",
                "customer_id": "c3",
                "amount": 14707500,
                "method": "Tunai",
                "payment_date": "2026-10-17"
        },
        {
                "_rowIndex": 5,
                "id": "PAY-004",
                "invoice_id": "INV-004",
                "customer_id": "c4",
                "amount": 335000,
                "method": "Transfer",
                "payment_date": "2026-10-18"
        },
        {
                "_rowIndex": 6,
                "id": "PAY-005",
                "invoice_id": "INV-005",
                "customer_id": "c5",
                "amount": 1473500,
                "method": "Tunai",
                "payment_date": "2026-10-19"
        },
        {
                "_rowIndex": 7,
                "id": "PAY-006",
                "invoice_id": "INV-006",
                "customer_id": "c6",
                "amount": 462000,
                "method": "Transfer",
                "payment_date": "2026-10-20"
        }
];
      setCached(tabName, defaultPayments);
      return defaultPayments;
    }
    return [];
  }

  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${tabName}!A:Z`
  });

  const rows = res.data.values || [];
  if (rows.length <= 1) {
    setCached(tabName, []);
    return [];
  }

  const headers = rows[0];
  const items = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const item = { _rowIndex: i + 1 };
    for (let j = 0; j < headers.length; j++) {
      item[headers[j]] = desanitizeText(row[j] !== undefined ? row[j] : '');
    }
    items.push(item);
  }

  setCached(tabName, items);
  return items;
}

/**
 * Membaca banyak tab sekaligus dengan values.batchGet
 */
export async function getTabsBatch(tabNames) {
  const result = {};
  const missingTabs = [];

  for (const tab of tabNames) {
    const cached = getCached(tab);
    if (cached) {
      result[tab] = cached;
    } else {
      missingTabs.push(tab);
    }
  }

  if (missingTabs.length === 0) return result;

  // Jika Google Service Account belum dikonfigurasi, gunakan fallback aman lokal
  if (!SA_EMAIL || !SA_KEY) {
    for (const tab of missingTabs) {
      result[tab] = await getTabRows(tab);
    }
    return result;
  }

  const sheets = getSheetsClient();
  const ranges = missingTabs.map(t => `${t}!A:Z`);
  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: SPREADSHEET_ID,
    ranges
  });

  const valueRanges = res.data.valueRanges || [];
  for (let i = 0; i < missingTabs.length; i++) {
    const tabName = missingTabs[i];
    const rows = valueRanges[i]?.values || [];
    if (rows.length <= 1) {
      result[tabName] = [];
      setCached(tabName, []);
      continue;
    }
    const headers = rows[0];
    const items = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const item = { _rowIndex: r + 1 };
      for (let c = 0; c < headers.length; c++) {
        item[headers[c]] = desanitizeText(row[c] !== undefined ? row[c] : '');
      }
      items.push(item);
    }
    result[tabName] = items;
    setCached(tabName, items);
  }

  return result;
}

import { callGas } from './gas.js';

/**
 * Menulis baris baru (append)
 * Instan: Perbarui cache memori lokal segera, lalu sync ke Google di background
 */
export async function appendRow(tabName, rowObject, headers) {
  // 1. Update cache lokal seketika
  const cached = getCached(tabName);
  if (Array.isArray(cached)) {
    const nextRowIndex = cached.length + 2;
    cached.push({ ...rowObject, _rowIndex: nextRowIndex });
    setCached(tabName, cached, 60);
  }

  // 2. Tulis langsung ke Google Spreadsheet / Google Apps Script (Wajib di-await agar tidak hilang saat serverless selesai)
  try {
    if (!SA_EMAIL || !SA_KEY) {
      await callGas('appendRow', { tabName, rowObject, headers });
    } else {
      const sheets = getSheetsClient();
      const values = [headers.map(h => sanitizeText(rowObject[h] !== undefined ? rowObject[h] : ''))];
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${tabName}!A:Z`,
        valueInputOption: 'RAW',
        requestBody: { values }
      });
    }
  } catch (e) {
    console.error(`[SYNC APPEND ERROR] Tab ${tabName}:`, e.message);
    throw e;
  }
}

/**
 * Mengupdate baris tertentu
 */
export async function updateRow(tabName, rowIndex, rowObject, headers) {
  // 1. Update cache lokal seketika
  const cached = getCached(tabName);
  if (Array.isArray(cached)) {
    const idx = cached.findIndex(r => r.id === rowObject.id || r._rowIndex === rowIndex);
    if (idx !== -1) {
      cached[idx] = { ...cached[idx], ...rowObject, _rowIndex: rowIndex };
    }
    setCached(tabName, cached, 60);
  }

  // 2. Sync langsung ke Google Spreadsheet / Apps Script
  try {
    if (!SA_EMAIL || !SA_KEY) {
      await callGas('updateRow', { tabName, rowIndex, rowObject, headers });
    } else {
      const sheets = getSheetsClient();
      const values = [headers.map(h => sanitizeText(rowObject[h] !== undefined ? rowObject[h] : ''))];
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${tabName}!A${rowIndex}:Z${rowIndex}`,
        valueInputOption: 'RAW',
        requestBody: { values }
      });
    }
  } catch (e) {
    console.error(`[SYNC UPDATE ERROR] Tab ${tabName} Row ${rowIndex}:`, e.message);
    throw e;
  }
}

export { SPREADSHEET_ID };
