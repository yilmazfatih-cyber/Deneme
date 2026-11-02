using System;
using System.Collections.Generic;
using UnityEngine;

namespace RoyalMatch
{
    [Serializable]
    public class GoalDef
    {
        public GoalType type;
        public int count;
        public GoalDef(GoalType t, int c) { type = t; count = c; }
    }

    /// <summary>Bir seviyenin tüm tanımı. Üretici tarafından sayıya göre belirlenimci olarak kurulur.</summary>
    public class LevelData
    {
        public int number;
        public int width, height;
        public int moves;
        public int colorCount;
        public int seed;
        public Difficulty difficulty;
        public bool[,] mask;
        public BlockerType[,] blocker;
        public int[,] blockerHp;
        public int[,] grass;
        public bool[,] chain;
        public List<GoalDef> goals = new List<GoalDef>();

        public LevelData(int w, int h)
        {
            width = w; height = h;
            mask = new bool[w, h];
            blocker = new BlockerType[w, h];
            blockerHp = new int[w, h];
            grass = new int[w, h];
            chain = new bool[w, h];
            for (int x = 0; x < w; x++) for (int y = 0; y < h; y++) mask[x, y] = true;
        }

        public bool In(int x, int y) { return x >= 0 && y >= 0 && x < width && y < height; }

        public static GoalType ColorGoal(PieceColor c) { return (GoalType)(int)c; }

        public static GoalType BlockerGoal(BlockerType b)
        {
            switch (b)
            {
                case BlockerType.Box: return GoalType.Box;
                case BlockerType.Vase: return GoalType.Vase;
                case BlockerType.Plate: return GoalType.Plate;
                case BlockerType.Egg: return GoalType.Egg;
                case BlockerType.Safe: return GoalType.Safe;
                default: return GoalType.Mailbox;
            }
        }

        public static int DefaultHp(BlockerType b)
        {
            switch (b)
            {
                case BlockerType.Box: return 1;
                case BlockerType.Vase: return 2;
                case BlockerType.Plate: return 3;
                case BlockerType.Egg: return 2;
                case BlockerType.Safe: return 3;
                case BlockerType.Mailbox: return 3;
                default: return 0;
            }
        }

        public static bool IsColorGoal(GoalType g) { return (int)g <= (int)GoalType.Orange; }
    }

    /// <summary>
    /// Seviye üretici: her seviye numarası aynı seviyeyi verir. Engeller seviye ilerledikçe açılır;
    /// Zor (her 7.) ve Çok Zor (her 15.) seviyelerde hamle kısılır.
    /// </summary>
    public static class LevelGenerator
    {
        private struct ObstaclePlan { public BlockerType blocker; public bool grass; public bool chain; public int weight; }

        public static LevelData Generate(int n)
        {
            var rnd = new System.Random(n * 7919 + 17);
            Difficulty diff = n % 15 == 0 ? Difficulty.SuperHard : (n % 7 == 0 ? Difficulty.Hard : Difficulty.Normal);

            int w, h;
            if (n <= 4) { w = 7; h = 7; }
            else if (n <= 15) { w = 8; h = 8; }
            else { w = 9; h = 9; }
            var lv = new LevelData(w, h);
            lv.number = n;
            lv.seed = n * 1337;
            lv.difficulty = diff;
            lv.colorCount = n <= 2 ? 4 : (n <= 9 ? 5 : 6);

            // Şekil: ileri seviyelerde köşe kesme / haç deseni
            if (n >= 10)
            {
                int shape = rnd.Next(4);
                if (shape == 1) { lv.mask[0, 0] = lv.mask[w - 1, 0] = lv.mask[0, h - 1] = lv.mask[w - 1, h - 1] = false; }
                else if (shape == 2)
                {
                    for (int d = 0; d < 2; d++)
                        for (int e = 0; e + d < 2; e++)
                        {
                            lv.mask[d, e] = false; lv.mask[w - 1 - d, e] = false; lv.mask[d, h - 1 - e] = false; lv.mask[w - 1 - d, h - 1 - e] = false;
                        }
                }
                else if (shape == 3) { lv.mask[0, h / 2] = lv.mask[w - 1, h / 2] = false; }
            }

            // Engel türleri açılma eşikleri
            var pool = new List<ObstaclePlan>();
            if (n >= 2) pool.Add(new ObstaclePlan { grass = true, weight = 3 });
            if (n >= 4) pool.Add(new ObstaclePlan { blocker = BlockerType.Box, weight = 3 });
            if (n >= 8) pool.Add(new ObstaclePlan { blocker = BlockerType.Vase, weight = 2 });
            if (n >= 12) pool.Add(new ObstaclePlan { blocker = BlockerType.Plate, weight = 2 });
            if (n >= 16) pool.Add(new ObstaclePlan { blocker = BlockerType.Egg, weight = 2 });
            if (n >= 20) pool.Add(new ObstaclePlan { chain = true, weight = 2 });
            if (n >= 26) pool.Add(new ObstaclePlan { blocker = BlockerType.Mailbox, weight = 1 });
            if (n >= 32) pool.Add(new ObstaclePlan { blocker = BlockerType.Safe, weight = 1 });

            int kinds = pool.Count == 0 ? 0 : Mathf.Min(pool.Count, n < 8 ? 1 : (n < 20 ? 2 : 3));
            var chosen = new List<ObstaclePlan>();
            // Yeni açılan engel ilk seviyesinde mutlaka görünür (öğretici etkisi)
            if (pool.Count > 0 && (n == 2 || n == 4 || n == 8 || n == 12 || n == 16 || n == 20 || n == 26 || n == 32))
                chosen.Add(pool[pool.Count - 1]);
            int guard = 0;
            while (chosen.Count < kinds && guard++ < 50)
            {
                ObstaclePlan pick = WeightedPick(pool, rnd);
                bool dup = false;
                foreach (var c in chosen) if (c.blocker == pick.blocker && c.grass == pick.grass && c.chain == pick.chain) dup = true;
                if (!dup) chosen.Add(pick);
            }

            float intensity = Mathf.Clamp01(0.25f + n * 0.012f);
            var counts = new Dictionary<GoalType, int>();
            int obstacleCells = 0;
            foreach (var plan in chosen)
            {
                int pattern = rnd.Next(5);
                for (int x = 0; x < w; x++)
                    for (int y = 0; y < h; y++)
                    {
                        if (!lv.mask[x, y]) continue;
                        bool put;
                        switch (pattern)
                        {
                            case 0: put = y <= 1; break;                                   // alt iki satır
                            case 1: put = (x + y) % 2 == 0 && rnd.NextDouble() < intensity + 0.2; break;
                            case 2: put = x == 0 || x == w - 1 || y == 0; break;              // çerçeve (üst açık)
                            case 3: put = Mathf.Abs(x - w / 2) <= 1 && Mathf.Abs(y - h / 2) <= 1; break; // orta blok
                            default: put = rnd.NextDouble() < intensity * 0.6; break;
                        }
                        if (!put) continue;
                        if (!plan.grass && y == h - 1) continue; // en üst satır her zaman taş doğurabilsin
                        if (plan.grass)
                        {
                            if (lv.grass[x, y] == 0) { lv.grass[x, y] = n >= 24 && rnd.NextDouble() < 0.35 ? 2 : 1; Add(counts, GoalType.Grass, lv.grass[x, y]); obstacleCells++; }
                        }
                        else if (plan.chain)
                        {
                            if (lv.blocker[x, y] == BlockerType.None && !lv.chain[x, y]) { lv.chain[x, y] = true; Add(counts, GoalType.Chain, 1); obstacleCells++; }
                        }
                        else if (lv.blocker[x, y] == BlockerType.None && !lv.chain[x, y])
                        {
                            lv.blocker[x, y] = plan.blocker;
                            int hp = LevelData.DefaultHp(plan.blocker);
                            if (plan.blocker == BlockerType.Box && n >= 18 && rnd.NextDouble() < 0.4) hp = 2;
                            if (plan.blocker == BlockerType.Box && n >= 30 && rnd.NextDouble() < 0.3) hp = 3;
                            if (plan.blocker == BlockerType.Plate) hp = 1 + rnd.Next(3);
                            lv.blockerHp[x, y] = hp;
                            Add(counts, LevelData.BlockerGoal(plan.blocker), 1);
                            obstacleCells++;
                        }
                    }
            }
            // Engeller tahtanın yarısından fazlasını kaplamasın; en az 24 serbest hücre kalsın
            int free = 0;
            for (int x = 0; x < w; x++) for (int y = 0; y < h; y++) if (lv.mask[x, y] && lv.blocker[x, y] == BlockerType.None) free++;
            if (free < 24)
            {
                for (int x = 0; x < w && free < 24; x++)
                    for (int y = 0; y < h && free < 24; y++)
                        if (lv.blocker[x, y] != BlockerType.None && (x + y) % 2 == 1)
                        {
                            Sub(counts, LevelData.BlockerGoal(lv.blocker[x, y]), 1);
                            lv.blocker[x, y] = BlockerType.None; lv.blockerHp[x, y] = 0; free++; obstacleCells--;
                        }
            }

            foreach (var kv in counts) if (kv.Value > 0) lv.goals.Add(new GoalDef(kv.Key, kv.Value));

            // Renk hedefleri
            int colorGoals = lv.goals.Count == 0 ? (n <= 1 ? 1 : 2) : (n % 3 == 0 ? 1 : 0);
            if (lv.goals.Count >= 3) colorGoals = 0;
            int colorTotal = 0;
            var used = new HashSet<int>();
            for (int i = 0; i < colorGoals; i++)
            {
                int c = rnd.Next(lv.colorCount);
                if (!used.Add(c)) continue;
                int cnt = 12 + rnd.Next(8) + n / 2;
                cnt = Mathf.Min(cnt, 60);
                lv.goals.Add(new GoalDef(LevelData.ColorGoal((PieceColor)c), cnt));
                colorTotal += cnt;
            }

            float moves = 20f + obstacleCells * 0.65f + colorTotal * 0.35f;
            if (diff == Difficulty.Hard) moves *= 0.85f;
            if (diff == Difficulty.SuperHard) moves *= 0.75f;
            lv.moves = Mathf.Clamp(Mathf.RoundToInt(moves), 14, 45);
            if (n == 1) { lv.moves = 20; }
            return lv;
        }

        private static ObstaclePlan WeightedPick(List<ObstaclePlan> pool, System.Random rnd)
        {
            int total = 0; foreach (var p in pool) total += p.weight;
            int r = rnd.Next(total);
            foreach (var p in pool) { r -= p.weight; if (r < 0) return p; }
            return pool[pool.Count - 1];
        }

        private static void Add(Dictionary<GoalType, int> d, GoalType g, int n) { int v; d.TryGetValue(g, out v); d[g] = v + n; }
        private static void Sub(Dictionary<GoalType, int> d, GoalType g, int n) { int v; d.TryGetValue(g, out v); d[g] = v - n; }
    }
}
