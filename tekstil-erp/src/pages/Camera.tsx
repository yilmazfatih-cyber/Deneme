import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CentroidTracker, HEAT_COLS, accumulateFrame, finalizeMinute, hourlyEntries, insights, mergeHeat, newMinuteAccumulator, type Box, type MinuteAccumulator, type Visit } from '../ai/tracker';
import { detectPeople, isDetectorReady, loadDetector } from '../ai/vision';
import { axisProps, tooltipStyle } from '../charts/theme';
import { Alert, Badge, Card, Empty, Field, Modal, PageHead, Progress, Stat } from '../components/ui';
import { db, getSettings } from '../db';
import type { CameraSession, CameraZone, VisitorSample } from '../db/schema';
import { uid } from '../lib/id';
import { fmtDateTime, fmtNum } from '../lib/format';

const DEFAULT_ZONES: CameraZone[] = [
  { id: 'z_giris', name: 'Giriş', x: 0.02, y: 0.55, w: 0.3, h: 0.43 },
  { id: 'z_reyon', name: 'Reyon', x: 0.34, y: 0.2, w: 0.34, h: 0.78 },
  { id: 'z_kasa', name: 'Kasa', x: 0.7, y: 0.35, w: 0.28, h: 0.63 },
];
const ZONE_COLORS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'];

type Source = 'camera' | 'file';
type Rect = { x: number; y: number; w: number; h: number };

function fmtDwell(sec: number): string {
  if (!sec) return '—';
  return sec >= 60 ? `${(sec / 60).toFixed(1)} dk` : `${Math.round(sec)} sn`;
}

function startOfDay(ts = Date.now()): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** object-fit: contain ile görüntünün kapsayıcı içindeki gerçek dikdörtgeni */
function containedRect(wrapW: number, wrapH: number, vidW: number, vidH: number): Rect {
  if (!vidW || !vidH) return { x: 0, y: 0, w: wrapW, h: wrapH };
  const scale = Math.min(wrapW / vidW, wrapH / vidH);
  const w = vidW * scale;
  const h = vidH * scale;
  return { x: (wrapW - w) / 2, y: (wrapH - h) / 2, w, h };
}

export default function Camera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileUrlRef = useRef<string | null>(null);
  const trackerRef = useRef<CentroidTracker>(new CentroidTracker());
  const accRef = useRef<MinuteAccumulator>(newMinuteAccumulator());
  const sessionRef = useRef<CameraSession | null>(null);
  const detectTimer = useRef<number | null>(null);
  const minuteTimer = useRef<number | null>(null);
  const busyRef = useRef(false);
  const lastCreatedRef = useRef(0);
  const zonesRef = useRef<CameraZone[]>(DEFAULT_ZONES);
  const sessionVisitsRef = useRef<Visit[]>([]);

  const [source, setSource] = useState<Source>('camera');
  const [running, setRunning] = useState(false);
  const [model, setModel] = useState<{ step: string; ratio: number; error?: string }>({ step: '', ratio: 0 });
  const [zones, setZones] = useState<CameraZone[]>(DEFAULT_ZONES);
  const [drawMode, setDrawMode] = useState(false);
  const [drawing, setDrawing] = useState<Rect | null>(null);
  const [pendingZone, setPendingZone] = useState<Rect | null>(null);
  const [zoneName, setZoneName] = useState('');
  const [live, setLive] = useState({ inside: 0, sessionEntries: 0, avgDwellSec: 0, busiestZone: '—', liveEntriesThisMinute: 0 });
  const [tableView, setTableView] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoSize, setVideoSize] = useState({ w: 0, h: 0 });
  const [wrapBox, setWrapBox] = useState({ w: 0, h: 0 });
  const [liveSessionId, setLiveSessionId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    zonesRef.current = zones;
  }, [zones]);

  const sessionsQ = useLiveQuery(() => db.cameraSessions.orderBy('startedAt').reverse().toArray(), []);
  const samplesQ = useLiveQuery(() => db.visitorSamples.orderBy('at').toArray(), []);
  const sessions = useMemo(() => sessionsQ ?? [], [sessionsQ]);
  const samples = useMemo(() => samplesQ ?? [], [samplesQ]);

  // Zaman damgası: oturum açıkken yarım dakikada bir, kapalıyken dakikada bir güncellenir
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), running ? 30_000 : 60_000);
    return () => window.clearInterval(t);
  }, [running]);

  // Son oturumun bölgelerini başlangıçta yükle
  useEffect(() => {
    void db.cameraSessions
      .orderBy('startedAt')
      .reverse()
      .first()
      .then((s) => {
        if (s?.zones?.length) setZones(s.zones);
      });
  }, []);

  // Oturum sürerken bölge değişikliklerini kaydet
  useEffect(() => {
    const s = sessionRef.current;
    if (s) void db.cameraSessions.update(s.id, { zones });
  }, [zones]);

  // ---------- Çizim ----------
  const draw = useCallback((boxes: Box[], trackIds: number[]) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;
    if (canvas.width !== vw || canvas.height !== vh) {
      canvas.width = vw;
      canvas.height = vh;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, vw, vh);
    const scale = Math.max(1, vw / 640);
    ctx.font = `${12 * scale}px system-ui, sans-serif`;
    zonesRef.current.forEach((z, i) => {
      const color = getComputedStyle(canvas).getPropertyValue(ZONE_COLORS[i % ZONE_COLORS.length].slice(4, -1)).trim() || '#2a78d6';
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5 * scale;
      ctx.setLineDash([6 * scale, 4 * scale]);
      ctx.strokeRect(z.x * vw, z.y * vh, z.w * vw, z.h * vh);
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.08;
      ctx.fillRect(z.x * vw, z.y * vh, z.w * vw, z.h * vh);
      ctx.globalAlpha = 1;
      ctx.fillText(z.name, z.x * vw + 4 * scale, z.y * vh + 14 * scale);
    });
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5 * scale;
    boxes.forEach((b, i) => {
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      const label = `#${trackIds[i] ?? '?'}`;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(b.x, Math.max(0, b.y - 16 * scale), ctx.measureText(label).width + 8 * scale, 16 * scale);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, b.x + 4 * scale, Math.max(12 * scale, b.y - 4 * scale));
    });
  }, []);

  // ---------- Dakikalık örnek kaydı ----------
  const flushMinute = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return;
    const acc = accRef.current;
    if (acc.frames === 0) return;
    const fin = finalizeMinute(acc);
    const sample: VisitorSample = { id: uid('vs'), sessionId: s.id, at: Math.floor(Date.now() / 60_000) * 60_000, ...fin };
    accRef.current = newMinuteAccumulator();
    await db.visitorSamples.add(sample);
  }, []);

  // ---------- Algılama döngüsü ----------
  const tick = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || video.paused || busyRef.current) return;
    busyRef.current = true;
    try {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const people = await detectPeople(video);
      const boxes: Box[] = people.map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h }));
      const tracker = trackerRef.current;
      const now = Date.now();
      const closed = tracker.update(boxes, now, zonesRef.current, vw, vh);
      const newTracks = tracker.createdCount - lastCreatedRef.current;
      lastCreatedRef.current = tracker.createdCount;
      accumulateFrame(accRef.current, boxes, zonesRef.current, vw, vh, newTracks, closed);
      sessionVisitsRef.current.push(...closed);
      // çizim: aktif izlerin kutuları
      const active = tracker.active;
      draw(active.map((t) => t.box), active.map((t) => t.id));
      const visits = sessionVisitsRef.current;
      const avgDwellSec = visits.length ? visits.reduce((a, v) => a + v.dwellMs, 0) / visits.length / 1000 : 0;
      const zoneSum = accRef.current.zoneSum;
      const busiest = Object.entries(zoneSum).sort((a, b) => b[1] - a[1])[0];
      const busiestZone = busiest && busiest[1] > 0 ? zonesRef.current.find((z) => z.id === busiest[0])?.name ?? '—' : '—';
      setLive({
        inside: active.length,
        sessionEntries: tracker.createdCount,
        avgDwellSec,
        busiestZone,
        liveEntriesThisMinute: accRef.current.entries,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      busyRef.current = false;
    }
  }, [draw]);

  const stop = useCallback(async () => {
    if (detectTimer.current) window.clearInterval(detectTimer.current);
    if (minuteTimer.current) window.clearInterval(minuteTimer.current);
    detectTimer.current = null;
    minuteTimer.current = null;
    const tracker = trackerRef.current;
    const closed = tracker.flush(Date.now());
    for (const v of closed) {
      accRef.current.dwellSum += v.dwellMs;
      accRef.current.dwellN += 1;
    }
    sessionVisitsRef.current.push(...closed);
    await flushMinute();
    const s = sessionRef.current;
    if (s) await db.cameraSessions.update(s.id, { endedAt: Date.now() });
    sessionRef.current = null;
    setLiveSessionId(null);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
      video.removeAttribute('src');
      video.load();
    }
    if (fileUrlRef.current) {
      URL.revokeObjectURL(fileUrlRef.current);
      fileUrlRef.current = null;
    }
    const canvas = canvasRef.current;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    setRunning(false);
    setLive((l) => ({ ...l, inside: 0 }));
  }, [flushMinute]);

  const beginSession = useCallback(async () => {
    const settings = await getSettings();
    trackerRef.current = new CentroidTracker();
    accRef.current = newMinuteAccumulator();
    lastCreatedRef.current = 0;
    sessionVisitsRef.current = [];
    const session: CameraSession = {
      id: uid('cs'),
      startedAt: Date.now(),
      label: source === 'camera' ? 'Cihaz kamerası' : 'Video dosyası',
      zones: zonesRef.current,
    };
    await db.cameraSessions.add(session);
    sessionRef.current = session;
    setLiveSessionId(session.id);
    const intervalMs = Math.max(150, Math.min(2000, (settings.cameraSampleIntervalSec || 0.2) * 1000));
    detectTimer.current = window.setInterval(() => void tick(), Math.min(intervalMs, 250));
    minuteTimer.current = window.setInterval(() => void flushMinute(), 60_000);
    setRunning(true);
  }, [flushMinute, source, tick]);

  const ensureModel = useCallback(async () => {
    if (isDetectorReady()) return true;
    setModel({ step: 'Model yükleniyor…', ratio: 0.05 });
    try {
      await loadDetector((step, ratio) => setModel({ step, ratio }));
      return true;
    } catch (e) {
      setModel({ step: '', ratio: 0, error: e instanceof Error ? e.message : String(e) });
      return false;
    }
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    if (!(await ensureModel())) return;
    const video = videoRef.current;
    if (!video) return;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Bu tarayıcı kamera erişimini desteklemiyor.');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      setVideoSize({ w: video.videoWidth, h: video.videoHeight });
      await beginSession();
    } catch (e) {
      const name = (e as { name?: string }).name;
      setError(
        name === 'NotAllowedError'
          ? 'Kamera izni verilmedi. Tarayıcı adres çubuğundan kamera iznini açın ve yeniden deneyin.'
          : name === 'NotFoundError'
            ? 'Kamera bulunamadı. Demo için bir video dosyası yükleyebilirsiniz.'
            : e instanceof Error
              ? e.message
              : String(e),
      );
    }
  }, [beginSession, ensureModel]);

  const startFile = useCallback(
    async (file: File) => {
      setError(null);
      if (!(await ensureModel())) return;
      const video = videoRef.current;
      if (!video) return;
      try {
        if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current);
        const url = URL.createObjectURL(file);
        fileUrlRef.current = url;
        video.srcObject = null;
        video.src = url;
        video.loop = true;
        video.muted = true;
        await video.play();
        setVideoSize({ w: video.videoWidth, h: video.videoHeight });
        await beginSession();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [beginSession, ensureModel],
  );

  // unmount: akışı ve zamanlayıcıları kapat
  useEffect(() => {
    return () => {
      if (detectTimer.current) window.clearInterval(detectTimer.current);
      if (minuteTimer.current) window.clearInterval(minuteTimer.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current);
      const s = sessionRef.current;
      if (s) void db.cameraSessions.update(s.id, { endedAt: Date.now() });
    };
  }, []);

  // ---------- Bölge çizimi (pointer) ----------
  const toNorm = (e: React.PointerEvent) => {
    const wrap = wrapRef.current;
    if (!wrap) return null;
    const r = wrap.getBoundingClientRect();
    const vid = videoRef.current;
    const c = containedRect(r.width, r.height, vid?.videoWidth || videoSize.w || 4, vid?.videoHeight || videoSize.h || 3);
    const nx = (e.clientX - r.left - c.x) / c.w;
    const ny = (e.clientY - r.top - c.y) / c.h;
    return { x: Math.min(1, Math.max(0, nx)), y: Math.min(1, Math.max(0, ny)) };
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (!drawMode) return;
    const p = toNorm(e);
    if (!p) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setWrapBox({ w: r.width, h: r.height });
    const vid = videoRef.current;
    if (vid?.videoWidth) setVideoSize({ w: vid.videoWidth, h: vid.videoHeight });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrawing({ x: p.x, y: p.y, w: 0, h: 0 });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawMode || !drawing) return;
    const p = toNorm(e);
    if (!p) return;
    setDrawing({ ...drawing, w: p.x - drawing.x, h: p.y - drawing.y });
  };
  const onPointerUp = () => {
    if (!drawMode || !drawing) return;
    const rect: Rect = {
      x: Math.min(drawing.x, drawing.x + drawing.w),
      y: Math.min(drawing.y, drawing.y + drawing.h),
      w: Math.abs(drawing.w),
      h: Math.abs(drawing.h),
    };
    setDrawing(null);
    if (rect.w < 0.03 || rect.h < 0.03) return;
    setPendingZone(rect);
    setZoneName('');
  };
  const saveZone = () => {
    if (!pendingZone) return;
    const name = zoneName.trim() || `Bölge ${zones.length + 1}`;
    setZones([...zones, { id: uid('z'), name, ...pendingZone }]);
    setPendingZone(null);
    setDrawMode(false);
  };
  const removeZone = (id: string) => setZones(zones.filter((z) => z.id !== id));

  // ---------- Geçmiş analizi ----------
  const zoneNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sessions) for (const z of s.zones) m.set(z.id, z.name);
    for (const z of zones) m.set(z.id, z.name);
    return m;
  }, [sessions, zones]);

  const todayEntries = useMemo(() => {
    const t0 = startOfDay(now);
    return samples.filter((s) => s.at >= t0).reduce((a, s) => a + s.entries, 0) + (running ? live.liveEntriesThisMinute : 0);
  }, [samples, running, live.liveEntriesThisMinute, now]);

  const hourly = useMemo(() => hourlyEntries(samples).map((v, h) => ({ hour: `${String(h).padStart(2, '0')}`, entries: v })), [samples]);
  const daily = useMemo(() => {
    const out: { day: string; entries: number }[] = [];
    const t0 = startOfDay(now);
    for (let i = 13; i >= 0; i--) {
      const ds = t0 - i * 86_400_000;
      const de = ds + 86_400_000;
      const d = new Date(ds);
      out.push({
        day: `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`,
        entries: samples.filter((s) => s.at >= ds && s.at < de).reduce((a, s) => a + s.entries, 0),
      });
    }
    return out;
  }, [samples, now]);
  const zoneDist = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of samples) for (const [zid, v] of Object.entries(s.zoneCounts)) {
      const name = zoneNameById.get(zid) ?? zid;
      m.set(name, (m.get(name) ?? 0) + v);
    }
    const total = [...m.values()].reduce((a, b) => a + b, 0) || 1;
    return [...m.entries()].map(([name, v]) => ({ name, share: Math.round((v / total) * 100) })).sort((a, b) => b.share - a.share);
  }, [samples, zoneNameById]);
  const heat = useMemo(() => mergeHeat(samples.map((s) => s.heat)), [samples]);
  const histAvgDwell = useMemo(() => {
    const d = samples.filter((s) => s.avgDwellSec > 0);
    return d.length ? d.reduce((a, s) => a + s.avgDwellSec, 0) / d.length : 0;
  }, [samples]);
  const allZones = useMemo(() => {
    const seen = new Map<string, CameraZone>();
    for (const s of sessions) for (const z of s.zones) seen.set(z.id, z);
    for (const z of zones) seen.set(z.id, z);
    return [...seen.values()];
  }, [sessions, zones]);
  const insightList = useMemo(() => insights(samples, allZones), [samples, allZones]);

  const sessionStats = (s: CameraSession) => {
    const ss = samples.filter((x) => x.sessionId === s.id);
    const entries = ss.reduce((a, x) => a + x.entries, 0);
    const dur = Math.round(((s.endedAt ?? now) - s.startedAt) / 60_000);
    return { entries, dur };
  };
  const deleteSession = async (s: CameraSession) => {
    if (!window.confirm('Bu oturum ve dakikalık özetleri silinsin mi? Bu işlem geri alınamaz.')) return;
    await db.transaction('rw', db.cameraSessions, db.visitorSamples, async () => {
      await db.visitorSamples.where('sessionId').equals(s.id).delete();
      await db.cameraSessions.delete(s.id);
    });
  };

  const drawingStyle = (() => {
    const r = drawing ?? pendingZone;
    if (!r || !wrapBox.w) return undefined;
    const c = containedRect(wrapBox.w, wrapBox.h, videoSize.w || 4, videoSize.h || 3);
    const x = Math.min(r.x, r.x + r.w);
    const y = Math.min(r.y, r.y + r.h);
    return {
      position: 'absolute' as const,
      left: c.x + x * c.w,
      top: c.y + y * c.h,
      width: Math.abs(r.w) * c.w,
      height: Math.abs(r.h) * c.h,
      border: '2px solid var(--accent)',
      background: 'rgba(235,104,52,0.15)',
      pointerEvents: 'none' as const,
    };
  })();

  return (
    <>
      <PageHead
        title="Kamera ile müşteri analizi"
        subtitle="Mağaza veya showroom kamerasından anonim ziyaretçi sayımı, kalış süresi ve bölge yoğunluğu"
        actions={
          running ? (
            <button className="btn danger" onClick={() => void stop()}>
              Durdur
            </button>
          ) : null
        }
      />

      <Alert tone="info">
        <strong>Gizlilik (KVKK):</strong> Görüntü yalnızca bu cihazda, tarayıcı içinde işlenir; hiçbir kare kaydedilmez ve
        sunucuya gönderilmez. Yüz tanıma yapılmaz, kişi kimliği çıkarılmaz. Yalnızca dakikalık sayılar (kişi sayısı, kalış süresi,
        bölge yoğunluğu) saklanır. Açık model: TensorFlow.js COCO-SSD; ilk kullanımda ~6 MB indirilir, sonra çevrimdışı çalışır.
      </Alert>

      <div className="grid grid-4" style={{ marginTop: 16 }}>
        <Stat label="Şu an içeride" value={running ? live.inside : '—'} delta={running ? 'canlı' : 'oturum kapalı'} />
        <Stat label="Bugünkü ziyaretçi" value={fmtNum(todayEntries)} delta={running ? `bu oturumda ${live.sessionEntries}` : undefined} />
        <Stat label="Ortalama kalış" value={fmtDwell(running && live.avgDwellSec ? live.avgDwellSec : histAvgDwell)} delta={running ? 'bu oturum' : 'tüm oturumlar'} />
        <Stat label="En yoğun bölge" value={running ? live.busiestZone : (zoneDist[0]?.name ?? '—')} delta={running ? 'bu dakika' : 'geçmiş'} />
      </div>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <Card
          title="Canlı görüntü"
          subtitle={running ? 'Kişiler beyaz kutu, bölgeler kesikli çizgi' : 'Kaynak seçip başlatın'}
          actions={
            <>
              <button className={`chip ${drawMode ? 'active' : ''}`} onClick={() => setDrawMode((d) => !d)} disabled={!running && !videoSize.w}>
                {drawMode ? 'Çizimi bitir' : '+ Bölge çiz'}
              </button>
            </>
          }
        >
          {!running && (
            <div className="row" style={{ marginBottom: 12 }}>
              <div className="chips" role="radiogroup" aria-label="Kaynak">
                <button className={`chip ${source === 'camera' ? 'active' : ''}`} role="radio" aria-checked={source === 'camera'} onClick={() => setSource('camera')}>
                  Cihaz kamerası
                </button>
                <button className={`chip ${source === 'file' ? 'active' : ''}`} role="radio" aria-checked={source === 'file'} onClick={() => setSource('file')}>
                  Video dosyası (demo)
                </button>
              </div>
              {source === 'camera' ? (
                <button className="btn primary" onClick={() => void startCamera()} disabled={model.ratio > 0 && model.ratio < 1}>
                  Başlat
                </button>
              ) : (
                <label className="btn primary" style={{ cursor: 'pointer' }}>
                  Video seç ve başlat
                  <input
                    type="file"
                    accept="video/*"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void startFile(f);
                      e.target.value = '';
                    }}
                  />
                </label>
              )}
            </div>
          )}
          {model.ratio > 0 && model.ratio < 1 && (
            <div style={{ marginBottom: 12 }}>
              <p className="small muted" style={{ marginBottom: 6 }}>
                {model.step}
              </p>
              <Progress value={model.ratio} />
            </div>
          )}
          {model.error && <Alert tone="bad">{model.error}</Alert>}
          {error && (
            <div style={{ marginBottom: 12 }}>
              <Alert tone="warn">{error}</Alert>
            </div>
          )}
          <div
            ref={wrapRef}
            className="video-wrap"
            style={{ cursor: drawMode ? 'crosshair' : 'default', touchAction: drawMode ? 'none' : 'auto' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <video ref={videoRef} playsInline muted aria-label="Kamera görüntüsü" />
            <canvas ref={canvasRef} aria-hidden />
            {drawingStyle && <div style={drawingStyle} />}
            {!running && !videoSize.w && (
              <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#bbb', fontSize: 14, padding: 16, textAlign: 'center' }}>
                Görüntü burada görünür. Kamera yoksa demo için kısa bir mağaza videosu yükleyin.
              </div>
            )}
          </div>
          {drawMode && (
            <p className="tiny" style={{ marginTop: 8 }}>
              Görüntü üzerinde sürükleyerek bir dikdörtgen çizin; ardından bölgeye ad verin.
            </p>
          )}
          <div className="chips" style={{ marginTop: 12 }} aria-label="Bölgeler">
            {zones.map((z, i) => (
              <span key={z.id} className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: ZONE_COLORS[i % ZONE_COLORS.length] }} aria-hidden />
                {z.name}
                <button className="btn ghost sm" style={{ minHeight: 20, padding: '0 4px' }} onClick={() => removeZone(z.id)} aria-label={`${z.name} bölgesini sil`}>
                  ✕
                </button>
              </span>
            ))}
            {zones.length === 0 && <span className="tiny">Bölge yok — "+ Bölge çiz" ile ekleyin.</span>}
          </div>
        </Card>

        <Card title="AI içgörüler" subtitle="Dakikalık özetlerden kural tabanlı çıkarımlar">
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 8 }}>
            {insightList.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
          <hr className="sep" />
          <h3 style={{ marginBottom: 8 }}>Isı haritası</h3>
          <p className="tiny" style={{ marginBottom: 8 }}>
            Ziyaretçilerin durduğu noktalar (tüm oturumlar, 8×6 ızgara). Koyu hücre = daha yoğun.
          </p>
          <div className="heat" role="img" aria-label="Ziyaretçi ısı haritası">
            {heat.map((v, i) => (
              <span key={i} style={{ opacity: 0.08 + v * 0.92 }} title={`Hücre ${Math.floor(i / HEAT_COLS) + 1}-${(i % HEAT_COLS) + 1}: %${Math.round(v * 100)}`} />
            ))}
          </div>
        </Card>
      </div>

      <Card
        title="Geçmiş analizi"
        subtitle={`${sessions.length} oturum · ${samples.length} dakikalık özet`}
        actions={
          <button className="btn sm" onClick={() => setTableView((t) => !t)} aria-pressed={tableView}>
            {tableView ? 'Grafik görünümü' : 'Tablo görünümü'}
          </button>
        }
        className="card"
      >
        {samples.length === 0 ? (
          <Empty title="Henüz özet yok" hint="Bir oturum başlatın; her dakika bir özet kaydedilir ve grafikler burada oluşur." />
        ) : tableView ? (
          <div className="grid grid-3">
            <div className="table-wrap">
              <table className="table">
                <caption className="small muted" style={{ textAlign: 'left', paddingBottom: 6 }}>Saatlik giriş</caption>
                <thead><tr><th>Saat</th><th className="num">Giriş</th></tr></thead>
                <tbody>
                  {hourly.filter((h) => h.entries > 0).map((h) => (
                    <tr key={h.hour}><td>{h.hour}:00</td><td className="num">{h.entries}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-wrap">
              <table className="table">
                <caption className="small muted" style={{ textAlign: 'left', paddingBottom: 6 }}>Günlük giriş (14 gün)</caption>
                <thead><tr><th>Gün</th><th className="num">Giriş</th></tr></thead>
                <tbody>{daily.map((d) => (<tr key={d.day}><td>{d.day}</td><td className="num">{d.entries}</td></tr>))}</tbody>
              </table>
            </div>
            <div className="table-wrap">
              <table className="table">
                <caption className="small muted" style={{ textAlign: 'left', paddingBottom: 6 }}>Bölge dağılımı</caption>
                <thead><tr><th>Bölge</th><th className="num">Pay</th></tr></thead>
                <tbody>{zoneDist.map((z) => (<tr key={z.name}><td>{z.name}</td><td className="num">%{z.share}</td></tr>))}</tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="grid grid-3">
            <div>
              <h3 style={{ marginBottom: 8 }}>Saatlik ziyaretçi girişi</h3>
              <div style={{ height: 220 }}>
                <ResponsiveContainer>
                  <BarChart data={hourly} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--grid)" />
                    <XAxis dataKey="hour" {...axisProps} interval={3} />
                    <YAxis {...axisProps} allowDecimals={false} />
                    <Tooltip {...tooltipStyle} formatter={(v) => [`${v} giriş`, 'Ziyaretçi']} labelFormatter={(l) => `${l}:00`} />
                    <Bar dataKey="entries" fill="var(--s1)" radius={[4, 4, 0, 0]} maxBarSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div>
              <h3 style={{ marginBottom: 8 }}>Günlük trend (son 14 gün)</h3>
              <div style={{ height: 220 }}>
                <ResponsiveContainer>
                  <LineChart data={daily} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--grid)" />
                    <XAxis dataKey="day" {...axisProps} interval={2} />
                    <YAxis {...axisProps} allowDecimals={false} />
                    <Tooltip {...tooltipStyle} formatter={(v) => [`${v} giriş`, 'Ziyaretçi']} />
                    <Line type="monotone" dataKey="entries" stroke="var(--s1)" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div>
              <h3 style={{ marginBottom: 8 }}>Bölge dağılımı</h3>
              <div style={{ height: 220 }}>
                {zoneDist.length === 0 ? (
                  <p className="tiny">Bölge verisi yok.</p>
                ) : (
                  <ResponsiveContainer>
                    <BarChart data={zoneDist} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
                      <CartesianGrid horizontal={false} stroke="var(--grid)" />
                      <XAxis type="number" {...axisProps} unit="%" domain={[0, 100]} />
                      <YAxis type="category" dataKey="name" {...axisProps} width={72} />
                      <Tooltip {...tooltipStyle} formatter={(v) => [`%${v}`, 'Pay']} />
                      <Bar dataKey="share" fill="var(--s3)" radius={[0, 4, 4, 0]} maxBarSize={18} label={{ position: 'right', fill: 'var(--text-2)', fontSize: 12, formatter: (v: unknown) => `%${String(v ?? "")}` }} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        )}
      </Card>

      <Card title="Oturum geçmişi" subtitle="Her satır bir izleme oturumu; ham görüntü saklanmaz">
        {sessions.length === 0 ? (
          <Empty title="Oturum yok" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Başlangıç</th>
                  <th>Kaynak</th>
                  <th className="num">Süre</th>
                  <th className="num">Ziyaretçi</th>
                  <th>Durum</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => {
                  const st = sessionStats(s);
                  const isLive = liveSessionId === s.id;
                  return (
                    <tr key={s.id}>
                      <td>{fmtDateTime(s.startedAt)}</td>
                      <td>{s.label ?? '—'}</td>
                      <td className="num">{st.dur} dk</td>
                      <td className="num">{st.entries}</td>
                      <td>{isLive ? <Badge tone="good">Canlı</Badge> : s.endedAt ? <Badge>Tamamlandı</Badge> : <Badge tone="warn">Kapatılmadı</Badge>}</td>
                      <td className="num">
                        <button className="btn sm danger" disabled={isLive} onClick={() => void deleteSession(s)}>
                          Sil
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={pendingZone !== null} title="Yeni bölge" onClose={() => setPendingZone(null)}>
        <Field label="Bölge adı" hint="Örn. Giriş, Kumaş reyonu, Kasa, Deneme kabini">
          <input className="input" value={zoneName} onChange={(e) => setZoneName(e.target.value)} autoFocus placeholder="Bölge adı" onKeyDown={(e) => e.key === 'Enter' && saveZone()} />
        </Field>
        <div className="row end" style={{ marginTop: 16 }}>
          <button className="btn" onClick={() => setPendingZone(null)}>
            Vazgeç
          </button>
          <button className="btn primary" onClick={saveZone}>
            Kaydet
          </button>
        </div>
      </Modal>
    </>
  );
}
