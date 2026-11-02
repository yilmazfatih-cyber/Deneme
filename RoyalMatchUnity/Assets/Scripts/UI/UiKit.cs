using System;
using System.Collections;
using UnityEngine;
using UnityEngine.EventSystems;
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
            Place(rt, anchor ?? new Vector2(0.5f, 0.5f), pos, size);
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

        /// <summary>Ahşap çerçeveli parşömen pano (ana pano stili).</summary>
        public static Image Wood(Transform parent, Vector2 size, Vector2 pos, Vector2? anchor = null, string name = "Wood")
        {
            var img = Img(parent, Art.WoodPanel(), Color.white, size, pos, anchor, true, name);
            img.raycastTarget = true;
            return img;
        }

        /// <summary>Koyu cam gösterge panosu.</summary>
        public static Image Glass(Transform parent, Vector2 size, Vector2 pos, Vector2? anchor = null, string name = "Glass")
        {
            var img = Img(parent, Art.GlassPanel(), Color.white, size, pos, anchor, true, name);
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
                o.effectColor = new Color(0.12f, 0.06f, 0.03f, 0.95f); o.effectDistance = new Vector2(2.5f, -2.5f);
                var sh = rt.gameObject.AddComponent<Shadow>();
                sh.effectColor = new Color(0f, 0f, 0f, 0.5f); sh.effectDistance = new Vector2(0f, -4f);
            }
            return t;
        }

        /// <summary>Hacimli oyun düğmesi: ButtonSprite renklendirilir, basınca küçülür.</summary>
        public static Button Btn(Transform parent, string label, Color color, Vector2 size, Vector2 pos, Action onClick, Vector2? anchor = null, int fontSize = 48)
        {
            var root = Node(parent, "Btn_" + label);
            Place(root, anchor ?? new Vector2(0.5f, 0.5f), pos, size);
            var shadow = Img(root, Art.SoftGlow(), new Color(0f, 0f, 0.1f, 0.35f), new Vector2(size.x * 1.1f, size.y * 1.2f), new Vector2(0f, -14f), null, false, "Shadow");
            var img = root.gameObject.AddComponent<Image>();
            img.sprite = Art.ButtonSprite(); img.type = Image.Type.Sliced; img.color = color;
            var t = Txt(root, label, fontSize, Color.white, new Vector2(0f, 6f), new Vector2(size.x - 20f, size.y), null, TextAnchor.MiddleCenter, true, "Label");
            var b = root.gameObject.AddComponent<Button>();
            b.targetGraphic = img;
            var cb = b.colors; cb.pressedColor = new Color(0.85f, 0.85f, 0.85f, 1f); cb.highlightedColor = Color.white; cb.disabledColor = new Color(0.6f, 0.6f, 0.6f, 1f); b.colors = cb;
            root.gameObject.AddComponent<PressScale>();
            b.onClick.AddListener(() => { Sfx.Play(SfxKind.Click); if (onClick != null) onClick(); });
            return b;
        }

        public static Button IconBtn(Transform parent, Sprite icon, Color color, float size, Vector2 pos, Action onClick, Vector2? anchor = null, float iconScale = 0.6f)
        {
            var root = Node(parent, "IconBtn");
            Place(root, anchor ?? new Vector2(0.5f, 0.5f), pos, new Vector2(size, size));
            Img(root, Art.SoftGlow(), new Color(0f, 0f, 0.1f, 0.35f), new Vector2(size * 1.25f, size * 1.25f), new Vector2(0f, -8f), null, false, "Shadow");
            var bg = root.gameObject.AddComponent<Image>();
            bg.sprite = Art.CircleUi(); bg.color = color;
            Img(root, Art.CircleUi(), new Color(1, 1, 1, 0.22f), new Vector2(size * 0.78f, size * 0.4f), new Vector2(0f, size * 0.24f), null, false, "Gloss");
            Img(root, icon, Color.white, new Vector2(size * iconScale, size * iconScale), Vector2.zero, null, false, "Icon");
            var b = root.gameObject.AddComponent<Button>();
            b.targetGraphic = bg;
            root.gameObject.AddComponent<PressScale>();
            b.onClick.AddListener(() => { Sfx.Play(SfxKind.Click); if (onClick != null) onClick(); });
            return b;
        }

        /// <summary>Simge + metin cam hap (can, para, yıldız).</summary>
        public static Text Pill(Transform parent, Sprite icon, string text, Vector2 pos, Vector2 size, Vector2? anchor = null)
        {
            var root = Node(parent, "Pill");
            Place(root, anchor ?? new Vector2(0.5f, 0.5f), pos, size);
            var img = root.gameObject.AddComponent<Image>();
            img.sprite = Art.GlassPanel(); img.type = Image.Type.Sliced; img.color = Color.white;
            Img(root, icon, Color.white, new Vector2(size.y * 1.25f, size.y * 1.25f), new Vector2(-size.y * 0.1f, 0f), new Vector2(0f, 0.5f), false, "Icon");
            var t = Txt(root, text, Mathf.RoundToInt(size.y * 0.5f), Color.white, new Vector2(size.y * 0.4f, 0f), new Vector2(size.x - size.y * 1.1f, size.y), new Vector2(0.5f, 0.5f), TextAnchor.MiddleCenter, true, "Value");
            return t;
        }

        /// <summary>Küçük yuvarlak sayaç rozeti.</summary>
        public static Text Badge(Transform parent, string text, Color color, float size, Vector2 pos)
        {
            var img = Img(parent, Art.CircleUi(), color, new Vector2(size, size), pos, null, false, "Badge");
            Img(img.rectTransform, Art.CircleUi(), new Color(1, 1, 1, 0.2f), new Vector2(size * 0.7f, size * 0.35f), new Vector2(0f, size * 0.22f));
            return Txt(img.rectTransform, text, Mathf.RoundToInt(size * 0.55f), Color.white, new Vector2(0f, 1f), new Vector2(size, size));
        }

        /// <summary>Kurdele başlık (renklendirilir).</summary>
        public static Text RibbonTitle(Transform parent, string title, Color color, Vector2 pos, float width = 640f, int fontSize = 50)
        {
            var rib = Img(parent, Art.Ribbon(), color, new Vector2(width, 120f), pos, null, true, "Ribbon");
            return Txt(rib.rectTransform, title, fontSize, Color.white, new Vector2(0f, 2f), new Vector2(width - 160f, 120f));
        }

        /// <summary>Tıklamayı yutan, yumuşak beliren koyu perde.</summary>
        public static Image Overlay(Transform parent, float alpha = 0.62f)
        {
            var rt = Node(parent, "Overlay");
            Stretch(rt);
            var img = rt.gameObject.AddComponent<Image>();
            img.sprite = Art.White(); img.color = new Color(0f, 0f, 0.08f, 0f);
            img.raycastTarget = true;
            var f = rt.gameObject.AddComponent<FadeIn>(); f.target = alpha;
            return img;
        }

        /// <summary>Ahşap çerçeveli, kurdele başlıklı pencere. Döndürdüğü RectTransform içerik alanıdır; kapatmak için ClosePopup.</summary>
        public static RectTransform Popup(Transform parent, string title, Vector2 size, Color? ribbon = null)
        {
            var holder = Node(parent, "PopupRoot");
            Stretch(holder);
            Overlay(holder);
            var shadow = Img(holder, Art.SoftGlow(), new Color(0f, 0f, 0.1f, 0.5f), new Vector2(size.x * 1.15f, size.y * 1.12f), new Vector2(0f, -20f), null, false, "Shadow");
            var panel = Wood(holder, size, Vector2.zero, null, "Popup");
            var rt = panel.rectTransform;
            RibbonTitle(rt, title, ribbon ?? Art.Hex("#2F6FD0"), new Vector2(0f, size.y / 2f - 6f), Mathf.Min(size.x * 0.82f, 720f));
            rt.localScale = Vector3.one * 0.7f;
            rt.gameObject.AddComponent<PopIn>();
            return rt;
        }

        public static void ClosePopup(RectTransform panel)
        {
            if (panel != null && panel.parent != null) UnityEngine.Object.Destroy(panel.parent.gameObject);
        }

        public static void CloseButton(RectTransform panel, Action onClose = null)
        {
            IconBtn(panel, Art.Close(), Art.RedBtn, 96f, new Vector2(14f, 14f), () => { ClosePopup(panel); if (onClose != null) onClose(); }, new Vector2(1f, 1f), 0.5f);
        }

        public static Color Hex(string h) { return Art.Hex(h); }

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

        /// <summary>Dünya noktasını bu canvas'ın yerel koordinatına çevirir.</summary>
        public static Vector2 WorldToCanvas(RectTransform canvas, Camera cam, Vector3 world)
        {
            Vector3 sp = cam.WorldToScreenPoint(world);
            Vector2 local;
            RectTransformUtility.ScreenPointToLocalPointInRectangle(canvas, sp, null, out local);
            return local;
        }

        /// <summary>Bir arayüz öğesinin canvas'a göre yerel konumu (uçan simge hedefi için).</summary>
        public static Vector2 CanvasLocal(RectTransform canvas, RectTransform target)
        {
            Vector3 world = target.TransformPoint(Vector3.zero);
            Vector3 local = canvas.InverseTransformPoint(world);
            return new Vector2(local.x, local.y);
        }

        // ---------------- Animasyon yardımcıları ----------------
        /// <summary>Bir simgeyi A'dan B'ye kavisle uçurur, varınca siler.</summary>
        public static IEnumerator FlyIcon(RectTransform canvas, Sprite icon, Vector2 from, Vector2 to, float size, float dur, Action onArrive)
        {
            var img = Img(canvas, icon, Color.white, new Vector2(size, size), from, null, false, "Fly");
            var rt = img.rectTransform;
            float t = 0f;
            Vector2 ctrl = (from + to) * 0.5f + new Vector2(0f, 160f);
            while (t < 1f)
            {
                t += Time.deltaTime / dur;
                float k = Ease.InOutQuad(Mathf.Clamp01(t));
                Vector2 p = (1 - k) * (1 - k) * from + 2 * (1 - k) * k * ctrl + k * k * to;
                rt.anchoredPosition = p;
                rt.localScale = Vector3.one * (1f + 0.35f * Mathf.Sin(k * Mathf.PI));
                yield return null;
            }
            UnityEngine.Object.Destroy(img.gameObject);
            if (onArrive != null) onArrive();
        }

        public static IEnumerator Punch(Transform tr, float amount = 1.18f, float dur = 0.22f)
        {
            if (tr == null) yield break;
            Vector3 baseScale = Vector3.one;
            float t = 0f;
            while (t < 1f)
            {
                if (tr == null) yield break;
                t += Time.deltaTime / dur;
                float k = Mathf.Clamp01(t);
                float s = 1f + (amount - 1f) * Mathf.Sin(k * Mathf.PI);
                tr.localScale = baseScale * s;
                yield return null;
            }
            if (tr != null) tr.localScale = baseScale;
        }

        /// <summary>Sayıyı artarak yazar.</summary>
        public static IEnumerator CountUp(Text t, int from, int to, float dur, string prefix = "")
        {
            float e = 0f;
            while (e < dur)
            {
                e += Time.deltaTime;
                int v = Mathf.RoundToInt(Mathf.Lerp(from, to, Ease.OutCubic(Mathf.Clamp01(e / dur))));
                if (t != null) t.text = prefix + v;
                yield return null;
            }
            if (t != null) t.text = prefix + to;
        }

        /// <summary>Tam ekran beyaz flaş.</summary>
        public static IEnumerator Flash(Transform parent, float alpha = 0.55f, float dur = 0.28f)
        {
            var rt = Node(parent, "Flash"); Stretch(rt);
            var img = rt.gameObject.AddComponent<Image>(); img.sprite = Art.White(); img.raycastTarget = false;
            float t = 0f;
            while (t < dur)
            {
                t += Time.deltaTime;
                img.color = new Color(1f, 1f, 1f, alpha * (1f - t / dur));
                yield return null;
            }
            UnityEngine.Object.Destroy(rt.gameObject);
        }

        /// <summary>Üstten konfeti yağdırır.</summary>
        public static IEnumerator Confetti(RectTransform canvas, int count = 60, float dur = 2.6f)
        {
            var parts = new RectTransform[count];
            var vel = new Vector2[count];
            var spin = new float[count];
            for (int i = 0; i < count; i++)
            {
                Color c = Art.PieceBase((PieceColor)(i % 6));
                var img = Img(canvas, Art.Confetti(), c, new Vector2(26f, 40f), new Vector2(UnityEngine.Random.Range(-540f, 540f), 1000f + UnityEngine.Random.Range(0f, 500f)), null, false, "Confetti");
                parts[i] = img.rectTransform;
                vel[i] = new Vector2(UnityEngine.Random.Range(-80f, 80f), -UnityEngine.Random.Range(420f, 760f));
                spin[i] = UnityEngine.Random.Range(-360f, 360f);
            }
            float t = 0f;
            while (t < dur)
            {
                t += Time.deltaTime;
                for (int i = 0; i < count; i++)
                {
                    if (parts[i] == null) continue;
                    parts[i].anchoredPosition += (vel[i] + new Vector2(Mathf.Sin(t * 4f + i) * 60f, 0f)) * Time.deltaTime;
                    parts[i].localEulerAngles = new Vector3(0, 0, spin[i] * t);
                    parts[i].localScale = new Vector3(Mathf.Abs(Mathf.Cos(t * 5f + i)), 1f, 1f);
                }
                yield return null;
            }
            for (int i = 0; i < count; i++) if (parts[i] != null) UnityEngine.Object.Destroy(parts[i].gameObject);
        }
    }

    /// <summary>Pencere açılış animasyonu (küçükten yaylanarak).</summary>
    public class PopIn : MonoBehaviour
    {
        private float t;
        private void Update()
        {
            t += Time.unscaledDeltaTime / 0.3f;
            float k = Mathf.Clamp01(t);
            transform.localScale = Vector3.one * Mathf.Lerp(0.7f, 1f, Ease.OutBack(k));
            if (k >= 1f) Destroy(this);
        }
    }

    /// <summary>Perde yumuşak belirir.</summary>
    public class FadeIn : MonoBehaviour
    {
        public float target = 0.6f;
        private float t; private Image img;
        private void Update()
        {
            if (img == null) img = GetComponent<Image>();
            t += Time.unscaledDeltaTime / 0.22f;
            Color c = img.color; c.a = Mathf.Lerp(0f, target, Mathf.Clamp01(t)); img.color = c;
            if (t >= 1f) Destroy(this);
        }
    }

    /// <summary>Basılınca küçülen, bırakınca yaylanan düğme hissi.</summary>
    public class PressScale : MonoBehaviour, IPointerDownHandler, IPointerUpHandler
    {
        private float target = 1f, cur = 1f;
        public void OnPointerDown(PointerEventData e) { target = 0.92f; }
        public void OnPointerUp(PointerEventData e) { target = 1f; }
        private void Update()
        {
            cur = Mathf.Lerp(cur, target, Time.unscaledDeltaTime * 18f);
            transform.localScale = Vector3.one * cur;
        }
    }

    /// <summary>Hafif yukarı-aşağı sallanma (kral, simgeler).</summary>
    public class Bob : MonoBehaviour
    {
        public float amp = 10f, speed = 1.6f, tilt = 2f;
        private Vector2 basePos; private RectTransform rt; private float t;
        private void Start() { rt = (RectTransform)transform; basePos = rt.anchoredPosition; t = UnityEngine.Random.Range(0f, 6f); }
        private void Update()
        {
            t += Time.deltaTime * speed;
            rt.anchoredPosition = basePos + new Vector2(0f, Mathf.Sin(t) * amp);
            rt.localEulerAngles = new Vector3(0, 0, Mathf.Sin(t * 0.7f) * tilt);
        }
    }

    /// <summary>Yatay kayan bulut; kenardan çıkınca diğer kenardan girer.</summary>
    public class Drift : MonoBehaviour
    {
        public float speed = 30f, limit = 700f;
        private RectTransform rt;
        private void Update()
        {
            if (rt == null) rt = (RectTransform)transform;
            Vector2 p = rt.anchoredPosition; p.x += speed * Time.deltaTime;
            if (p.x > limit) p.x = -limit;
            rt.anchoredPosition = p;
        }
    }

    /// <summary>Sürekli nabız (seçili güçlendirici, oynanabilir düğme).</summary>
    public class Pulse : MonoBehaviour
    {
        public float amp = 0.05f, speed = 3f;
        private float t;
        private void Update() { t += Time.deltaTime * speed; transform.localScale = Vector3.one * (1f + Mathf.Sin(t) * amp); }
    }
}
