using System;
using System.Collections.Generic;
using UnityEngine;

namespace BlockOut.Core
{
    /// <summary>
    /// Elle yazılmış bölümler bitince sonsuz bölüm üretir. Tohum bölüm numarasından türetildiği için
    /// aynı bölüm her açılışta aynıdır. Üretilen her aday Solver ile denetlenir; çözülemeyenler atılır.
    /// </summary>
    public static class LevelGenerator
    {
        static readonly Vector2Int[][] Shapes =
        {
            new[] { new Vector2Int(0, 0), new Vector2Int(1, 0) },
            new[] { new Vector2Int(0, 0), new Vector2Int(0, 1) },
            new[] { new Vector2Int(0, 0), new Vector2Int(1, 0), new Vector2Int(2, 0) },
            new[] { new Vector2Int(0, 0), new Vector2Int(0, 1), new Vector2Int(0, 2) },
            new[] { new Vector2Int(0, 0), new Vector2Int(1, 0), new Vector2Int(0, 1), new Vector2Int(1, 1) },
            new[] { new Vector2Int(0, 0), new Vector2Int(0, 1), new Vector2Int(1, 1) },
            new[] { new Vector2Int(0, 0), new Vector2Int(1, 0), new Vector2Int(0, 1) },
            new[] { new Vector2Int(1, 0), new Vector2Int(1, 1), new Vector2Int(0, 1) },
            new[] { new Vector2Int(0, 0), new Vector2Int(1, 0), new Vector2Int(1, 1) },
            new[] { new Vector2Int(0, 0) }
        };

        public static LevelDef Generate(int levelNumber)
        {
            var rng = new System.Random(1000 + levelNumber * 7919);
            int difficulty = Mathf.Max(0, levelNumber - 12);
            int width = Mathf.Clamp(5 + difficulty / 8, 5, 7);
            int height = Mathf.Clamp(6 + difficulty / 6, 6, 8);
            int blocks = Mathf.Clamp(7 + difficulty / 3, 7, 14);
            int frozenCount = difficulty >= 3 ? Mathf.Min(2, 1 + difficulty / 10) : 0;
            int colorCount = Mathf.Clamp(4 + difficulty / 5, 4, 7);

            for (int attempt = 0; attempt < 40; attempt++)
            {
                int targetBlocks = Mathf.Max(5, blocks - attempt / 8);
                LevelDef lv = TryGenerate(rng, width, height, targetBlocks, frozenCount, colorCount);
                if (lv == null) continue;
                int steps = Solver.Solve(lv, 25000);
                if (steps >= 0 && steps >= targetBlocks)
                {
                    lv.Name = levelNumber.ToString();
                    lv.TimeSeconds = 45 + lv.Blocks.Count * 8 + steps * 2;
                    return lv;
                }
            }
            return Fallback(levelNumber);
        }

        static LevelDef TryGenerate(System.Random rng, int w, int h, int blockCount, int frozenCount, int colorCount)
        {
            var lv = new LevelDef { Width = w, Height = h };
            var occupied = new bool[w, h];
            var colors = new List<BlockColor>(BlockColorUtil.All);
            Shuffle(colors, rng);
            colors.RemoveRange(colorCount, colors.Count - colorCount);

            char id = 'a';
            for (int tries = 0; tries < 400 && lv.Blocks.Count < blockCount; tries++)
            {
                Vector2Int[] shape = Shapes[rng.Next(Shapes.Length - 1)]; // tek hücreli şekil nadiren
                if (rng.Next(10) == 0) shape = Shapes[Shapes.Length - 1];
                int ox = rng.Next(w), oy = rng.Next(h);
                bool ok = true;
                foreach (Vector2Int c in shape)
                {
                    int x = ox + c.x, y = oy + c.y;
                    if (x >= w || y >= h || occupied[x, y]) { ok = false; break; }
                }
                if (!ok) continue;
                var def = new BlockDef { Id = id++, Color = colors[rng.Next(colors.Count)] };
                foreach (Vector2Int c in shape)
                {
                    occupied[ox + c.x, oy + c.y] = true;
                    def.Cells.Add(new Vector2Int(ox + c.x, oy + c.y));
                }
                lv.Blocks.Add(def);
            }
            if (lv.Blocks.Count < 4) return null;

            // Her blok için sığabileceği bir kapı: rastgele bir kenar, bloğun o kenardaki genişliği kadar.
            var edgeUsed = new Dictionary<Dir, BlockColor?[]>();
            foreach (Dir d in DirUtil.All)
                edgeUsed[d] = new BlockColor?[DirUtil.IsVertical(d) ? w : h];

            foreach (BlockDef b in lv.Blocks)
            {
                int minX = int.MaxValue, maxX = int.MinValue, minY = int.MaxValue, maxY = int.MinValue;
                foreach (Vector2Int c in b.Cells)
                {
                    minX = Mathf.Min(minX, c.x); maxX = Mathf.Max(maxX, c.x);
                    minY = Mathf.Min(minY, c.y); maxY = Mathf.Max(maxY, c.y);
                }
                bool placed = false;
                var sides = new List<Dir>(DirUtil.All);
                Shuffle(sides, rng);
                foreach (Dir side in sides)
                {
                    int lo = DirUtil.IsVertical(side) ? minX : minY;
                    int hi = DirUtil.IsVertical(side) ? maxX : maxY;
                    // Aynı renkte bir kapı zaten bu aralığı kaplıyor mu?
                    if (Covered(lv, side, lo, hi, b.Color)) { placed = true; break; }
                    BlockColor?[] used = edgeUsed[side];
                    bool free = true;
                    for (int i = lo; i <= hi; i++)
                        if (used[i].HasValue && used[i].Value != b.Color) { free = false; break; }
                    if (!free) continue;
                    for (int i = lo; i <= hi; i++) used[i] = b.Color;
                    lv.Gates.Add(new GateDef { Side = side, Start = lo, Length = hi - lo + 1, Color = b.Color });
                    placed = true;
                    break;
                }
                if (!placed) return null;
            }
            MergeGates(lv);

            // Buzlu bloklar: önce birkaç blok çıkmalı.
            var candidates = new List<BlockDef>(lv.Blocks);
            Shuffle(candidates, rng);
            for (int i = 0; i < frozenCount && i < candidates.Count; i++)
                candidates[i].Frozen = 2 + rng.Next(Mathf.Max(1, lv.Blocks.Count / 3));
            return lv;
        }

        static bool Covered(LevelDef lv, Dir side, int lo, int hi, BlockColor color)
        {
            foreach (GateDef g in lv.Gates)
                if (g.Side == side && g.Color == color && g.Start <= lo && g.End >= hi) return true;
            return false;
        }

        /// <summary>Aynı kenarda aynı renkte bitişik/çakışan kapıları tek kapıda birleştirir.</summary>
        static void MergeGates(LevelDef lv)
        {
            bool merged = true;
            while (merged)
            {
                merged = false;
                for (int i = 0; i < lv.Gates.Count && !merged; i++)
                    for (int j = i + 1; j < lv.Gates.Count && !merged; j++)
                    {
                        GateDef a = lv.Gates[i], b = lv.Gates[j];
                        if (a.Side != b.Side || a.Color != b.Color) continue;
                        if (b.Start > a.End + 1 || a.Start > b.End + 1) continue;
                        int start = Mathf.Min(a.Start, b.Start);
                        int end = Mathf.Max(a.End, b.End);
                        a.Start = start;
                        a.Length = end - start + 1;
                        lv.Gates.RemoveAt(j);
                        merged = true;
                    }
            }
        }

        static void Shuffle<T>(List<T> list, System.Random rng)
        {
            for (int i = list.Count - 1; i > 0; i--)
            {
                int j = rng.Next(i + 1);
                T t = list[i]; list[i] = list[j]; list[j] = t;
            }
        }

        /// <summary>Üretim başarısız olursa her zaman çözülebilen basit bir bölüm.</summary>
        static LevelDef Fallback(int levelNumber)
        {
            string text =
                "level: " + levelNumber + "\n" +
                "time: 70\n" +
                "map:\n" +
                "aa.bb\n" +
                "c...d\n" +
                "c...d\n" +
                "ee.ff\n" +
                "colors: a:R b:B c:G d:Y e:P f:O\n" +
                "gates: U,0,2,R ; U,3,2,B ; L,1,2,G ; R,1,2,Y ; D,0,2,P ; D,3,2,O\n";
            return LevelParser.ParseAll(text)[0];
        }
    }
}
