using System;
using System.Collections.Generic;
using UnityEngine;

namespace RoyalMatch
{
    /// <summary>
    /// Tüm görseller çalışma anında kodla üretilir ve önbelleğe alınır (telif içeren hazır dosya yok).
    /// Hedef: Royal Match'in çizgi film stili — parlak hacimli taşlar, kalın koyu kenar, üstten gelen ışık,
    /// altta iç gölge, büyük yumuşak parıltı. Şekiller 128 birimlik koordinatlarla yazılır, 2x çözünürlükte boyanır.
    /// </summary>
    public static partial class Art
    {
        public const int S = 128;              // yazım koordinat alanı
        public const float Res = 2f;           // boyama çarpanı (256 px)
        public const float PPU = 256f;         // 1 birim = 1 hücre
        private static readonly Dictionary<string, Sprite> cache = new Dictionary<string, Sprite>();

        private static Painter P() { return new Painter((int)(S * Res), (int)(S * Res), Res); }
        private static Painter P(int w, int h) { return new Painter((int)(w * Res), (int)(h * Res), Res); }

        public static Color Hex(string hex)
        {
            Color c;
            if (ColorUtility.TryParseHtmlString(hex, out c)) return c;
            return Color.magenta;
        }

        public static Color A(Color c, float a) { c.a = a; return c; }
        public static Color Mul(Color c, float k) { return new Color(c.r * k, c.g * k, c.b * k, c.a); }
        public static Color Lighten(Color c, float k) { return Color.Lerp(c, Color.white, k); }
        private static readonly Color ShadowCol = new Color(0.05f, 0.02f, 0.1f, 0.42f);

        private static Sprite Cached(string key, Func<Sprite> make)
        {
            Sprite s;
            if (cache.TryGetValue(key, out s) && s != null) return s;
            s = make();
            s.name = key;
            cache[key] = s;
            return s;
        }

        // ---------------- Renk paleti ----------------
        public static Color PieceBase(PieceColor c)
        {
            switch (c)
            {
                case PieceColor.Red: return Hex("#EE3B33");
                case PieceColor.Blue: return Hex("#2F8BF0");
                case PieceColor.Green: return Hex("#44CC44");
                case PieceColor.Yellow: return Hex("#FFC928");
                case PieceColor.Purple: return Hex("#A94BE6");
                default: return Hex("#FF8A1E");
            }
        }

        public static readonly Color Gold = Hex("#F6C544");
        public static readonly Color GoldDark = Hex("#B9831A");
        public static readonly Color Wood = Hex("#8B5A2B");
        public static readonly Color WoodLight = Hex("#C68A4B");
        public static readonly Color Cream = Hex("#FFF3D6");
        public static readonly Color NavyUi = Hex("#1D2B53");
        public static readonly Color Ink = Hex("#2B1B10");
        public static readonly Color GreenBtn = Hex("#52C83C");
        public static readonly Color BlueBtn = Hex("#3A8DE8");
        public static readonly Color RedBtn = Hex("#E8403A");

        // ---------------- Ortak hacim boyama ----------------
        /// <summary>Hacimli, parlak gövde: gölge, dikey geçiş, alt iç gölge, üst kenar ışığı, kalın kenar.</summary>
        private static void Volume(Painter p, Shape s, Color baseCol, float outline = 2.6f, float y0 = 14f, float y1 = 114f, bool rim = true)
        {
            p.FillGradient(s, Mul(baseCol, 0.8f), Lighten(baseCol, 0.42f), y0, y1);
            p.InnerShadow(s, 0f, 8f, 12f, A(Mul(baseCol, 0.4f), 0.7f));
            p.InnerShadow(s, 5f, 0f, 9f, A(Mul(baseCol, 0.5f), 0.35f));
            if (rim) p.RimLight(s, 0f, -4f, 5f, A(Color.white, 0.5f));
            p.Stroke(s, outline, Mul(baseCol, 0.4f));
        }

        /// <summary>Parlak oyun taşı görünümü.</summary>
        private static void Glossy(Painter p, Shape s, Color baseCol, float glossY = 22f, float glossRx = 30f, float glossRy = 15f, float glossX = -8f)
        {
            p.Shadow(s, 2f, -6f, 10f, ShadowCol);
            Volume(p, s, baseCol, 2.8f);
            Shape gloss = Sdf.Intersect(Sdf.Expand(s, -8f), Sdf.Ellipse(S / 2f + glossX, S / 2f + glossY, glossRx, glossRy));
            p.Fill(gloss, A(Color.white, 0.5f));
            p.Fill(Sdf.Circle(S / 2f - 22f, S / 2f + 28f, 6f), A(Color.white, 0.95f));
        }

        private static Shape PieceShape(PieceColor c)
        {
            float cx = S / 2f, cy = S / 2f;
            switch (c)
            {
                case PieceColor.Red: return Sdf.RoundBox(cx, cy, 46f, 46f, 18f);
                case PieceColor.Blue: return Sdf.Circle(cx, cy, 49f);
                case PieceColor.Green: return Sdf.RegularPolygon(cx, cy, 52f, 6, 0f, 9f);
                case PieceColor.Yellow: return Sdf.RegularPolygon(cx, cy - 8f, 58f, 3, 90f, 12f);
                case PieceColor.Purple: return Sdf.RegularPolygon(cx, cy, 54f, 4, 90f, 9f);
                default: return Sdf.RegularPolygon(cx, cy, 53f, 5, 90f, 10f);
            }
        }

        // ---------------- Taşlar ----------------
        public static Sprite Piece(PieceColor c)
        {
            return Cached("piece_" + c, () =>
            {
                var p = P();
                Glossy(p, PieceShape(c), PieceBase(c));
                return p.ToSprite(PPU);
            });
        }

        public static Sprite Particle()
        {
            return Cached("particle", () =>
            {
                var p = new Painter(32, 32);
                p.Fill(Sdf.Circle(16, 16, 13), Color.white);
                p.Fill(Sdf.Circle(13, 19, 5), A(Color.white, 0.6f));
                return p.ToSprite(PPU / 4f);
            });
        }

        public static Sprite Sparkle()
        {
            return Cached("sparkle", () =>
            {
                var p = new Painter(64, 64);
                p.Glow(32f, 32f, 30f, A(Color.white, 0.5f));
                p.Fill(Sdf.Star(32f, 32f, 28f, 6f, 4, 90f), Color.white);
                return p.ToSprite(PPU / 2f);
            });
        }

        // ---------------- Güçlendiriciler ----------------
        public static Sprite Rocket(RocketDir dir)
        {
            return Cached("rocket_" + dir, () =>
            {
                var p = P();
                float cx = 64f, cy = 64f;
                Func<Shape, Shape> R = sh => dir == RocketDir.Horizontal ? Sdf.Rotate(sh, cx, cy, -90f) : sh;
                Shape body = Sdf.RoundBox(cx, cy - 2f, 19f, 34f, 16f);
                Shape nose = Sdf.Polygon(new[] { new Vector2(cx - 19f, cy + 22f), new Vector2(cx + 19f, cy + 22f), new Vector2(cx, cy + 56f) }, 4f);
                Shape finL = Sdf.Polygon(new[] { new Vector2(cx - 16f, cy - 8f), new Vector2(cx - 16f, cy - 38f), new Vector2(cx - 38f, cy - 44f) }, 3f);
                Shape finR = Sdf.Polygon(new[] { new Vector2(cx + 16f, cy - 8f), new Vector2(cx + 16f, cy - 38f), new Vector2(cx + 38f, cy - 44f) }, 3f);
                Shape flame = Sdf.Ellipse(cx, cy - 50f, 12f, 16f);
                Shape all = Sdf.Union(body, nose, finL, finR);
                p.Shadow(R(all), 2f, -6f, 10f, ShadowCol);
                p.Glow(cx, cy - 52f, 22f, A(Hex("#FFB13B"), 0.5f));
                p.FillGradient(R(flame), Hex("#FF6A00"), Hex("#FFE66B"), cy - 66f, cy - 36f);
                p.Fill(R(Sdf.Ellipse(cx, cy - 47f, 6f, 9f)), Hex("#FFF9C4"));
                Volume(p, R(finL), Hex("#E33B30"), 2.4f, cy - 44f, cy - 8f, false);
                Volume(p, R(finR), Hex("#E33B30"), 2.4f, cy - 44f, cy - 8f, false);
                Volume(p, R(body), Hex("#E9EEF5"), 2.6f, cy - 36f, cy + 32f);
                p.Fill(R(Sdf.Intersect(body, Sdf.Box(cx, cy - 22f, 20f, 6f))), Hex("#E33B30"));
                Volume(p, R(nose), Hex("#E33B30"), 2.6f, cy + 22f, cy + 56f);
                p.Fill(R(Sdf.Circle(cx, cy + 4f, 10f)), Hex("#1F58A3"));
                p.Fill(R(Sdf.Circle(cx, cy + 4f, 7f)), Hex("#7EC2FF"));
                p.Fill(R(Sdf.Circle(cx - 2.5f, cy + 7f, 2.8f)), Color.white);
                p.Stroke(R(all), 2.6f, Hex("#3A2420"));
                p.Fill(R(Sdf.Intersect(Sdf.Expand(body, -5f), Sdf.Box(cx - 11f, cy + 2f, 4f, 22f))), A(Color.white, 0.6f));
                return p.ToSprite(PPU);
            });
        }

        public static Sprite Tnt()
        {
            return Cached("tnt", () =>
            {
                var p = P();
                Shape a = Sdf.RoundBox(41f, 56f, 13f, 36f, 7f);
                Shape b = Sdf.RoundBox(64f, 60f, 13f, 40f, 7f);
                Shape c = Sdf.RoundBox(87f, 56f, 13f, 36f, 7f);
                Shape all = Sdf.Union(a, b, c);
                p.Shadow(all, 2f, -6f, 10f, ShadowCol);
                Shape fuse = Sdf.Segment(64f, 100f, 80f, 118f, 2.8f);
                p.Fill(fuse, Hex("#6B4A2B"));
                p.Glow(82f, 120f, 18f, A(Hex("#FFE066"), 0.9f));
                p.Fill(Sdf.Star(82f, 120f, 9f, 4f, 6, 90f), Hex("#FFF6B8"));
                foreach (Shape s in new[] { a, c, b }) Volume(p, s, Hex("#E53A2E"), 2.4f, 16f, 100f);
                p.Fill(Sdf.Intersect(all, Sdf.Box(64f, 38f, 60f, 4f)), Hex("#4A1310"));
                p.Fill(Sdf.Intersect(all, Sdf.Box(64f, 84f, 60f, 4f)), Hex("#4A1310"));
                Shape label = Sdf.Intersect(all, Sdf.RoundBox(64f, 61f, 42f, 10f, 4f));
                p.Fill(label, Cream);
                p.InnerShadow(label, 0f, 3f, 4f, A(Hex("#B89C70"), 0.5f));
                Color ink = Hex("#5A120E");
                p.Fill(Sdf.Union(Sdf.Box(47f, 60f, 2.2f, 6.5f), Sdf.Box(47f, 66f, 6.5f, 2f)), ink);
                p.Fill(Sdf.Union(Sdf.Box(58f, 60f, 2f, 7f), Sdf.Box(70f, 60f, 2f, 7f), Sdf.Segment(58f, 67f, 70f, 53f, 2f)), ink);
                p.Fill(Sdf.Union(Sdf.Box(81f, 60f, 2.2f, 6.5f), Sdf.Box(81f, 66f, 6.5f, 2f)), ink);
                p.Stroke(all, 2.6f, Hex("#4A1310"));
                p.Fill(Sdf.Intersect(Sdf.Expand(b, -4f), Sdf.Box(56f, 92f, 2.5f, 6f)), A(Color.white, 0.6f));
                return p.ToSprite(PPU);
            });
        }

        public static Sprite LightBall()
        {
            return Cached("lightball", () =>
            {
                var p = P();
                Shape ball = Sdf.Circle(64f, 64f, 47f);
                p.Shadow(ball, 2f, -6f, 10f, ShadowCol);
                p.Glow(64f, 64f, 64f, A(Hex("#C58CFF"), 0.55f));
                p.FillRadial(ball, 50f, 80f, 70f, Hex("#9C5CF0"), Hex("#3A1266"));
                p.InnerShadow(ball, 0f, 7f, 12f, A(Hex("#1E0838"), 0.6f));
                for (int i = 0; i < 6; i++)
                {
                    float ang = (90f + 60f * i) * Mathf.Deg2Rad;
                    float x = 64f + Mathf.Cos(ang) * 30f, y = 64f + Mathf.Sin(ang) * 30f;
                    Color c = PieceBase((PieceColor)i);
                    p.Glow(x, y, 12f, A(Lighten(c, 0.3f), 0.6f));
                    p.Fill(Sdf.Circle(x, y, 8f), Mul(c, 0.75f));
                    p.FillGradient(Sdf.Circle(x, y, 6.2f), Mul(c, 0.9f), Lighten(c, 0.35f), y - 6f, y + 6f);
                    p.Fill(Sdf.Circle(x - 1.8f, y + 1.8f, 2.2f), A(Color.white, 0.9f));
                }
                p.Glow(64f, 64f, 18f, A(Color.white, 0.95f));
                p.Fill(Sdf.Star(64f, 64f, 14f, 4.5f, 4, 90f), Color.white);
                p.RimLight(ball, 0f, -4f, 6f, A(Color.white, 0.45f));
                p.Stroke(ball, 2.8f, Hex("#24083F"));
                p.Stroke(Sdf.Circle(64f, 64f, 42f), 1.6f, A(Color.white, 0.3f));
                p.Fill(Sdf.Intersect(Sdf.Expand(ball, -7f), Sdf.Ellipse(50f, 90f, 20f, 9f)), A(Color.white, 0.4f));
                return p.ToSprite(PPU);
            });
        }

        public static Sprite Propeller()
        {
            return Cached("propeller", () =>
            {
                var p = P();
                Shape blades = null;
                for (int i = 0; i < 3; i++)
                {
                    Shape bl = Sdf.Rotate(Sdf.Ellipse(64f, 64f + 29f, 13f, 31f), 64f, 64f, 120f * i);
                    blades = blades == null ? bl : Sdf.Union(blades, bl);
                }
                Shape hub = Sdf.Circle(64f, 64f, 14f);
                Shape all = Sdf.Union(blades, hub);
                p.Shadow(all, 2f, -6f, 10f, ShadowCol);
                Volume(p, blades, Hex("#45A6F5"), 2.6f, 8f, 120f);
                for (int i = 0; i < 3; i++)
                    p.Fill(Sdf.Rotate(Sdf.Ellipse(59f, 64f + 32f, 3.2f, 15f), 64f, 64f, 120f * i), A(Color.white, 0.55f));
                Volume(p, hub, Hex("#B8C2D0"), 2.6f, 50f, 78f);
                p.Fill(Sdf.Circle(64f, 64f, 4.5f), Hex("#2F3A4F"));
                p.Fill(Sdf.Circle(62f, 66f, 1.5f), A(Color.white, 0.8f));
                return p.ToSprite(PPU);
            });
        }

        // ---------------- Engeller ----------------
        public static Sprite Box(int hp)
        {
            return Cached("box_" + hp, () =>
            {
                var p = P();
                Shape body = Sdf.RoundBox(64f, 64f, 50f, 50f, 10f);
                Color wood = hp >= 3 ? Hex("#7A4A22") : hp == 2 ? Hex("#9B6230") : Hex("#BE7C40");
                p.Shadow(body, 2f, -6f, 10f, ShadowCol);
                Volume(p, body, wood, 3f, 14f, 114f);
                Color line = A(Mul(wood, 0.45f), 0.9f);
                for (int i = 0; i < 2; i++) p.Fill(Sdf.Intersect(body, Sdf.Box(64f, 40f + i * 48f, 60f, 1.4f)), line);
                Shape d1 = Sdf.Segment(28f, 28f, 100f, 100f, 8f), d2 = Sdf.Segment(28f, 100f, 100f, 28f, 8f);
                Shape cross = Sdf.Intersect(Sdf.Union(d1, d2), Sdf.Expand(body, -4f));
                p.FillGradient(cross, Mul(wood, 0.95f), Lighten(wood, 0.3f), 20f, 110f);
                p.InnerShadow(cross, 0f, 3f, 4f, A(Mul(wood, 0.4f), 0.6f));
                p.Stroke(cross, 2f, Mul(wood, 0.45f));
                foreach (var pt in new[] { new Vector2(26f, 26f), new Vector2(102f, 26f), new Vector2(26f, 102f), new Vector2(102f, 102f) })
                {
                    p.Fill(Sdf.Circle(pt.x, pt.y, 3.6f), Hex("#3A2414"));
                    p.Fill(Sdf.Circle(pt.x - 1f, pt.y + 1f, 1.3f), A(Color.white, 0.5f));
                }
                if (hp >= 3)
                    foreach (var pt in new[] { new Vector2(20f, 20f), new Vector2(108f, 20f), new Vector2(20f, 108f), new Vector2(108f, 108f) })
                    {
                        Shape m = Sdf.Intersect(body, Sdf.RoundBox(pt.x, pt.y, 12f, 12f, 3f));
                        Volume(p, m, Hex("#9AA3B2"), 1.8f, pt.y - 12f, pt.y + 12f, false);
                    }
                if (hp == 1)
                    p.Fill(Sdf.Union(Sdf.Segment(40f, 112f, 52f, 84f, 1.5f), Sdf.Segment(52f, 84f, 44f, 70f, 1.5f), Sdf.Segment(92f, 18f, 82f, 44f, 1.5f)), A(Hex("#2B1B10"), 0.8f));
                p.Stroke(body, 3f, Hex("#3A2414"));
                return p.ToSprite(PPU);
            });
        }

        public static Sprite Vase(int hp)
        {
            return Cached("vase_" + hp, () =>
            {
                var p = P();
                Shape body = Sdf.Ellipse(64f, 54f, 33f, 38f);
                Shape neck = Sdf.RoundBox(64f, 94f, 13f, 12f, 4f);
                Shape rim = Sdf.RoundBox(64f, 108f, 22f, 6f, 3f);
                Shape foot = Sdf.RoundBox(64f, 18f, 19f, 6f, 3f);
                Shape all = Sdf.Union(body, neck, rim, foot);
                Color blue = Hex("#3F86E0");
                p.Shadow(all, 2f, -6f, 10f, ShadowCol);
                Volume(p, all, blue, 2.6f, 12f, 114f);
                Shape band = Sdf.Intersect(body, Sdf.Box(64f, 54f, 40f, 7f));
                p.Fill(band, Cream);
                p.InnerShadow(band, 0f, 3f, 4f, A(Hex("#B89C70"), 0.5f));
                for (int i = -2; i <= 2; i++) p.Fill(Sdf.RegularPolygon(64f + i * 12f, 54f, 4.2f, 4, 90f), Mul(blue, 0.7f));
                p.Fill(Sdf.Intersect(Sdf.Expand(body, -5f), Sdf.Ellipse(48f, 68f, 7f, 17f)), A(Color.white, 0.5f));
                if (hp <= 1)
                {
                    Color crack = A(Color.white, 0.9f);
                    p.Fill(Sdf.Union(Sdf.Segment(74f, 88f, 80f, 66f, 1.5f), Sdf.Segment(80f, 66f, 72f, 50f, 1.5f), Sdf.Segment(72f, 50f, 78f, 34f, 1.5f), Sdf.Segment(80f, 66f, 90f, 60f, 1.3f)), crack);
                }
                p.Stroke(all, 2.6f, Hex("#163F75"));
                return p.ToSprite(PPU);
            });
        }

        public static Sprite Plate(int hp)
        {
            return Cached("plate_" + hp, () =>
            {
                var p = P();
                int n = Mathf.Clamp(hp, 1, 3);
                for (int i = 0; i < n; i++)
                {
                    float y = 38f + i * 16f;
                    Shape pl = Sdf.Ellipse(64f, y, 48f, 20f);
                    if (i == 0) p.Shadow(pl, 2f, -6f, 10f, ShadowCol);
                    Volume(p, pl, Hex("#F3EADA"), 2.4f, y - 20f, y + 20f, false);
                    p.Stroke(Sdf.Ellipse(64f, y, 40f, 14f), 2.2f, Hex("#3A8DE8"));
                    p.Stroke(Sdf.Ellipse(64f, y, 36f, 12f), 1f, A(Hex("#3A8DE8"), 0.5f));
                    if (i == n - 1)
                    {
                        p.Fill(Sdf.Ellipse(64f, y, 26f, 9f), A(Hex("#C9D3E0"), 0.5f));
                        p.Fill(Sdf.Ellipse(50f, y + 7f, 11f, 3.2f), A(Color.white, 0.85f));
                    }
                }
                return p.ToSprite(PPU);
            });
        }

        public static Sprite Egg(int hp)
        {
            return Cached("egg_" + hp, () =>
            {
                var p = P();
                Shape egg = Sdf.Union(Sdf.Ellipse(64f, 56f, 38f, 42f), Sdf.Ellipse(64f, 68f, 31f, 44f));
                p.Shadow(egg, 2f, -6f, 10f, ShadowCol);
                Volume(p, egg, Hex("#F6E9CF"), 2.6f, 14f, 112f);
                foreach (var pt in new[] { new Vector2(48f, 50f), new Vector2(76f, 40f), new Vector2(60f, 80f), new Vector2(84f, 72f), new Vector2(44f, 70f), new Vector2(70f, 98f) })
                    p.Fill(Sdf.Circle(pt.x, pt.y, 3.4f), A(Hex("#C9A978"), 0.8f));
                if (hp <= 1)
                    p.Fill(Sdf.Union(Sdf.Segment(56f, 106f, 62f, 86f, 1.6f), Sdf.Segment(62f, 86f, 54f, 74f, 1.6f), Sdf.Segment(54f, 74f, 66f, 60f, 1.6f), Sdf.Segment(62f, 86f, 74f, 80f, 1.4f)), Hex("#6B5438"));
                p.Fill(Sdf.Intersect(Sdf.Expand(egg, -6f), Sdf.Ellipse(50f, 82f, 8f, 17f)), A(Color.white, 0.65f));
                p.Stroke(egg, 2.6f, Hex("#6B5438"));
                return p.ToSprite(PPU);
            });
        }

        public static Sprite Safe(int hp)
        {
            return Cached("safe_" + hp, () =>
            {
                var p = P();
                Shape body = Sdf.RoundBox(64f, 64f, 50f, 50f, 12f);
                Shape panel = Sdf.RoundBox(64f, 64f, 40f, 40f, 8f);
                Color steel = Hex("#67738A");
                p.Shadow(body, 2f, -6f, 10f, ShadowCol);
                Volume(p, body, steel, 3f, 14f, 114f);
                p.FillGradient(panel, Mul(steel, 0.9f), Lighten(steel, 0.2f), 24f, 104f);
                p.InnerShadow(panel, 0f, -3f, 5f, A(Mul(steel, 0.4f), 0.6f));
                p.Stroke(panel, 2f, Mul(steel, 0.45f));
                Shape dial = Sdf.Circle(52f, 66f, 15f);
                Volume(p, dial, Hex("#C9D3E0"), 2.2f, 51f, 81f);
                p.Fill(Sdf.Circle(52f, 66f, 5.5f), Hex("#2F3A4F"));
                for (int i = 0; i < 8; i++)
                {
                    float a = i * 45f * Mathf.Deg2Rad;
                    p.Fill(Sdf.Circle(52f + Mathf.Cos(a) * 10.5f, 66f + Mathf.Sin(a) * 10.5f, 1.5f), Hex("#2F3A4F"));
                }
                Shape handle = Sdf.Union(Sdf.Segment(80f, 54f, 80f, 78f, 3.8f), Sdf.Segment(80f, 66f, 94f, 66f, 3.8f));
                Volume(p, handle, Hex("#3F4A5F"), 1.6f, 50f, 82f, false);
                p.Fill(Sdf.Circle(94f, 66f, 5.5f), Hex("#B8C2D0"));
                for (int i = 0; i < 3; i++)
                {
                    bool on = i < hp;
                    if (on) p.Glow(52f + i * 12f, 34f, 8f, A(Hex("#FF6B5E"), 0.7f));
                    p.Fill(Sdf.Circle(52f + i * 12f, 34f, 3.8f), on ? Hex("#E8403A") : Hex("#2F3A4F"));
                    if (on) p.Fill(Sdf.Circle(51f + i * 12f, 35f, 1.3f), A(Color.white, 0.85f));
                }
                p.Stroke(body, 3f, Hex("#232A38"));
                return p.ToSprite(PPU);
            });
        }

        public static Sprite Mailbox(int hp)
        {
            return Cached("mailbox_" + hp, () =>
            {
                var p = P();
                Shape box = Sdf.RoundBox(64f, 50f, 40f, 32f, 9f);
                Shape roof = Sdf.Intersect(Sdf.Ellipse(64f, 82f, 40f, 21f), Sdf.HalfPlaneAbove(80f));
                Shape body = Sdf.Union(box, roof, Sdf.Box(64f, 81f, 40f, 3f));
                p.Shadow(body, 2f, -6f, 10f, ShadowCol);
                Volume(p, body, Hex("#2F74DA"), 2.6f, 16f, 104f);
                Shape slot = Sdf.RoundBox(64f, 74f, 22f, 4f, 2f);
                p.Fill(slot, Hex("#0E2148"));
                p.Fill(Sdf.Segment(102f, 70f, 102f, 114f, 3.2f), Hex("#E8403A"));
                Volume(p, Sdf.RoundBox(95f, 110f, 10f, 5.5f, 2f), Hex("#E8403A"), 1.5f, 104f, 116f, false);
                for (int i = 0; i < Mathf.Clamp(hp, 1, 3); i++)
                {
                    float x = 44f + i * 20f, y = 42f;
                    Shape env = Sdf.RoundBox(x, y, 9.5f, 7f, 1.5f);
                    p.Fill(env, Cream);
                    p.InnerShadow(env, 0f, 2f, 3f, A(Hex("#B89C70"), 0.5f));
                    p.Stroke(env, 1.2f, Hex("#6B5438"));
                    p.Fill(Sdf.Union(Sdf.Segment(x - 9f, y + 6f, x, y - 1f, 0.9f), Sdf.Segment(x, y - 1f, x + 9f, y + 6f, 0.9f)), Hex("#6B5438"));
                }
                p.Fill(Sdf.Intersect(Sdf.Expand(body, -5f), Sdf.Ellipse(38f, 60f, 5f, 18f)), A(Color.white, 0.45f));
                p.Stroke(body, 2.6f, Hex("#132C57"));
                return p.ToSprite(PPU);
            });
        }

        public static Sprite Grass(int layer)
        {
            return Cached("grass_" + layer, () =>
            {
                var p = P();
                Shape tile = Sdf.RoundBox(64f, 64f, 60f, 60f, 12f);
                Color g = layer >= 2 ? Hex("#3E9B2E") : Hex("#67C94C");
                p.FillGradient(tile, Mul(g, 0.85f), Lighten(g, 0.12f), 4f, 124f);
                p.InnerShadow(tile, 0f, 5f, 8f, A(Mul(g, 0.5f), 0.5f));
                var rnd = new System.Random(layer * 7 + 3);
                int blades = layer >= 2 ? 30 : 18;
                for (int i = 0; i < blades; i++)
                {
                    float x = 12f + (float)rnd.NextDouble() * 104f, y = 8f + (float)rnd.NextDouble() * 100f;
                    float h = 9f + (float)rnd.NextDouble() * 9f;
                    float lean = (float)rnd.NextDouble() * 6f - 3f;
                    Shape bl = Sdf.Polygon(new[] { new Vector2(x - 3.5f, y), new Vector2(x + 3.5f, y), new Vector2(x + lean, y + h) }, 0.8f);
                    p.Fill(Sdf.Intersect(bl, tile), Lighten(g, 0.38f));
                }
                p.RimLight(tile, 0f, -3f, 4f, A(Color.white, 0.25f));
                p.Stroke(tile, 2.2f, Mul(g, 0.55f));
                return p.ToSprite(PPU);
            });
        }

        public static Sprite Chain()
        {
            return Cached("chain", () =>
            {
                var p = P();
                Color metal = Hex("#C2C9D4"), dark = Hex("#4B5566");
                for (int pass = 0; pass < 2; pass++)
                    for (int i = 0; i < 6; i++)
                    {
                        float c = 12f + i * 21f;
                        Shape link = pass == 0 ? Sdf.Ellipse(c, 64f, 13f, 8f) : Sdf.Ellipse(64f, c, 8f, 13f);
                        p.Shadow(Sdf.Expand(link, 3f), 1f, -3f, 5f, A(Color.black, 0.3f));
                        p.Stroke(link, 7f, dark);
                        p.Stroke(link, 4.2f, metal);
                        p.Stroke(Sdf.Expand(link, 1.2f), 1.2f, A(Color.white, 0.5f));
                    }
                return p.ToSprite(PPU);
            });
        }

        public static Sprite CellBack()
        {
            return Cached("cellback", () =>
            {
                var p = P();
                Shape t = Sdf.RoundBox(64f, 64f, 62f, 62f, 12f);
                p.Fill(t, Color.white);
                p.InnerShadow(t, 0f, -4f, 7f, A(Color.black, 0.18f));
                p.RimLight(t, 0f, -3f, 3f, A(Color.white, 0.18f));
                return p.ToSprite(PPU);
            });
        }

        public static Sprite SelectRing()
        {
            return Cached("selectring", () =>
            {
                var p = P();
                p.Glow(64f, 64f, 64f, A(Color.white, 0.3f));
                p.Stroke(Sdf.RoundBox(64f, 64f, 58f, 58f, 16f), 6f, Color.white);
                return p.ToSprite(PPU);
            });
        }

        public static Sprite Beam()
        {
            return Cached("beam", () =>
            {
                var p = new Painter(256, 64, 2f);
                p.Glow(64f, 16f, 62f, A(Color.white, 0.45f));
                p.Fill(Sdf.RoundBox(64f, 16f, 62f, 9f, 9f), A(Color.white, 0.9f));
                p.Fill(Sdf.RoundBox(64f, 16f, 60f, 4f, 4f), Color.white);
                return p.ToSprite(PPU);
            });
        }

        public static Sprite Ring()
        {
            return Cached("ring", () =>
            {
                var p = P();
                p.Stroke(Sdf.Circle(64f, 64f, 52f), 12f, A(Color.white, 0.5f));
                p.Stroke(Sdf.Circle(64f, 64f, 52f), 6f, Color.white);
                return p.ToSprite(PPU);
            });
        }

        /// <summary>Haritada kayan bulut.</summary>
        public static Sprite Cloud()
        {
            return Cached("cloud", () =>
            {
                var p = new Painter(256, 128, 2f);
                Shape c = Sdf.Union(Sdf.Ellipse(64f, 28f, 50f, 16f), Sdf.Circle(44f, 36f, 18f), Sdf.Circle(72f, 40f, 22f), Sdf.Circle(96f, 32f, 14f));
                p.Shadow(c, 0f, -3f, 6f, A(Hex("#2250B3"), 0.25f));
                p.FillGradient(c, Hex("#DCEBFF"), Color.white, 10f, 60f);
                return p.ToSprite(100f);
            });
        }

        /// <summary>Konfeti parçası (beyaz, renklendirilir).</summary>
        public static Sprite Confetti()
        {
            return Cached("confetti", () =>
            {
                var p = new Painter(32, 48);
                p.Fill(Sdf.RoundBox(16f, 24f, 12f, 20f, 3f), Color.white);
                p.Fill(Sdf.Intersect(Sdf.RoundBox(16f, 24f, 12f, 20f, 3f), Sdf.HalfPlaneAbove(24f)), new Color(1f, 1f, 1f, 0.35f));
                return p.ToSprite(100f);
            });
        }

        /// <summary>Tahta çerçevesi: koyu ahşap, altın şerit, iç gölge (9-slice).</summary>
        public static Sprite BoardFrame()
        {
            return Cached("boardframe", () =>
            {
                var p = new Painter(192, 192, 2f);
                Shape outer = Sdf.RoundBox(48f, 48f, 46f, 46f, 12f);
                p.Shadow(outer, 0f, -4f, 8f, A(Color.black, 0.45f));
                Volume(p, outer, Hex("#7A4A22"), 2.4f, 2f, 94f);
                Shape goldLine = Sdf.Subtract(Sdf.RoundBox(48f, 48f, 41f, 41f, 9f), Sdf.RoundBox(48f, 48f, 39f, 39f, 8f));
                p.Fill(goldLine, Hex("#E0A317"));
                p.Fill(Sdf.Intersect(goldLine, Sdf.HalfPlaneAbove(48f)), A(Hex("#FFE37A"), 0.6f));
                Shape inner = Sdf.RoundBox(48f, 48f, 38f, 38f, 8f);
                p.Fill(inner, Hex("#1B2A4D"));
                p.InnerShadow(inner, 0f, -5f, 8f, A(Color.black, 0.5f));
                return p.ToSliced(10f, PPU);
            });
        }
    }
}
