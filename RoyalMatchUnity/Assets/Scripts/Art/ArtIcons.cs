using System;
using UnityEngine;

namespace RoyalMatch
{
    /// <summary>Arayüz parçaları, simgeler, kral ve oda eşyaları.</summary>
    public static partial class Art
    {
        // ---------------- Arayüz 9-slice parçaları ----------------
        public static Sprite RoundRect()
        {
            return Cached("ui_roundrect", () =>
            {
                var p = new Painter(64, 64);
                p.Fill(Sdf.RoundBox(32f, 32f, 30f, 30f, 14f), Color.white);
                return p.ToSliced(22f, 100f);
            });
        }

        public static Sprite RoundRectSmall()
        {
            return Cached("ui_roundrect_s", () =>
            {
                var p = new Painter(64, 64);
                p.Fill(Sdf.RoundBox(32f, 32f, 30f, 30f, 8f), Color.white);
                return p.ToSliced(20f, 100f);
            });
        }

        public static Sprite RoundRectOutline()
        {
            return Cached("ui_roundrect_outline", () =>
            {
                var p = new Painter(64, 64);
                p.Stroke(Sdf.RoundBox(32f, 32f, 28f, 28f, 14f), 4f, Color.white);
                return p.ToSliced(22f, 100f);
            });
        }

        public static Sprite Pill()
        {
            return Cached("ui_pill", () =>
            {
                var p = new Painter(96, 48);
                p.Fill(Sdf.RoundBox(48f, 24f, 46f, 22f, 22f), Color.white);
                return p.ToSliced(23f, 100f);
            });
        }

        public static Sprite CircleUi()
        {
            return Cached("ui_circle", () =>
            {
                var p = new Painter(64, 64);
                p.Fill(Sdf.Circle(32f, 32f, 31f), Color.white);
                return p.ToSprite(100f);
            });
        }

        public static Sprite SoftGlow()
        {
            return Cached("ui_glow", () =>
            {
                var p = new Painter(128, 128);
                p.Glow(64f, 64f, 64f, Color.white);
                return p.ToSprite(100f);
            });
        }

        /// <summary>Yumuşak çapraz vinyet (koyu arka perde).</summary>
        public static Sprite White()
        {
            return Cached("ui_white", () =>
            {
                var p = new Painter(4, 4);
                p.Fill((x, y) => -1f, Color.white);
                return p.ToSprite(100f);
            });
        }

        // ---------------- Simgeler ----------------
        private static Sprite Icon(string key, Action<Painter> draw)
        {
            return Cached("icon_" + key, () =>
            {
                var p = new Painter(S, S);
                draw(p);
                return p.ToSprite(100f);
            });
        }

        public static Sprite Heart()
        {
            return Icon("heart", p =>
            {
                Shape h = Sdf.Heart(64f, 64f, 92f);
                p.Shadow(h, 2f, -4f, 6f, new Color(0, 0, 0, 0.3f));
                p.FillGradient(h, Hex("#B8231C"), Hex("#FF6B5E"), 20f, 108f);
                p.Shade(h, A(Hex("#7A1511"), 0.5f), 10f);
                p.Stroke(h, 3f, Hex("#6E100C"));
                p.Fill(Sdf.Intersect(Sdf.Expand(h, -6f), Sdf.Ellipse(44f, 84f, 14f, 9f)), A(Color.white, 0.6f));
            });
        }

        public static Sprite HeartEmpty()
        {
            return Icon("heart_empty", p =>
            {
                Shape h = Sdf.Heart(64f, 64f, 92f);
                p.Fill(h, Hex("#4A2E2A"));
                p.Stroke(h, 3f, Hex("#2B1B10"));
            });
        }

        public static Sprite Coin()
        {
            return Icon("coin", p =>
            {
                Shape c = Sdf.Circle(64f, 64f, 48f);
                p.Shadow(c, 2f, -4f, 6f, new Color(0, 0, 0, 0.3f));
                p.FillGradient(c, Hex("#D29A17"), Hex("#FFE37A"), 16f, 112f);
                p.Shade(c, A(Hex("#9A6A0A"), 0.5f), 10f);
                p.Stroke(Sdf.Circle(64f, 64f, 38f), 3f, A(Hex("#B9831A"), 0.9f));
                Shape crown = CrownShape(64f, 62f, 0.42f);
                p.Fill(crown, Hex("#B9831A"));
                p.Stroke(c, 3f, Hex("#8A5C0A"));
                p.Fill(Sdf.Intersect(Sdf.Expand(c, -6f), Sdf.Ellipse(48f, 88f, 16f, 8f)), A(Color.white, 0.55f));
            });
        }

        public static Sprite StarIcon()
        {
            return Icon("star", p =>
            {
                Shape s = Sdf.Star(64f, 60f, 54f, 24f, 5, 90f, 4f);
                p.Shadow(s, 2f, -4f, 6f, new Color(0, 0, 0, 0.3f));
                p.FillGradient(s, Hex("#E0A317"), Hex("#FFEA8A"), 10f, 114f);
                p.Shade(s, A(Hex("#9A6A0A"), 0.5f), 9f);
                p.Stroke(s, 3f, Hex("#8A5C0A"));
                p.Fill(Sdf.Intersect(Sdf.Expand(s, -6f), Sdf.Ellipse(52f, 80f, 12f, 7f)), A(Color.white, 0.6f));
            });
        }

        public static Sprite StarEmpty()
        {
            return Icon("star_empty", p =>
            {
                Shape s = Sdf.Star(64f, 60f, 54f, 24f, 5, 90f, 4f);
                p.Fill(s, Hex("#3A3F55"));
                p.Stroke(s, 3f, Hex("#20233A"));
            });
        }

        private static Shape CrownShape(float cx, float cy, float k)
        {
            Shape baseBand = Sdf.RoundBox(cx, cy - 34f * k, 48f * k, 12f * k, 4f * k);
            Shape spikes = Sdf.Polygon(new[]
            {
                new Vector2(cx - 48f * k, cy - 24f * k), new Vector2(cx - 50f * k, cy + 30f * k),
                new Vector2(cx - 24f * k, cy + 4f * k), new Vector2(cx, cy + 44f * k),
                new Vector2(cx + 24f * k, cy + 4f * k), new Vector2(cx + 50f * k, cy + 30f * k),
                new Vector2(cx + 48f * k, cy - 24f * k)
            }, 2f * k);
            return Sdf.Union(baseBand, spikes);
        }

        public static Sprite Crown()
        {
            return Icon("crown", p =>
            {
                Shape c = CrownShape(64f, 60f, 1f);
                p.Shadow(c, 2f, -4f, 6f, new Color(0, 0, 0, 0.3f));
                p.FillGradient(c, Hex("#D29A17"), Hex("#FFE37A"), 16f, 110f);
                p.Shade(c, A(Hex("#9A6A0A"), 0.5f), 8f);
                p.Stroke(c, 3f, Hex("#8A5C0A"));
                p.Fill(Sdf.Circle(64f, 32f, 6f), Hex("#E8403A"));
                p.Fill(Sdf.Circle(34f, 32f, 5f), Hex("#3A8DE8"));
                p.Fill(Sdf.Circle(94f, 32f, 5f), Hex("#4CC94A"));
                p.Fill(Sdf.Circle(64f, 100f, 5f), Hex("#E8403A"));
            });
        }

        public static Sprite Gear()
        {
            return Icon("gear", p =>
            {
                Shape g = Sdf.Circle(64f, 64f, 36f);
                for (int i = 0; i < 8; i++)
                    g = Sdf.Union(g, Sdf.Rotate(Sdf.RoundBox(64f, 64f + 40f, 10f, 12f, 3f), 64f, 64f, 45f * i));
                g = Sdf.Subtract(g, Sdf.Circle(64f, 64f, 14f));
                p.Fill(g, Color.white);
            });
        }

        public static Sprite Hammer()
        {
            return Icon("hammer", p =>
            {
                Func<Shape, Shape> R = s => Sdf.Rotate(s, 64f, 64f, -35f);
                Shape handle = Sdf.RoundBox(64f, 44f, 8f, 44f, 4f);
                Shape head = Sdf.RoundBox(64f, 96f, 38f, 16f, 6f);
                p.Shadow(R(Sdf.Union(handle, head)), 2f, -4f, 6f, new Color(0, 0, 0, 0.3f));
                p.FillGradient(R(handle), Hex("#8B5A2B"), Hex("#C68A4B"), 0f, 90f);
                p.Stroke(R(handle), 2.5f, Hex("#3A2414"));
                p.FillGradient(R(head), Hex("#5C6676"), Hex("#C9D3E0"), 80f, 112f);
                p.Stroke(R(head), 2.5f, Hex("#232A38"));
                p.Fill(R(Sdf.Intersect(Sdf.Expand(head, -5f), Sdf.Box(64f, 102f, 30f, 3f))), A(Color.white, 0.5f));
            });
        }

        public static Sprite Arrow()
        {
            return Icon("arrow", p =>
            {
                Shape shaft = Sdf.RoundBox(52f, 64f, 36f, 9f, 5f);
                Shape head = Sdf.Polygon(new[] { new Vector2(84f, 36f), new Vector2(84f, 92f), new Vector2(120f, 64f) }, 3f);
                Shape tail = Sdf.Polygon(new[] { new Vector2(8f, 44f), new Vector2(30f, 64f), new Vector2(8f, 84f), new Vector2(20f, 64f) }, 2f);
                Shape all = Sdf.Union(shaft, head, tail);
                p.Shadow(all, 2f, -4f, 6f, new Color(0, 0, 0, 0.3f));
                p.FillGradient(all, Hex("#E0A317"), Hex("#FFEA8A"), 36f, 92f);
                p.Shade(all, A(Hex("#9A6A0A"), 0.5f), 6f);
                p.Stroke(all, 2.5f, Hex("#8A5C0A"));
            });
        }

        public static Sprite Cannon()
        {
            return Icon("cannon", p =>
            {
                Shape barrel = Sdf.RoundBox(64f, 74f, 17f, 40f, 9f);
                Shape muzzle = Sdf.RoundBox(64f, 108f, 21f, 7f, 4f);
                Shape wheel = Sdf.Circle(64f, 30f, 20f);
                Shape all = Sdf.Union(barrel, muzzle, wheel);
                p.Shadow(all, 2f, -4f, 6f, new Color(0, 0, 0, 0.3f));
                p.FillGradient(wheel, Hex("#8B5A2B"), Hex("#C68A4B"), 10f, 50f);
                p.Stroke(wheel, 2.5f, Hex("#3A2414"));
                p.Fill(Sdf.Circle(64f, 30f, 6f), Hex("#3A2414"));
                p.FillGradient(Sdf.Union(barrel, muzzle), Hex("#2F3A4F"), Hex("#8A94A6"), 34f, 116f);
                p.Shade(Sdf.Union(barrel, muzzle), A(Hex("#1A2030"), 0.5f), 8f);
                p.Stroke(Sdf.Union(barrel, muzzle), 2.5f, Hex("#1A2030"));
                p.Fill(Sdf.Intersect(Sdf.Expand(barrel, -5f), Sdf.Box(56f, 74f, 3f, 30f)), A(Color.white, 0.45f));
            });
        }

        public static Sprite JesterHat()
        {
            return Icon("jester", p =>
            {
                Shape band = Sdf.RoundBox(64f, 36f, 46f, 10f, 5f);
                Shape hat = Sdf.Polygon(new[]
                {
                    new Vector2(22f, 40f), new Vector2(16f, 104f), new Vector2(44f, 60f), new Vector2(64f, 118f),
                    new Vector2(84f, 60f), new Vector2(112f, 104f), new Vector2(106f, 40f)
                }, 3f);
                p.Shadow(Sdf.Union(band, hat), 2f, -4f, 6f, new Color(0, 0, 0, 0.3f));
                p.FillGradient(hat, Hex("#6A2A9E"), Hex("#C57BFF"), 40f, 118f);
                p.Fill(Sdf.Intersect(hat, Sdf.Box(64f, 80f, 64f, 60f)), A(Hex("#F7CF3A"), 0f));
                p.Fill(Sdf.Intersect(hat, Sdf.Polygon(new[] { new Vector2(44f, 60f), new Vector2(64f, 118f), new Vector2(84f, 60f), new Vector2(64f, 40f) })), Hex("#F7CF3A"));
                p.Stroke(hat, 2.5f, Hex("#3E1A5E"));
                p.FillGradient(band, Hex("#B8231C"), Hex("#FF6B5E"), 26f, 46f);
                p.Stroke(band, 2.5f, Hex("#6E100C"));
                foreach (var pt in new[] { new Vector2(16f, 104f), new Vector2(64f, 118f), new Vector2(112f, 104f) })
                {
                    p.Fill(Sdf.Circle(pt.x, pt.y, 7f), Hex("#FFE37A"));
                    p.Stroke(Sdf.Circle(pt.x, pt.y, 7f), 2f, Hex("#8A5C0A"));
                }
            });
        }

        public static Sprite Lock()
        {
            return Icon("lock", p =>
            {
                Shape body = Sdf.RoundBox(64f, 46f, 32f, 26f, 7f);
                Shape shackle = Sdf.Intersect(Sdf.Subtract(Sdf.Circle(64f, 76f, 24f), Sdf.Circle(64f, 76f, 14f)), Sdf.HalfPlaneAbove(72f));
                p.FillGradient(Sdf.Union(body, shackle), Hex("#8A94A6"), Hex("#E6ECF5"), 20f, 100f);
                p.Stroke(Sdf.Union(body, Sdf.Union(shackle, Sdf.Box(64f, 73f, 19f, 3f))), 2.5f, Hex("#232A38"));
                p.Fill(Sdf.Union(Sdf.Circle(64f, 50f, 6f), Sdf.Box(64f, 40f, 3f, 8f)), Hex("#232A38"));
            });
        }

        public static Sprite Check()
        {
            return Icon("check", p =>
            {
                p.Fill(Sdf.Union(Sdf.Segment(30f, 64f, 54f, 40f, 9f), Sdf.Segment(54f, 40f, 100f, 90f, 9f)), Color.white);
            });
        }

        public static Sprite Close()
        {
            return Icon("close", p =>
            {
                p.Fill(Sdf.Union(Sdf.Segment(34f, 34f, 94f, 94f, 9f), Sdf.Segment(34f, 94f, 94f, 34f, 9f)), Color.white);
            });
        }

        public static Sprite Back()
        {
            return Icon("back", p =>
            {
                p.Fill(Sdf.Union(Sdf.Segment(36f, 64f, 100f, 64f, 9f), Sdf.Segment(36f, 64f, 70f, 30f, 9f), Sdf.Segment(36f, 64f, 70f, 98f, 9f)), Color.white);
            });
        }

        public static Sprite Plus()
        {
            return Icon("plus", p =>
            {
                p.Fill(Sdf.Union(Sdf.RoundBox(64f, 64f, 10f, 40f, 5f), Sdf.RoundBox(64f, 64f, 40f, 10f, 5f)), Color.white);
            });
        }

        public static Sprite Speaker(bool on)
        {
            return Icon("speaker_" + on, p =>
            {
                Shape body = Sdf.Union(Sdf.Box(40f, 64f, 10f, 14f), Sdf.Polygon(new[] { new Vector2(50f, 50f), new Vector2(50f, 78f), new Vector2(74f, 98f), new Vector2(74f, 30f) }, 3f));
                p.Fill(body, Color.white);
                if (on)
                {
                    p.Stroke(Sdf.Intersect(Sdf.Circle(74f, 64f, 22f), (x, y) => 78f - x), 7f, Color.white);
                    p.Stroke(Sdf.Intersect(Sdf.Circle(74f, 64f, 38f), (x, y) => 82f - x), 7f, Color.white);
                }
                else
                {
                    p.Fill(Sdf.Union(Sdf.Segment(84f, 48f, 112f, 80f, 6f), Sdf.Segment(84f, 80f, 112f, 48f, 6f)), Hex("#FF6B5E"));
                }
            });
        }

        public static Sprite Home()
        {
            return Icon("home", p =>
            {
                Shape roof = Sdf.Polygon(new[] { new Vector2(16f, 66f), new Vector2(64f, 112f), new Vector2(112f, 66f) }, 3f);
                Shape body = Sdf.RoundBox(64f, 44f, 34f, 26f, 4f);
                Shape door = Sdf.RoundBox(64f, 34f, 9f, 16f, 3f);
                p.Fill(Sdf.Subtract(Sdf.Union(roof, body), door), Color.white);
            });
        }

        public static Sprite Bolt()
        {
            return Icon("bolt", p =>
            {
                Shape b = Sdf.Polygon(new[]
                {
                    new Vector2(74f, 118f), new Vector2(30f, 60f), new Vector2(60f, 60f), new Vector2(50f, 10f),
                    new Vector2(98f, 72f), new Vector2(68f, 72f)
                }, 2f);
                p.FillGradient(b, Hex("#E0A317"), Hex("#FFEA8A"), 10f, 118f);
                p.Stroke(b, 2.5f, Hex("#8A5C0A"));
            });
        }

        public static Sprite Trophy()
        {
            return Icon("trophy", p =>
            {
                Shape cup = Sdf.Union(Sdf.Intersect(Sdf.Ellipse(64f, 86f, 36f, 40f), (x, y) => y - 92f), Sdf.Box(64f, 100f, 36f, 10f));
                Shape stem = Sdf.Box(64f, 40f, 7f, 14f);
                Shape foot = Sdf.RoundBox(64f, 22f, 26f, 7f, 3f);
                Shape hL = Sdf.Subtract(Sdf.Circle(26f, 84f, 14f), Sdf.Circle(26f, 84f, 8f));
                Shape hR = Sdf.Subtract(Sdf.Circle(102f, 84f, 14f), Sdf.Circle(102f, 84f, 8f));
                Shape all = Sdf.Union(cup, stem, foot, hL, hR);
                p.Shadow(all, 2f, -4f, 6f, new Color(0, 0, 0, 0.3f));
                p.FillGradient(all, Hex("#D29A17"), Hex("#FFE37A"), 14f, 112f);
                p.Shade(all, A(Hex("#9A6A0A"), 0.5f), 8f);
                p.Stroke(all, 2.5f, Hex("#8A5C0A"));
            });
        }

        /// <summary>Kral Robert'a göz kırpan, özgün çizim bir kral yüzü.</summary>
        public static Sprite King()
        {
            return Cached("king", () =>
            {
                var p = new Painter(256, 256);
                Shape robe = Sdf.Intersect(Sdf.Ellipse(128f, 20f, 110f, 70f), Sdf.HalfPlaneAbove(0f));
                p.FillGradient(robe, Hex("#8E1C1C"), Hex("#D8403A"), 0f, 90f);
                p.Fill(Sdf.Intersect(robe, Sdf.Box(128f, 72f, 140f, 12f)), Cream);
                foreach (var pt in new[] { new Vector2(80f, 72f), new Vector2(128f, 72f), new Vector2(176f, 72f) })
                    p.Fill(Sdf.Circle(pt.x, pt.y, 5f), Hex("#2B1B10"));
                p.Stroke(robe, 3f, Hex("#4A0F0F"));
                Shape head = Sdf.Ellipse(128f, 128f, 66f, 72f);
                Shape beard = Sdf.Union(Sdf.Ellipse(128f, 86f, 70f, 50f), Sdf.Ellipse(128f, 60f, 44f, 36f));
                p.Shadow(Sdf.Union(head, beard), 3f, -6f, 10f, new Color(0, 0, 0, 0.3f));
                p.FillGradient(beard, Hex("#C9CDD6"), Hex("#F4F6FA"), 20f, 120f);
                p.Shade(beard, A(Hex("#8A94A6"), 0.5f), 14f);
                p.Stroke(beard, 3f, Hex("#4B5566"));
                Shape face = Sdf.Intersect(head, (x, y) => 96f - y);
                p.FillGradient(head, Hex("#E7B48A"), Hex("#F9DCC0"), 60f, 200f);
                p.Shade(head, A(Hex("#B8805A"), 0.45f), 14f);
                p.Fill(Sdf.Intersect(head, Sdf.Ellipse(128f, 70f, 80f, 44f)), A(Color.white, 0f));
                p.FillGradient(Sdf.Intersect(beard, Sdf.HalfPlaneAbove(0f)), Hex("#C9CDD6"), Hex("#F4F6FA"), 20f, 120f);
                p.Fill(Sdf.Intersect(head, Sdf.Ellipse(128f, 108f, 60f, 26f)), Hex("#F9DCC0"));
                p.Stroke(head, 3f, Hex("#8A5A3A"));
                // bıyık
                Shape must = Sdf.Union(Sdf.Rotate(Sdf.Ellipse(104f, 104f, 26f, 9f), 104f, 104f, 12f), Sdf.Rotate(Sdf.Ellipse(152f, 104f, 26f, 9f), 152f, 104f, -12f));
                p.Fill(must, Hex("#E6EAF0"));
                p.Stroke(must, 2.5f, Hex("#4B5566"));
                // burun
                p.Fill(Sdf.Ellipse(128f, 118f, 12f, 10f), Hex("#E29A72"));
                p.Stroke(Sdf.Ellipse(128f, 118f, 12f, 10f), 2f, Hex("#8A5A3A"));
                // gözler
                foreach (float ex in new[] { 104f, 152f })
                {
                    p.Fill(Sdf.Ellipse(ex, 144f, 12f, 13f), Color.white);
                    p.Stroke(Sdf.Ellipse(ex, 144f, 12f, 13f), 2f, Hex("#4B3A2A"));
                    p.Fill(Sdf.Circle(ex + 2f, 142f, 6f), Hex("#2B4C7E"));
                    p.Fill(Sdf.Circle(ex + 2f, 142f, 3f), Color.black);
                    p.Fill(Sdf.Circle(ex + 4f, 145f, 1.6f), Color.white);
                    p.Fill(Sdf.Rotate(Sdf.RoundBox(ex, 164f, 14f, 4f, 2f), ex, 164f, ex < 128f ? 8f : -8f), Hex("#C9CDD6"));
                }
                // yanaklar
                p.Fill(Sdf.Ellipse(92f, 120f, 10f, 6f), A(Hex("#F0908A"), 0.5f));
                p.Fill(Sdf.Ellipse(164f, 120f, 10f, 6f), A(Hex("#F0908A"), 0.5f));
                // taç
                Shape crown = CrownShape(128f, 212f, 1.15f);
                p.Shadow(crown, 2f, -5f, 8f, new Color(0, 0, 0, 0.3f));
                p.FillGradient(crown, Hex("#D29A17"), Hex("#FFE37A"), 170f, 256f);
                p.Shade(crown, A(Hex("#9A6A0A"), 0.5f), 8f);
                p.Stroke(crown, 3f, Hex("#8A5C0A"));
                p.Fill(Sdf.Circle(128f, 188f, 7f), Hex("#E8403A"));
                p.Fill(Sdf.Circle(96f, 186f, 5f), Hex("#3A8DE8"));
                p.Fill(Sdf.Circle(160f, 186f, 5f), Hex("#4CC94A"));
                return p.ToSprite(100f);
            });
        }

        // ---------------- Arka planlar ----------------
        /// <summary>Gökyüzü + şato silüeti; haritada ve oyun ekranında kullanılır.</summary>
        public static Sprite Castle()
        {
            return Cached("bg_castle", () =>
            {
                var p = new Painter(256, 512);
                p.FillGradient((x, y) => -1f, Hex("#2A5BB8"), Hex("#7FC4FF"), 60f, 512f);
                var rnd = new System.Random(11);
                for (int i = 0; i < 7; i++)
                {
                    float cx = (float)rnd.NextDouble() * 256f, cy = 330f + (float)rnd.NextDouble() * 150f;
                    Shape cloud = Sdf.Union(Sdf.Ellipse(cx, cy, 34f, 14f), Sdf.Circle(cx - 12f, cy + 8f, 14f), Sdf.Circle(cx + 10f, cy + 10f, 17f));
                    p.Fill(cloud, A(Color.white, 0.85f));
                }
                Color wall = Hex("#4C6FB3"), wallDark = Hex("#2E4A86"), roof = Hex("#B8352E");
                Shape silhouette = Sdf.Union(
                    Sdf.Box(128f, 110f, 150f, 50f),
                    Sdf.Box(40f, 150f, 22f, 90f), Sdf.Box(216f, 150f, 22f, 90f), Sdf.Box(128f, 170f, 28f, 110f),
                    Sdf.Box(84f, 128f, 14f, 70f), Sdf.Box(172f, 128f, 14f, 70f));
                p.FillGradient(silhouette, wallDark, wall, 60f, 280f);
                // mazgallar
                for (int i = -5; i <= 5; i++) p.Fill(Sdf.Box(128f + i * 26f, 164f, 7f, 6f), wall);
                foreach (var t in new[] { new Vector2(40f, 240f), new Vector2(216f, 240f), new Vector2(84f, 198f), new Vector2(172f, 198f) })
                    p.Fill(Sdf.Polygon(new[] { new Vector2(t.x - 26f, t.y), new Vector2(t.x + 26f, t.y), new Vector2(t.x, t.y + 46f) }, 1f), roof);
                p.Fill(Sdf.Polygon(new[] { new Vector2(96f, 280f), new Vector2(160f, 280f), new Vector2(128f, 336f) }, 1f), roof);
                p.Fill(Sdf.Union(Sdf.Segment(128f, 336f, 128f, 362f, 1.5f), Sdf.Polygon(new[] { new Vector2(128f, 362f), new Vector2(128f, 348f), new Vector2(148f, 355f) })), Hex("#F6C544"));
                var rnd2 = new System.Random(5);
                for (int i = 0; i < 18; i++)
                {
                    float wx = 20f + (float)rnd2.NextDouble() * 216f, wy = 80f + (float)rnd2.NextDouble() * 160f;
                    if (silhouette(wx, wy) < -6f) p.Fill(Sdf.RoundBox(wx, wy, 3f, 5f, 1.5f), Hex("#FFE37A"));
                }
                // ön plan çimen
                p.FillGradient((x, y) => y - 64f, Hex("#2F8A2E"), Hex("#5BBE3F"), 0f, 64f);
                return p.ToSprite(100f);
            });
        }

        /// <summary>Oda arka planı: duvar + zemin + pencere. Stil paletine göre renklenir.</summary>
        public static Sprite RoomBackdrop(int roomIndex)
        {
            return Cached("bg_room_" + roomIndex, () =>
            {
                var p = new Painter(256, 256);
                Color[] walls = { Hex("#F3E2C3"), Hex("#CFE3F5"), Hex("#E7D2EE"), Hex("#F8E7D0"), Hex("#D8EFD5"), Hex("#F1D6D6") };
                Color[] floors = { Hex("#A9733D"), Hex("#8E6A4B"), Hex("#6D5A8C"), Hex("#C28F58"), Hex("#6F8F5E"), Hex("#9A5B4E") };
                Color wall = walls[roomIndex % walls.Length], floor = floors[roomIndex % floors.Length];
                p.FillGradient((x, y) => 96f - y, Mul(wall, 0.92f), Lighten(wall, 0.1f), 96f, 256f);
                p.FillGradient((x, y) => y - 96f, Mul(floor, 0.8f), floor, 0f, 96f);
                for (int i = 0; i < 8; i++) p.Fill(Sdf.Box(128f, 6f + i * 12f, 128f, 0.6f), A(Mul(floor, 0.6f), 0.7f));
                p.Fill(Sdf.Box(128f, 100f, 128f, 5f), Mul(wall, 0.75f));
                Shape win = Sdf.Union(Sdf.RoundBox(64f, 184f, 26f, 30f, 4f), Sdf.Intersect(Sdf.Circle(64f, 214f, 26f), Sdf.HalfPlaneAbove(214f)));
                p.FillGradient(win, Hex("#7FC4FF"), Hex("#2A5BB8"), 150f, 240f);
                p.Fill(Sdf.Circle(72f, 206f, 7f), A(Color.white, 0.9f));
                p.Stroke(win, 4f, Cream);
                p.Fill(Sdf.Union(Sdf.Box(64f, 184f, 1.5f, 30f), Sdf.Box(64f, 190f, 26f, 1.5f)), Cream);
                return p.ToSprite(100f);
            });
        }

        // ---------------- Oda eşyaları ----------------
        public static readonly string[] FurnitureKinds = { "sofa", "table", "lamp", "carpet", "painting", "plant", "bed", "bookshelf", "fountain", "bench" };

        private static Color[] StylePalette(int style)
        {
            switch (style)
            {
                case 0: return new[] { Hex("#C8433A"), Hex("#F6C544"), Hex("#2B1B10") };
                case 1: return new[] { Hex("#3A8DE8"), Hex("#E6ECF5"), Hex("#1F3F75") };
                default: return new[] { Hex("#4CC94A"), Hex("#A64BE0"), Hex("#2A4A2A") };
            }
        }

        public static Sprite Furniture(string kind, int style)
        {
            return Cached("furn_" + kind + "_" + style, () =>
            {
                var p = new Painter(S, S);
                Color[] pal = StylePalette(style);
                Color main = pal[0], accent = pal[1], line = pal[2];
                Shape all = null;
                Action<Shape, Color> part = (s, c) =>
                {
                    p.FillGradient(s, Mul(c, 0.8f), Lighten(c, 0.25f), 0f, 128f);
                    p.Shade(s, A(Mul(c, 0.5f), 0.5f), 7f);
                    p.Stroke(s, 2.5f, line);
                    all = all == null ? s : Sdf.Union(all, s);
                };
                switch (kind)
                {
                    case "sofa":
                        part(Sdf.RoundBox(64f, 44f, 54f, 18f, 8f), main);
                        part(Sdf.RoundBox(64f, 70f, 44f, 14f, 8f), main);
                        part(Sdf.RoundBox(18f, 60f, 10f, 26f, 7f), accent);
                        part(Sdf.RoundBox(110f, 60f, 10f, 26f, 7f), accent);
                        p.Fill(Sdf.Union(Sdf.Box(34f, 18f, 4f, 8f), Sdf.Box(94f, 18f, 4f, 8f)), line);
                        break;
                    case "table":
                        part(Sdf.RoundBox(64f, 78f, 54f, 9f, 5f), main);
                        part(Sdf.Box(28f, 46f, 5f, 26f), Mul(main, 0.8f));
                        part(Sdf.Box(100f, 46f, 5f, 26f), Mul(main, 0.8f));
                        part(Sdf.Ellipse(64f, 94f, 16f, 7f), accent);
                        break;
                    case "lamp":
                        part(Sdf.Polygon(new[] { new Vector2(30f, 70f), new Vector2(98f, 70f), new Vector2(84f, 110f), new Vector2(44f, 110f) }, 3f), accent);
                        part(Sdf.Box(64f, 46f, 4f, 24f), line);
                        part(Sdf.Ellipse(64f, 20f, 22f, 7f), main);
                        p.Glow(64f, 90f, 40f, A(Hex("#FFE37A"), 0.5f));
                        break;
                    case "carpet":
                        part(Sdf.RoundBox(64f, 52f, 56f, 28f, 10f), main);
                        p.Stroke(Sdf.RoundBox(64f, 52f, 46f, 19f, 7f), 3f, accent);
                        p.Fill(Sdf.RegularPolygon(64f, 52f, 10f, 4, 90f), accent);
                        break;
                    case "painting":
                        part(Sdf.RoundBox(64f, 64f, 44f, 36f, 4f), accent);
                        p.FillGradient(Sdf.Box(64f, 64f, 36f, 28f), Hex("#2A5BB8"), Hex("#7FC4FF"), 36f, 92f);
                        p.Fill(Sdf.Polygon(new[] { new Vector2(30f, 36f), new Vector2(98f, 36f), new Vector2(76f, 66f), new Vector2(56f, 52f) }), main);
                        p.Fill(Sdf.Circle(84f, 80f, 6f), Hex("#FFE37A"));
                        p.Stroke(Sdf.Box(64f, 64f, 36f, 28f), 2f, line);
                        break;
                    case "plant":
                        part(Sdf.Polygon(new[] { new Vector2(40f, 50f), new Vector2(88f, 50f), new Vector2(80f, 14f), new Vector2(48f, 14f) }, 3f), accent);
                        foreach (var l in new[] { new Vector3(64f, 86f, 0f), new Vector3(44f, 76f, 35f), new Vector3(84f, 76f, -35f), new Vector3(52f, 100f, 15f), new Vector3(78f, 100f, -15f) })
                            part(Sdf.Rotate(Sdf.Ellipse(l.x, l.y, 9f, 22f), l.x, l.y, l.z), main);
                        break;
                    case "bed":
                        part(Sdf.RoundBox(64f, 40f, 56f, 22f, 8f), main);
                        part(Sdf.RoundBox(64f, 58f, 50f, 8f, 4f), Cream);
                        part(Sdf.RoundBox(36f, 70f, 16f, 8f, 4f), accent);
                        part(Sdf.RoundBox(74f, 70f, 16f, 8f, 4f), accent);
                        part(Sdf.RoundBox(64f, 92f, 50f, 12f, 6f), Mul(main, 0.7f));
                        break;
                    case "bookshelf":
                        part(Sdf.RoundBox(64f, 64f, 44f, 54f, 5f), main);
                        for (int r = 0; r < 3; r++)
                        {
                            float y = 32f + r * 30f;
                            p.Fill(Sdf.Box(64f, y - 10f, 40f, 2f), line);
                            for (int b = 0; b < 6; b++)
                                p.Fill(Sdf.RoundBox(32f + b * 13f, y + 4f, 5f, 11f + (b % 3) * 2f, 1.5f), b % 2 == 0 ? accent : Lighten(PieceBase((PieceColor)(b % 6)), 0.1f));
                        }
                        break;
                    case "fountain":
                        part(Sdf.Ellipse(64f, 30f, 54f, 18f), Hex("#9AA3B2"));
                        p.Fill(Sdf.Ellipse(64f, 32f, 44f, 11f), Hex("#7FC4FF"));
                        part(Sdf.Box(64f, 60f, 7f, 26f), Hex("#9AA3B2"));
                        part(Sdf.Ellipse(64f, 86f, 26f, 9f), Hex("#9AA3B2"));
                        p.Fill(Sdf.Ellipse(64f, 88f, 20f, 5f), Hex("#7FC4FF"));
                        p.Fill(Sdf.Union(Sdf.Segment(64f, 92f, 64f, 112f, 2.5f), Sdf.Segment(64f, 110f, 50f, 96f, 2f), Sdf.Segment(64f, 110f, 78f, 96f, 2f)), A(Hex("#BFE6FF"), 0.9f));
                        break;
                    default: // bench
                        part(Sdf.RoundBox(64f, 52f, 54f, 8f, 4f), main);
                        part(Sdf.RoundBox(64f, 78f, 50f, 7f, 4f), main);
                        part(Sdf.Box(24f, 36f, 4f, 16f), line);
                        part(Sdf.Box(104f, 36f, 4f, 16f), line);
                        part(Sdf.Box(24f, 66f, 3f, 10f), line);
                        part(Sdf.Box(104f, 66f, 3f, 10f), line);
                        break;
                }
                if (all != null) p.Shadow(all, 3f, -6f, 10f, new Color(0, 0, 0, 0.0f));
                return p.ToSprite(100f);
            });
        }

        /// <summary>Henüz yapılmamış eşya yerini gösteren hayalet (gri taslak).</summary>
        public static Sprite FurnitureGhost(string kind)
        {
            return Cached("ghost_" + kind, () =>
            {
                var p = new Painter(S, S);
                p.Stroke(Sdf.RoundBox(64f, 64f, 50f, 50f, 12f), 4f, A(Color.white, 0.8f));
                p.Fill(Sdf.Union(Sdf.RoundBox(64f, 64f, 6f, 26f, 3f), Sdf.RoundBox(64f, 64f, 26f, 6f, 3f)), A(Color.white, 0.9f));
                return p.ToSprite(100f);
            });
        }
    }
}
