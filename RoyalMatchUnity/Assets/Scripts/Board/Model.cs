using System.Collections.Generic;
using UnityEngine;

namespace RoyalMatch
{
    public class Piece
    {
        private static int nextId = 1;
        public readonly int id;
        public PieceColor color;
        public PieceKind kind;
        public RocketDir dir;
        public Piece(PieceColor c) { id = nextId++; color = c; kind = PieceKind.Normal; }
        public Piece(PieceKind k, RocketDir d = RocketDir.Horizontal) { id = nextId++; kind = k; dir = d; color = PieceColor.Red; }
        /// <summary>Kopya (aynı kimlik) — simülasyon/klonlama için.</summary>
        public Piece(Piece src) { id = src.id; color = src.color; kind = src.kind; dir = src.dir; }
        public bool IsBooster { get { return kind != PieceKind.Normal; } }
    }

    public class Cell
    {
        public int x, y;
        public bool exists;
        public Piece piece;
        public BlockerType blocker;
        public int blockerHp;
        public int grass;
        public bool chain;
        public bool HasBlocker { get { return blocker != BlockerType.None; } }
        /// <summary>Taş alabilir ve oynatılabilir.</summary>
        public bool Movable { get { return exists && !HasBlocker && !chain && piece != null; } }
        public Vector2Int Pos { get { return new Vector2Int(x, y); } }
    }

    public enum EvKind
    {
        PieceCleared, BlockerHit, BlockerCleared, GrassCleared, ChainBroken,
        BoosterCreated, RocketFired, TntFired, LightBallFired, PropellerFlight, BoardCleared, GoalProgress, Shuffle
    }

    /// <summary>Görünümün canlandırması için modelin ürettiği olay.</summary>
    public class BoardEvent
    {
        public EvKind kind;
        public int x, y;            // kaynak hücre
        public int tx, ty;          // hedef hücre (pervane)
        public Piece piece;
        public PieceKind payload;
        public RocketDir dir;
        public int radius;
        public int value;           // kalan can / katman
        public GoalType goal;
        public BlockerType blocker;
        public PieceColor color;
        public List<Vector2Int> cells; // birleşen taşlar / ışık topu hedefleri
    }

    public class PieceMove
    {
        public Piece piece;
        public int fromX, fromY, toX, toY;
        public bool spawned;
    }

    /// <summary>Hamle sırasında etkinleştirilmesi bekleyen güçlendirici.</summary>
    public class PendingActivation
    {
        public int x, y;
        public PieceKind kind;
        public RocketDir dir;
        public PieceKind combo;          // ikinci güçlendirici (yoksa Normal)
        public PieceColor? colorHint;    // ışık topunun hedef rengi
        public bool fromSwap;
    }
}
