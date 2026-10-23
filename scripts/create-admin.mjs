import readline from 'readline';
import bcrypt from 'bcryptjs';
import { google } from 'googleapis';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load .env if exists
const envPath = path.resolve('.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  console.log('Perhatian: File .env belum ditemukan. Mencoba membaca dari environment variables.');
}

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SA_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const SA_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const ask = question => new Promise(resolve => rl.question(question, resolve));

async function main() {
  console.log('====================================');
  console.log('   PEMBUATAN USER ADMIN PERTAMA     ');
  console.log('====================================\n');

  if (!SPREADSHEET_ID || !SA_EMAIL || !SA_KEY) {
    console.error('ERROR: Konfigurasi Google Sheets API belum lengkap di .env:');
    console.error('- SPREADSHEET_ID:', !!SPREADSHEET_ID);
    console.error('- GOOGLE_SERVICE_ACCOUNT_EMAIL:', !!SA_EMAIL);
    console.error('- GOOGLE_PRIVATE_KEY:', !!SA_KEY);
    console.error('\nSilakan isi file .env terlebih dahulu lalu jalankan kembali script ini.');
    rl.close();
    process.exit(1);
  }

  const usernameInput = await ask('Username Admin (contoh: admin): ');
  const username = usernameInput.trim().toLowerCase();

  if (!username || username.length < 4) {
    console.error('Username minimal 4 karakter!');
    rl.close();
    process.exit(1);
  }

  const fullNameInput = await ask('Nama Lengkap (contoh: Administrator RH Frozen): ');
  const fullName = fullNameInput.trim();

  const passwordInput = await ask('Password Awal (minimal 8 karakter kombinasi huruf & angka): ');
  const password = passwordInput.trim();

  if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    console.error('Password harus minimal 8 karakter dan mengandung huruf serta angka!');
    rl.close();
    process.exit(1);
  }

  console.log('\nMemproses pembuatan user admin...');

  const auth = new google.auth.JWT({
    email: SA_EMAIL,
    key: SA_KEY,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  const sheets = google.sheets({ version: 'v4', auth });

  // 1. Ambil data Users yang ada untuk validasi username unik
  const getRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Users!A:B'
  });

  const rows = getRes.data.values || [];
  if (rows.length > 0) {
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][1] && rows[i][1].toString().toLowerCase() === username) {
        console.error(`Username "${username}" sudah digunakan! Silakan pilih username lain.`);
        rl.close();
        process.exit(1);
      }
    }
  }

  // 2. Hash password dengan bcrypt (cost 10)
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  const now = new Date();
  const nowIso = now.toISOString();
  const userId = crypto.randomUUID();

  // Kolom tab Users:
  // id, username, full_name, role, branch_id, password_hash, active, must_change_password, token_version, failed_count, locked_until, created_at, last_login_at
  const newRow = [
    userId,
    username,
    fullName || 'Admin',
    'admin',
    '', // Admin dapat mengakses semua cabang
    passwordHash,
    'TRUE',
    'TRUE', // must_change_password di awal
    1,
    0,
    '',
    nowIso,
    ''
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Users!A:M',
    valueInputOption: 'RAW',
    requestBody: {
      values: [newRow]
    }
  });

  console.log('\n✓ Berhasil membuat Admin!');
  console.log('------------------------------------');
  console.log(`User ID   : ${userId}`);
  console.log(`Username  : ${username}`);
  console.log(`Role      : admin`);
  console.log(`Wajib Ganti Password saat login pertama: Ya`);
  console.log('------------------------------------\n');

  rl.close();
}

main().catch(err => {
  console.error('Terjadi kesalahan:', err);
  rl.close();
  process.exit(1);
});
