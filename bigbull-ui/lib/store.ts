/**
 * lib/store.ts — File-based JSON persistence for BigBull Engine
 *
 * Data layout (inside bigbull-ui/data/):
 *   projections/YYYY-MM-DD.json   → 7-day rolling, auto-pruned
 *   actuals/YYYY-MM-DD.json       → 7-day rolling, auto-pruned
 *   learning/variance_log.json    → LIFELONG (never deleted)
 *   learning/engine_modifiers.json → LIFELONG (current modifier state)
 */

import fs from 'fs';
import path from 'path';

// ─── Paths ────────────────────────────────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), 'data');
const PROJ_DIR = path.join(DATA_DIR, 'projections');
const ACT_DIR = path.join(DATA_DIR, 'actuals');
const LEARN_DIR = path.join(DATA_DIR, 'learning');
const VARIANCE_FILE = path.join(LEARN_DIR, 'variance_log.json');
const MODIFIERS_FILE = path.join(LEARN_DIR, 'engine_modifiers.json');

const RETENTION_DAYS = 7;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StoredProjection {
  rank: number;
  ticker: string;
  sector: string;
  conviction_score: number;
  thematic_alpha: string;
  thesis_summary: string;
  level7_flow: 'Accumulation' | 'Neutral' | 'Distribution';
  day_start_price: number;  // session open price (or prev close pre-market)
  open_confirmed: boolean; // true once Yahoo returns a real session open != prevClose
  current_price: number;
  change_pct: number;
  projected_price: number;
  stop_loss: number;
  upside_pct: number;
  risk_pct: number;
  saved_at: string;
  // Post-close enrichment fields (written by audit route after market close)
  actual_high?: number;
  actual_low?: number;
  target_hit?: boolean;
  stop_hit?: boolean;
}

export interface StoredActual {
  rank: number;
  ticker: string;
  daily_return_pct: number;
  closing_price: number;
  total_volume_cr: number;
  institutional_volume: number;
  saved_at: string;
}

export interface VarianceLogEntry {
  id: number;
  date: string;
  missed_ticker: string;
  actual_return: number;
  engine_failure_point: string;
  failure_reason: string;
  weight_adjustment_applied: object | null;
  audit_run_ts: string;
}

export interface EngineModifier {
  level: string;
  modifier_key: string;
  current_value: number;
  base_value: number;
  last_adjusted_at: string;
  adjustment_count: number;
}

// ─── Default modifier seed (from db_schema.md) ───────────────────────────────

const DEFAULT_MODIFIERS: EngineModifier[] = [
  { level: 'Level_1', modifier_key: 'CRUDE_DANGER_THRESHOLD', current_value: 85.00, base_value: 85.00, last_adjusted_at: new Date().toISOString(), adjustment_count: 0 },
  { level: 'Level_1', modifier_key: 'YIELD_CURVE_WEIGHT', current_value: 0.35, base_value: 0.35, last_adjusted_at: new Date().toISOString(), adjustment_count: 0 },
  { level: 'Level_1', modifier_key: 'CURRENCY_IMPACT_MULTIPLIER', current_value: 1.20, base_value: 1.20, last_adjusted_at: new Date().toISOString(), adjustment_count: 0 },
  { level: 'Level_2', modifier_key: 'MIN_THEME_SCORE', current_value: 65.00, base_value: 65.00, last_adjusted_at: new Date().toISOString(), adjustment_count: 0 },
  { level: 'Level_2', modifier_key: 'NLP_KEYWORD_MULTIPLIER', current_value: 1.15, base_value: 1.15, last_adjusted_at: new Date().toISOString(), adjustment_count: 0 },
  { level: 'Level_3', modifier_key: 'MARGIN_PREMIUM_WEIGHT', current_value: 0.40, base_value: 0.40, last_adjusted_at: new Date().toISOString(), adjustment_count: 0 },
  { level: 'Level_3', modifier_key: 'MARKET_SHARE_WEIGHT', current_value: 0.60, base_value: 0.60, last_adjusted_at: new Date().toISOString(), adjustment_count: 0 },
  { level: 'Level_3', modifier_key: 'MIN_ROCE_SD', current_value: 3.00, base_value: 3.00, last_adjusted_at: new Date().toISOString(), adjustment_count: 0 },
  { level: 'Level_4', modifier_key: 'MAX_PLEDGE_PCT', current_value: 15.00, base_value: 15.00, last_adjusted_at: new Date().toISOString(), adjustment_count: 0 },
  { level: 'Level_4', modifier_key: 'MIN_RETAINED_VALUE_RATIO', current_value: 1.25, base_value: 1.25, last_adjusted_at: new Date().toISOString(), adjustment_count: 0 },
  { level: 'Level_5', modifier_key: 'PEG_CONSTANT', current_value: 1.50, base_value: 1.50, last_adjusted_at: new Date().toISOString(), adjustment_count: 0 },
  { level: 'Level_5', modifier_key: 'MIN_GAP_THRESHOLD', current_value: 5.00, base_value: 5.00, last_adjusted_at: new Date().toISOString(), adjustment_count: 0 },
  { level: 'Level_6', modifier_key: 'MIN_HEADCOUNT_GROWTH', current_value: 2.00, base_value: 2.00, last_adjusted_at: new Date().toISOString(), adjustment_count: 0 },
  { level: 'Level_6', modifier_key: 'MATERIAL_DEFLATION_WEIGHT', current_value: 0.30, base_value: 0.30, last_adjusted_at: new Date().toISOString(), adjustment_count: 0 },
  { level: 'Level_7', modifier_key: 'INSTITUTIONAL_ACCUMULATION_MIN_CR', current_value: 50.00, base_value: 50.00, last_adjusted_at: new Date().toISOString(), adjustment_count: 0 },
  { level: 'Level_8', modifier_key: 'MAX_THESIS_LENGTH_WORDS', current_value: 50.00, base_value: 50.00, last_adjusted_at: new Date().toISOString(), adjustment_count: 0 },
  { level: 'Level_9', modifier_key: 'MAX_SECTOR_CONCENTRATION', current_value: 30.00, base_value: 30.00, last_adjusted_at: new Date().toISOString(), adjustment_count: 0 },
  { level: 'Level_9', modifier_key: 'MAX_BETA', current_value: 1.35, base_value: 1.35, last_adjusted_at: new Date().toISOString(), adjustment_count: 0 },
  { level: 'Level_10', modifier_key: 'LEARNING_RATE_ALPHA', current_value: 0.05, base_value: 0.05, last_adjusted_at: new Date().toISOString(), adjustment_count: 0 },
  { level: 'Level_10', modifier_key: 'ROLLING_AUDIT_WINDOW_DAYS', current_value: 14.00, base_value: 14.00, last_adjusted_at: new Date().toISOString(), adjustment_count: 0 },
  { level: 'Level_10', modifier_key: 'MAX_ADJUSTMENT_CAP', current_value: 0.20, base_value: 0.20, last_adjusted_at: new Date().toISOString(), adjustment_count: 0 },
];

// ─── Directory bootstrap ──────────────────────────────────────────────────────

function ensureDirs() {
  for (const dir of [PROJ_DIR, ACT_DIR, LEARN_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

// ─── Atomic write (write to .tmp then rename) ─────────────────────────────────

function atomicWrite(filePath: string, data: unknown) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

function readJSON<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

// ─── Projections ──────────────────────────────────────────────────────────────

export function saveProjections(date: string, data: StoredProjection[]): void {
  ensureDirs();
  const file = path.join(PROJ_DIR, `${date}.json`);
  // Write-once: once the snapshot is on disk it is never overwritten.
  // The freeze point is enforced at the API route level (session === 'open').
  if (fs.existsSync(file)) return;
  const payload = { date, saved_at: new Date().toISOString(), projections: data };
  atomicWrite(file, payload);
}

export function updateProjections(date: string, data: StoredProjection[]): void {
  ensureDirs();
  const file = path.join(PROJ_DIR, `${date}.json`);
  const payload = { date, saved_at: new Date().toISOString(), projections: data };
  atomicWrite(file, payload);
}

export function loadProjections(date: string): StoredProjection[] | null {
  ensureDirs();
  const file = path.join(PROJ_DIR, `${date}.json`);
  const record = readJSON<{ projections: StoredProjection[] }>(file);
  return record?.projections ?? null;
}

/** Returns all dates that have stored projections (sorted desc) */
export function availableProjectionDates(): string[] {
  ensureDirs();
  return fs.readdirSync(PROJ_DIR)
    .filter(f => f.endsWith('.json') && !f.endsWith('.tmp'))
    .map(f => f.replace('.json', ''))
    .sort((a, b) => b.localeCompare(a));
}

// ─── Actuals ──────────────────────────────────────────────────────────────────

export function saveActuals(date: string, data: StoredActual[]): void {
  ensureDirs();
  const file = path.join(ACT_DIR, `${date}.json`);
  // Actuals can be overwritten (refreshed at end of day)
  const payload = { date, saved_at: new Date().toISOString(), actuals: data };
  atomicWrite(file, payload);
}

export function loadActuals(date: string): StoredActual[] | null {
  ensureDirs();
  const file = path.join(ACT_DIR, `${date}.json`);
  const record = readJSON<{ actuals: StoredActual[] }>(file);
  return record?.actuals ?? null;
}

// ─── Variance Log (lifelong) ──────────────────────────────────────────────────

export function appendVarianceLog(entries: Omit<VarianceLogEntry, 'id'>[]): void {
  ensureDirs();
  const existing = readJSON<VarianceLogEntry[]>(VARIANCE_FILE) ?? [];
  const nextId = (existing[existing.length - 1]?.id ?? 0) + 1;
  const stamped = entries.map((e, i) => ({ id: nextId + i, ...e }));
  atomicWrite(VARIANCE_FILE, [...existing, ...stamped]);
}

export function loadVarianceLog(date?: string): VarianceLogEntry[] {
  ensureDirs();
  const all = readJSON<VarianceLogEntry[]>(VARIANCE_FILE) ?? [];
  return date ? all.filter(e => e.date === date) : all;
}

// ─── Engine Modifiers (lifelong) ──────────────────────────────────────────────

export function loadModifiers(): EngineModifier[] {
  ensureDirs();
  const stored = readJSON<EngineModifier[]>(MODIFIERS_FILE);
  if (stored && stored.length > 0) return stored;
  // Seed defaults on first call
  atomicWrite(MODIFIERS_FILE, DEFAULT_MODIFIERS);
  return DEFAULT_MODIFIERS;
}

export function updateModifiers(
  adjustments: { engine_level: string; modifier_key: string; old_value: number; new_value: number }[]
): EngineModifier[] {
  ensureDirs();
  const modifiers = loadModifiers();
  const now = new Date().toISOString();

  for (const adj of adjustments) {
    const mod = modifiers.find(
      m => m.level === adj.engine_level && m.modifier_key === adj.modifier_key
    );
    if (mod) {
      mod.current_value = adj.new_value;
      mod.last_adjusted_at = now;
      mod.adjustment_count += 1;
    }
  }

  atomicWrite(MODIFIERS_FILE, modifiers);
  return modifiers;
}

// ─── Pruning (7-day rolling for projections + actuals) ───────────────────────

export function pruneOldData(): { pruned: string[] } {
  ensureDirs();
  const pruned: string[] = [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  for (const dir of [PROJ_DIR, ACT_DIR]) {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const dateStr = file.replace('.json', '');
      if (dateStr < cutoffStr) {
        fs.unlinkSync(path.join(dir, file));
        pruned.push(`${path.basename(dir)}/${file}`);
      }
    }
  }

  return { pruned };
}
