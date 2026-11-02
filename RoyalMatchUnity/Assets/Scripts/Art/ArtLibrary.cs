using System;
using System.Collections.Generic;
using UnityEngine;

namespace RoyalMatch
{
    /// <summary>
    /// Tüm görseller çalışma anında kodla üretilir ve önbelleğe alınır (telif içeren
    /// hazır dosya kullanılmaz). Royal Match'in parlak, yuvarlak hatlı, güçlü kontrastlı
    /// çizgi film stili hedeflenir.
    /// </summary>
    public static partial class Art
    {
        public const int S = 128;          // taş/simge tuvali
        public const float PPU = 128f;     // 1 birim = 1 hücre
        private static readonly Dictionary<string, Sprite> cache = new Dictionary<string, Sprite>();

        public static Color Hex(string hex)
        {
            Color c;
            if (ColorUtility.TryParseHtmlString(hex, out c)) return c;
            return Color.magenta;
        }

        public static Color A(Color c, float a) { c.a = a; return c; }
        public static Color Mul(Color c, float k) { return new Color(c.r * k, c.g * k, c.b * k, c.a); }
        public static Color Lighten(Color c, float k) { return Color.Lerp(c, Color.white, k); }

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
                case PieceColor.Red: return Hex("#E8403A");
                case PieceColor.Blue: return Hex("#3A8DE8");
                case PieceColor.Green: return Hex("#4CC94A");
                case PieceColor.Yellow: return Hex("#F7CF3A");
                case PieceColor.Purple: return Hex("#A64BE0");
                default: return Hex("#F7862E");
            }
        }

        public static readonly Color Gold = Hex("#F6C544");
        public static readonly Color GoldDark = Hex("#B9831A");
        public static readonly Color Wood = Hex("#8B5A2B");
        public static readonly Color WoodLight = Hex("#C68A4B");
        public static readonly Color Cream = Hex("#FFF3D6");
        public static readonly Color NavyUi = Hex("#1D2B53");
        public static readonly Color Ink = Hex("#2B1B10");
        public static readonly Color GreenBtn = Hex("#4CC94A");
        public static readonly Color BlueBtn = Hex("#3A8DE8");
        public static readonly Color RedBtn = Hex("#E8403A");

        // ---------------- Ortak boyama yardımcıları ----------------
        /// <summary>Parlak oyun taşı görünümü: gölge, geçiş, hacim, kenar çizgisi, parıltı.</summary>
        private static void Glossy(Painter p, Shape s, Color baseCol, float glossY = 18f, float glossRx = 26f, float glossRy = 13f, float glossX = -10f)
        {
            Color light = Lighten(baseCol, 0.35f), dark = Mul(baseCol, 0.6f);
            p.Shadow(s, 3f, -5f, 8f, new Color(0, 0, 0, 0.35f));
            p.FillGradient(s, Mul(baseCol, 0.9f), light, 20f, 110f);
            p.Shade(s, A(dark, 0.55f), 12f);
            p.Stroke(s, 3f, Mul(baseCol, 0.5f));
            Shape gloss = Sdf.Intersect(Sdf.Expand(s, -7f), Sdf.Ellipse(S / 2f + glossX, S / 2f + glossY, glossRx, glossRy));
            p.Fill(gloss, A(Color.white, 0.42f));
            p.Fill(Sdf.Circle(S / 2f - 20f, S / 2f + 26f, 5f), A(Color.white, 0.85f));
        }

        private static Shape PieceShape(PieceColor c)
        {
            float cx = S / 2f, cy = S / 2f;
            switch (c)
            {
                case PieceColor.Red: return Sdf.RoundBox(cx, cy, 42f, 42f, 15f);
                case PieceColor.Blue: return Sdf.Circle(cx, cy, 45f);
                case PieceColor.Green: return Sdf.RegularPolygon(cx, cy, 48f, 6, 0f, 7f);
                case PieceColor.Yellow: return Sdf.RegularPolygon(cx, cy - 6f, 54f, 3, 90f, 10f);
                case PieceColor.Purple: return Sdf.RegularPolygon(cx, cy, 50f, 4, 90f, 7f);
                default: return Sdf.RegularPolygon(cx, cy, 49f, 5, 90f, 8f);
            }
        }

        // ---------------- Taşlar ----------------
        public static Sprite Piece(PieceColor c)
        {
            return Cached("piece_" + c, () =>
            {
                var p = new Painter(S, S);
                Glossy(p, PieceShape(c), PieceBase(c));
                return p.ToSprite(PPU);
            });
        }

        /// <summary>Taşın rengiyle aynı tonda, patlama parçacığı için küçük yuvarlak.</summary>
        public static Sprite Particle()
        {
            return Cached("particle", () =>
            {
                var p = new Painter(32, 32);
                p.Fill(Sdf.Circle(16, 16, 13), Color.white);
                return p.ToSprite(PPU);
            });
        }

        // ---------------- Güçlendiriciler ----------------
        public static Sprite Rocket(RocketDir dir)
        {
            return Cached("rocket_" + dir, () =>
            {
                var p = new Painter(S, S);
                float cx = 64f, cy = 64f;
                Func<Shape, Shape> R = sh => dir == RocketDir.Horizontal ? Sdf.Rotate(sh, cx, cy, -90f) : sh;
                Shape body = Sdf.RoundBox(cx, cy - 2f, 17f, 32f, 14f);
                Shape nose = Sdf.Polygon(new[] { new Vector2(cx - 17f, cy + 20f), new Vector2(cx + 17f, cy + 20f), new Vector2(cx, cy + 52f) }, 3f);
                Shape finL = Sdf.Polygon(new[] { new Vector2(cx - 15f, cy - 10f), new Vector2(cx - 15f, cy - 36f), new Vector2(cx - 34f, cy - 40f) }, 2f);
                Shape finR = Sdf.Polygon(new[] { new Vector2(cx + 15f, cy - 10f), new Vector2(cx + 15f, cy - 36f), new Vector2(cx + 34f, cy - 40f) }, 2f);
                Shape flame = Sdf.Ellipse(cx, cy - 46f, 10f, 14f);
                Shape all = Sdf.Union(body, nose, finL, finR);
                p.Shadow(R(all), 3f, -5f, 8f, new Color(0, 0, 0, 0.35f));
                p.FillGradient(R(flame), Hex("#FF7A1A"), Hex("#FFE066"), cy - 60f, cy - 34f);
                p.Fill(R(Sdf.Ellipse(cx, cy - 44f, 5f, 8f)), Hex("#FFF6B0"));
                p.FillGradient(R(finL), Hex("#B22A22"), Hex("#F0574B"), cy - 40f, cy - 10f);
                p.FillGradient(R(finR), Hex("#B22A22"), Hex("#F0574B"), cy - 40f, cy - 10f);
                p.FillGradient(R(body), Hex("#C9D3E0"), Color.white, cy - 34f, cy + 30f);
                p.Fill(R(Sdf.Box(cx, cy - 20f, 17f, 5f)), Hex("#E8403A"));
                p.FillGradient(R(nose), Hex("#B22A22"), Hex("#FF6B5E"), cy + 20f, cy + 52f);
                p.Fill(R(Sdf.Circle(cx, cy + 4f, 9f)), Hex("#1F58A3"));
                p.Fill(R(Sdf.Circle(cx, cy + 4f, 6f)), Hex("#7EC2FF"));
                p.Fill(R(Sdf.Circle(cx - 2f, cy + 7f, 2.5f)), Color.white);
                p.Stroke(R(all), 2.5f, Hex("#4A2E2A"));
                p.Fill(R(Sdf.Intersect(Sdf.Expand(body, -5f), Sdf.Box(cx - 10f, cy, 4f, 22f))), A(Color.white, 0.5f));
                return p.ToSprite(PPU);
            });
        }

        public static Sprite Tnt()
        {
            return Cached("tnt", () =>
            {
                var p = new Painter(S, S);
                Shape a = Sdf.RoundBox(42f, 58f, 12f, 34f, 6f);
                Shape b = Sdf.RoundBox(64f, 62f, 12f, 38f, 6f);
                Shape c = Sdf.RoundBox(86f, 58f, 12f, 34f, 6f);
                Shape all = Sdf.Union(a, b, c);
                p.Shadow(all, 3f, -5f, 8f, new Color(0, 0, 0, 0.35f));
                Shape fuse = Sdf.Segment(64f, 100f, 80f, 116f, 2.5f);
                p.Fill(fuse, Hex("#6B4A2B"));
                p.Glow(82f, 118f, 16f, A(Hex("#FFE066"), 0.9f));
                p.Fill(Sdf.Star(82f, 118f, 8f, 3.5f, 6, 90f), Hex("#FFF2A0"));
                foreach (Shape s in new[] { a, c, b })
                {
                    p.FillGradient(s, Hex("#B4231C"), Hex("#F2584A"), 20f, 100f);
                    p.Shade(s, A(Hex("#6E100C"), 0.5f), 7f);
                }
                p.Fill(Sdf.Intersect(all, Sdf.Box(64f, 40f, 60f, 4f)), Hex("#4A1310"));
                p.Fill(Sdf.Intersect(all, Sdf.Box(64f, 84f, 60f, 4f)), Hex("#4A1310"));
                p.Fill(Sdf.Intersect(all, Sdf.RoundBox(64f, 62f, 40f, 9f, 3f)), Cream);
                // "TNT" harfleri: basit çubuklar
                p.Fill(Sdf.Union(Sdf.Box(48f, 62f, 2f, 6f), Sdf.Box(48f, 67f, 6f, 1.8f)), Hex("#6E100C"));
                p.Fill(Sdf.Union(Sdf.Box(59f, 62f, 1.8f, 6f), Sdf.Box(69f, 62f, 1.8f, 6f), Sdf.Segment(59f, 68f, 69f, 56f, 1.8f)), Hex("#6E100C"));
                p.Fill(Sdf.Union(Sdf.Box(80f, 62f, 2f, 6f), Sdf.Box(80f, 67f, 6f, 1.8f)), Hex("#6E100C"));
                p.Stroke(all, 2.5f, Hex("#4A1310"));
                p.Fill(Sdf.Intersect(Sdf.Expand(b, -4f), Sdf.Box(56f, 90f, 2.5f, 8f)), A(Color.white, 0.5f));
                return p.ToSprite(PPU);
            });
        }

        public static Sprite LightBall()
        {
            return Cached("lightball", () =>
            {
                var p = new Painter(S, S);
                Shape ball = Sdf.Circle(64f, 64f, 44f);
                p.Shadow(ball, 3f, -5f, 8f, new Color(0, 0, 0, 0.35f));
                p.Glow(64f, 64f, 62f, A(Hex("#C58CFF"), 0.6f));
                p.FillGradient(ball, Hex("#4A1A7A"), Hex("#8A46D6"), 20f, 108f);
                p.Shade(ball, A(Hex("#2A0A4A"), 0.6f), 12f);
                for (int i = 0; i < 6; i++)
                {
                    float ang = (90f + 60f * i) * Mathf.Deg2Rad;
                    float x = 64f + Mathf.Cos(ang) * 29f, y = 64f + Mathf.Sin(ang) * 29f;
                    Color c = PieceBase((PieceColor)i);
                    p.Fill(Sdf.Circle(x, y, 7.5f), Mul(c, 0.8f));
                    p.Fill(Sdf.Circle(x, y, 5.5f), Lighten(c, 0.2f));
                    p.Fill(Sdf.Circle(x - 1.5f, y + 1.5f, 2f), A(Color.white, 0.8f));
                }
                p.Glow(64f, 64f, 16f, A(Color.white, 0.9f));
                p.Fill(Sdf.Star(64f, 64f, 13f, 4f, 4, 90f), Color.white);
                p.Stroke(ball, 2.5f, Hex("#2A0A4A"));
                p.Stroke(Sdf.Circle(64f, 64f, 40f), 1.5f, A(Color.white, 0.35f));
                p.Fill(Sdf.Intersect(Sdf.Expand(ball, -6f), Sdf.Ellipse(50f, 86f, 20f, 9f)), A(Color.white, 0.35f));
                return p.ToSprite(PPU);
            });
        }

        public static Sprite Propeller()
        {
            return Cached("propeller", () =>
            {
                var p = new Painter(S, S);
                Shape blades = null;
                for (int i = 0; i < 3; i++)
                {
                    Shape bl = Sdf.Rotate(Sdf.Ellipse(64f, 64f + 27f, 12f, 29f), 64f, 64f, 120f * i);
                    blades = blades == null ? bl : Sdf.Union(blades, bl);
                }
                Shape hub = Sdf.Circle(64f, 64f, 13f);
                Shape all = Sdf.Union(blades, hub);
                p.Shadow(all, 3f, -5f, 8f, new Color(0, 0, 0, 0.35f));
                p.FillGradient(blades, Hex("#2F7FD9"), Hex("#9ED6FF"), 10f, 118f);
                p.Shade(blades, A(Hex("#1F58A3"), 0.5f), 7f);
                p.Stroke(blades, 2.5f, Hex("#163F75"));
                for (int i = 0; i < 3; i++)
                    p.Fill(Sdf.Rotate(Sdf.Ellipse(60f, 64f + 30f, 3f, 14f), 64f, 64f, 120f * i), A(Color.white, 0.5f));
                p.FillGradient(hub, Hex("#8A94A6"), Hex("#E6ECF5"), 51f, 77f);
                p.Stroke(hub, 2.5f, Hex("#2F3A4F"));
                p.Fill(Sdf.Circle(64f, 64f, 4f), Hex("#2F3A4F"));
                return p.ToSprite(PPU);
            });
        }

        // ---------------- Engeller ----------------
        public static Sprite Box(int hp)
        {
            return Cached("box_" + hp, () =>
            {
                var p = new Painter(S, S);
                Shape body = Sdf.RoundBox(64f, 64f, 48f, 48f, 9f);
                Color wood = hp >= 3 ? Hex("#7A4A22") : hp == 2 ? Hex("#9B6230") : Hex("#B9793F");
                p.Shadow(body, 3f, -5f, 8f, new Color(0, 0, 0, 0.35f));
                p.FillGradient(body, Mul(wood, 0.85f), Lighten(wood, 0.25f), 16f, 112f);
                p.Shade(body, A(Mul(wood, 0.5f), 0.55f), 10f);
                Color line = A(Mul(wood, 0.45f), 0.9f);
                p.Fill(Sdf.Intersect(body, Sdf.Box(64f, 42f, 60f, 1.5f)), line);
                p.Fill(Sdf.Intersect(body, Sdf.Box(64f, 86f, 60f, 1.5f)), line);
                Shape d1 = Sdf.Segment(30f, 30f, 98f, 98f, 7f), d2 = Sdf.Segment(30f, 98f, 98f, 30f, 7f);
                Shape cross = Sdf.Intersect(Sdf.Union(d1, d2), Sdf.Expand(body, -4f));
                p.Fill(cross, Lighten(wood, 0.15f));
                p.Stroke(cross, 2f, Mul(wood, 0.5f));
                foreach (var pt in new[] { new Vector2(28f, 28f), new Vector2(100f, 28f), new Vector2(28f, 100f), new Vector2(100f, 100f) })
                    p.Fill(Sdf.Circle(pt.x, pt.y, 3f), Hex("#3A2414"));
                if (hp >= 3)
                {
                    Color metal = Hex("#9AA3B2");
                    foreach (var pt in new[] { new Vector2(22f, 22f), new Vector2(106f, 22f), new Vector2(22f, 106f), new Vector2(106f, 106f) })
                        p.Fill(Sdf.Intersect(body, Sdf.RoundBox(pt.x, pt.y, 10f, 10f, 2f)), metal);
                }
                if (hp == 1)
                {
                    Color crack = A(Hex("#2B1B10"), 0.8f);
                    p.Fill(Sdf.Union(Sdf.Segment(40f, 110f, 52f, 84f, 1.3f), Sdf.Segment(52f, 84f, 44f, 70f, 1.3f), Sdf.Segment(90f, 20f, 82f, 44f, 1.3f)), crack);
                }
                p.Stroke(body, 3f, Hex("#3A2414"));
                return p.ToSprite(PPU);
            });
        }

        public static Sprite Vase(int hp)
        {
            return Cached("vase_" + hp, () =>
            {
                var p = new Painter(S, S);
                Shape body = Sdf.Ellipse(64f, 54f, 31f, 36f);
                Shape neck = Sdf.RoundBox(64f, 92f, 13f, 12f, 4f);
                Shape rim = Sdf.RoundBox(64f, 106f, 21f, 6f, 3f);
                Shape foot = Sdf.RoundBox(64f, 20f, 18f, 6f, 3f);
                Shape all = Sdf.Union(body, neck, rim, foot);
                Color blue = Hex("#3D7FD9");
                p.Shadow(all, 3f, -5f, 8f, new Color(0, 0, 0, 0.35f));
                p.FillGradient(all, Mul(blue, 0.8f), Lighten(blue, 0.3f), 14f, 112f);
                p.Shade(all, A(Mul(blue, 0.45f), 0.55f), 9f);
                p.Fill(Sdf.Intersect(body, Sdf.Box(64f, 54f, 40f, 6f)), Cream);
                for (int i = -2; i <= 2; i++)
                    p.Fill(Sdf.RegularPolygon(64f + i * 12f, 54f, 4f, 4, 90f), Mul(blue, 0.7f));
                p.Fill(Sdf.Intersect(Sdf.Expand(body, -5f), Sdf.Ellipse(48f, 66f, 7f, 16f)), A(Color.white, 0.45f));
                if (hp <= 1)
                {
                    Color crack = A(Color.white, 0.9f);
                    p.Fill(Sdf.Union(Sdf.Segment(74f, 86f, 80f, 66f, 1.4f), Sdf.Segment(80f, 66f, 72f, 50f, 1.4f), Sdf.Segment(72f, 50f, 78f, 34f, 1.4f)), crack);
                    p.Fill(Sdf.Segment(80f, 66f, 90f, 60f, 1.2f), crack);
                }
                p.Stroke(all, 2.5f, Hex("#163F75"));
                return p.ToSprite(PPU);
            });
        }

        public static Sprite Plate(int hp)
        {
            return Cached("plate_" + hp, () =>
            {
                var p = new Painter(S, S);
                int n = Mathf.Clamp(hp, 1, 3);
                float baseY = 40f;
                for (int i = 0; i < n; i++)
                {
                    float y = baseY + i * 15f;
                    Shape pl = Sdf.Ellipse(64f, y, 46f, 19f);
                    if (i == 0) p.Shadow(pl, 3f, -5f, 8f, new Color(0, 0, 0, 0.35f));
                    p.FillGradient(pl, Hex("#D9D2C2"), Hex("#FFFBF0"), y - 19f, y + 19f);
                    p.Stroke(pl, 2.5f, Hex("#5C6C85"));
                    p.Stroke(Sdf.Ellipse(64f, y, 38f, 13f), 2f, Hex("#3A8DE8"));
                    if (i == n - 1)
                    {
                        p.Fill(Sdf.Ellipse(64f, y, 24f, 8f), A(Hex("#C9D3E0"), 0.6f));
                        p.Fill(Sdf.Ellipse(50f, y + 6f, 10f, 3f), A(Color.white, 0.8f));
                    }
                }
                return p.ToSprite(PPU);
            });
        }

        public static Sprite Egg(int hp)
        {
            return Cached("egg_" + hp, () =>
            {
                var p = new Painter(S, S);
                Shape egg = Sdf.Union(Sdf.Ellipse(64f, 56f, 36f, 40f), Sdf.Ellipse(64f, 66f, 30f, 42f));
                p.Shadow(egg, 3f, -5f, 8f, new Color(0, 0, 0, 0.35f));
                p.FillGradient(egg, Hex("#E7D6B8"), Hex("#FFFBF2"), 16f, 108f);
                p.Shade(egg, A(Hex("#B89C70"), 0.5f), 12f);
                foreach (var pt in new[] { new Vector2(48f, 50f), new Vector2(76f, 40f), new Vector2(60f, 80f), new Vector2(84f, 72f), new Vector2(44f, 70f) })
                    p.Fill(Sdf.Circle(pt.x, pt.y, 3.2f), A(Hex("#C9A978"), 0.8f));
                if (hp <= 1)
                {
                    Color crack = Hex("#6B5438");
                    p.Fill(Sdf.Union(Sdf.Segment(56f, 104f, 62f, 86f, 1.5f), Sdf.Segment(62f, 86f, 54f, 74f, 1.5f),
                        Sdf.Segment(54f, 74f, 66f, 60f, 1.5f), Sdf.Segment(62f, 86f, 74f, 80f, 1.3f)), crack);
                }
                p.Fill(Sdf.Intersect(Sdf.Expand(egg, -6f), Sdf.Ellipse(50f, 80f, 8f, 16f)), A(Color.white, 0.6f));
                p.Stroke(egg, 2.5f, Hex("#6B5438"));
                return p.ToSprite(PPU);
            });
        }

        public static Sprite Safe(int hp)
        {
            return Cached("safe_" + hp, () =>
            {
                var p = new Painter(S, S);
                Shape body = Sdf.RoundBox(64f, 64f, 48f, 48f, 11f);
                Shape panel = Sdf.RoundBox(64f, 64f, 38f, 38f, 7f);
                Color steel = Hex("#5C6676");
                p.Shadow(body, 3f, -5f, 8f, new Color(0, 0, 0, 0.35f));
                p.FillGradient(body, Mul(steel, 0.8f), Lighten(steel, 0.3f), 16f, 112f);
                p.Shade(body, A(Mul(steel, 0.4f), 0.6f), 10f);
                p.FillGradient(panel, Mul(steel, 0.95f), Lighten(steel, 0.15f), 26f, 102f);
                p.Stroke(panel, 2f, Mul(steel, 0.45f));
                Shape dial = Sdf.Circle(52f, 66f, 14f);
                p.FillGradient(dial, Hex("#9AA3B2"), Hex("#E6ECF5"), 52f, 80f);
                p.Stroke(dial, 2.2f, Hex("#2F3A4F"));
                p.Fill(Sdf.Circle(52f, 66f, 5f), Hex("#2F3A4F"));
                for (int i = 0; i < 8; i++)
                {
                    float a = i * 45f * Mathf.Deg2Rad;
                    p.Fill(Sdf.Circle(52f + Mathf.Cos(a) * 10f, 66f + Mathf.Sin(a) * 10f, 1.4f), Hex("#2F3A4F"));
                }
                p.Fill(Sdf.Segment(78f, 56f, 78f, 78f, 3.5f), Hex("#2F3A4F"));
                p.Fill(Sdf.Segment(78f, 67f, 92f, 67f, 3.5f), Hex("#2F3A4F"));
                p.Fill(Sdf.Circle(92f, 67f, 5f), Hex("#9AA3B2"));
                for (int i = 0; i < 3; i++)
                {
                    Color lamp = i < hp ? Hex("#E8403A") : Hex("#2F3A4F");
                    p.Fill(Sdf.Circle(52f + i * 12f, 36f, 3.5f), lamp);
                    if (i < hp) p.Fill(Sdf.Circle(51f + i * 12f, 37f, 1.2f), A(Color.white, 0.8f));
                }
                p.Stroke(body, 3f, Hex("#232A38"));
                return p.ToSprite(PPU);
            });
        }

        public static Sprite Mailbox(int hp)
        {
            return Cached("mailbox_" + hp, () =>
            {
                var p = new Painter(S, S);
                Shape box = Sdf.RoundBox(64f, 50f, 38f, 30f, 8f);
                Shape roof = Sdf.Intersect(Sdf.Ellipse(64f, 80f, 38f, 20f), Sdf.HalfPlaneAbove(78f));
                Shape body = Sdf.Union(box, roof, Sdf.Box(64f, 79f, 38f, 3f));
                Color blue = Hex("#2F6FD0");
                p.Shadow(body, 3f, -5f, 8f, new Color(0, 0, 0, 0.35f));
                p.FillGradient(body, Mul(blue, 0.8f), Lighten(blue, 0.3f), 18f, 102f);
                p.Shade(body, A(Mul(blue, 0.45f), 0.55f), 9f);
                p.Fill(Sdf.RoundBox(64f, 72f, 20f, 3.5f, 2f), Hex("#132C57"));
                p.Fill(Sdf.Segment(100f, 70f, 100f, 112f, 3f), Hex("#E8403A"));
                p.Fill(Sdf.RoundBox(94f, 108f, 9f, 5f, 2f), Hex("#E8403A"));
                for (int i = 0; i < Mathf.Clamp(hp, 1, 3); i++)
                {
                    float x = 44f + i * 20f, y = 42f;
                    Shape env = Sdf.RoundBox(x, y, 9f, 6.5f, 1.5f);
                    p.Fill(env, Cream);
                    p.Stroke(env, 1.2f, Hex("#6B5438"));
                    p.Fill(Sdf.Union(Sdf.Segment(x - 9f, y + 6f, x, y - 1f, 0.9f), Sdf.Segment(x, y - 1f, x + 9f, y + 6f, 0.9f)), Hex("#6B5438"));
                }
                p.Fill(Sdf.Intersect(Sdf.Expand(body, -5f), Sdf.Ellipse(40f, 60f, 5f, 18f)), A(Color.white, 0.4f));
                p.Stroke(body, 2.5f, Hex("#132C57"));
                return p.ToSprite(PPU);
            });
        }

        /// <summary>Hücre zemini olarak çizilen çimen; katman 2 daha koyu ve sık.</summary>
        public static Sprite Grass(int layer)
        {
            return Cached("grass_" + layer, () =>
            {
                var p = new Painter(S, S);
                Shape tile = Sdf.RoundBox(64f, 64f, 60f, 60f, 12f);
                Color g = layer >= 2 ? Hex("#3E9B2E") : Hex("#63C44A");
                p.FillGradient(tile, Mul(g, 0.85f), Lighten(g, 0.15f), 4f, 124f);
                var rnd = new System.Random(layer * 7 + 3);
                int blades = layer >= 2 ? 26 : 16;
                for (int i = 0; i < blades; i++)
                {
                    float x = 14f + (float)rnd.NextDouble() * 100f, y = 10f + (float)rnd.NextDouble() * 96f;
                    float h = 8f + (float)rnd.NextDouble() * 8f;
                    Shape bl = Sdf.Polygon(new[] { new Vector2(x - 3f, y), new Vector2(x + 3f, y), new Vector2(x + 1f, y + h) }, 0.6f);
                    p.Fill(Sdf.Intersect(bl, tile), Lighten(g, 0.35f));
                }
                p.Stroke(tile, 2f, Mul(g, 0.6f));
                return p.ToSprite(PPU);
            });
        }

        /// <summary>Taşın üstüne binen zincir (taşı kilitler).</summary>
        public static Sprite Chain()
        {
            return Cached("chain", () =>
            {
                var p = new Painter(S, S);
                Color metal = Hex("#B5BCC8"), dark = Hex("#4B5566");
                for (int i = 0; i < 6; i++)
                {
                    float x = 12f + i * 21f;
                    Shape link = Sdf.Ellipse(x, 64f, 13f, 8f);
                    p.Stroke(link, 6.5f, dark);
                    p.Stroke(link, 4f, metal);
                }
                for (int i = 0; i < 6; i++)
                {
                    float y = 12f + i * 21f;
                    Shape link = Sdf.Ellipse(64f, y, 8f, 13f);
                    p.Stroke(link, 6.5f, dark);
                    p.Stroke(link, 4f, metal);
                }
                return p.ToSprite(PPU);
            });
        }

        /// <summary>Boş hücre zemini (beyaz; renklendirme SpriteRenderer.color ile).</summary>
        public static Sprite CellBack()
        {
            return Cached("cellback", () =>
            {
                var p = new Painter(S, S);
                p.Fill(Sdf.RoundBox(64f, 64f, 62f, 62f, 12f), Color.white);
                return p.ToSprite(PPU);
            });
        }

        /// <summary>Seçili taş çerçevesi.</summary>
        public static Sprite SelectRing()
        {
            return Cached("selectring", () =>
            {
                var p = new Painter(S, S);
                p.Stroke(Sdf.RoundBox(64f, 64f, 58f, 58f, 14f), 6f, Color.white);
                return p.ToSprite(PPU);
            });
        }

        /// <summary>Roket izi / ışın çizgisi için yumuşak kenarlı çubuk.</summary>
        public static Sprite Beam()
        {
            return Cached("beam", () =>
            {
                var p = new Painter(S, 32);
                p.FillGradient(Sdf.RoundBox(64f, 16f, 62f, 10f, 10f), Color.white, Color.white, 0f, 32f);
                p.Glow(64f, 16f, 60f, A(Color.white, 0.5f));
                return p.ToSprite(PPU);
            });
        }

        /// <summary>Patlama halkası.</summary>
        public static Sprite Ring()
        {
            return Cached("ring", () =>
            {
                var p = new Painter(S, S);
                p.Stroke(Sdf.Circle(64f, 64f, 52f), 10f, Color.white);
                return p.ToSprite(PPU);
            });
        }
    }
}
