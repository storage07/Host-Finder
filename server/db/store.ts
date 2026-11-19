import crypto from 'crypto';
import { and, asc, count as sqlCount, desc, eq, getTableColumns } from 'drizzle-orm';
import fs from 'fs';
import mongoose, { Model } from 'mongoose';
import path from 'path';
import { db as pgDb, isSqlConfigured } from '../../src/db/index.ts';
import {
  activityLogs,
  bankAccounts,
  clients,
  domains,
  hostingServices,
  invoices,
  notifications,
  paymentGateways,
  paymentRecords,
  providers,
  settings,
  users,
} from '../../src/db/schema.ts';
import { getDatabaseHealth, isDatabaseConnected } from '../config/database.js';
import { Models } from '../models/schemas.js';

export type CollectionName =
  | 'users'
  | 'clients'
  | 'hosting_services'
  | 'domains'
  | 'providers'
  | 'payment_gateways'
  | 'bank_accounts'
  | 'payment_records'
  | 'invoices'
  | 'notifications'
  | 'activity_logs'
  | 'settings';

const PG_TABLES: Record<CollectionName, any> = {
  users,
  clients,
  hosting_services: hostingServices,
  domains,
  providers,
  payment_gateways: paymentGateways,
  bank_accounts: bankAccounts,
  payment_records: paymentRecords,
  invoices,
  notifications,
  activity_logs: activityLogs,
  settings,
};

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DATA_FILE = path.join(DATA_DIR, 'host_finder_db.json');

type StoreData = Record<CollectionName, Record<string, any>[]>;

const EMPTY_DATA: StoreData = {
  users: [],
  clients: [],
  hosting_services: [],
  domains: [],
  providers: [],
  payment_gateways: [],
  bank_accounts: [],
  payment_records: [],
  invoices: [],
  notifications: [],
  activity_logs: [],
  settings: [],
};

let localData: StoreData = structuredClone(EMPTY_DATA);
let localLoaded = false;

function ensureLocalLoaded() {
  if (localLoaded) return;
  localLoaded = true;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      localData = { ...structuredClone(EMPTY_DATA), ...JSON.parse(raw) };
    } else {
      saveLocalData();
    }
  } catch {
    localData = structuredClone(EMPTY_DATA);
  }
}

function saveLocalData() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(localData, null, 2), 'utf8');
  } catch (err) {
    console.warn('[LocalStore] Failed to write snapshot:', (err as Error).message);
  }
}

function normalizeDoc<T extends Record<string, any>>(
  doc: T | null
): (T & { _id: string }) | null {
  if (!doc) return null;
  const copy: Record<string, any> = { ...doc };
  if (copy._id !== undefined) {
    copy._id = String(copy._id);
  } else if (copy.id !== undefined) {
    copy._id = String(copy.id);
  }
  if (copy.createdAt instanceof Date) {
    copy.createdAt = copy.createdAt.toISOString();
  }
  if (copy.updatedAt instanceof Date) {
    copy.updatedAt = copy.updatedAt.toISOString();
  }
  return copy as T & { _id: string };
}

function matchesFilter(doc: Record<string, any>, filter: Record<string, any>): boolean {
  for (const [k, v] of Object.entries(filter)) {
    if (v === undefined) continue;
    if (doc[k] !== v) return false;
  }
  return true;
}

function buildPgConditions(table: any, cols: Record<string, any>, filter: Record<string, any>) {
  const conditions: any[] = [];
  for (const [k, v] of Object.entries(filter)) {
    if (v === undefined) continue;
    if (k === '_id' || k === 'id') {
      const numId = Number(v);
      if (!Number.isInteger(numId) || numId <= 0) {
        return { impossible: true, conditions: [] };
      }
      conditions.push(eq(table.id, numId));
      continue;
    }
    if (cols[k]) {
      conditions.push(eq(cols[k], v));
    }
  }
  return { impossible: false, conditions };
}

function pickPgColumns(
  name: CollectionName,
  cols: Record<string, any>,
  payload: Record<string, any>,
  isInsert: boolean
): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (v === undefined || k === '_id' || k === 'id' || k === 'createdAt' || k === 'updatedAt') {
      continue;
    }
    if (cols[k]) {
      result[k] = v instanceof Date ? v.toISOString() : v;
    }
  }
  if (isInsert && name === 'users' && !result.uid) {
    const base = String(result.username || result.email || crypto.randomBytes(4).toString('hex'))
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    result.uid = `local_${base}`;
  }
  if (!isInsert) {
    result.updatedAt = new Date();
  }
  return result;
}

class HybridRepository {
  private pgTable: any;
  private pgCols: Record<string, any>;

  constructor(
    private name: CollectionName,
    private model: Model<any>
  ) {
    this.pgTable = PG_TABLES[name];
    this.pgCols = getTableColumns(this.pgTable);
  }

  async find(
    filter: Record<string, any> = {},
    sortBy?: { field: string; dir: 1 | -1 }
  ): Promise<any[]> {
    if (isSqlConfigured()) {
      try {
        const { impossible, conditions } = buildPgConditions(this.pgTable, this.pgCols, filter);
        if (impossible) return [];
        let query = pgDb.select().from(this.pgTable).$dynamic();
        if (conditions.length > 0) {
          query = query.where(and(...conditions));
        }
        if (sortBy && this.pgCols[sortBy.field]) {
          const col = this.pgCols[sortBy.field];
          query = query.orderBy(sortBy.dir === -1 ? desc(col) : asc(col));
        }
        const rows = await query;
        return rows.map((r: any) => normalizeDoc(r)!);
      } catch (err) {
        console.error(`Database query failed [${this.name}.find]:`, err);
        throw new Error('Database query failed. Please try again later.', { cause: err });
      }
    }

    if (isDatabaseConnected()) {
      let query = this.model.find(filter);
      if (sortBy) {
        query = query.sort({ [sortBy.field]: sortBy.dir });
      }
      const docs = await query.lean();
      return docs.map((d) => normalizeDoc(d)!);
    }

    ensureLocalLoaded();
    let items = localData[this.name].filter((doc) => matchesFilter(doc, filter));
    if (sortBy) {
      items = [...items].sort((a, b) => {
        const av = a[sortBy.field] ?? '';
        const bv = b[sortBy.field] ?? '';
        if (av < bv) return -1 * sortBy.dir;
        if (av > bv) return 1 * sortBy.dir;
        return 0;
      });
    }
    return items.map((d) => structuredClone(d));
  }

  async findOne(filter: Record<string, any>): Promise<any | null> {
    if (isSqlConfigured()) {
      try {
        const { impossible, conditions } = buildPgConditions(this.pgTable, this.pgCols, filter);
        if (impossible) return null;
        let query = pgDb.select().from(this.pgTable).$dynamic();
        if (conditions.length > 0) {
          query = query.where(and(...conditions));
        }
        const rows = await query.limit(1);
        return rows.length > 0 ? normalizeDoc(rows[0]) : null;
      } catch (err) {
        console.error(`Database query failed [${this.name}.findOne]:`, err);
        throw new Error('Database query failed. Please try again later.', { cause: err });
      }
    }

    if (isDatabaseConnected()) {
      const doc = await this.model.findOne(filter).lean();
      return normalizeDoc(doc);
    }

    ensureLocalLoaded();
    const found = localData[this.name].find((doc) => matchesFilter(doc, filter));
    return found ? structuredClone(found) : null;
  }

  async findById(id: string): Promise<any | null> {
    if (!id) return null;

    if (isSqlConfigured()) {
      const numId = Number(id);
      if (!Number.isInteger(numId) || numId <= 0) return null;
      try {
        const rows = await pgDb
          .select()
          .from(this.pgTable)
          .where(eq(this.pgTable.id, numId))
          .limit(1);
        return rows.length > 0 ? normalizeDoc(rows[0]) : null;
      } catch (err) {
        console.error(`Database query failed [${this.name}.findById]:`, err);
        throw new Error('Database query failed. Please try again later.', { cause: err });
      }
    }

    if (isDatabaseConnected()) {
      if (!mongoose.isValidObjectId(id)) return null;
      const doc = await this.model.findById(id).lean();
      return normalizeDoc(doc);
    }

    ensureLocalLoaded();
    const found = localData[this.name].find((doc) => doc._id === id);
    return found ? structuredClone(found) : null;
  }

  async create(payload: Record<string, any>): Promise<any> {
    if (isSqlConfigured()) {
      try {
        const values = pickPgColumns(this.name, this.pgCols, payload, true);
        const rows = (await pgDb.insert(this.pgTable).values(values).returning()) as any[];
        return normalizeDoc(rows[0]);
      } catch (err) {
        console.error(`Database query failed [${this.name}.create]:`, err);
        throw new Error('Database query failed. Please try again later.', { cause: err });
      }
    }

    if (isDatabaseConnected()) {
      const created = await this.model.create(payload);
      return normalizeDoc(created.toObject());
    }

    ensureLocalLoaded();
    const now = new Date().toISOString();
    const doc = {
      ...structuredClone(payload),
      _id: crypto.randomBytes(12).toString('hex'),
      createdAt: now,
      updatedAt: now,
    };
    localData[this.name].push(doc);
    saveLocalData();
    return structuredClone(doc);
  }

  async updateById(id: string, updates: Record<string, any>): Promise<any | null> {
    if (!id) return null;

    if (isSqlConfigured()) {
      const numId = Number(id);
      if (!Number.isInteger(numId) || numId <= 0) return null;
      try {
        const values = pickPgColumns(this.name, this.pgCols, updates, false);
        const rows = (await pgDb
          .update(this.pgTable)
          .set(values)
          .where(eq(this.pgTable.id, numId))
          .returning()) as any[];
        return rows.length > 0 ? normalizeDoc(rows[0]) : null;
      } catch (err) {
        console.error(`Database query failed [${this.name}.updateById]:`, err);
        throw new Error('Database query failed. Please try again later.', { cause: err });
      }
    }

    if (isDatabaseConnected()) {
      if (!mongoose.isValidObjectId(id)) return null;
      const updated = await this.model
        .findByIdAndUpdate(
          id,
          { $set: updates },
          { new: true, runValidators: true }
        )
        .lean();
      return normalizeDoc(updated);
    }

    ensureLocalLoaded();
    const idx = localData[this.name].findIndex((doc) => doc._id === id);
    if (idx === -1) return null;
    const now = new Date().toISOString();
    localData[this.name][idx] = {
      ...localData[this.name][idx],
      ...structuredClone(updates),
      updatedAt: now,
    };
    saveLocalData();
    return structuredClone(localData[this.name][idx]);
  }

  async deleteById(id: string): Promise<boolean> {
    if (!id) return false;

    if (isSqlConfigured()) {
      const numId = Number(id);
      if (!Number.isInteger(numId) || numId <= 0) return false;
      try {
        const rows = (await pgDb
          .delete(this.pgTable)
          .where(eq(this.pgTable.id, numId))
          .returning({ id: this.pgTable.id })) as any[];
        return rows.length > 0;
      } catch (err) {
        console.error(`Database query failed [${this.name}.deleteById]:`, err);
        throw new Error('Database query failed. Please try again later.', { cause: err });
      }
    }

    if (isDatabaseConnected()) {
      if (!mongoose.isValidObjectId(id)) return false;
      const res = await this.model.findByIdAndDelete(id);
      return Boolean(res);
    }

    ensureLocalLoaded();
    const before = localData[this.name].length;
    localData[this.name] = localData[this.name].filter((doc) => doc._id !== id);
    if (localData[this.name].length !== before) {
      saveLocalData();
      return true;
    }
    return false;
  }

  async updateMany(
    filter: Record<string, any>,
    updates: Record<string, any>
  ): Promise<number> {
    if (isSqlConfigured()) {
      try {
        const { impossible, conditions } = buildPgConditions(this.pgTable, this.pgCols, filter);
        if (impossible) return 0;
        const values = pickPgColumns(this.name, this.pgCols, updates, false);
        let query = pgDb.update(this.pgTable).set(values).$dynamic();
        if (conditions.length > 0) {
          query = query.where(and(...conditions));
        }
        const rows = (await query.returning({ id: this.pgTable.id })) as any[];
        return rows.length;
      } catch (err) {
        console.error(`Database query failed [${this.name}.updateMany]:`, err);
        throw new Error('Database query failed. Please try again later.', { cause: err });
      }
    }

    if (isDatabaseConnected()) {
      const res = await this.model.updateMany(filter, { $set: updates });
      return res.modifiedCount || 0;
    }

    ensureLocalLoaded();
    let count = 0;
    const now = new Date().toISOString();
    localData[this.name] = localData[this.name].map((doc) => {
      if (matchesFilter(doc, filter)) {
        count++;
        return { ...doc, ...structuredClone(updates), updatedAt: now };
      }
      return doc;
    });
    if (count > 0) saveLocalData();
    return count;
  }

  async count(filter: Record<string, any> = {}): Promise<number> {
    if (isSqlConfigured()) {
      try {
        const { impossible, conditions } = buildPgConditions(this.pgTable, this.pgCols, filter);
        if (impossible) return 0;
        let query = pgDb.select({ total: sqlCount() }).from(this.pgTable).$dynamic();
        if (conditions.length > 0) {
          query = query.where(and(...conditions));
        }
        const rows = await query;
        return Number(rows[0]?.total || 0);
      } catch (err) {
        console.error(`Database query failed [${this.name}.count]:`, err);
        throw new Error('Database query failed. Please try again later.', { cause: err });
      }
    }

    if (isDatabaseConnected()) {
      return this.model.countDocuments(filter);
    }

    ensureLocalLoaded();
    return localData[this.name].filter((doc) => matchesFilter(doc, filter)).length;
  }
}

export const db = {
  users: new HybridRepository('users', Models.User),
  clients: new HybridRepository('clients', Models.Client),
  hosting_services: new HybridRepository('hosting_services', Models.HostingService),
  domains: new HybridRepository('domains', Models.Domain),
  providers: new HybridRepository('providers', Models.Provider),
  payment_gateways: new HybridRepository('payment_gateways', Models.PaymentGateway),
  bank_accounts: new HybridRepository('bank_accounts', Models.BankAccount),
  payment_records: new HybridRepository('payment_records', Models.PaymentRecord),
  invoices: new HybridRepository('invoices', Models.Invoice),
  notifications: new HybridRepository('notifications', Models.Notification),
  activity_logs: new HybridRepository('activity_logs', Models.ActivityLog),
  settings: new HybridRepository('settings', Models.Setting),
};

export function getDbStatus() {
  if (isSqlConfigured()) {
    return {
      mode: 'cloud-sql-postgresql',
      connected: true,
      collections: Object.keys(db),
    };
  }
  return {
    ...getDatabaseHealth(),
    collections: Object.keys(db),
  };
}
