namespace RoyalMatch
{
    /// <summary>Tahtadaki normal taşların renkleri (Royal Match'teki altı renk).</summary>
    public enum PieceColor { Red = 0, Blue = 1, Green = 2, Yellow = 3, Purple = 4, Orange = 5 }

    /// <summary>Taş türü. Normal taşlar renk taşır; güçlendiriciler renksizdir.</summary>
    public enum PieceKind { Normal, Rocket, Tnt, LightBall, Propeller }

    public enum RocketDir { Horizontal, Vertical }

    /// <summary>Hücreyi işgal eden sabit engeller (taş yerine dururlar).</summary>
    public enum BlockerType { None, Box, Vase, Plate, Egg, Safe, Mailbox }

    /// <summary>Seviye hedefleri.</summary>
    public enum GoalType
    {
        Red, Blue, Green, Yellow, Purple, Orange,
        Box, Vase, Plate, Egg, Safe, Mailbox, Grass, Chain
    }

    public enum Difficulty { Normal, Hard, SuperHard }

    /// <summary>Oyun içi güçlendiriciler (hamle harcamaz).</summary>
    public enum InGameBooster { Hammer, Arrow, Cannon, JesterHat }

    /// <summary>Seviye başı güçlendiriciler (tahtaya yerleştirilir).</summary>
    public enum StartBooster { Rocket, Tnt, LightBall }

    public enum HitSource { Match, Booster, Adjacent }
}
