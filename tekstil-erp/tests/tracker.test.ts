import { describe, expect, it } from 'vitest';
import { CentroidTracker, accumulateHeat, emptyHeat, pointInZone, zoneOfBox } from '../src/ai/tracker';
import type { CameraZone } from '../src/db/schema';

describe('CentroidTracker', () => {
  it('aynı kişiyi kareler arasında eşleştirir ve tek iz tutar', () => {
    const t = new CentroidTracker({ maxMissed: 2, minDwellMs: 0 });
    t.update([{ x: 100, y: 100, w: 50, h: 120 }], 0, [], 640, 480);
    t.update([{ x: 106, y: 102, w: 50, h: 120 }], 200, [], 640, 480);
    t.update([{ x: 112, y: 104, w: 52, h: 118 }], 400, [], 640, 480);
    expect(t.activeCount).toBe(1);
    expect(t.active[0].id).toBe(1);
  });

  it('kaybolan izi N kare sonra kapatır ve kalış süresini hesaplar', () => {
    const t = new CentroidTracker({ maxMissed: 2, minDwellMs: 0 });
    t.update([{ x: 10, y: 10, w: 40, h: 100 }], 0, [], 640, 480);
    t.update([{ x: 12, y: 10, w: 40, h: 100 }], 3000, [], 640, 480);
    expect(t.update([], 3200, [], 640, 480)).toHaveLength(0);
    expect(t.update([], 3400, [], 640, 480)).toHaveLength(0);
    const closed = t.update([], 3600, [], 640, 480);
    expect(closed).toHaveLength(1);
    expect(closed[0].dwellMs).toBe(3000);
    expect(t.activeCount).toBe(0);
  });

  it('uzak iki kutuyu ayrı kişiler olarak sayar', () => {
    const t = new CentroidTracker({ minDwellMs: 0 });
    t.update([{ x: 0, y: 0, w: 40, h: 100 }, { x: 500, y: 300, w: 40, h: 100 }], 0, [], 640, 480);
    expect(t.activeCount).toBe(2);
  });
});

describe('bölge ve ısı haritası', () => {
  const zone: CameraZone = { id: 'z1', name: 'Kasa', x: 0.5, y: 0.5, w: 0.5, h: 0.5 };
  it('ayak noktasına göre bölge testi yapar', () => {
    expect(pointInZone(480, 400, zone, 640, 480)).toBe(true);
    expect(pointInZone(100, 100, zone, 640, 480)).toBe(false);
    // kutu üstte başlıyor ama ayak noktası sağ alt çeyrekte
    expect(zoneOfBox({ x: 400, y: 100, w: 60, h: 300 }, [zone], 640, 480)?.id).toBe('z1');
    expect(zoneOfBox({ x: 10, y: 10, w: 60, h: 100 }, [zone], 640, 480)).toBeUndefined();
  });

  it('ısı haritasını 8×6 ızgaraya biriktirir', () => {
    const heat = emptyHeat();
    accumulateHeat(heat, [{ x: 600, y: 400, w: 40, h: 79 }], 640, 480); // sağ alt köşe
    expect(heat).toHaveLength(48);
    expect(heat[47]).toBe(1);
    expect(heat.reduce((a, b) => a + b, 0)).toBe(1);
  });
});
