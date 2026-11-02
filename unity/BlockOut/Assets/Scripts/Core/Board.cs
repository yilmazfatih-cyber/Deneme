using System.Collections.Generic;
using UnityEngine;

namespace BlockOut.Core
{
    /// <summary>Tahtadaki bir blok: başlangıç hücreleri + o andaki kaydırma.</summary>
    public class Block
    {
        public char Id;
        public BlockColor Color;
        public List<Vector2Int> BaseCells;
        public Vector2Int Offset;
        public int Frozen;

        public IEnumerable<Vector2Int> Cells
        {
            get
            {
                for (int i = 0; i < BaseCells.Count; i++) yield return BaseCells[i] + Offset;
            }
        }

        public int MinX { get { int m = int.MaxValue; foreach (var c in Cells) if (c.x < m) m = c.x; return m; } }
        public int MaxX { get { int m = int.MinValue; foreach (var c in Cells) if (c.x > m) m = c.x; return m; } }
        public int MinY { get { int m = int.MaxValue; foreach (var c in Cells) if (c.y < m) m = c.y; return m; } }
        public int MaxY { get { int m = int.MinValue; foreach (var c in Cells) if (c.y > m) m = c.y; return m; } }

        public Vector2 Center
        {
            get
            {
                Vector2 sum = Vector2.zero;
                int n = 0;
                foreach (var c in Cells) { sum += new Vector2(c.x, c.y); n++; }
                return n == 0 ? Vector2.zero : sum / n;
            }
        }

        public Block Clone()
        {
            return new Block
            {
                Id = Id,
                Color = Color,
                BaseCells = BaseCells, // başlangıç hücreleri değişmez, paylaşılabilir
                Offset = Offset,
                Frozen = Frozen
            };
        }
    }

    /// <summary>
    /// Oyun kuralları. Görsel katmandan bağımsızdır; geri alma için klonlanabilir.
    /// Kurallar:
    ///  - Blok bir hücre kayar; hedef hücreler tahtada, duvarsız ve boş olmalı.
    ///  - Blok kenara dayalıysa ve o kenarda bloğun tüm genişliğini kaplayan aynı renkte kapı varsa çıkar.
    ///  - Buzlu blok, (Frozen - çıkan blok sayısı) sıfıra inmeden çıkamaz.
    /// </summary>
    public class Board
    {
        public int Width;
        public int Height;
        public HashSet<Vector2Int> Walls;
        public List<GateDef> Gates;
        public List<Block> Blocks;
        public int TotalBlocks;

        public int ExitedCount { get { return TotalBlocks - Blocks.Count; } }
        public bool IsCleared { get { return Blocks.Count == 0; } }

        public Board(LevelDef def)
        {
            Width = def.Width;
            Height = def.Height;
            Walls = def.Walls;
            Gates = def.Gates;
            Blocks = new List<Block>();
            foreach (BlockDef b in def.Blocks)
            {
                Blocks.Add(new Block
                {
                    Id = b.Id,
                    Color = b.Color,
                    BaseCells = b.Cells,
                    Offset = Vector2Int.zero,
                    Frozen = b.Frozen
                });
            }
            TotalBlocks = Blocks.Count;
        }

        Board() { }

        public Board Clone()
        {
            var b = new Board
            {
                Width = Width,
                Height = Height,
                Walls = Walls,
                Gates = Gates,
                TotalBlocks = TotalBlocks,
                Blocks = new List<Block>(Blocks.Count)
            };
            foreach (Block blk in Blocks) b.Blocks.Add(blk.Clone());
            return b;
        }

        public int FrozenLeft(Block b)
        {
            return Mathf.Max(0, b.Frozen - ExitedCount);
        }

        public bool InBounds(Vector2Int c)
        {
            return c.x >= 0 && c.y >= 0 && c.x < Width && c.y < Height;
        }

        public Block BlockAt(Vector2Int c)
        {
            foreach (Block b in Blocks)
                foreach (Vector2Int cell in b.Cells)
                    if (cell == c) return b;
            return null;
        }

        public bool IsFree(Vector2Int c, Block self)
        {
            if (!InBounds(c) || Walls.Contains(c)) return false;
            Block other = BlockAt(c);
            return other == null || other == self;
        }

        public bool CanMove(Block b, Dir d)
        {
            Vector2Int delta = DirUtil.Delta(d);
            foreach (Vector2Int c in b.Cells)
                if (!IsFree(c + delta, b)) return false;
            return true;
        }

        public void Move(Block b, Dir d)
        {
            b.Offset += DirUtil.Delta(d);
        }

        /// <summary>Blok bu yönde çıkabiliyorsa eşleşen kapıyı, yoksa null döndürür.</summary>
        public GateDef ExitGate(Block b, Dir d)
        {
            if (FrozenLeft(b) > 0) return null;
            int lo, hi;
            switch (d)
            {
                case Dir.Up:
                    if (b.MinY != 0) return null;
                    lo = b.MinX; hi = b.MaxX; break;
                case Dir.Down:
                    if (b.MaxY != Height - 1) return null;
                    lo = b.MinX; hi = b.MaxX; break;
                case Dir.Left:
                    if (b.MinX != 0) return null;
                    lo = b.MinY; hi = b.MaxY; break;
                default:
                    if (b.MaxX != Width - 1) return null;
                    lo = b.MinY; hi = b.MaxY; break;
            }
            foreach (GateDef g in Gates)
                if (g.Side == d && g.Color == b.Color && g.Start <= lo && g.End >= hi) return g;
            return null;
        }

        public bool CanExit(Block b, Dir d)
        {
            return ExitGate(b, d) != null;
        }

        public void Remove(Block b)
        {
            Blocks.Remove(b);
        }
    }
}
