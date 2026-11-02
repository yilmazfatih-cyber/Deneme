using System.Collections.Generic;
using BlockOut.Core;
using UnityEngine;

namespace BlockOut.Game
{
    /// <summary>Renkler ve malzemeler. Hiçbir sanat dosyası gerekmez; her şey çalışma anında üretilir.</summary>
    public static class Palette
    {
        public static readonly Color Background = new Color(0.11f, 0.12f, 0.18f);
        public static readonly Color Floor = new Color(0.20f, 0.22f, 0.30f);
        public static readonly Color Tile = new Color(0.26f, 0.28f, 0.37f);
        public static readonly Color Wall = new Color(0.42f, 0.44f, 0.50f);
        public static readonly Color Ice = new Color(0.70f, 0.88f, 1.00f, 0.55f);
        public static readonly Color UiPanel = new Color(0.16f, 0.17f, 0.25f, 0.97f);
        public static readonly Color UiButton = new Color(0.30f, 0.62f, 0.95f);
        public static readonly Color UiButtonActive = new Color(0.98f, 0.70f, 0.25f);
        public static readonly Color UiText = Color.white;

        public static Color Get(BlockColor c)
        {
            switch (c)
            {
                case BlockColor.Red: return new Color(0.93f, 0.30f, 0.30f);
                case BlockColor.Blue: return new Color(0.28f, 0.52f, 0.96f);
                case BlockColor.Green: return new Color(0.30f, 0.78f, 0.42f);
                case BlockColor.Yellow: return new Color(0.97f, 0.82f, 0.22f);
                case BlockColor.Purple: return new Color(0.62f, 0.42f, 0.92f);
                case BlockColor.Orange: return new Color(0.98f, 0.58f, 0.22f);
                case BlockColor.Cyan: return new Color(0.26f, 0.80f, 0.86f);
                default: return new Color(0.96f, 0.50f, 0.75f);
            }
        }

        static readonly Dictionary<Color, Material> lit = new Dictionary<Color, Material>();
        static readonly Dictionary<Color, Material> translucent = new Dictionary<Color, Material>();
        static Shader litShader;
        static Shader unlitShader;

        static Shader LitShader
        {
            get
            {
                if (litShader == null)
                {
                    litShader = Shader.Find("Universal Render Pipeline/Lit");
                    if (litShader == null) litShader = Shader.Find("Standard");
                    if (litShader == null) litShader = Shader.Find("Legacy Shaders/Diffuse");
                }
                return litShader;
            }
        }

        static Shader UnlitShader
        {
            get
            {
                if (unlitShader == null)
                {
                    unlitShader = Shader.Find("Sprites/Default");
                    if (unlitShader == null) unlitShader = Shader.Find("UI/Default");
                }
                return unlitShader;
            }
        }

        public static Material Lit(Color c)
        {
            Material m;
            if (lit.TryGetValue(c, out m) && m != null) return m;
            m = new Material(LitShader) { color = c };
            if (m.HasProperty("_Glossiness")) m.SetFloat("_Glossiness", 0.25f);
            if (m.HasProperty("_Smoothness")) m.SetFloat("_Smoothness", 0.25f);
            lit[c] = m;
            return m;
        }

        /// <summary>Yarı saydam, ışıksız malzeme (buz katmanı için). Her boru hattında çalışır.</summary>
        public static Material Translucent(Color c)
        {
            Material m;
            if (translucent.TryGetValue(c, out m) && m != null) return m;
            m = new Material(UnlitShader) { color = c };
            m.renderQueue = 3000;
            translucent[c] = m;
            return m;
        }

        static Font font;

        /// <summary>Yerleşik yazı tipi; Unity sürümüne göre adı değişir.</summary>
        public static Font Font
        {
            get
            {
                if (font != null) return font;
                try { font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf"); } catch { font = null; }
                if (font == null)
                {
                    try { font = Resources.GetBuiltinResource<Font>("Arial.ttf"); } catch { font = null; }
                }
                if (font == null) font = Font.CreateDynamicFontFromOSFont(new[] { "Arial", "Roboto", "Helvetica", "DejaVu Sans" }, 32);
                return font;
            }
        }
    }
}
