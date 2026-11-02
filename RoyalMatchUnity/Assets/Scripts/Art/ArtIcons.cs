using System;
using UnityEngine;

namespace RoyalMatch
{
    /// <summary>Arayüz parçaları, simgeler, kral ve oda eşyaları.</summary>
    public static partial class Art
    {
        // ---------------- Arayüz 9-slice parçaları (beyaz, renklendirme Image.color ile) ----------------
        public static Sprite RoundRect()
        {
            return Cached("ui_roundrect", () =>
            {
                var p = new Painter(128, 128, 2f);
                p.Fill(Sdf.RoundBox(32f, 32f, 30f, 30f, 14f), Color.white);
                return p.ToSliced(22f, 100f);
            });
        }

        public static Sprite RoundRectSmall()
        {
            return Cached("ui_roundrect_s", () =>
            {
                var p = new Painter(128, 128, 2f);
                p.Fill(Sdf.RoundBox(32f, 32f, 30f, 30f, 8f), Color.white);
                return p.ToSliced(20f, 100f);
            });
        }

        public static Sprite RoundRectOutline()
        {
            return Cached("ui_roundrect_outline", () =>
            {
                var p = new Painter(128, 128, 2f);
                p.Stroke(Sdf.RoundBox(32f, 32f, 28f, 28f, 14f), 4f, Color.white);
                return p.ToSliced(22f, 100f);
            });
        }

        public static Sprite Pill()
        {
            return Cached("ui_pill", () =>
            {
                var p = new Painter(192, 96, 2f);
                p.Fill(Sdf.RoundBox(48f, 24f, 46f, 22f, 22f), Color.white);
                return p.ToSliced(23f, 100f);
            });
        }

        public static Sprite CircleUi()
        {
            return Cached("ui_circle", () =>
            {
                var p = new Painter(128, 128, 2f);
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

        public static Sprite White()
        {
            return Cached("ui_white", () =>
            {
                var p = new Painter(4, 4);
                p.Fill((x, y) => -1f, Color.white);
                return p.ToSprite(100f);
            });
        }

        /// <summary>Gölgeli oyun düğmesi (beyaz; Image.color ile boyanır): üst parıltı, alt bevel, koyu kenar.</summary>
        public static Sprite ButtonSprite()
        {
            return Cached("ui_button", () =>
            {
                var p = new Painter(192, 128, 2f);
                Shape s = Sdf.RoundBox(48f, 32f, 46f, 30f, 16f);
                Shape top = Sdf.RoundBox(48f, 35f, 46f, 27f, 16f);
                p.Fill(s, new Color(0.46f, 0.46f, 0.46f, 1f));                 // alt bevel
                p.FillGradient(top, new Color(0.82f, 0.82f, 0.82f, 1f), Color.white, 8f, 62f);
                p.Fill(Sdf.Intersect(Sdf.Expand(top, -4f), Sdf.HalfPlaneAbove(38f)), new Color(1f, 1f, 1f, 0.22f));
                p.RimLight(top, 0f, -3f, 3f, new Color(1f, 1f, 1f, 0.5f));
                p.Stroke(s, 2.4f, new Color(0.22f, 0.22f, 0.22f, 1f));
                return p.ToSliced(24f, 100f);
            });
        }

        /// <summary>Ahşap pano: koyu çerçeve, altın şerit, içi parşömen.</summary>
        public static Sprite WoodPanel()
        {
            return Cached("ui_wood", () =>
            {
                var p = new Painter(192, 192, 2f);
                Shape outer = Sdf.RoundBox(48f, 48f, 46f, 46f, 14f);
                p.Shadow(outer, 0f, -3f, 6f, A(Color.black, 0.4f));
                p.FillGradient(outer, Hex("#6B3F1D"), Hex("#9B6230"), 2f, 94f);
                p.InnerShadow(outer, 0f, 5f, 6f, A(Hex("#3A2414"), 0.6f));
                p.RimLight(outer, 0f, -3f, 3f, A(Hex("#E3B179"), 0.6f));
                for (int i = 0; i < 6; i++) p.Fill(Sdf.Intersect(outer, Sdf.Box(48f, 6f + i * 16f, 60f, 0.5f)), A(Hex("#3A2414"), 0.25f));
                Shape gold = Sdf.Subtract(Sdf.RoundBox(48f, 48f, 41f, 41f, 11f), Sdf.RoundBox(48f, 48f, 38.5f, 38.5f, 9f));
                p.Fill(gold, Hex("#D9A226"));
                p.Fill(Sdf.Intersect(gold, Sdf.HalfPlaneAbove(48f)), A(Hex("#FFE37A"), 0.55f));
                Shape inner = Sdf.RoundBox(48f, 48f, 38f, 38f, 9f);
                p.FillGradient(inner, Hex("#F3DEB8"), Hex("#FFF4DF"), 10f, 86f);
                p.InnerShadow(inner, 0f, -4f, 6f, A(Hex("#8B5A2B"), 0.35f));
                p.Stroke(outer, 2.2f, Hex("#2E1A0C"));
                return p.ToSliced(14f, 100f);
            });
        }

        /// <summary>Koyu, yarı saydam cam pano (HUD göstergeleri).</summary>
        public static Sprite GlassPanel()
        {
            return Cached("ui_glass", () =>
            {
                var p = new Painter(128, 128, 2f);
                Shape s = Sdf.RoundBox(32f, 32f, 30f, 30f, 12f);
                p.Fill(s, new Color(0.06f, 0.09f, 0.22f, 0.78f));
                p.RimLight(s, 0f, -2.5f, 3f, new Color(1f, 1f, 1f, 0.25f));
                p.InnerShadow(s, 0f, 3f, 4f, new Color(0f, 0f, 0f, 0.35f));
                p.Stroke(s, 1.6f, new Color(0f, 0f, 0.05f, 0.6f));
                return p.ToSliced(20f, 100f);
            });
        }

        /// <summary>Başlık şeridi (kurdele): iki ucu çentikli, ortası kabarık.</summary>
        public static Sprite Ribbon()
        {
            return Cached("ui_ribbon", () =>
            {
                var p = new Painter(384, 128, 2f);
                Shape mid = Sdf.RoundBox(96f, 34f, 70f, 26f, 8f);
                Shape tailL = Sdf.Subtract(Sdf.Box(22f, 28f, 20f, 20f), Sdf.RegularPolygon(2f, 28f, 14f, 3, 0f));
                Shape tailR = Sdf.Subtract(Sdf.Box(170f, 28f, 20f, 20f), Sdf.RegularPolygon(190f, 28f, 14f, 3, 180f));
                p.Fill(tailL, new Color(0.55f, 0.55f, 0.55f, 1f)); p.Fill(tailR, new Color(0.55f, 0.55f, 0.55f, 1f));
                p.Shadow(mid, 0f, -3f, 6f, A(Color.black, 0.35f));
                p.FillGradient(mid, new Color(0.78f, 0.78f, 0.78f, 1f), Color.white, 8f, 60f);
                p.Fill(Sdf.Intersect(Sdf.Expand(mid, -4f), Sdf.HalfPlaneAbove(36f)), new Color(1f, 1f, 1f, 0.22f));
                p.Stroke(Sdf.Union(mid, tailL, tailR), 2f, new Color(0.2f, 0.2f, 0.2f, 1f));
                return p.ToSliced(46f, 100f);
            });
        }

        // ---------------- Simgeler ----------------
        private static Sprite Icon(string key, Action<Painter> draw)
        {
            return Cached("icon_" + key, () =>
            {
                var p = P();
                draw(p);
                return p.ToSprite(100f);
            });
        }

        public static Sprite Heart()
        {
            return Icon("heart", p =>
            {
                Shape h = Sdf.Heart(64f, 64f, 94f);
                p.Shadow(h, 2f, -5f, 8f, ShadowCol);
                Volume(p, h, Hex("#F0433A"), 3f, 14f, 112f);
                p.Fill(Sdf.Intersect(Sdf.Expand(h, -7f), Sdf.Ellipse(42f, 86f, 15f, 9f)), A(Color.white, 0.7f));
                p.Fill(Sdf.Circle(30f, 94f, 4f), A(Color.white, 0.9f));
            });
        }

        public static Sprite HeartEmpty()
        {
            return Icon("heart_empty", p =>
            {
                Shape h = Sdf.Heart(64f, 64f, 94f);
                p.Fill(h, Hex("#4A2E2A"));
                p.InnerShadow(h, 0f, -4f, 8f, A(Color.black, 0.4f));
                p.Stroke(h, 3f, Hex("#2B1B10"));
            });
        }

        public static Sprite Coin()
        {
            return Icon("coin", p =>
            {
                Shape c = Sdf.Circle(64f, 64f, 50f);
                p.Shadow(c, 2f, -5f, 8f, ShadowCol);
                Volume(p, c, Hex("#F2B31E"), 3f, 14f, 114f);
                Shape ring = Sdf.Subtract(Sdf.Circle(64f, 64f, 40f), Sdf.Circle(64f, 64f, 36f));
                p.Fill(ring, A(Hex("#B9831A"), 0.9f));
                p.Fill(Sdf.Intersect(ring, Sdf.HalfPlaneAbove(64f)), A(Hex("#FFE37A"), 0.35f));
                Shape crown = CrownShape(64f, 62f, 0.44f);
                p.Fill(crown, Hex("#B9831A"));
                p.InnerShadow(crown, 0f, 2f, 3f, A(Hex("#8A5C0A"), 0.6f));
                p.Fill(Sdf.Intersect(Sdf.Expand(c, -7f), Sdf.Ellipse(46f, 90f, 17f, 8f)), A(Color.white, 0.6f));
            });
        }

        public static Sprite StarIcon()
        {
            return Icon("star", p =>
            {
                Shape s = Sdf.Star(64f, 60f, 56f, 25f, 5, 90f, 5f);
                p.Shadow(s, 2f, -5f, 8f, ShadowCol);
                Volume(p, s, Hex("#FFC928"), 3f, 8f, 116f);
                p.Fill(Sdf.Intersect(Sdf.Expand(s, -7f), Sdf.Ellipse(50f, 82f, 13f, 7f)), A(Color.white, 0.7f));
            });
        }

        public static Sprite StarEmpty()
        {
            return Icon("star_empty", p =>
            {
                Shape s = Sdf.Star(64f, 60f, 56f, 25f, 5, 90f, 5f);
                p.Fill(s, Hex("#3A3F55"));
                p.InnerShadow(s, 0f, -4f, 8f, A(Color.black, 0.4f));
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
                p.Shadow(c, 2f, -5f, 8f, ShadowCol);
                Volume(p, c, Hex("#F2B31E"), 3f, 14f, 110f);
                foreach (var j in new[] { new Vector3(64f, 32f, 6f), new Vector3(34f, 32f, 5f), new Vector3(94f, 32f, 5f), new Vector3(64f, 100f, 5f) })
                {
                    Color jc = j.x == 64f ? Hex("#E8403A") : j.x < 64f ? Hex("#3A8DE8") : Hex("#4CC94A");
                    Volume(p, Sdf.Circle(j.x, j.y, j.z), jc, 1.4f, j.y - j.z, j.y + j.z);
                }
            });
        }

        public static Sprite Gear()
        {
            return Icon("gear", p =>
            {
                Shape g = Sdf.Circle(64f, 64f, 36f);
                for (int i = 0; i < 8; i++) g = Sdf.Union(g, Sdf.Rotate(Sdf.RoundBox(64f, 64f + 40f, 10f, 12f, 3f), 64f, 64f, 45f * i));
                g = Sdf.Subtract(g, Sdf.Circle(64f, 64f, 14f));
                p.Fill(g, Color.white);
            });
        }

        public static Sprite Hammer()
        {
            return Icon("hammer", p =>
            {
                Func<Shape, Shape> R = s => Sdf.Rotate(s, 64f, 64f, -35f);
                Shape handle = Sdf.RoundBox(64f, 44f, 9f, 46f, 4f);
                Shape head = Sdf.RoundBox(64f, 96f, 40f, 17f, 7f);
                p.Shadow(R(Sdf.Union(handle, head)), 2f, -5f, 8f, ShadowCol);
                Volume(p, R(handle), Hex("#B07A3F"), 2.6f, 0f, 90f);
                Volume(p, R(head), Hex("#9AA3B2"), 2.6f, 80f, 114f);
                p.Fill(R(Sdf.Intersect(Sdf.Expand(head, -6f), Sdf.Box(64f, 104f, 30f, 2.5f))), A(Color.white, 0.6f));
            });
        }

        public static Sprite Arrow()
        {
            return Icon("arrow", p =>
            {
                Shape shaft = Sdf.RoundBox(52f, 64f, 38f, 10f, 5f);
                Shape head = Sdf.Polygon(new[] { new Vector2(84f, 34f), new Vector2(84f, 94f), new Vector2(122f, 64f) }, 4f);
                Shape tail = Sdf.Polygon(new[] { new Vector2(6f, 42f), new Vector2(30f, 64f), new Vector2(6f, 86f), new Vector2(20f, 64f) }, 2f);
                Shape all = Sdf.Union(shaft, head, tail);
                p.Shadow(all, 2f, -5f, 8f, ShadowCol);
                Volume(p, all, Hex("#FFC928"), 2.6f, 34f, 94f);
            });
        }

        public static Sprite Cannon()
        {
            return Icon("cannon", p =>
            {
                Func<Shape, Shape> R = s => Sdf.Rotate(s, 64f, 64f, -30f);
                Shape barrel = Sdf.RoundBox(64f, 72f, 18f, 42f, 10f);
                Shape muzzle = Sdf.RoundBox(64f, 108f, 23f, 8f, 4f);
                Shape band = Sdf.RoundBox(64f, 60f, 21f, 5f, 3f);
                Shape wheel = Sdf.Circle(64f, 28f, 22f);
                p.Shadow(R(Sdf.Union(barrel, muzzle, wheel)), 2f, -5f, 8f, ShadowCol);
                Volume(p, R(wheel), Hex("#B07A3F"), 2.6f, 6f, 50f);
                p.Fill(R(Sdf.Circle(64f, 28f, 7f)), Hex("#3A2414"));
                for (int i = 0; i < 4; i++) p.Fill(R(Sdf.Rotate(Sdf.Box(64f, 28f, 2f, 18f), 64f, 28f, 45f * i)), A(Hex("#3A2414"), 0.7f));
                Volume(p, R(Sdf.Union(barrel, muzzle)), Hex("#5B6880"), 2.6f, 30f, 118f);
                Volume(p, R(band), Hex("#D9A226"), 1.6f, 55f, 65f, false);
                p.Fill(R(Sdf.Intersect(Sdf.Expand(barrel, -5f), Sdf.Box(55f, 76f, 3f, 30f))), A(Color.white, 0.5f));
            });
        }

        public static Sprite JesterHat()
        {
            return Icon("jester", p =>
            {
                Shape band = Sdf.RoundBox(64f, 34f, 48f, 11f, 6f);
                Shape hat = Sdf.Polygon(new[]
                {
                    new Vector2(20f, 40f), new Vector2(14f, 106f), new Vector2(44f, 60f), new Vector2(64f, 120f),
                    new Vector2(84f, 60f), new Vector2(114f, 106f), new Vector2(108f, 40f)
                }, 4f);
                p.Shadow(Sdf.Union(band, hat), 2f, -5f, 8f, ShadowCol);
                Volume(p, hat, Hex("#A94BE6"), 2.6f, 40f, 120f);
                Shape mid = Sdf.Intersect(hat, Sdf.Polygon(new[] { new Vector2(44f, 60f), new Vector2(64f, 120f), new Vector2(84f, 60f), new Vector2(64f, 40f) }));
                p.FillGradient(mid, Mul(Hex("#FFC928"), 0.85f), Lighten(Hex("#FFC928"), 0.3f), 40f, 120f);
                p.Stroke(hat, 2.6f, Hex("#3E1A5E"));
                Volume(p, band, Hex("#F0433A"), 2.4f, 22f, 46f);
                foreach (var pt in new[] { new Vector2(14f, 106f), new Vector2(64f, 120f), new Vector2(114f, 106f) })
                    Volume(p, Sdf.Circle(pt.x, pt.y, 7.5f), Hex("#FFE37A"), 2f, pt.y - 8f, pt.y + 8f);
            });
        }

        public static Sprite Lock()
        {
            return Icon("lock", p =>
            {
                Shape body = Sdf.RoundBox(64f, 46f, 32f, 26f, 7f);
                Shape shackle = Sdf.Intersect(Sdf.Subtract(Sdf.Circle(64f, 76f, 24f), Sdf.Circle(64f, 76f, 14f)), Sdf.HalfPlaneAbove(72f));
                Volume(p, Sdf.Union(body, shackle, Sdf.Box(64f, 73f, 19f, 3f)), Hex("#B8C2D0"), 2.6f, 20f, 100f);
                p.Fill(Sdf.Union(Sdf.Circle(64f, 50f, 6f), Sdf.Box(64f, 40f, 3f, 8f)), Hex("#232A38"));
            });
        }

        public static Sprite Check()
        {
            return Icon("check", p => { p.Fill(Sdf.Union(Sdf.Segment(30f, 64f, 54f, 40f, 10f), Sdf.Segment(54f, 40f, 100f, 90f, 10f)), Color.white); });
        }

        public static Sprite Close()
        {
            return Icon("close", p => { p.Fill(Sdf.Union(Sdf.Segment(34f, 34f, 94f, 94f, 10f), Sdf.Segment(34f, 94f, 94f, 34f, 10f)), Color.white); });
        }

        public static Sprite Back()
        {
            return Icon("back", p => { p.Fill(Sdf.Union(Sdf.Segment(36f, 64f, 100f, 64f, 10f), Sdf.Segment(36f, 64f, 70f, 30f, 10f), Sdf.Segment(36f, 64f, 70f, 98f, 10f)), Color.white); });
        }

        public static Sprite Plus()
        {
            return Icon("plus", p => { p.Fill(Sdf.Union(Sdf.RoundBox(64f, 64f, 11f, 42f, 5f), Sdf.RoundBox(64f, 64f, 42f, 11f, 5f)), Color.white); });
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
                else p.Fill(Sdf.Union(Sdf.Segment(84f, 48f, 112f, 80f, 6f), Sdf.Segment(84f, 80f, 112f, 48f, 6f)), Hex("#FF6B5E"));
            });
        }

        public static Sprite Home()
        {
            return Icon("home", p =>
            {
                Shape roof = Sdf.Polygon(new[] { new Vector2(14f, 66f), new Vector2(64f, 114f), new Vector2(114f, 66f) }, 4f);
                Shape body = Sdf.RoundBox(64f, 44f, 36f, 28f, 5f);
                Shape door = Sdf.RoundBox(64f, 32f, 10f, 16f, 4f);
                p.Fill(Sdf.Subtract(Sdf.Union(roof, body), door), Color.white);
            });
        }

        public static Sprite Bolt()
        {
            return Icon("bolt", p =>
            {
                Shape b = Sdf.Polygon(new[] { new Vector2(74f, 118f), new Vector2(30f, 60f), new Vector2(60f, 60f), new Vector2(50f, 10f), new Vector2(98f, 72f), new Vector2(68f, 72f) }, 2f);
                Volume(p, b, Hex("#FFC928"), 2.6f, 10f, 118f);
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
                p.Shadow(all, 2f, -5f, 8f, ShadowCol);
                Volume(p, all, Hex("#F2B31E"), 2.6f, 14f, 112f);
                p.Fill(Sdf.Intersect(Sdf.Expand(cup, -6f), Sdf.Ellipse(50f, 86f, 6f, 14f)), A(Color.white, 0.55f));
            });
        }

        /// <summary>Kral: yuvarlak yüz, iri gözler, beyaz sakal, kadife pelerin ve mücevherli taç. Özgün çizim.</summary>
        public static Sprite King()
        {
            return Cached("king", () =>
            {
                var p = new Painter(512, 512, 2f);
                float cx = 128f;
                // pelerin + kürk yaka
                Shape robe = Sdf.Intersect(Sdf.Ellipse(cx, 10f, 118f, 78f), Sdf.HalfPlaneAbove(0f));
                p.Shadow(robe, 0f, -4f, 10f, ShadowCol);
                Volume(p, robe, Hex("#C8302A"), 3f, 0f, 90f);
                p.Fill(Sdf.Intersect(robe, Sdf.Box(cx, 20f, 10f, 40f)), A(Hex("#8E1C1C"), 0.5f));
                Shape fur = Sdf.Intersect(Sdf.Union(Sdf.Ellipse(cx, 76f, 120f, 18f), Sdf.Box(cx, 60f, 118f, 18f)), robe);
                Volume(p, fur, Hex("#F4F6FA"), 2.4f, 40f, 94f, false);
                foreach (float fx in new[] { 60f, 96f, 160f, 196f }) p.Fill(Sdf.Circle(fx, 70f, 5f), Hex("#2B1B10"));
                Volume(p, Sdf.Circle(cx, 66f, 9f), Hex("#3A8DE8"), 2f, 57f, 75f);
                // sakal
                Shape beard = Sdf.Union(Sdf.Ellipse(cx, 84f, 74f, 54f), Sdf.Ellipse(cx, 52f, 46f, 40f));
                p.Shadow(beard, 2f, -6f, 10f, ShadowCol);
                Volume(p, beard, Hex("#EEF1F6"), 3f, 10f, 130f);
                foreach (float bx in new[] { 90f, 110f, 146f, 166f }) p.Fill(Sdf.Ellipse(bx, 46f, 6f, 18f), A(Hex("#C9CDD6"), 0.6f));
                // yüz
                Shape head = Sdf.Ellipse(cx, 134f, 68f, 70f);
                Volume(p, head, Hex("#F3C9A3"), 3f, 70f, 204f);
                // kulaklar
                foreach (float ex in new[] { cx - 64f, cx + 64f }) Volume(p, Sdf.Ellipse(ex, 130f, 8f, 11f), Hex("#F3C9A3"), 2.2f, 119f, 141f, false);
                // yanaklar
                p.Fill(Sdf.Ellipse(cx - 40f, 120f, 13f, 8f), A(Hex("#F08A80"), 0.55f));
                p.Fill(Sdf.Ellipse(cx + 40f, 120f, 13f, 8f), A(Hex("#F08A80"), 0.55f));
                // bıyık
                Shape must = Sdf.Union(Sdf.Rotate(Sdf.Ellipse(cx - 26f, 104f, 30f, 10f), cx - 26f, 104f, 14f), Sdf.Rotate(Sdf.Ellipse(cx + 26f, 104f, 30f, 10f), cx + 26f, 104f, -14f));
                Volume(p, must, Hex("#EEF1F6"), 2.4f, 90f, 118f, false);
                // burun
                Volume(p, Sdf.Ellipse(cx, 120f, 13f, 11f), Hex("#E8A47E"), 2f, 108f, 132f);
                // gözler
                foreach (float ex in new[] { cx - 28f, cx + 28f })
                {
                    Shape eye = Sdf.Ellipse(ex, 148f, 13f, 15f);
                    p.Fill(eye, Color.white);
                    p.InnerShadow(eye, 0f, -3f, 5f, A(Hex("#8A94A6"), 0.4f));
                    p.Stroke(eye, 2.2f, Hex("#4B3A2A"));
                    p.Fill(Sdf.Circle(ex + 2f, 146f, 7f), Hex("#2B4C7E"));
                    p.Fill(Sdf.Circle(ex + 2f, 146f, 3.6f), Color.black);
                    p.Fill(Sdf.Circle(ex + 4.5f, 149f, 2f), Color.white);
                    // kaş
                    p.Fill(Sdf.Rotate(Sdf.RoundBox(ex, 170f, 15f, 4.5f, 2.5f), ex, 170f, ex < cx ? 10f : -10f), Hex("#D9DEE6"));
                }
                // taç
                Shape crown = CrownShape(cx, 206f, 1.0f);
                p.Shadow(crown, 2f, -6f, 10f, ShadowCol);
                Volume(p, crown, Hex("#F2B31E"), 3f, 168f, 250f);
                Volume(p, Sdf.Circle(cx, 184f, 7f), Hex("#E8403A"), 2f, 177f, 191f);
                Volume(p, Sdf.Circle(cx - 30f, 182f, 5f), Hex("#3A8DE8"), 1.6f, 177f, 187f);
                Volume(p, Sdf.Circle(cx + 30f, 182f, 5f), Hex("#4CC94A"), 1.6f, 177f, 187f);
                return p.ToSprite(100f);
            });
        }

        // ---------------- Arka planlar ----------------
        /// <summary>Gökyüzü, tepeler, şato ve bulutlar; haritada ve oyun ekranı arkasında kullanılır.</summary>
        public static Sprite Castle()
        {
            return Cached("bg_castle", () =>
            {
                var p = new Painter(512, 1024, 2f);
                p.FillGradient((x, y) => -1f, Hex("#2250B3"), Hex("#8FD0FF"), 40f, 512f);
                p.Glow(200f, 430f, 150f, A(Hex("#FFF2B0"), 0.35f));
                p.Fill(Sdf.Circle(200f, 440f, 22f), Hex("#FFF2B0"));
                var rnd = new System.Random(11);
                for (int i = 0; i < 8; i++)
                {
                    float cx = (float)rnd.NextDouble() * 256f, cy = 300f + (float)rnd.NextDouble() * 190f;
                    float k = 0.8f + (float)rnd.NextDouble() * 0.6f;
                    Shape cloud = Sdf.Union(Sdf.Ellipse(cx, cy, 36f * k, 14f * k), Sdf.Circle(cx - 14f * k, cy + 8f * k, 15f * k), Sdf.Circle(cx + 10f * k, cy + 11f * k, 19f * k));
                    p.Shadow(cloud, 0f, -3f, 6f, A(Hex("#2250B3"), 0.25f));
                    p.FillGradient(cloud, Hex("#DCEBFF"), Color.white, cy - 20f, cy + 24f);
                }
                // uzak tepeler
                p.Fill(Sdf.Union(Sdf.Ellipse(40f, 70f, 120f, 70f), Sdf.Ellipse(230f, 60f, 130f, 80f)), Hex("#3F7FD4"));
                Color wall = Hex("#5A7FC2"), wallDark = Hex("#2E4A86"), roof = Hex("#C23A33");
                Shape towers = Sdf.Union(Sdf.Box(40f, 150f, 22f, 92f), Sdf.Box(216f, 150f, 22f, 92f), Sdf.Box(128f, 176f, 30f, 116f), Sdf.Box(84f, 128f, 14f, 72f), Sdf.Box(172f, 128f, 14f, 72f));
                Shape silhouette = Sdf.Union(Sdf.Box(128f, 110f, 150f, 52f), towers);
                p.Shadow(silhouette, 0f, -4f, 10f, A(Hex("#1B2A4D"), 0.5f));
                p.FillGradient(silhouette, wallDark, wall, 60f, 290f);
                p.InnerShadow(silhouette, 6f, 0f, 10f, A(wallDark, 0.6f));
                p.RimLight(silhouette, -3f, 0f, 4f, A(Hex("#A7C4F2"), 0.5f));
                for (int i = -5; i <= 5; i++) p.Fill(Sdf.Box(128f + i * 26f, 166f, 7f, 7f), wall);
                foreach (var t in new[] { new Vector3(40f, 242f, 28f), new Vector3(216f, 242f, 28f), new Vector3(84f, 200f, 18f), new Vector3(172f, 200f, 18f), new Vector3(128f, 292f, 34f) })
                {
                    Shape r = Sdf.Polygon(new[] { new Vector2(t.x - t.z, t.y), new Vector2(t.x + t.z, t.y), new Vector2(t.x, t.y + t.z * 1.7f) }, 1.5f);
                    p.FillGradient(r, Mul(roof, 0.7f), Lighten(roof, 0.2f), t.y, t.y + t.z * 1.7f);
                    p.Stroke(r, 1.4f, Mul(roof, 0.5f));
                }
                p.Fill(Sdf.Union(Sdf.Segment(128f, 350f, 128f, 376f, 1.6f), Sdf.Polygon(new[] { new Vector2(128f, 376f), new Vector2(128f, 362f), new Vector2(150f, 369f) })), Hex("#F6C544"));
                var rnd2 = new System.Random(5);
                for (int i = 0; i < 22; i++)
                {
                    float wx = 20f + (float)rnd2.NextDouble() * 216f, wy = 80f + (float)rnd2.NextDouble() * 170f;
                    if (silhouette(wx, wy) < -6f)
                    {
                        p.Glow(wx, wy, 7f, A(Hex("#FFE37A"), 0.5f));
                        p.Fill(Sdf.Union(Sdf.RoundBox(wx, wy, 3f, 5f, 1.5f), Sdf.Intersect(Sdf.Circle(wx, wy + 5f, 3f), Sdf.HalfPlaneAbove(wy + 5f))), Hex("#FFE37A"));
                    }
                }
                Shape gate = Sdf.Union(Sdf.Box(128f, 70f, 12f, 12f), Sdf.Intersect(Sdf.Circle(128f, 82f, 12f), Sdf.HalfPlaneAbove(82f)));
                p.Fill(gate, Hex("#3A2414"));
                p.FillGradient((x, y) => y - 64f, Hex("#2F8A2E"), Hex("#62C748"), 0f, 64f);
                p.Fill(Sdf.Intersect((x, y) => y - 64f, Sdf.Ellipse(128f, 60f, 60f, 10f)), A(Hex("#C68A4B"), 0.8f));
                return p.ToSprite(100f);
            });
        }

        public static Sprite RoomBackdrop(int roomIndex)
        {
            return Cached("bg_room_" + roomIndex, () =>
            {
                var p = new Painter(512, 512, 2f);
                Color[] walls = { Hex("#F3E2C3"), Hex("#CFE3F5"), Hex("#E7D2EE"), Hex("#F8E7D0"), Hex("#D8EFD5"), Hex("#F1D6D6") };
                Color[] floors = { Hex("#A9733D"), Hex("#8E6A4B"), Hex("#6D5A8C"), Hex("#C28F58"), Hex("#6F8F5E"), Hex("#9A5B4E") };
                Color wall = walls[roomIndex % walls.Length], floor = floors[roomIndex % floors.Length];
                p.FillGradient((x, y) => 96f - y, Mul(wall, 0.9f), Lighten(wall, 0.12f), 96f, 256f);
                for (int i = 0; i < 5; i++) p.Fill(Sdf.Box(128f, 120f + i * 30f, 128f, 0.6f), A(Mul(wall, 0.8f), 0.4f));
                p.FillGradient((x, y) => y - 96f, Mul(floor, 0.75f), floor, 0f, 96f);
                for (int i = 0; i < 8; i++) p.Fill(Sdf.Box(128f, 6f + i * 12f, 128f, 0.7f), A(Mul(floor, 0.55f), 0.7f));
                for (int i = 0; i < 6; i++) p.Fill(Sdf.Box(20f + i * 44f + (i % 2) * 20f, 48f, 0.5f, 48f), A(Mul(floor, 0.55f), 0.5f));
                Shape skirting = Sdf.Box(128f, 100f, 128f, 5f);
                p.Fill(skirting, Mul(wall, 0.7f));
                p.RimLight(skirting, 0f, -2f, 2f, A(Color.white, 0.35f));
                Shape win = Sdf.Union(Sdf.RoundBox(64f, 184f, 26f, 30f, 4f), Sdf.Intersect(Sdf.Circle(64f, 214f, 26f), Sdf.HalfPlaneAbove(214f)));
                p.Shadow(win, 0f, -3f, 8f, A(Mul(wall, 0.6f), 0.5f));
                p.FillGradient(win, Hex("#8FD0FF"), Hex("#2250B3"), 150f, 240f);
                p.Fill(Sdf.Circle(72f, 206f, 7f), A(Color.white, 0.9f));
                p.Fill(Sdf.Union(Sdf.Ellipse(56f, 190f, 14f, 5f), Sdf.Circle(50f, 193f, 6f)), A(Color.white, 0.85f));
                p.Stroke(win, 4.5f, Cream);
                p.Fill(Sdf.Union(Sdf.Box(64f, 184f, 1.6f, 30f), Sdf.Box(64f, 190f, 26f, 1.6f)), Cream);
                p.Glow(64f, 150f, 60f, A(Hex("#FFF2B0"), 0.25f));
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
                var p = P();
                Color[] pal = StylePalette(style);
                Color main = pal[0], accent = pal[1], line = pal[2];
                Action<Shape, Color> part = (s, c) =>
                {
                    p.Shadow(s, 2f, -5f, 8f, A(Color.black, 0.25f));
                    Volume(p, s, c, 2.4f, 0f, 128f);
                };
                switch (kind)
                {
                    case "sofa":
                        part(Sdf.RoundBox(64f, 70f, 44f, 14f, 8f), main);
                        part(Sdf.RoundBox(64f, 44f, 54f, 18f, 8f), main);
                        part(Sdf.RoundBox(18f, 60f, 10f, 26f, 7f), accent);
                        part(Sdf.RoundBox(110f, 60f, 10f, 26f, 7f), accent);
                        p.Fill(Sdf.Union(Sdf.Box(34f, 18f, 4f, 8f), Sdf.Box(94f, 18f, 4f, 8f)), line);
                        break;
                    case "table":
                        part(Sdf.Box(28f, 46f, 5f, 26f), Mul(main, 0.8f));
                        part(Sdf.Box(100f, 46f, 5f, 26f), Mul(main, 0.8f));
                        part(Sdf.RoundBox(64f, 78f, 54f, 9f, 5f), main);
                        part(Sdf.Ellipse(64f, 94f, 16f, 7f), accent);
                        break;
                    case "lamp":
                        part(Sdf.Ellipse(64f, 20f, 22f, 7f), main);
                        part(Sdf.Box(64f, 46f, 4f, 24f), line);
                        part(Sdf.Polygon(new[] { new Vector2(30f, 70f), new Vector2(98f, 70f), new Vector2(84f, 110f), new Vector2(44f, 110f) }, 3f), accent);
                        p.Glow(64f, 90f, 44f, A(Hex("#FFE37A"), 0.45f));
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
                        foreach (var l in new[] { new Vector3(64f, 86f, 0f), new Vector3(44f, 76f, 35f), new Vector3(84f, 76f, -35f), new Vector3(52f, 100f, 15f), new Vector3(78f, 100f, -15f) })
                            part(Sdf.Rotate(Sdf.Ellipse(l.x, l.y, 9f, 22f), l.x, l.y, l.z), main);
                        part(Sdf.Polygon(new[] { new Vector2(40f, 50f), new Vector2(88f, 50f), new Vector2(80f, 14f), new Vector2(48f, 14f) }, 3f), accent);
                        break;
                    case "bed":
                        part(Sdf.RoundBox(64f, 92f, 50f, 12f, 6f), Mul(main, 0.7f));
                        part(Sdf.RoundBox(64f, 40f, 56f, 22f, 8f), main);
                        part(Sdf.RoundBox(64f, 58f, 50f, 8f, 4f), Cream);
                        part(Sdf.RoundBox(36f, 70f, 16f, 8f, 4f), accent);
                        part(Sdf.RoundBox(74f, 70f, 16f, 8f, 4f), accent);
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
                    default:
                        part(Sdf.Box(24f, 36f, 4f, 16f), line);
                        part(Sdf.Box(104f, 36f, 4f, 16f), line);
                        part(Sdf.Box(24f, 66f, 3f, 10f), line);
                        part(Sdf.Box(104f, 66f, 3f, 10f), line);
                        part(Sdf.RoundBox(64f, 52f, 54f, 8f, 4f), main);
                        part(Sdf.RoundBox(64f, 78f, 50f, 7f, 4f), main);
                        break;
                }
                return p.ToSprite(100f);
            });
        }

        public static Sprite FurnitureGhost(string kind)
        {
            return Cached("ghost_" + kind, () =>
            {
                var p = P();
                p.Glow(64f, 64f, 60f, A(Color.white, 0.25f));
                p.Stroke(Sdf.RoundBox(64f, 64f, 50f, 50f, 12f), 4f, A(Color.white, 0.85f));
                p.Fill(Sdf.Union(Sdf.RoundBox(64f, 64f, 6f, 26f, 3f), Sdf.RoundBox(64f, 64f, 26f, 6f, 3f)), A(Color.white, 0.9f));
                return p.ToSprite(100f);
            });
        }
    }
}
