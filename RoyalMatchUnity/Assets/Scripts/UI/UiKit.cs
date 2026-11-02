using System;
using UnityEngine;
using UnityEngine.UI;

namespace RoyalMatch
{
    /// <summary>Arayüz kurucu yardımcıları (uGUI, kodla). Tasarım: 1080×1920 dikey.</summary>
    public static class Ui
    {
        public const float RefW = 1080f, RefH = 1920f;
        private static Font font;

        public static Font Font
        {
            get
            {
                if (font == null)
                {
                    font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
                    if (font == null) font = Resources.GetBuiltinResource<Font>("Arial.ttf");
                }
                return font;
            }
        }

        public static RectTransform Node(Transform parent, string name)
        {
            var go = new GameObject(name);
            var rt = go.AddComponent<RectTransform>();
            rt.SetParent(parent, false);
            rt.anchorMin = new Vector2(0.5f, 0.5f); rt.anchorMax = new Vector2(0.5f, 0.5f);
            rt.pivot = new Vector2(0.5f, 0.5f);
            rt.anchoredPosition = Vector2.zero;
            rt.localScale = Vector3.one;
            return rt;
        }

        public static RectTransform Place(RectTransform rt, Vector2 anchor, Vector2 pos, Vector2 size)
        {
            rt.anchorMin = anchor; rt.anchorMax = anchor; rt.pivot = anchor;
            rt.anchoredPosition = pos; rt.sizeDelta = size;
            return rt;
        }

        public static RectTransform Stretch(RectTransform rt, float margin = 0f)
        {
            rt.anchorMin = Vector2.zero; rt.anchorMax = Vector2.one;
            rt.offsetMin = new Vector2(margin, margin); rt.offsetMax = new Vector2(-margin, -margin);
            return rt;
        }

        public static Image Img(Transform parent, Sprite sprite, Color color, Vector2 size, Vector2 pos, Vector2? anchor = null, bool sliced = false, string name = "Img")
        {
            var rt = Node(parent, name);
            Vector2 a = anchor ?? new Vector2(0.5f, 0.5f);
            Place(rt, a, pos, size);
            var img = rt.gameObject.AddComponent<Image>();
            img.sprite = sprite; img.color = color;
            img.type = sliced ? Image.Type.Sliced : Image.Type.Simple;
            img.raycastTarget = false;
            if (!sliced) img.preserveAspect = true;
            return img;
        }

        public static Image Panel(Transform parent, Color color, Vector2 size, Vector2 pos, Vector2? anchor = null, bool small = false, string name = "Panel")
        {
            var img = Img(parent, small ? Art.RoundRectSmall() : Art.RoundRect(), color, size, pos, anchor, true, name);
            img.raycastTarget = true;
            return img;
        }

        public static Text Txt(Transform parent, string text, int size, Color color, Vector2 pos, Vector2 boxSize, Vector2? anchor = null, TextAnchor align = TextAnchor.MiddleCenter, bool outline = true, string name = "Text")
        {
            var rt = Node(parent, name);
            Place(rt, anchor ?? new Vector2(0.5f, 0.5f), pos, boxSize);
            var t = rt.gameObject.AddComponent<Text>();
            t.font = Font; t.text = text; t.fontSize = size; t.color = color; t.alignment = align;
            t.fontStyle = FontStyle.Bold;
            t.horizontalOverflow = HorizontalWrapMode.Wrap; t.verticalOverflow = VerticalWrapMode.Overflow;
            t.raycastTarget = false;
            if (outline)
            {
                var o = rt.gameObject.AddComponent<Outline>();
                o.effectColor = new Color(0.1f, 0.05f, 0.02f, 0.9f); o.effectDistance = new Vector2(2.5f, -2.5f);
            }
            return t;
        }

        /// <summary>Parlak, alt kenarı koyu oyun düğmesi.</summary>
        public static Button Btn(Transform parent, string label, Color color, Vector2 size, Vector2 pos, Action onClick, Vector2? anchor = null, int fontSize = 48)
        {
            var root = Node(parent, "Btn_" + label);
            Place(root, anchor ?? new Vector2(0.5f, 0.5f), pos, size);
            var shadow = root.gameObject.AddComponent<Image>();
            shadow.sprite = Art.RoundRect(); shadow.type = Image.Type.Sliced; shadow.color = Art.Mul(color, 0.55f);
            var top = Img(root, Art.RoundRect(), color, new Vector2(size.x, size.y - 10f), new Vector2(0f, 5f), null, true, "Top");
            var gloss = Img(root, Art.RoundRect(), new Color(1, 1, 1, 0.22f), new Vector2(size.x - 24f, (size.y - 10f) * 0.42f), new Vector2(0f, size.y * 0.22f), null, true, "Gloss");
            var t = Txt(root, label, fontSize, Color.white, new Vector2(0f, 4f), new Vector2(size.x - 20f, size.y), null, TextAnchor.MiddleCenter, true, "Label");
            var b = root.gameObject.AddComponent<Button>();
            b.targetGraphic = top;
            var cb = b.colors; cb.pressedColor = new Color(0.8f, 0.8f, 0.8f, 1f); cb.highlightedColor = Color.white; cb.disabledColor = new Color(0.6f, 0.6f, 0.6f, 1f); b.colors = cb;
            b.onClick.AddListener(() => { Sfx.Play(SfxKind.Click); if (onClick != null) onClick(); });
            return b;
        }

        /// <summary>Yuvarlak simge düğmesi.</summary>
        public static Button IconBtn(Transform parent, Sprite icon, Color color, float size, Vector2 pos, Action onClick, Vector2? anchor = null, float iconScale = 0.62f)
        {
            var root = Node(parent, "IconBtn");
            Place(root, anchor ?? new Vector2(0.5f, 0.5f), pos, new Vector2(size, size));
            var bg = root.gameObject.AddComponent<Image>();
            bg.sprite = Art.CircleUi(); bg.color = color;
            Img(root, Art.CircleUi(), new Color(1, 1, 1, 0.2f), new Vector2(size * 0.8f, size * 0.42f), new Vector2(0f, size * 0.22f), null, false, "Gloss");
            Img(root, icon, Color.white, new Vector2(size * iconScale, size * iconScale), Vector2.zero, null, false, "Icon");
            var b = root.gameObject.AddComponent<Button>();
            b.targetGraphic = bg;
            b.onClick.AddListener(() => { Sfx.Play(SfxKind.Click); if (onClick != null) onClick(); });
            return b;
        }

        /// <summary>Simge + metin hap (can, para, yıldız göstergeleri).</summary>
        public static Text Pill(Transform parent, Sprite icon, string text, Vector2 pos, Vector2 size, Vector2? anchor = null, Color? bg = null)
        {
            var root = Node(parent, "Pill");
            Place(root, anchor ?? new Vector2(0.5f, 0.5f), pos, size);
            var img = root.gameObject.AddComponent<Image>();
            img.sprite = Art.Pill(); img.type = Image.Type.Sliced; img.color = bg ?? new Color(0.08f, 0.1f, 0.25f, 0.75f);
            Img(root, icon, Color.white, new Vector2(size.y * 1.15f, size.y * 1.15f), new Vector2(size.y * 0.1f, 0f), new Vector2(0f, 0.5f), false, "Icon");
            var t = Txt(root, text, Mathf.RoundToInt(size.y * 0.55f), Color.white, new Vector2(size.y * 0.55f, 0f), new Vector2(size.x - size.y * 1.1f, size.y), new Vector2(0.5f, 0.5f), TextAnchor.MiddleCenter, true, "Value");
            return t;
        }

        /// <summary>Tıklamayı yutan koyu perde.</summary>
        public static Image Overlay(Transform parent, float alpha = 0.6f)
        {
            var rt = Node(parent, "Overlay");
            Stretch(rt);
            var img = rt.gameObject.AddComponent<Image>();
            img.sprite = Art.White(); img.color = new Color(0f, 0f, 0.05f, alpha);
            img.raycastTarget = true;
            return img;
        }

        /// <summary>Başlık şeritli pencere. Döndürdüğü RectTransform içerik alanıdır; kapatmak için ClosePopup.</summary>
        public static RectTransform Popup(Transform parent, string title, Vector2 size, Color? ribbon = null)
        {
            var holder = Node(parent, "PopupRoot");
            Stretch(holder);
            Overlay(holder);
            var panel = Panel(holder, Hex("#F7E7C6"), size, Vector2.zero, null, false, "Popup");
            var rt = panel.rectTransform;
            Img(rt, Art.RoundRectOutline(), Art.Hex("#8B5A2B"), size, Vector2.zero, null, true, "Frame");
            var rib = Img(rt, Art.RoundRect(), ribbon ?? Art.Hex("#2F6FD0"), new Vector2(size.x * 0.78f, 110f), new Vector2(0f, size.y / 2f - 10f), null, true, "Ribbon");
            Img(rib.rectTransform, Art.RoundRect(), new Color(1, 1, 1, 0.2f), new Vector2(size.x * 0.78f - 24f, 40f), new Vector2(0f, 24f), null, true, "Gloss");
            Txt(rib.rectTransform, title, 52, Color.white, Vector2.zero, new Vector2(size.x * 0.76f, 110f));
            rt.localScale = Vector3.one * 0.7f;
            rt.gameObject.AddComponent<PopIn>();
            return rt;
        }

        public static void ClosePopup(RectTransform panel)
        {
            if (panel != null && panel.parent != null) UnityEngine.Object.Destroy(panel.parent.gameObject);
        }

        /// <summary>Sağ üstte kapatma düğmesi.</summary>
        public static void CloseButton(RectTransform panel, Action onClose = null)
        {
            IconBtn(panel, Art.Close(), Art.RedBtn, 96f, new Vector2(10f, 10f), () => { ClosePopup(panel); if (onClose != null) onClose(); }, new Vector2(1f, 1f));
        }

        public static Color Hex(string h) { return Art.Hex(h); }

        /// <summary>Hedef simgesi: renk taşı veya engel.</summary>
        public static Sprite GoalIcon(GoalType g)
        {
            switch (g)
            {
                case GoalType.Box: return Art.Box(1);
                case GoalType.Vase: return Art.Vase(2);
                case GoalType.Plate: return Art.Plate(2);
                case GoalType.Egg: return Art.Egg(2);
                case GoalType.Safe: return Art.Safe(3);
                case GoalType.Mailbox: return Art.Mailbox(3);
                case GoalType.Grass: return Art.Grass(1);
                case GoalType.Chain: return Art.Chain();
                default: return Art.Piece((PieceColor)(int)g);
            }
        }

        public static string GoalName(GoalType g)
        {
            switch (g)
            {
                case GoalType.Red: return "Kırmızı"; case GoalType.Blue: return "Mavi"; case GoalType.Green: return "Yeşil";
                case GoalType.Yellow: return "Sarı"; case GoalType.Purple: return "Mor"; case GoalType.Orange: return "Turuncu";
                case GoalType.Box: return "Kutu"; case GoalType.Vase: return "Vazo"; case GoalType.Plate: return "Tabak";
                case GoalType.Egg: return "Yumurta"; case GoalType.Safe: return "Kasa"; case GoalType.Mailbox: return "Posta kutusu";
                case GoalType.Grass: return "Çimen"; default: return "Zincir";
            }
        }
    }

    /// <summary>Pencere açılış animasyonu (küçükten yaylanarak).</summary>
    public class PopIn : MonoBehaviour
    {
        private float t;
        private void Update()
        {
            t += Time.unscaledDeltaTime / 0.28f;
            float k = Mathf.Clamp01(t);
            transform.localScale = Vector3.one * Mathf.Lerp(0.7f, 1f, Ease.OutBack(k));
            if (k >= 1f) Destroy(this);
        }
    }
}
