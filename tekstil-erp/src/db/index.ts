import Dexie, { type EntityTable } from 'dexie';
import type {
  AppSettings,
  CameraSession,
  Customer,
  Invoice,
  JournalEntry,
  Lot,
  Order,
  Payment,
  Product,
  ProductionOrder,
  StockMovement,
  StoredDocument,
  VisitorSample,
} from './schema';
import { DEFAULT_SETTINGS } from './schema';

export class ErpDb extends Dexie {
  products!: EntityTable<Product, 'id'>;
  lots!: EntityTable<Lot, 'id'>;
  movements!: EntityTable<StockMovement, 'id'>;
  productionOrders!: EntityTable<ProductionOrder, 'id'>;
  customers!: EntityTable<Customer, 'id'>;
  orders!: EntityTable<Order, 'id'>;
  invoices!: EntityTable<Invoice, 'id'>;
  payments!: EntityTable<Payment, 'id'>;
  journal!: EntityTable<JournalEntry, 'id'>;
  documents!: EntityTable<StoredDocument, 'id'>;
  cameraSessions!: EntityTable<CameraSession, 'id'>;
  visitorSamples!: EntityTable<VisitorSample, 'id'>;
  settings!: EntityTable<AppSettings, 'id'>;

  constructor(name = 'tekstil-ai-erp') {
    super(name);
    this.version(1).stores({
      products: 'id, sku, name, category, barcode, updatedAt',
      lots: 'id, productId, lotNo, status, stage, location, updatedAt',
      movements: 'id, productId, lotId, type, at',
      productionOrders: 'id, orderNo, productId, status, stage, dueDate',
      customers: 'id, name, taxNo, segment',
      orders: 'id, orderNo, customerId, status, orderDate, dueDate',
      invoices: 'id, invoiceNo, type, status, date, dueDate, customerId, category',
      payments: 'id, invoiceId, direction, date',
      journal: 'id, date, refType, refId',
      documents: 'id, kind, createdAt, linkedInvoiceId',
      cameraSessions: 'id, startedAt',
      visitorSamples: 'id, sessionId, at',
      settings: 'id',
    });
  }
}

export const db = new ErpDb();

export async function getSettings(): Promise<AppSettings> {
  const s = await db.settings.get('main');
  if (s) return { ...DEFAULT_SETTINGS, ...s, llm: { ...DEFAULT_SETTINGS.llm, ...s.llm } };
  await db.settings.put(DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const next = { ...current, ...patch, id: 'main' as const };
  await db.settings.put(next);
  return next;
}

/** Tüm verileri JSON olarak dışa aktar (blob'lar hariç) */
export async function exportAll(): Promise<string> {
  const dump: Record<string, unknown[]> = {};
  for (const table of db.tables) {
    const rows = await table.toArray();
    dump[table.name] = rows.map((r) => {
      if (table.name === 'documents') {
        const { blob: _blob, ...rest } = r as { blob?: Blob };
        return rest;
      }
      return r;
    });
  }
  return JSON.stringify({ version: 1, exportedAt: Date.now(), tables: dump }, null, 2);
}

export async function importAll(json: string): Promise<void> {
  const parsed = JSON.parse(json) as { tables: Record<string, unknown[]> };
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) {
      const rows = parsed.tables[table.name];
      if (!rows) continue;
      await table.clear();
      await table.bulkPut(rows as never[]);
    }
  });
}

export async function clearAll(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
}
