using System.Collections.Generic;
using UnityEngine;

namespace BlockOut.Core
{
    /// <summary>Bir bloğun başlangıç tanımı (bölüm dosyasından).</summary>
    public class BlockDef
    {
        public char Id;
        public BlockColor Color;
        public List<Vector2Int> Cells = new List<Vector2Int>();
        /// <summary>0 ise normal blok; n ise bu blok çıkmadan önce n blok çıkmalı (buz).</summary>
        public int Frozen;
    }

    /// <summary>Tahta kenarındaki renkli kapı.</summary>
    public class GateDef
    {
        public Dir Side;
        /// <summary>Üst/alt kapılarda sütun, sol/sağ kapılarda satır başlangıcı.</summary>
        public int Start;
        public int Length;
        public BlockColor Color;

        public int End { get { return Start + Length - 1; } }
    }

    public class LevelDef
    {
        public string Name = "";
        public int TimeSeconds = 60;
        public int Width;
        public int Height;
        public HashSet<Vector2Int> Walls = new HashSet<Vector2Int>();
        public List<BlockDef> Blocks = new List<BlockDef>();
        public List<GateDef> Gates = new List<GateDef>();
    }
}
