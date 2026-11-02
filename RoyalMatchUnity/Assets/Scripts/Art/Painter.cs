using System;
using UnityEngine;

namespace RoyalMatch
{
    /// <summary>İşaretli uzaklık fonksiyonu: içeride negatif, dışarıda pozitif (piksel birimi).</summary>
    public delegate float Shape(float x, float y);

    /// <summary>Temel şekiller. Tüm görseller bunların birleşiminden kodla çizilir; dış dosya yoktur.</summary>
    public static class Sdf
    {
        public static Shape Circle(float cx, float cy, float r)
        {
            return (x, y) => Mathf.Sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) - r;
        }

        public static Shape Ellipse(float cx, float cy, float rx, float ry)
        {
            // Yaklaşık uzaklık: ölçeklenmiş daire, kenarda yeterince doğru.
            return (x, y) =>
            {
                float dx = (x - cx) / rx, dy = (y - cy) / ry;
                float k = Mathf.Sqrt(dx * dx + dy * dy);
                return (k - 1f) * Mathf.Min(rx, ry);
            };
        }

        public static Shape RoundBox(float cx, float cy, float hw, float hh, float r)
        {
            return (x, y) =>
            {
                float qx = Mathf.Abs(x - cx) - hw + r, qy = Mathf.Abs(y - cy) - hh + r;
                float ox = Mathf.Max(qx, 0f), oy = Mathf.Max(qy, 0f);
                return Mathf.Sqrt(ox * ox + oy * oy) + Mathf.Min(Mathf.Max(qx, qy), 0f) - r;
            };
        }

        public static Shape Box(float cx, float cy, float hw, float hh) { return RoundBox(cx, cy, hw, hh, 0f); }

        /// <summary>Kapsül: iki nokta arası kalın çizgi.</summary>
        public static Shape Segment(float ax, float ay, float bx, float by, float r)
        {
            return (x, y) =>
            {
                float pax = x - ax, pay = y - ay, bax = bx - ax, bay = by - ay;
                float h = Mathf.Clamp01((pax * bax + pay * bay) / (bax * bax + bay * bay + 1e-6f));
                float dx = pax - bax * h, dy = pay - bay * h;
                return Mathf.Sqrt(dx * dx + dy * dy) - r;
            };
        }

        public static Shape Polygon(Vector2[] v, float round = 0f)
        {
            int n = v.Length;
            return (x, y) =>
            {
                float d = (x - v[0].x) * (x - v[0].x) + (y - v[0].y) * (y - v[0].y);
                float s = 1f;
                for (int i = 0, j = n - 1; i < n; j = i, i++)
                {
                    float ex = v[j].x - v[i].x, ey = v[j].y - v[i].y;
                    float wx = x - v[i].x, wy = y - v[i].y;
                    float t = Mathf.Clamp01((wx * ex + wy * ey) / (ex * ex + ey * ey + 1e-6f));
                    float bx = wx - ex * t, by = wy - ey * t;
                    d = Mathf.Min(d, bx * bx + by * by);
                    bool c1 = y >= v[i].y, c2 = y < v[j].y, c3 = ex * wy > ey * wx;
                    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
                }
                return s * Mathf.Sqrt(d) - round;
            };
        }

        public static Shape RegularPolygon(float cx, float cy, float r, int sides, float rotDeg, float round = 0f)
        {
            var pts = new Vector2[sides];
            for (int i = 0; i < sides; i++)
            {
                float a = (rotDeg + 360f * i / sides) * Mathf.Deg2Rad;
                pts[i] = new Vector2(cx + Mathf.Cos(a) * r, cy + Mathf.Sin(a) * r);
            }
            return Polygon(pts, round);
        }

        public static Shape Star(float cx, float cy, float rOuter, float rInner, int points, float rotDeg = 90f, float round = 0f)
        {
            var pts = new Vector2[points * 2];
            for (int i = 0; i < points * 2; i++)
            {
                float a = (rotDeg + 180f * i / points) * Mathf.Deg2Rad;
                float r = (i % 2 == 0) ? rOuter : rInner;
                pts[i] = new Vector2(cx + Mathf.Cos(a) * r, cy + Mathf.Sin(a) * r);
            }
            return Polygon(pts, round);
        }

        public static Shape Heart(float cx, float cy, float size)
        {
            float r = size * 0.5f;
            Shape l = Circle(cx - r * 0.52f, cy + r * 0.32f, r * 0.62f);
            Shape rr = Circle(cx + r * 0.52f, cy + r * 0.32f, r * 0.62f);
            Shape tri = Polygon(new[]
            {
                new Vector2(cx - r * 1.12f, cy + r * 0.3f),
                new Vector2(cx + r * 1.12f, cy + r * 0.3f),
                new Vector2(cx, cy - r * 1.05f)
            }, 2f);
            return Union(Union(l, rr), tri);
        }

        public static Shape Union(Shape a, Shape b) { return (x, y) => Mathf.Min(a(x, y), b(x, y)); }
        public static Shape Union(params Shape[] s)
        {
            return (x, y) => { float d = float.MaxValue; for (int i = 0; i < s.Length; i++) d = Mathf.Min(d, s[i](x, y)); return d; };
        }
        public static Shape Subtract(Shape a, Shape b) { return (x, y) => Mathf.Max(a(x, y), -b(x, y)); }
        public static Shape Intersect(Shape a, Shape b) { return (x, y) => Mathf.Max(a(x, y), b(x, y)); }
        public static Shape Expand(Shape a, float r) { return (x, y) => a(x, y) - r; }
        public static Shape Translate(Shape a, float dx, float dy) { return (x, y) => a(x - dx, y - dy); }

        public static Shape Rotate(Shape a, float cx, float cy, float deg)
        {
            float c = Mathf.Cos(-deg * Mathf.Deg2Rad), s = Mathf.Sin(-deg * Mathf.Deg2Rad);
            return (x, y) =>
            {
                float px = x - cx, py = y - cy;
                return a(cx + px * c - py * s, cy + px * s + py * c);
            };
        }

        /// <summary>Üst yarı: y > cy olan bölge (parlaklık için kesme).</summary>
        public static Shape HalfPlaneAbove(float cy) { return (x, y) => cy - y; }
    }

    /// <summary>Piksel tuvali: şekilleri kenar yumuşatmayla boyar, Sprite'a çevirir.</summary>
    public class Painter
    {
        public readonly int W, H;
        private readonly Color[] px;

        public Painter(int w, int h)
        {
            W = w; H = h; px = new Color[w * h];
            for (int i = 0; i < px.Length; i++) px[i] = new Color(0, 0, 0, 0);
        }

        private static Color Blend(Color dst, Color src, float a)
        {
            a *= src.a;
            if (a <= 0f) return dst;
            float outA = a + dst.a * (1f - a);
            if (outA <= 0f) return new Color(0, 0, 0, 0);
            float r = (src.r * a + dst.r * dst.a * (1f - a)) / outA;
            float g = (src.g * a + dst.g * dst.a * (1f - a)) / outA;
            float b = (src.b * a + dst.b * dst.a * (1f - a)) / outA;
            return new Color(r, g, b, outA);
        }

        private static float Coverage(float d) { return Mathf.Clamp01(0.5f - d); }

        public Painter Fill(Shape s, Color c)
        {
            for (int y = 0; y < H; y++)
                for (int x = 0; x < W; x++)
                {
                    float cov = Coverage(s(x + 0.5f, y + 0.5f));
                    if (cov > 0f) px[y * W + x] = Blend(px[y * W + x], c, cov);
                }
            return this;
        }

        /// <summary>Dikey geçiş: alttan üste bottom→top rengi.</summary>
        public Painter FillGradient(Shape s, Color bottom, Color top, float y0, float y1)
        {
            for (int y = 0; y < H; y++)
            {
                float k = Mathf.Clamp01((y - y0) / Mathf.Max(1f, y1 - y0));
                Color c = Color.Lerp(bottom, top, k);
                for (int x = 0; x < W; x++)
                {
                    float cov = Coverage(s(x + 0.5f, y + 0.5f));
                    if (cov > 0f) px[y * W + x] = Blend(px[y * W + x], c, cov);
                }
            }
            return this;
        }

        /// <summary>Kenara yaklaşınca koyulaşan "hacim" gölgesi.</summary>
        public Painter Shade(Shape s, Color edge, float depth)
        {
            for (int y = 0; y < H; y++)
                for (int x = 0; x < W; x++)
                {
                    float d = s(x + 0.5f, y + 0.5f);
                    if (d < 0f)
                    {
                        float k = Mathf.Clamp01(1f + d / depth); // kenarda 1, içeride 0
                        if (k > 0f) px[y * W + x] = Blend(px[y * W + x], edge, k * k);
                    }
                }
            return this;
        }

        public Painter Stroke(Shape s, float width, Color c)
        {
            float hw = width * 0.5f;
            for (int y = 0; y < H; y++)
                for (int x = 0; x < W; x++)
                {
                    float d = Mathf.Abs(s(x + 0.5f, y + 0.5f)) - hw;
                    float cov = Coverage(d);
                    if (cov > 0f) px[y * W + x] = Blend(px[y * W + x], c, cov);
                }
            return this;
        }

        /// <summary>Yumuşak gölge: şeklin alt-sağına kaydırılmış saydam koyu kopya.</summary>
        public Painter Shadow(Shape s, float dx, float dy, float blur, Color c)
        {
            for (int y = 0; y < H; y++)
                for (int x = 0; x < W; x++)
                {
                    float d = s(x + 0.5f - dx, y + 0.5f - dy);
                    float cov = Mathf.Clamp01(1f - (d + blur * 0.5f) / Mathf.Max(0.001f, blur));
                    if (cov > 0f) px[y * W + x] = Blend(px[y * W + x], c, cov);
                }
            return this;
        }

        /// <summary>Çok yönlü parlama: merkezden dışa doğru sönen ışık.</summary>
        public Painter Glow(float cx, float cy, float radius, Color c)
        {
            for (int y = 0; y < H; y++)
                for (int x = 0; x < W; x++)
                {
                    float d = Mathf.Sqrt((x + 0.5f - cx) * (x + 0.5f - cx) + (y + 0.5f - cy) * (y + 0.5f - cy)) / radius;
                    float k = Mathf.Clamp01(1f - d);
                    if (k > 0f) px[y * W + x] = Blend(px[y * W + x], c, k * k);
                }
            return this;
        }

        public Texture2D ToTexture()
        {
            var tex = new Texture2D(W, H, TextureFormat.RGBA32, false);
            tex.filterMode = FilterMode.Bilinear;
            tex.wrapMode = TextureWrapMode.Clamp;
            tex.SetPixels(px);
            tex.Apply();
            return tex;
        }

        public Sprite ToSprite(float pixelsPerUnit = 100f)
        {
            Texture2D tex = ToTexture();
            return Sprite.Create(tex, new Rect(0, 0, W, H), new Vector2(0.5f, 0.5f), pixelsPerUnit);
        }

        /// <summary>Dokuz parçalı (9-slice) sprite: kenar kalınlığı border.</summary>
        public Sprite ToSliced(float border, float pixelsPerUnit = 100f)
        {
            Texture2D tex = ToTexture();
            return Sprite.Create(tex, new Rect(0, 0, W, H), new Vector2(0.5f, 0.5f), pixelsPerUnit, 0,
                SpriteMeshType.FullRect, new Vector4(border, border, border, border));
        }
    }
}
