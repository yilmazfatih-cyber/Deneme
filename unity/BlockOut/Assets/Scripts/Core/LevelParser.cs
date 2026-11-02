using System;
using System.Collections.Generic;
using UnityEngine;

namespace BlockOut.Core
{
    /// <summary>
    /// Assets/Resources/levels.txt biçimini okur. Biçim açıklaması dosyanın başındadır.
    /// Satır 0 haritanın en üstüdür (U kenarı); sütun 0 en soldadır (L kenarı).
    /// </summary>
    public static class LevelParser
    {
        public static List<LevelDef> ParseAll(string text)
        {
            var levels = new List<LevelDef>();
            LevelDef cur = null;
            var mapRows = new List<string>();
            var colors = new Dictionary<char, BlockColor>();
            var frozen = new Dictionary<char, int>();
            bool inMap = false;

            Action finish = () =>
            {
                if (cur == null) return;
                BuildLevel(cur, mapRows, colors, frozen);
                levels.Add(cur);
                cur = null;
            };

            foreach (string raw in text.Replace("\r", "").Split('\n'))
            {
                string line = raw.TrimEnd();
                if (line.Length == 0)
                {
                    inMap = false;
                    continue;
                }
                // Yorum satırı; harita içinde '#' duvar olduğundan orada yorum yok.
                if (line.StartsWith("#") && !inMap) continue;

                if (line.StartsWith("level:"))
                {
                    finish();
                    cur = new LevelDef { Name = line.Substring(6).Trim() };
                    mapRows = new List<string>();
                    colors = new Dictionary<char, BlockColor>();
                    frozen = new Dictionary<char, int>();
                    inMap = false;
                    continue;
                }
                if (cur == null) continue;

                if (line.StartsWith("time:"))
                {
                    cur.TimeSeconds = int.Parse(line.Substring(5).Trim());
                    inMap = false;
                }
                else if (line.StartsWith("map:"))
                {
                    inMap = true;
                }
                else if (line.StartsWith("colors:"))
                {
                    inMap = false;
                    foreach (string p in Split(line.Substring(7), ' '))
                    {
                        string[] kv = p.Split(':');
                        colors[kv[0][0]] = BlockColorUtil.FromChar(kv[1][0]);
                    }
                }
                else if (line.StartsWith("frozen:"))
                {
                    inMap = false;
                    foreach (string p in Split(line.Substring(7), ' '))
                    {
                        string[] kv = p.Split(':');
                        frozen[kv[0][0]] = int.Parse(kv[1]);
                    }
                }
                else if (line.StartsWith("gates:"))
                {
                    inMap = false;
                    foreach (string g in Split(line.Substring(6), ';'))
                    {
                        string[] f = g.Split(',');
                        cur.Gates.Add(new GateDef
                        {
                            Side = DirUtil.FromChar(f[0].Trim()[0]),
                            Start = int.Parse(f[1].Trim()),
                            Length = int.Parse(f[2].Trim()),
                            Color = BlockColorUtil.FromChar(f[3].Trim()[0])
                        });
                    }
                }
                else if (inMap)
                {
                    mapRows.Add(line.Trim());
                }
            }
            finish();
            return levels;
        }

        static IEnumerable<string> Split(string s, char sep)
        {
            foreach (string part in s.Split(sep))
            {
                string t = part.Trim();
                if (t.Length > 0) yield return t;
            }
        }

        static void BuildLevel(LevelDef lv, List<string> rows, Dictionary<char, BlockColor> colors, Dictionary<char, int> frozen)
        {
            lv.Height = rows.Count;
            lv.Width = rows.Count > 0 ? rows[0].Length : 0;
            var blocks = new Dictionary<char, BlockDef>();
            for (int y = 0; y < rows.Count; y++)
            {
                string r = rows[y];
                if (r.Length != lv.Width)
                    throw new FormatException("Bölüm " + lv.Name + ": satır " + y + " genişliği farklı");
                for (int x = 0; x < r.Length; x++)
                {
                    char ch = r[x];
                    if (ch == '.') continue;
                    if (ch == '#')
                    {
                        lv.Walls.Add(new Vector2Int(x, y));
                        continue;
                    }
                    BlockDef b;
                    if (!blocks.TryGetValue(ch, out b))
                    {
                        BlockColor col;
                        if (!colors.TryGetValue(ch, out col))
                            throw new FormatException("Bölüm " + lv.Name + ": '" + ch + "' bloğunun rengi yok");
                        b = new BlockDef { Id = ch, Color = col };
                        int fz;
                        if (frozen.TryGetValue(ch, out fz)) b.Frozen = fz;
                        blocks[ch] = b;
                        lv.Blocks.Add(b);
                    }
                    b.Cells.Add(new Vector2Int(x, y));
                }
            }
            foreach (GateDef g in lv.Gates)
            {
                int limit = DirUtil.IsVertical(g.Side) ? lv.Width : lv.Height;
                if (g.Start < 0 || g.End >= limit)
                    throw new FormatException("Bölüm " + lv.Name + ": kapı tahtanın dışında");
            }
        }
    }
}
