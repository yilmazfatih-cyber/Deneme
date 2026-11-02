using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace RoyalMatch
{
    /// <summary>
    /// Saf oyun mantığı (Unity bileşeni değil). Royal Match kuralları:
    /// 3'lü eşleme; 4'lü → Roket (dik yönde); 5'li → Işık Topu; L/T → TNT; 2x2 kare → Pervane.
    /// Güçlendirici kombinasyonları, engeller, yer çekimi ve karıştırma burada.
    /// </summary>
    public class BoardModel
    {
        public readonly int W, H;
        public readonly Cell[,] cells;
        public readonly LevelData level;
        public readonly Dictionary<GoalType, int> goals = new Dictionary<GoalType, int>();
        public int movesLeft;
        public readonly List<BoardEvent> events = new List<BoardEvent>();
        public readonly List<PendingActivation> pending = new List<PendingActivation>();
        private readonly System.Random rnd;
        private readonly HashSet<Vector2Int> hitThisStep = new HashSet<Vector2Int>();

        public BoardModel(LevelData lv) : this(lv, true) { }

        private BoardModel(LevelData lv, bool fill)
        {
            level = lv; W = lv.width; H = lv.height;
            rnd = new System.Random(lv.seed);
            movesLeft = lv.moves;
            cells = new Cell[W, H];
            for (int x = 0; x < W; x++)
                for (int y = 0; y < H; y++)
                {
                    var c = new Cell { x = x, y = y, exists = lv.mask[x, y], blocker = lv.blocker[x, y], blockerHp = lv.blockerHp[x, y], grass = lv.grass[x, y], chain = lv.chain[x, y] };
                    cells[x, y] = c;
                }
            foreach (var g in lv.goals) goals[g.type] = g.count;
            if (fill) FillInitial();
        }

        /// <summary>Durumun bağımsız kopyası (ipucu/denge simülasyonu için). Rastgelelik yeni tohumla başlar.</summary>
        public BoardModel Clone(int seedOffset = 1)
        {
            var m = new BoardModel(level, false);
            for (int x = 0; x < W; x++)
                for (int y = 0; y < H; y++)
                {
                    var s = cells[x, y]; var d = m.cells[x, y];
                    d.exists = s.exists; d.blocker = s.blocker; d.blockerHp = s.blockerHp; d.grass = s.grass; d.chain = s.chain;
                    d.piece = s.piece == null ? null : new Piece(s.piece);
                }
            m.goals.Clear(); foreach (var kv in goals) m.goals[kv.Key] = kv.Value;
            m.movesLeft = movesLeft;
            foreach (var p in pending) m.pending.Add(p);
            m.rndOverride = new System.Random(level.seed + seedOffset * 7919 + movesLeft);
            return m;
        }

        private System.Random rndOverride;
        private System.Random Rng { get { return rndOverride ?? rnd; } }

        public bool In(int x, int y) { return x >= 0 && y >= 0 && x < W && y < H; }
        public Cell At(int x, int y) { return In(x, y) ? cells[x, y] : null; }
        public bool GoalsDone { get { foreach (var kv in goals) if (kv.Value > 0) return false; return true; } }

        private PieceColor RandomColor() { return (PieceColor)Rng.Next(level.colorCount); }

        private void FillInitial()
        {
            for (int y = 0; y < H; y++)
                for (int x = 0; x < W; x++)
                {
                    var c = cells[x, y];
                    if (!c.exists || c.HasBlocker) continue;
                    Piece p = new Piece(RandomColor());
                    int guard = 0;
                    while (guard++ < 20 && MakesMatchAt(x, y, p.color)) p.color = RandomColor();
                    c.piece = p;
                }
            EnsureMoveExists(false);
        }

        private bool MakesMatchAt(int x, int y, PieceColor col)
        {
            int h = 1, v = 1;
            for (int i = x - 1; i >= 0 && Same(i, y, col); i--) h++;
            for (int i = x + 1; i < W && Same(i, y, col); i++) h++;
            for (int j = y - 1; j >= 0 && Same(x, j, col); j--) v++;
            for (int j = y + 1; j < H && Same(x, j, col); j++) v++;
            return h >= 3 || v >= 3;
        }

        private bool Same(int x, int y, PieceColor col)
        {
            var c = At(x, y);
            return c != null && c.exists && c.piece != null && !c.piece.IsBooster && c.piece.color == col;
        }

        /// <summary>Seviye başı güçlendiricileri rastgele normal taşların yerine koyar.</summary>
        public void PlaceStartBoosters(IList<StartBooster> boosters)
        {
            var spots = new List<Cell>();
            for (int x = 0; x < W; x++) for (int y = 0; y < H; y++) if (cells[x, y].Movable && !cells[x, y].piece.IsBooster) spots.Add(cells[x, y]);
            foreach (var b in boosters)
            {
                if (spots.Count == 0) break;
                var c = spots[Rng.Next(spots.Count)]; spots.Remove(c);
                c.piece = b == StartBooster.Rocket ? new Piece(PieceKind.Rocket, Rng.Next(2) == 0 ? RocketDir.Horizontal : RocketDir.Vertical)
                    : b == StartBooster.Tnt ? new Piece(PieceKind.Tnt) : new Piece(PieceKind.LightBall);
            }
        }

        // ------------------------------------------------------------------ Hamle
        public enum SwapResult { Invalid, NoMatch, Ok }

        /// <summary>İki komşu hücreyi değiştirmeyi dener. Geçerliyse hamle düşer ve etkinleşmeler kuyruğa girer.</summary>
        public SwapResult TrySwap(Vector2Int a, Vector2Int b)
        {
            if (Mathf.Abs(a.x - b.x) + Mathf.Abs(a.y - b.y) != 1) return SwapResult.Invalid;
            Cell ca = At(a.x, a.y), cb = At(b.x, b.y);
            if (ca == null || cb == null || !ca.Movable || !cb.Movable) return SwapResult.Invalid;
            Piece pa = ca.piece, pb = cb.piece;
            ca.piece = pb; cb.piece = pa;

            if (pa.IsBooster && pb.IsBooster)
            {
                // Kombo: b hücresinde patlar
                cb.piece = null; ca.piece = null;
                pending.Add(new PendingActivation { x = b.x, y = b.y, kind = pa.kind, dir = pa.dir, combo = pb.kind, fromSwap = true });
                if (pa.kind == PieceKind.LightBall && pb.kind == PieceKind.LightBall) pending[pending.Count - 1].kind = PieceKind.LightBall;
                movesLeft--;
                return SwapResult.Ok;
            }
            if (pa.IsBooster || pb.IsBooster)
            {
                Piece booster = pa.IsBooster ? pa : pb;
                Piece other = pa.IsBooster ? pb : pa;
                Cell boosterCell = pa.IsBooster ? cb : ca; // güçlendirici yeni yerine gitti
                boosterCell.piece = null;
                pending.Add(new PendingActivation { x = boosterCell.x, y = boosterCell.y, kind = booster.kind, dir = booster.dir, combo = PieceKind.Normal, colorHint = other.color, fromSwap = true });
                movesLeft--;
                return SwapResult.Ok;
            }
            bool match = MakesMatchAt(a.x, a.y, pb.color) || MakesMatchAt(b.x, b.y, pa.color) || SquareAt(a.x, a.y) || SquareAt(b.x, b.y);
            if (!match)
            {
                ca.piece = pa; cb.piece = pb;
                return SwapResult.NoMatch;
            }
            movesLeft--;
            lastSwap = new[] { a, b };
            return SwapResult.Ok;
        }

        private Vector2Int[] lastSwap;

        /// <summary>Güçlendiriciye dokunma: hamle harcar, yerinde patlar.</summary>
        public bool TapBooster(Vector2Int p)
        {
            var c = At(p.x, p.y);
            if (c == null || !c.Movable || !c.piece.IsBooster) return false;
            Piece b = c.piece; c.piece = null;
            pending.Add(new PendingActivation { x = p.x, y = p.y, kind = b.kind, dir = b.dir, combo = PieceKind.Normal, fromSwap = true });
            movesLeft--;
            return true;
        }

        // ------------------------------------------------------------------ Çözümleme adımı
        /// <summary>Bir dalga: bekleyen güçlendiriciler + eşlemeler. Bir şey olduysa true.</summary>
        public bool ResolveStep()
        {
            events.Clear();
            hitThisStep.Clear();
            bool any = false;

            if (pending.Count > 0)
            {
                var batch = new List<PendingActivation>(pending);
                pending.Clear();
                foreach (var act in batch) { Activate(act); any = true; }
            }

            var groups = FindMatchGroups();
            if (groups.Count > 0)
            {
                any = true;
                foreach (var g in groups) ClearGroup(g);
            }
            lastSwap = null;
            return any;
        }

        // ------------------------------------------------------------------ Eşleme bulma
        private class Group
        {
            public HashSet<Vector2Int> cells = new HashSet<Vector2Int>();
            public PieceColor color;
            public int maxRun;
            public bool hasH, hasV, square;
            public Vector2Int? intersection;
        }

        private List<Group> FindMatchGroups()
        {
            var groupOf = new Dictionary<Vector2Int, Group>();
            var groups = new List<Group>();
            // Yatay ve dikey koşular
            for (int pass = 0; pass < 2; pass++)
            {
                int outer = pass == 0 ? H : W, inner = pass == 0 ? W : H;
                for (int o = 0; o < outer; o++)
                {
                    int i = 0;
                    while (i < inner)
                    {
                        int x = pass == 0 ? i : o, y = pass == 0 ? o : i;
                        var c = cells[x, y];
                        if (!c.exists || c.piece == null || c.piece.IsBooster || c.HasBlocker) { i++; continue; }
                        int j = i + 1;
                        while (j < inner)
                        {
                            int x2 = pass == 0 ? j : o, y2 = pass == 0 ? o : j;
                            if (!Same(x2, y2, c.piece.color)) break;
                            j++;
                        }
                        int len = j - i;
                        if (len >= 3)
                        {
                            var run = new List<Vector2Int>();
                            for (int k = i; k < j; k++) run.Add(new Vector2Int(pass == 0 ? k : o, pass == 0 ? o : k));
                            Group g = null;
                            foreach (var p in run) if (groupOf.TryGetValue(p, out g)) break;
                            if (g == null) { g = new Group { color = c.piece.color }; groups.Add(g); }
                            else
                            {
                                foreach (var p in run) if (groupOf.ContainsKey(p) && g.intersection == null) g.intersection = p;
                            }
                            g.maxRun = Mathf.Max(g.maxRun, len);
                            if (pass == 0) g.hasH = true; else g.hasV = true;
                            foreach (var p in run) { g.cells.Add(p); groupOf[p] = g; }
                        }
                        i = j;
                    }
                }
            }
            // 2x2 kareler
            for (int x = 0; x < W - 1; x++)
                for (int y = 0; y < H - 1; y++)
                {
                    var c = cells[x, y];
                    if (!c.exists || c.piece == null || c.piece.IsBooster || c.HasBlocker) continue;
                    PieceColor col = c.piece.color;
                    if (!Same(x + 1, y, col) || !Same(x, y + 1, col) || !Same(x + 1, y + 1, col)) continue;
                    var sq = new[] { new Vector2Int(x, y), new Vector2Int(x + 1, y), new Vector2Int(x, y + 1), new Vector2Int(x + 1, y + 1) };
                    Group g = null;
                    foreach (var p in sq) if (groupOf.TryGetValue(p, out g)) break;
                    if (g == null) { g = new Group { color = col, square = true }; groups.Add(g); }
                    foreach (var p in sq) { g.cells.Add(p); groupOf[p] = g; }
                }
            return groups;
        }

        private void ClearGroup(Group g)
        {
            PieceKind created = PieceKind.Normal;
            RocketDir dir = RocketDir.Horizontal;
            if (g.maxRun >= 5) created = PieceKind.LightBall;
            else if (g.hasH && g.hasV) created = PieceKind.Tnt;
            else if (g.maxRun == 4) { created = PieceKind.Rocket; dir = g.hasH ? RocketDir.Vertical : RocketDir.Horizontal; }
            else if (g.square && g.maxRun < 3) created = PieceKind.Propeller;

            // Oluşum noktası: oyuncunun oynattığı taş, yoksa kesişim, yoksa merkeze en yakın
            Vector2Int pivot = g.cells.First();
            if (lastSwap != null && g.cells.Contains(lastSwap[1])) pivot = lastSwap[1];
            else if (lastSwap != null && g.cells.Contains(lastSwap[0])) pivot = lastSwap[0];
            else if (g.intersection != null) pivot = g.intersection.Value;
            else
            {
                float cx = 0, cy = 0; foreach (var p in g.cells) { cx += p.x; cy += p.y; }
                cx /= g.cells.Count; cy /= g.cells.Count;
                float best = float.MaxValue;
                foreach (var p in g.cells) { float d = (p.x - cx) * (p.x - cx) + (p.y - cy) * (p.y - cy); if (d < best) { best = d; pivot = p; } }
            }

            var adjacentBlockers = new HashSet<Vector2Int>();
            foreach (var p in g.cells)
            {
                var c = cells[p.x, p.y];
                if (c.piece == null) continue;
                Piece piece = c.piece;
                if (created != PieceKind.Normal && p == pivot)
                {
                    // Taş kaybolur ama hedef sayılır; yerine güçlendirici gelir
                    RemovePiece(c, HitSource.Match);
                }
                else RemovePiece(c, HitSource.Match);
                if (c.chain) { c.chain = false; Progress(GoalType.Chain, p); Emit(new BoardEvent { kind = EvKind.ChainBroken, x = p.x, y = p.y }); }
                if (c.grass > 0) { c.grass--; Progress(GoalType.Grass, p); Emit(new BoardEvent { kind = EvKind.GrassCleared, x = p.x, y = p.y, value = c.grass }); }
                foreach (var n in Neighbors4(p)) { var nc = At(n.x, n.y); if (nc != null && nc.exists && nc.HasBlocker) adjacentBlockers.Add(n); }
            }
            foreach (var b in adjacentBlockers) DamageBlocker(cells[b.x, b.y]);

            if (created != PieceKind.Normal)
            {
                var pc = cells[pivot.x, pivot.y];
                pc.piece = new Piece(created, dir);
                Emit(new BoardEvent { kind = EvKind.BoosterCreated, x = pivot.x, y = pivot.y, piece = pc.piece, cells = g.cells.ToList(), color = g.color });
            }
        }

        private static readonly Vector2Int[] dirs4 = { new Vector2Int(1, 0), new Vector2Int(-1, 0), new Vector2Int(0, 1), new Vector2Int(0, -1) };
        private IEnumerable<Vector2Int> Neighbors4(Vector2Int p) { foreach (var d in dirs4) yield return p + d; }

        private void Emit(BoardEvent e) { events.Add(e); }

        private void Progress(GoalType g, Vector2Int at)
        {
            int v;
            if (!goals.TryGetValue(g, out v) || v <= 0) return;
            goals[g] = v - 1;
            Emit(new BoardEvent { kind = EvKind.GoalProgress, goal = g, x = at.x, y = at.y, value = v - 1 });
        }

        private void RemovePiece(Cell c, HitSource src)
        {
            Piece p = c.piece;
            if (p == null) return;
            c.piece = null;
            if (p.IsBooster)
            {
                // Başka bir patlamanın tetiklediği güçlendirici zincirleme patlar
                pending.Add(new PendingActivation { x = c.x, y = c.y, kind = p.kind, dir = p.dir, combo = PieceKind.Normal });
                return;
            }
            Progress(LevelData.ColorGoal(p.color), c.Pos);
            Emit(new BoardEvent { kind = EvKind.PieceCleared, x = c.x, y = c.y, piece = p, color = p.color });
        }

        private void DamageBlocker(Cell c)
        {
            if (!c.HasBlocker) return;
            c.blockerHp--;
            if (c.blockerHp <= 0)
            {
                BlockerType t = c.blocker;
                c.blocker = BlockerType.None; c.blockerHp = 0;
                Progress(LevelData.BlockerGoal(t), c.Pos);
                Emit(new BoardEvent { kind = EvKind.BlockerCleared, x = c.x, y = c.y, blocker = t });
            }
            else Emit(new BoardEvent { kind = EvKind.BlockerHit, x = c.x, y = c.y, blocker = c.blocker, value = c.blockerHp });
        }

        /// <summary>Güçlendirici vuruşu: hücredeki her şeye bir birim hasar.</summary>
        private void Hit(int x, int y)
        {
            var c = At(x, y);
            if (c == null || !c.exists) return;
            var key = new Vector2Int(x, y);
            if (c.HasBlocker)
            {
                if (hitThisStep.Add(key)) DamageBlocker(c);
                return;
            }
            if (c.chain) { c.chain = false; Progress(GoalType.Chain, key); Emit(new BoardEvent { kind = EvKind.ChainBroken, x = x, y = y }); }
            if (c.grass > 0) { c.grass--; Progress(GoalType.Grass, key); Emit(new BoardEvent { kind = EvKind.GrassCleared, x = x, y = y, value = c.grass }); }
            if (c.piece != null) RemovePiece(c, HitSource.Booster);
        }

        // ------------------------------------------------------------------ Güçlendiriciler
        private void Activate(PendingActivation a)
        {
            PieceKind k1 = a.kind, k2 = a.combo;
            if (k2 != PieceKind.Normal)
            {
                // sıralama: LightBall en üstte
                if (Rank(k2) > Rank(k1)) { var t = k1; k1 = k2; k2 = t; }
                ActivateCombo(a, k1, k2);
                return;
            }
            switch (a.kind)
            {
                case PieceKind.Rocket: FireRocket(a.x, a.y, a.dir); break;
                case PieceKind.Tnt: FireTnt(a.x, a.y, 2); break;
                case PieceKind.Propeller: FirePropeller(a.x, a.y, PieceKind.Normal, 1); break;
                case PieceKind.LightBall: FireLightBall(a.x, a.y, a.colorHint ?? MostCommonColor()); break;
            }
        }

        private static int Rank(PieceKind k)
        {
            switch (k) { case PieceKind.LightBall: return 4; case PieceKind.Tnt: return 3; case PieceKind.Rocket: return 2; case PieceKind.Propeller: return 1; default: return 0; }
        }

        private void ActivateCombo(PendingActivation a, PieceKind hi, PieceKind lo)
        {
            if (hi == PieceKind.LightBall && lo == PieceKind.LightBall) { ClearWholeBoard(a.x, a.y); return; }
            if (hi == PieceKind.LightBall)
            {
                // Rengin tüm taşları o güçlendiriciye dönüşür ve patlar
                PieceColor col = MostCommonColor();
                var targets = new List<Vector2Int>();
                for (int x = 0; x < W; x++)
                    for (int y = 0; y < H; y++)
                    {
                        var c = cells[x, y];
                        if (c.exists && c.piece != null && !c.piece.IsBooster && c.piece.color == col && !c.HasBlocker)
                        {
                            targets.Add(c.Pos);
                            c.piece = null;
                            pending.Add(new PendingActivation { x = x, y = y, kind = lo, dir = Rng.Next(2) == 0 ? RocketDir.Horizontal : RocketDir.Vertical, combo = PieceKind.Normal });
                        }
                    }
                Emit(new BoardEvent { kind = EvKind.LightBallFired, x = a.x, y = a.y, cells = targets, color = col, payload = lo });
                return;
            }
            if (hi == PieceKind.Tnt && lo == PieceKind.Tnt) { FireTnt(a.x, a.y, 3); return; }
            if (hi == PieceKind.Tnt && lo == PieceKind.Rocket)
            {
                for (int d = -1; d <= 1; d++) { FireRocket(a.x, a.y + d, RocketDir.Horizontal); FireRocket(a.x + d, a.y, RocketDir.Vertical); }
                return;
            }
            if (hi == PieceKind.Rocket && lo == PieceKind.Rocket)
            {
                FireRocket(a.x, a.y, RocketDir.Horizontal); FireRocket(a.x, a.y, RocketDir.Vertical);
                return;
            }
            if (lo == PieceKind.Propeller && hi == PieceKind.Propeller) { FirePropeller(a.x, a.y, PieceKind.Propeller, 3); return; }
            if (lo == PieceKind.Propeller) { FirePropeller(a.x, a.y, hi, 1); return; }
        }

        private void FireRocket(int x, int y, RocketDir dir)
        {
            if (!In(x, y)) return;
            Emit(new BoardEvent { kind = EvKind.RocketFired, x = x, y = y, dir = dir });
            if (dir == RocketDir.Horizontal) for (int i = 0; i < W; i++) Hit(i, y);
            else for (int j = 0; j < H; j++) Hit(x, j);
        }

        private void FireTnt(int x, int y, int radius)
        {
            Emit(new BoardEvent { kind = EvKind.TntFired, x = x, y = y, radius = radius });
            for (int i = -radius; i <= radius; i++)
                for (int j = -radius; j <= radius; j++) Hit(x + i, y + j);
        }

        private void FirePropeller(int x, int y, PieceKind payload, int count)
        {
            foreach (var n in Neighbors4(new Vector2Int(x, y))) Hit(n.x, n.y);
            var used = new HashSet<Vector2Int>();
            for (int i = 0; i < count; i++)
            {
                Vector2Int t = PickPropellerTarget(used);
                used.Add(t);
                Emit(new BoardEvent { kind = EvKind.PropellerFlight, x = x, y = y, tx = t.x, ty = t.y, payload = payload });
                switch (payload)
                {
                    case PieceKind.Rocket: FireRocket(t.x, t.y, RocketDir.Horizontal); FireRocket(t.x, t.y, RocketDir.Vertical); break;
                    case PieceKind.Tnt: FireTnt(t.x, t.y, 2); break;
                    case PieceKind.LightBall: FireLightBall(t.x, t.y, MostCommonColor()); break;
                    case PieceKind.Propeller: for (int a = -1; a <= 1; a++) for (int b = -1; b <= 1; b++) Hit(t.x + a, t.y + b); break;
                    default: Hit(t.x, t.y); break;
                }
            }
        }

        /// <summary>Pervane hedefi: hedefe sayılan engel/çimen/renk öncelikli, yoksa rastgele.</summary>
        private Vector2Int PickPropellerTarget(HashSet<Vector2Int> exclude)
        {
            var best = new List<Vector2Int>(); var ok = new List<Vector2Int>();
            for (int x = 0; x < W; x++)
                for (int y = 0; y < H; y++)
                {
                    var c = cells[x, y];
                    if (!c.exists || exclude.Contains(c.Pos)) continue;
                    bool relevant = false;
                    if (c.HasBlocker && goals.ContainsKey(LevelData.BlockerGoal(c.blocker)) && goals[LevelData.BlockerGoal(c.blocker)] > 0) relevant = true;
                    if (c.grass > 0 && Remaining(GoalType.Grass) > 0) relevant = true;
                    if (c.chain && Remaining(GoalType.Chain) > 0) relevant = true;
                    if (c.piece != null && !c.piece.IsBooster && Remaining(LevelData.ColorGoal(c.piece.color)) > 0) relevant = true;
                    if (relevant) best.Add(c.Pos);
                    if (c.piece != null || c.HasBlocker) ok.Add(c.Pos);
                }
            var pool = best.Count > 0 ? best : ok;
            if (pool.Count == 0) return new Vector2Int(W / 2, H / 2);
            return pool[Rng.Next(pool.Count)];
        }

        public int Remaining(GoalType g) { int v; return goals.TryGetValue(g, out v) ? v : 0; }

        private void FireLightBall(int x, int y, PieceColor col)
        {
            var targets = new List<Vector2Int>();
            for (int i = 0; i < W; i++)
                for (int j = 0; j < H; j++)
                {
                    var c = cells[i, j];
                    if (c.exists && c.piece != null && !c.piece.IsBooster && c.piece.color == col && !c.HasBlocker) targets.Add(c.Pos);
                }
            Emit(new BoardEvent { kind = EvKind.LightBallFired, x = x, y = y, cells = targets, color = col, payload = PieceKind.Normal });
            foreach (var t in targets) Hit(t.x, t.y);
        }

        private void ClearWholeBoard(int x, int y)
        {
            Emit(new BoardEvent { kind = EvKind.BoardCleared, x = x, y = y });
            for (int i = 0; i < W; i++) for (int j = 0; j < H; j++) Hit(i, j);
        }

        public PieceColor MostCommonColor()
        {
            var count = new int[6];
            for (int x = 0; x < W; x++) for (int y = 0; y < H; y++)
            {
                var c = cells[x, y];
                if (c.exists && c.piece != null && !c.piece.IsBooster && !c.HasBlocker) count[(int)c.piece.color]++;
            }
            int best = 0; for (int i = 1; i < 6; i++) if (count[i] > count[best]) best = i;
            return (PieceColor)best;
        }

        // ------------------------------------------------------------------ Oyun içi güçlendiriciler
        public void UseHammer(Vector2Int p) { events.Clear(); hitThisStep.Clear(); Hit(p.x, p.y); }
        public void UseArrow(int row) { events.Clear(); hitThisStep.Clear(); FireRocket(0, row, RocketDir.Horizontal); }
        public void UseCannon(int col) { events.Clear(); hitThisStep.Clear(); FireRocket(col, 0, RocketDir.Vertical); }
        public void UseJester() { events.Clear(); Shuffle(); Emit(new BoardEvent { kind = EvKind.Shuffle }); }

        // ------------------------------------------------------------------ Yer çekimi ve doldurma
        /// <summary>Taşları düşürür, üstten yenilerini ekler. Hareket listesi döner.</summary>
        public List<PieceMove> ApplyGravity()
        {
            var moves = new List<PieceMove>();
            int guard = 0;
            bool changed = true;
            while (changed && guard++ < 24)
            {
                changed = Fall(moves);
                if (Spawn(moves)) changed = true;
            }
            MergeMoves(moves);
            return moves;
        }

        /// <summary>Düz ve çapraz düşme. Bir taş hareket ettiyse true.</summary>
        private bool Fall(List<PieceMove> moves)
        {
            bool any = false, changed = true; int guard = 0;
            while (changed && guard++ < 64)
            {
                changed = false;
                for (int y = 0; y < H; y++)
                    for (int x = 0; x < W; x++)
                    {
                        var c = cells[x, y];
                        if (!c.exists || c.HasBlocker || c.chain || c.piece != null) continue;
                        Cell src = FindFaller(x, y + 1) ?? FindDiagonalFaller(x, y);
                        if (src != null)
                        {
                            Piece p = src.piece; src.piece = null; c.piece = p;
                            moves.Add(new PieceMove { piece = p, fromX = src.x, fromY = src.y, toX = x, toY = y });
                            changed = true; any = true;
                        }
                    }
            }
            return any;
        }

        /// <summary>Her sütunda, üstten ilk engele kadar olan boş hücrelere yeni taş doğurur.</summary>
        private bool Spawn(List<PieceMove> moves)
        {
            bool any = false;
            // Hiçbir yoldan beslenemeyen boş hücreler (engellerle çevrili) yerinde doğurur
            for (int x = 0; x < W; x++)
                for (int y = 0; y < H; y++)
                {
                    var c = cells[x, y];
                    if (!c.exists || c.HasBlocker || c.chain || c.piece != null) continue;
                    if (HasFeeder(x, y)) continue;
                    Piece p = new Piece(RandomColor());
                    c.piece = p;
                    moves.Add(new PieceMove { piece = p, fromX = x, fromY = y + 2, toX = x, toY = y, spawned = true });
                    any = true;
                }
            for (int x = 0; x < W; x++)
            {
                int spawnOrder = 0;
                for (int y = H - 1; y >= 0; y--)
                {
                    var c = cells[x, y];
                    if (!c.exists) continue;
                    if (c.HasBlocker || c.chain) break;
                    if (c.piece != null) continue;
                    Piece p = new Piece(RandomColor());
                    c.piece = p;
                    spawnOrder++;
                    moves.Add(new PieceMove { piece = p, fromX = x, fromY = H + spawnOrder - 1, toX = x, toY = y, spawned = true });
                    any = true;
                }
            }
            return any;
        }

        /// <summary>Hücreye yukarıdan (düz ya da çapraz) taş gelebilir mi? Üst kenara açık bir yol var mı?</summary>
        private bool HasFeeder(int x, int y)
        {
            // Düz yukarı: engele çarpmadan tahtanın üstüne ulaşılıyorsa doğurma kanalı açık
            bool straightOpen = true;
            for (int j = y + 1; j < H; j++) { var c = cells[x, j]; if (!c.exists) continue; if (c.HasBlocker || c.chain) { straightOpen = false; break; } }
            if (straightOpen) return true;
            // Çapraz: üst-yan komşu taşıyabiliyorsa
            foreach (int dx in new[] { -1, 1 })
            {
                var d = At(x + dx, y + 1);
                if (d != null && d.exists && !d.HasBlocker && !d.chain) return true;
            }
            return false;
        }

        /// <summary>Aynı taşın ardışık hareketlerini tek harekete indirir (ilk kaynak → son hedef).</summary>
        private void MergeMoves(List<PieceMove> moves)
        {
            var first = new Dictionary<int, PieceMove>();
            var merged = new List<PieceMove>();
            foreach (var m in moves)
            {
                PieceMove f;
                if (first.TryGetValue(m.piece.id, out f)) { f.toX = m.toX; f.toY = m.toY; }
                else { first[m.piece.id] = m; merged.Add(m); }
            }
            moves.Clear(); moves.AddRange(merged);
        }

        private Cell FindFaller(int x, int fromY)
        {
            for (int j = fromY; j < H; j++)
            {
                var c = cells[x, j];
                if (!c.exists) continue;           // delikten düşer
                if (c.HasBlocker || c.chain) return null;
                if (c.piece != null) return c;
            }
            return null;
        }

        private Cell FindDiagonalFaller(int x, int y)
        {
            // Üst komşusu engel/delik olan boş hücreye yan-üstten taş kayar
            Cell above = At(x, y + 1);
            bool blockedAbove = above == null || !above.exists || above.HasBlocker || above.chain;
            if (!blockedAbove) return null;
            foreach (int dx in new[] { -1, 1 })
            {
                var d = At(x + dx, y + 1);
                if (d != null && d.Movable) return d;
            }
            return null;
        }

        // ------------------------------------------------------------------ Olası hamleler
        public List<Vector2Int[]> FindMoves()
        {
            var list = new List<Vector2Int[]>();
            for (int x = 0; x < W; x++)
                for (int y = 0; y < H; y++)
                {
                    var c = cells[x, y];
                    if (!c.Movable) continue;
                    foreach (var d in new[] { new Vector2Int(1, 0), new Vector2Int(0, 1) })
                    {
                        var n = At(x + d.x, y + d.y);
                        if (n == null || !n.Movable) continue;
                        if (c.piece.IsBooster || n.piece.IsBooster) { list.Add(new[] { c.Pos, n.Pos }); continue; }
                        // simüle et
                        Piece pa = c.piece, pb = n.piece;
                        c.piece = pb; n.piece = pa;
                        bool ok = MakesMatchAt(c.x, c.y, pb.color) || MakesMatchAt(n.x, n.y, pa.color) || SquareAt(c.x, c.y) || SquareAt(n.x, n.y);
                        c.piece = pa; n.piece = pb;
                        if (ok) list.Add(new[] { c.Pos, n.Pos });
                    }
                }
            return list;
        }

        private bool SquareAt(int x, int y)
        {
            var c = cells[x, y]; if (c.piece == null || c.piece.IsBooster) return false;
            PieceColor col = c.piece.color;
            for (int dx = -1; dx <= 0; dx++)
                for (int dy = -1; dy <= 0; dy++)
                {
                    int n = 0;
                    for (int i = 0; i < 2; i++) for (int j = 0; j < 2; j++) if (Same(x + dx + i, y + dy + j, col)) n++;
                    if (n == 4) return true;
                }
            return false;
        }

        /// <summary>Hamle yoksa karıştırır. Karıştırma gerektiyse true.</summary>
        public bool EnsureMoveExists(bool emit)
        {
            if (FindMoves().Count > 0) return false;
            Shuffle();
            if (emit) Emit(new BoardEvent { kind = EvKind.Shuffle });
            return true;
        }

        private void Shuffle()
        {
            var movable = new List<Cell>();
            for (int x = 0; x < W; x++) for (int y = 0; y < H; y++) { var c = cells[x, y]; if (c.Movable && !c.piece.IsBooster) movable.Add(c); }
            for (int attempt = 0; attempt < 60; attempt++)
            {
                for (int i = movable.Count - 1; i > 0; i--)
                {
                    int j = Rng.Next(i + 1);
                    Piece t = movable[i].piece; movable[i].piece = movable[j].piece; movable[j].piece = t;
                }
                bool immediate = false;
                foreach (var c in movable) if (MakesMatchAt(c.x, c.y, c.piece.color)) { immediate = true; break; }
                if (!immediate && FindMoves().Count > 0) return;
            }
            // son çare: renkleri yeniden dağıt
            foreach (var c in movable) { c.piece.color = RandomColor(); int g = 0; while (g++ < 10 && MakesMatchAt(c.x, c.y, c.piece.color)) c.piece.color = RandomColor(); }
        }

        /// <summary>Kalan hamle bonusu: rastgele bir normal taşı güçlendiriciye çevirir ve ateşler.</summary>
        public Piece ConvertRandomPieceToBooster()
        {
            var spots = new List<Cell>();
            for (int x = 0; x < W; x++) for (int y = 0; y < H; y++) { var c = cells[x, y]; if (c.Movable && !c.piece.IsBooster) spots.Add(c); }
            if (spots.Count == 0) return null;
            var cell = spots[Rng.Next(spots.Count)];
            int r = Rng.Next(10);
            PieceKind k = r < 5 ? PieceKind.Rocket : (r < 8 ? PieceKind.Propeller : PieceKind.Tnt);
            Piece removed = cell.piece;
            cell.piece = null;
            pending.Add(new PendingActivation { x = cell.x, y = cell.y, kind = k, dir = Rng.Next(2) == 0 ? RocketDir.Horizontal : RocketDir.Vertical, combo = PieceKind.Normal });
            events.Clear();
            Emit(new BoardEvent { kind = EvKind.BoosterCreated, x = cell.x, y = cell.y, piece = new Piece(k), cells = new List<Vector2Int>() });
            return removed;
        }

        public bool HasPendingBoosters()
        {
            for (int x = 0; x < W; x++) for (int y = 0; y < H; y++) { var c = cells[x, y]; if (c.Movable && c.piece.IsBooster) return true; }
            return false;
        }

        /// <summary>Tahtadaki ilk güçlendiriciyi patlatır (bonus turunda).</summary>
        public bool DetonateAnyBooster()
        {
            for (int x = 0; x < W; x++) for (int y = 0; y < H; y++)
            {
                var c = cells[x, y];
                if (c.Movable && c.piece.IsBooster) { Piece b = c.piece; c.piece = null; pending.Add(new PendingActivation { x = x, y = y, kind = b.kind, dir = b.dir, combo = PieceKind.Normal }); return true; }
            }
            return false;
        }
    }
}
