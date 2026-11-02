using System.Collections.Generic;
using UnityEngine;

namespace RoyalMatch
{
    /// <summary>
    /// Dışarıdan gelen hazır çizimler: Assets/Resources/Art altındaki CC0 (Kenney) PNG'ler.
    /// Dosya yoksa kodla üretilen görsel kullanılır; bu yüzden hiçbir ekran dosyaya bağımlı değildir.
    /// PNG'ler Texture2D olarak yüklenir ve çalışma anında Sprite'a çevrilir (içe aktarma ayarı gerekmez).
    /// </summary>
    public static partial class Art
    {
        private static readonly Dictionary<string, Sprite> external = new Dictionary<string, Sprite>();
        private static readonly HashSet<string> missing = new HashSet<string>();

        /// <summary>Resources/Art/{path}.png varsa Sprite döner, yoksa null.</summary>
        public static Sprite Ext(string path, float ppu = 100f)
        {
            Sprite s;
            if (external.TryGetValue(path, out s)) return s;
            if (missing.Contains(path)) return null;
            Texture2D tex = Resources.Load<Texture2D>("Art/" + path);
            if (tex == null) { missing.Add(path); return null; }
            s = Sprite.Create(tex, new Rect(0, 0, tex.width, tex.height), new Vector2(0.5f, 0.5f), ppu);
            s.name = "ext_" + path;
            external[path] = s;
            return s;
        }

        /// <summary>Oda eşyası için hazır model adı (Kenney Furniture Kit, yan görünüm). Yoksa null → kodla çizilir.</summary>
        public static string FurnitureFile(string kind, int style)
        {
            string[] set;
            switch (kind)
            {
                case "sofa": set = new[] { "loungeSofa", "loungeDesignSofa", "loungeSofaLong" }; break;
                case "table": set = new[] { "table", "tableRound", "tableCoffee" }; break;
                case "lamp": set = new[] { "lampRoundFloor", "lampSquareFloor", "lampRoundTable" }; break;
                case "plant": set = new[] { "pottedPlant", "plantSmall1", "plantSmall3" }; break;
                case "bed": set = new[] { "bedSingle", "bedDouble", "bedBunk" }; break;
                case "bookshelf": set = new[] { "bookcaseClosed", "bookcaseOpen", "bookcaseClosedWide" }; break;
                case "bench": set = new[] { "bench", "benchCushion", "benchCushionLow" }; break;
                case "chair": set = new[] { "loungeChair", "loungeChairRelax", "chairCushion" }; break;
                case "tv": set = new[] { "televisionModern", "televisionVintage", "radio" }; break;
                default: return null;
            }
            return set[Mathf.Clamp(style, 0, set.Length - 1)];
        }

        /// <summary>Hazır eşya çizimi varsa onu, yoksa kodla üretileni verir.</summary>
        public static Sprite FurnitureAny(string kind, int style)
        {
            string f = FurnitureFile(kind, style);
            Sprite s = f == null ? null : Ext("furniture/" + f);
            return s ?? Furniture(kind, style);
        }

        // Parçacık paketi (yumuşak kenarlı gerçek efekt dokuları); yoksa kodla üretilen eşdeğer
        public static Sprite FxStar() { return Ext("fx/star_05", 400f) ?? Sparkle(); }
        public static Sprite FxStarSmall() { return Ext("fx/star_07", 400f) ?? Particle(); }
        public static Sprite FxLight() { return Ext("fx/light_01", 400f) ?? SoftGlow(); }
        public static Sprite FxFlare() { return Ext("fx/flare_01", 400f) ?? SoftGlow(); }
        public static Sprite FxTwirl() { return Ext("fx/twirl_02", 400f) ?? Ring(); }
        public static Sprite FxMagic() { return Ext("fx/magic_03", 400f) ?? Sparkle(); }
        public static Sprite FxCircle() { return Ext("fx/circle_05", 400f) ?? Particle(); }

        // Arayüz simgeleri (Kenney Game Icons, beyaz; Image.color ile renklenir)
        public static Sprite IconGear() { return Ext("icons/gear") ?? Gear(); }
        public static Sprite IconHome() { return Ext("icons/home") ?? Home(); }
        public static Sprite IconBack() { return Ext("icons/arrowLeft") ?? Back(); }
        public static Sprite IconClose() { return Ext("icons/cross") ?? Close(); }
        public static Sprite IconPlus() { return Ext("icons/plus") ?? Plus(); }
        public static Sprite IconCheck() { return Ext("icons/checkmark") ?? Check(); }
        public static Sprite IconSpeaker(bool on) { return Ext(on ? "icons/audioOn" : "icons/audioOff") ?? Speaker(on); }
        public static Sprite IconTrophyFlat() { return Ext("icons/trophy"); }
    }
}
