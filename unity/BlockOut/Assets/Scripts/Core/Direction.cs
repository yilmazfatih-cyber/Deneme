using UnityEngine;

namespace BlockOut.Core
{
    /// <summary>Dört yön. Model koordinatında y aşağı doğru büyür (satır 0 en üsttedir).</summary>
    public enum Dir
    {
        Up,
        Down,
        Left,
        Right
    }

    public static class DirUtil
    {
        public static readonly Dir[] All = { Dir.Up, Dir.Down, Dir.Left, Dir.Right };

        public static Vector2Int Delta(Dir d)
        {
            switch (d)
            {
                case Dir.Up: return new Vector2Int(0, -1);
                case Dir.Down: return new Vector2Int(0, 1);
                case Dir.Left: return new Vector2Int(-1, 0);
                default: return new Vector2Int(1, 0);
            }
        }

        public static bool IsVertical(Dir d)
        {
            return d == Dir.Up || d == Dir.Down;
        }

        public static Dir FromChar(char c)
        {
            switch (char.ToUpperInvariant(c))
            {
                case 'U': return Dir.Up;
                case 'D': return Dir.Down;
                case 'L': return Dir.Left;
                case 'R': return Dir.Right;
                default: throw new System.FormatException("Bilinmeyen kenar: " + c);
            }
        }

        public static char ToChar(Dir d)
        {
            switch (d)
            {
                case Dir.Up: return 'U';
                case Dir.Down: return 'D';
                case Dir.Left: return 'L';
                default: return 'R';
            }
        }
    }
}
