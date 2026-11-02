namespace BlockOut.Core
{
    public enum BlockColor
    {
        Red,
        Blue,
        Green,
        Yellow,
        Purple,
        Orange,
        Cyan,
        Pink
    }

    public static class BlockColorUtil
    {
        public static readonly BlockColor[] All =
        {
            BlockColor.Red, BlockColor.Blue, BlockColor.Green, BlockColor.Yellow,
            BlockColor.Purple, BlockColor.Orange, BlockColor.Cyan, BlockColor.Pink
        };

        public static BlockColor FromChar(char c)
        {
            switch (char.ToUpperInvariant(c))
            {
                case 'R': return BlockColor.Red;
                case 'B': return BlockColor.Blue;
                case 'G': return BlockColor.Green;
                case 'Y': return BlockColor.Yellow;
                case 'P': return BlockColor.Purple;
                case 'O': return BlockColor.Orange;
                case 'C': return BlockColor.Cyan;
                case 'K': return BlockColor.Pink;
                default: throw new System.FormatException("Bilinmeyen renk: " + c);
            }
        }

        public static char ToChar(BlockColor c)
        {
            switch (c)
            {
                case BlockColor.Red: return 'R';
                case BlockColor.Blue: return 'B';
                case BlockColor.Green: return 'G';
                case BlockColor.Yellow: return 'Y';
                case BlockColor.Purple: return 'P';
                case BlockColor.Orange: return 'O';
                case BlockColor.Cyan: return 'C';
                default: return 'K';
            }
        }
    }
}
