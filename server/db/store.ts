import crypto from 'crypto';
import fs from 'fs';
import mongoose, { Model } from 'mongoose';
import path from 'path';
import { env } from '../config/env.js';
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

let dbMode: 'mongodb-atlas' | 'local-fallback' = 'local-fallback';
let dbConnectionInfo = 'Local persistent JSON store (.data/host_finder_db.json)';
let localData: StoreData = structuredClone(EMPTY_DATA);

function loadLocalData() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      localData = { ...structuredClone(EMPTY_DATA), ...parsed };
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
    console.error('Failed to persist local DB snapshot:', err);
  }
}

function normalizeDoc<T extends Record<string, any>>(doc: T | null): (T & { _id: string }) | null {
  if (!doc) return null;
  const copy: Record<string, any> = { ...doc };
  if (copy._id !== undefined) {
    copy._id = String(copy._id);
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

class CollectionRepo {
  constructor(
    private name: CollectionName,
    private model: Model<any>
  ) {}

  async find(filter: Record<string, any> = {}, sortBy?: { field: string; dir: 1 | -1 }): Promise<any[]> {
    if (dbMode === 'mongodb-atlas') {
      let q = this.model.find(filter);
      if (sortBy) {
        q = q.sort({ [sortBy.field]: sortBy.dir });
      }
      const docs = await q.lean();
      return docs.map((d) => normalizeDoc(d)!);
    }
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
    if (dbMode === 'mongodb-atlas') {
      const doc = await this.model.findOne(filter).lean();
      return normalizeDoc(doc);
    }
    const found = localData[this.name].find((doc) => matchesFilter(doc, filter));
    return found ? structuredClone(found) : null;
  }

  async findById(id: string): Promise<any | null> {
    if (!id) return null;
    if (dbMode === 'mongodb-atlas') {
      if (!mongoose.isValidObjectId(id)) return null;
      const doc = await this.model.findById(id).lean();
      return normalizeDoc(doc);
    }
    const found = localData[this.name].find((doc) => doc._id === id);
    return found ? structuredClone(found) : null;
  }

  async create(payload: Record<string, any>): Promise<any> {
    if (dbMode === 'mongodb-atlas') {
      const created = await this.model.create(payload);
      return normalizeDoc(created.toObject());
    }
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
    if (dbMode === 'mongodb-atlas') {
      if (!mongoose.isValidObjectId(id)) return null;
      const updated = await this.model
        .findByIdAndUpdate(id, { $set: updates }, { new: true, runValidators: true })
        .lean();
      return normalizeDoc(updated);
    }
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
    if (dbMode === 'mongodb-atlas') {
      if (!mongoose.isValidObjectId(id)) return false;
      const res = await this.model.findByIdAndDelete(id);
      return Boolean(res);
    }
    const before = localData[this.name].length;
    localData[this.name] = localData[this.name].filter((doc) => doc._id !== id);
    if (localData[this.name].length !== before) {
      saveLocalData();
      return true;
    }
    return false;
  }

  async updateMany(filter: Record<string, any>, updates: Record<string, any>): Promise<number> {
    if (dbMode === 'mongodb-atlas') {
      const res = await this.model.updateMany(filter, { $set: updates });
      return res.modifiedCount || 0;
    }
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
    if (dbMode === 'mongodb-atlas') {
      return this.model.countDocuments(filter);
    }
    return localData[this.name].filter((doc) => matchesFilter(doc, filter)).length;
  }
}

export const db = {
  users: new CollectionRepo('users', Models.User),
  clients: new CollectionRepo('clients', Models.Client),
  hosting_services: new CollectionRepo('hosting_services', Models.HostingService),
  domains: new CollectionRepo('domains', Models.Domain),
  providers: new CollectionRepo('providers', Models.Provider),
  payment_gateways: new CollectionRepo('payment_gateways', Models.PaymentGateway),
  bank_accounts: new CollectionRepo('bank_accounts', Models.BankAccount),
  payment_records: new CollectionRepo('payment_records', Models.PaymentRecord),
  invoices: new CollectionRepo('invoices', Models.Invoice),
  notifications: new CollectionRepo('notifications', Models.Notification),
  activity_logs: new CollectionRepo('activity_logs', Models.ActivityLog),
  settings: new CollectionRepo('settings', Models.Setting),
};

export function getDbStatus() {
  return {
    mode: dbMode,
    info: dbConnectionInfo,
    collections: Object.keys(db),
  };
}

export async function connectDatabase(): Promise<void> {
  if (env.MONGO_URI) {
    try {
      await mongoose.connect(env.MONGO_URI, {
        serverSelectionTimeoutMS: 6000,
      });
      dbMode = 'mongodb-atlas';
      dbConnectionInfo = 'Connected to MongoDB Atlas via MONGO_URI';
      console.log('[DB] Connected to MongoDB Atlas');
      return;
    } catch (err) {
      console.warn(
        '[DB] MongoDB Atlas connection failed, falling back to local persistent store:',
        (err as Error).message
      );
    }
  } else {
    console.log(
      '[DB] MONGO_URI not set — using local persistent JSON collection store for preview.'
    );
  }
  loadLocalData();
  dbMode = 'local-fallback';
}
