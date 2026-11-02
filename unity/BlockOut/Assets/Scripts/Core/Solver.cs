using System.Collections.Generic;
using System.Text;
using UnityEngine;

namespace BlockOut.Core
{
    /// <summary>
    /// Üretilen bölümlerin çözülebilirliğini denetler. Bir bloğu çıkarmak hiçbir zaman zarar vermez;
    /// bu yüzden her durumda önce çıkabilen tüm bloklar çıkarılır (kapanış), sonra tek adımlık
    /// kaydırmalar denenir. Öncelik: kalan blok sayısı, sonra adım sayısı (en iyi-önce arama).
    /// </summary>
    public static class Solver
    {
        class Node
        {
            public Board Board;
            public int G;
            public long Priority;
            public long Order;
        }

        /// <summary>Çözüm bulunursa adım sayısı, bulunamazsa (veya sınır aşılırsa) -1.</summary>
        public static int Solve(LevelDef level, int maxStates = 30000)
        {
            Board start = new Board(level);
            int m0 = ApplyExits(start);
            if (start.IsCleared) return m0;

            var seen = new HashSet<string> { Key(start) };
            var heap = new MinHeap();
            long order = 0;
            heap.Push(new Node { Board = start, G = m0, Priority = start.Blocks.Count * 1000L, Order = order++ });

            while (heap.Count > 0)
            {
                Node n = heap.Pop();
                Board b = n.Board;
                if (b.IsCleared) return n.G;
                if (seen.Count > maxStates) return -1;

                for (int i = 0; i < b.Blocks.Count; i++)
                {
                    foreach (Dir d in DirUtil.All)
                    {
                        if (!b.CanMove(b.Blocks[i], d)) continue;
                        Board nb = b.Clone();
                        Block moved = nb.Blocks[i];
                        nb.Move(moved, d);
                        int exits = ApplyExits(nb);
                        string key = Key(nb);
                        if (!seen.Add(key)) continue;
                        int g = n.G + 1 + exits;
                        heap.Push(new Node { Board = nb, G = g, Priority = nb.Blocks.Count * 1000L + g, Order = order++ });
                    }
                }
            }
            return -1;
        }

        /// <summary>Çıkabilen her bloğu çıkarır; çıkan blok sayısını döndürür.</summary>
        static int ApplyExits(Board b)
        {
            int count = 0;
            bool changed = true;
            while (changed)
            {
                changed = false;
                for (int i = 0; i < b.Blocks.Count && !changed; i++)
                {
                    Block blk = b.Blocks[i];
                    foreach (Dir d in DirUtil.All)
                    {
                        if (b.CanExit(blk, d))
                        {
                            b.Remove(blk);
                            count++;
                            changed = true;
                            break;
                        }
                    }
                }
            }
            return count;
        }

        static string Key(Board b)
        {
            var sb = new StringBuilder();
            foreach (Block blk in b.Blocks)
                sb.Append(blk.Id).Append(blk.Offset.x).Append(',').Append(blk.Offset.y).Append(';');
            return sb.ToString();
        }

        /// <summary>Küçük ikili yığın (Unity'nin .NET sürümünde PriorityQueue yok).</summary>
        class MinHeap
        {
            readonly List<Node> items = new List<Node>();
            public int Count { get { return items.Count; } }

            static bool Less(Node a, Node b)
            {
                return a.Priority != b.Priority ? a.Priority < b.Priority : a.Order < b.Order;
            }

            public void Push(Node n)
            {
                items.Add(n);
                int i = items.Count - 1;
                while (i > 0)
                {
                    int p = (i - 1) / 2;
                    if (!Less(items[i], items[p])) break;
                    Node t = items[i]; items[i] = items[p]; items[p] = t;
                    i = p;
                }
            }

            public Node Pop()
            {
                Node top = items[0];
                Node last = items[items.Count - 1];
                items.RemoveAt(items.Count - 1);
                if (items.Count > 0)
                {
                    items[0] = last;
                    int i = 0;
                    while (true)
                    {
                        int l = 2 * i + 1, r = l + 1, s = i;
                        if (l < items.Count && Less(items[l], items[s])) s = l;
                        if (r < items.Count && Less(items[r], items[s])) s = r;
                        if (s == i) break;
                        Node t = items[i]; items[i] = items[s]; items[s] = t;
                        i = s;
                    }
                }
                return top;
            }
        }
    }
}
