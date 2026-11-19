import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const configDir = path.resolve(process.cwd(), 'data');
const runtimeConfigPath = path.join(configDir, 'supabase-config.json');

interface RuntimeSupabaseConfig {
  supabaseUrl?: string;
  anonKey?: string;
  serviceRoleKey?: string;
  updatedAt?: string;
}

function loadRuntimeConfig(): RuntimeSupabaseConfig {
  try {
    if (fs.existsSync(runtimeConfigPath)) {
      const raw = fs.readFileSync(runtimeConfigPath, 'utf-8');
      return JSON.parse(raw) as RuntimeSupabaseConfig;
    }
  } catch (e) {
    console.warn('Gagal membaca konfigurasi Supabase tersimpan:', e);
  }
  return {};
}

const initialSaved = loadRuntimeConfig();

export const ENV = {
  PORT: Number(process.env.PORT || 3000),
  NODE_ENV: process.env.NODE_ENV || 'development',
  JWT_SECRET: process.env.JWT_SECRET || 'cbt-sekolah-madrasah-dev-secret-key-2026-min-32-chars',
  SUPABASE_URL: (initialSaved.supabaseUrl || process.env.SUPABASE_URL || '').trim(),
  SUPABASE_ANON_KEY: (initialSaved.anonKey || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim(),
  SUPABASE_SERVICE_ROLE_KEY: (initialSaved.serviceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
};

let supabaseAdminInstance: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(
    ENV.SUPABASE_URL &&
    ENV.SUPABASE_SERVICE_ROLE_KEY &&
    ENV.SUPABASE_URL.startsWith('http')
  );
}

export function getSupabaseAdmin(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!supabaseAdminInstance) {
    supabaseAdminInstance = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return supabaseAdminInstance;
}

export function saveSupabaseRuntimeConfig(params: {
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey?: string;
}) {
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  const existing = loadRuntimeConfig();
  const nextServiceKey = params.serviceRoleKey?.trim()
    ? params.serviceRoleKey.trim()
    : existing.serviceRoleKey || ENV.SUPABASE_SERVICE_ROLE_KEY;

  const payload: RuntimeSupabaseConfig = {
    supabaseUrl: params.supabaseUrl.trim().replace(/\/+$/, ''),
    anonKey: params.anonKey.trim(),
    serviceRoleKey: nextServiceKey,
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(runtimeConfigPath, JSON.stringify(payload, null, 2), { mode: 0o600 });

  ENV.SUPABASE_URL = payload.supabaseUrl || '';
  ENV.SUPABASE_ANON_KEY = payload.anonKey || '';
  ENV.SUPABASE_SERVICE_ROLE_KEY = payload.serviceRoleKey || '';
  supabaseAdminInstance = null;
}

export function clearSupabaseRuntimeConfig() {
  if (fs.existsSync(runtimeConfigPath)) {
    fs.unlinkSync(runtimeConfigPath);
  }
  ENV.SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
  ENV.SUPABASE_ANON_KEY = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
  ENV.SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  supabaseAdminInstance = null;
}

function maskSecret(val: string): string {
  if (!val) return '';
  if (val.length <= 12) return '••••••••';
  return `${val.slice(0, 6)}••••••••••••${val.slice(-4)}`;
}

export function getSafeSupabaseConfigSummary() {
  const hasSavedFile = fs.existsSync(runtimeConfigPath);
  return {
    supabaseUrl: ENV.SUPABASE_URL,
    anonKey: ENV.SUPABASE_ANON_KEY,
    hasServiceRoleKey: Boolean(ENV.SUPABASE_SERVICE_ROLE_KEY),
    serviceRoleKeyMask: maskSecret(ENV.SUPABASE_SERVICE_ROLE_KEY),
    source: hasSavedFile ? 'Pengaturan Admin Server' : process.env.SUPABASE_URL ? 'Environment (.env)' : 'Belum Dikonfigurasi',
    isConfigured: isSupabaseConfigured(),
  };
}

export const REQUIRED_SUPABASE_TABLES = [
  'schools',
  'profiles',
  'academic_years',
  'classes',
  'students',
  'subjects',
  'question_banks',
  'questions',
  'question_options',
  'exams',
  'exam_participants',
  'exam_questions',
  'exam_sessions',
  'student_answers',
  'exam_activity_logs',
  'exam_results',
  'audit_logs',
];

export async function testSupabaseConnection(override?: {
  supabaseUrl?: string;
  serviceRoleKey?: string;
}) {
  const url = (override?.supabaseUrl || ENV.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = (override?.serviceRoleKey || ENV.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!url || !key) {
    return {
      ok: false,
      reachable: false,
      message: 'URL Supabase dan Service Role Key wajib diisi untuk pengujian koneksi server.',
      tables: [] as { table: string; ready: boolean; error?: string }[],
      bucketReady: false,
    };
  }

  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const tableChecks = await Promise.all(
    REQUIRED_SUPABASE_TABLES.map(async (table) => {
      try {
        const { error } = await client.from(table).select('id').limit(1);
        if (!error) return { table, ready: true };
        return { table, ready: false, error: error.message };
      } catch (e: any) {
        return { table, ready: false, error: e.message };
      }
    })
  );

  let bucketReady = false;
  let bucketMessage = '';
  try {
    const { data: buckets, error: bErr } = await client.storage.listBuckets();
    if (!bErr && buckets) {
      bucketReady = buckets.some((b) => b.id === 'cbt-media' || b.name === 'cbt-media');
      if (!bucketReady) bucketMessage = 'Bucket "cbt-media" belum dibuat (jalankan 003_functions_and_storage.sql).';
    } else if (bErr) {
      bucketMessage = bErr.message;
    }
  } catch (e: any) {
    bucketMessage = e.message;
  }

  const readyTablesCount = tableChecks.filter((t) => t.ready).length;
  const anyReachable = readyTablesCount > 0 || bucketReady || !tableChecks[0]?.error?.includes('fetch failed');

  return {
    ok: readyTablesCount === REQUIRED_SUPABASE_TABLES.length && bucketReady,
    reachable: anyReachable,
    readyTablesCount,
    totalTables: REQUIRED_SUPABASE_TABLES.length,
    tables: tableChecks,
    bucketReady,
    bucketMessage,
    message:
      readyTablesCount === REQUIRED_SUPABASE_TABLES.length && bucketReady
        ? 'Koneksi Supabase berhasil! Seluruh 17 tabel & bucket cbt-media siap digunakan.'
        : readyTablesCount > 0
        ? `Terhubung ke Supabase, tetapi baru ${readyTablesCount}/${REQUIRED_SUPABASE_TABLES.length} tabel siap. Jalankan seluruh file migrasi SQL.`
        : `Gagal mengakses tabel Supabase: ${tableChecks[0]?.error || 'Periksa URL dan Service Role Key Anda.'}`,
  };
}
