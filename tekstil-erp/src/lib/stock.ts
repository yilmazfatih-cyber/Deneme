import type { MovementType, Product, StockMovement } from '../db/schema';
import { db } from '../db';

/** Hareketin stok üzerindeki işaretli etkisi */
export function movementSign(type: MovementType): number {
  switch (type) {
    case 'giris':
      return 1;
    case 'cikis':
    case 'fire':
      return -1;
    case 'sayim':
      return 1; // sayım düzeltmesi: quantity işaretli girilir (negatif olabilir)
    case 'transfer':
      return 0;
  }
}

export function stockFromMovements(movements: StockMovement[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const m of movements) {
    const delta = movementSign(m.type) * m.quantity;
    map.set(m.productId, (map.get(m.productId) ?? 0) + delta);
  }
  return map;
}

export async function stockLevels(): Promise<Map<string, number>> {
  return stockFromMovements(await db.movements.toArray());
}

export function lowStock(products: Product[], levels: Map<string, number>): Product[] {
  return products.filter((p) => (levels.get(p.id) ?? 0) <= p.minStock);
}

export async function addMovement(m: Omit<StockMovement, 'id' | 'at'> & { at?: number }): Promise<string> {
  const id = crypto.randomUUID();
  await db.movements.add({ ...m, id, at: m.at ?? Date.now() });
  return id;
}
