using System;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace BlockOut.Game
{
    /// <summary>Oyun içi arayüz: üst çubuk (bölüm, süre, menü), alt çubuk (geri al, çekiç, yenile), sonuç panelleri.</summary>
    public class UIController : MonoBehaviour
    {
        public GameManager Game;
        public Canvas Canvas { get; private set; }

        GameObject hud;
        Text levelText;
        Text timerText;
        Text hintText;
        Button undoButton;
        Button hammerButton;
        Text hammerText;
        Image hammerImage;
        GameObject winPanel;
        GameObject losePanel;
        Text winText;

        public const int RefW = 1080;
        public const int RefH = 1920;

        public struct ButtonSpec
        {
            public string Label;
            public Action OnClick;
            public bool Secondary;
        }

        void Awake()
        {
            BuildCanvas();
        }

        void Update()
        {
            if (Game == null || timerText == null || Game.Level == null) return;
            int t = Mathf.CeilToInt(Game.TimeLeft);
            timerText.text = string.Format("{0}:{1:00}", t / 60, t % 60);
            timerText.color = t <= 10 && Game.Running ? Palette.UiButtonActive : Palette.UiText;
            if (undoButton != null) undoButton.interactable = Game.CanUndo && Game.Running;
        }

        public void ShowHud(bool show)
        {
            hud.SetActive(show);
            if (!show) HidePanels();
        }

        public void OnLevelLoaded()
        {
            HidePanels();
            ShowHud(true);
            levelText.text = "Bölüm " + Game.Level.Name;
            hintText.text = Game.LevelIndex == 0 ? "Bloğu aynı renkteki kapıya sürükle." : "";
            Refresh();
        }

        public void Refresh()
        {
            hammerText.text = "Çekiç  ×" + Game.Hammers;
            hammerImage.color = Game.HammerMode ? Palette.UiButtonActive : Palette.UiButton;
            hammerButton.interactable = Game.Hammers > 0;
            if (Game.HammerMode) hintText.text = "Kırmak için bir bloğa dokun.";
            else if (Game.LevelIndex != 0) hintText.text = "";
        }

        public void ShowWin()
        {
            winText.text = "Bölüm " + Game.Level.Name + " · " + Game.Moves + " hamle";
            winPanel.SetActive(true);
        }

        public void ShowTimeOver()
        {
            losePanel.SetActive(true);
        }

        public void HidePanels()
        {
            winPanel.SetActive(false);
            losePanel.SetActive(false);
        }

        // --- kurulum ---------------------------------------------------------------------

        void BuildCanvas()
        {
            if (EventSystem.current == null)
            {
                GameObject es = new GameObject("EventSystem");
                es.AddComponent<EventSystem>();
                es.AddComponent<StandaloneInputModule>();
            }

            GameObject cgo = new GameObject("Canvas");
            cgo.transform.SetParent(transform, false);
            Canvas = cgo.AddComponent<Canvas>();
            Canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            CanvasScaler scaler = cgo.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(RefW, RefH);
            scaler.matchWidthOrHeight = 0.5f;
            cgo.AddComponent<GraphicRaycaster>();

            hud = new GameObject("Hud");
            hud.transform.SetParent(Canvas.transform, false);
            RectTransform hudRt = hud.AddComponent<RectTransform>();
            Anchor(hudRt, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);

            // Üst çubuk
            RectTransform top = Panel("Top", hud.transform, new Color(0, 0, 0, 0.25f));
            Anchor(top, new Vector2(0, 1), new Vector2(1, 1), new Vector2(0, -200), new Vector2(0, 0));
            levelText = Label("Level", top, "Bölüm 1", 52, TextAnchor.MiddleLeft);
            Anchor(levelText.rectTransform, new Vector2(0, 0), new Vector2(0.36f, 1), new Vector2(40, 40), new Vector2(0, -20));
            timerText = Label("Timer", top, "1:00", 72, TextAnchor.MiddleCenter);
            Anchor(timerText.rectTransform, new Vector2(0.36f, 0), new Vector2(0.7f, 1), new Vector2(0, 40), new Vector2(0, -20));
            Image menuImg;
            Text menuTxt;
            Button menu = MakeButton("Menu", top, "Menü", out menuImg, out menuTxt);
            menuImg.color = new Color(0.35f, 0.38f, 0.5f);
            menuTxt.fontSize = 40;
            Anchor((RectTransform)menu.transform, new Vector2(1, 0.5f), new Vector2(1, 0.5f), new Vector2(-260, -50), new Vector2(-40, 50));
            menu.onClick.AddListener(() => { Sfx.Instance.Click(); Game.ShowMenu(); });

            hintText = Label("Hint", hud.transform, "", 40, TextAnchor.MiddleCenter);
            hintText.color = new Color(1, 1, 1, 0.85f);
            Anchor(hintText.rectTransform, new Vector2(0, 1), new Vector2(1, 1), new Vector2(40, -290), new Vector2(-40, -210));

            // Alt çubuk
            RectTransform bottom = Panel("Bottom", hud.transform, new Color(0, 0, 0, 0.25f));
            Anchor(bottom, new Vector2(0, 0), new Vector2(1, 0), new Vector2(0, 0), new Vector2(0, 220));
            Image undoImg;
            Text undoTxt;
            undoButton = MakeButton("Undo", bottom, "Geri al", out undoImg, out undoTxt);
            Anchor((RectTransform)undoButton.transform, new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(40, -70), new Vector2(330, 70));
            undoButton.onClick.AddListener(() => { Sfx.Instance.Click(); Game.Undo(); });

            hammerButton = MakeButton("Hammer", bottom, "Çekiç ×3", out hammerImage, out hammerText);
            Anchor((RectTransform)hammerButton.transform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(-165, -70), new Vector2(165, 70));
            hammerButton.onClick.AddListener(() => { Sfx.Instance.Click(); Game.ToggleHammer(); });

            Image restartImg;
            Text restartTxt;
            Button restart = MakeButton("Restart", bottom, "Yenile", out restartImg, out restartTxt);
            Anchor((RectTransform)restart.transform, new Vector2(1, 0.5f), new Vector2(1, 0.5f), new Vector2(-330, -70), new Vector2(-40, 70));
            restart.onClick.AddListener(() => { Sfx.Instance.Click(); Game.Restart(); });

            // Paneller
            winPanel = ResultPanel("Win", "Harika!", out winText, new[]
            {
                new ButtonSpec { Label = "Sonraki bölüm", OnClick = () => Game.NextLevel() },
                new ButtonSpec { Label = "Menü", OnClick = () => Game.ShowMenu(), Secondary = true }
            });
            Text loseSub;
            losePanel = ResultPanel("Lose", "Süre doldu", out loseSub, new[]
            {
                new ButtonSpec { Label = "Tekrar dene", OnClick = () => Game.Restart() },
                new ButtonSpec { Label = "+30 saniye", OnClick = () => Game.AddTime(30f), Secondary = true },
                new ButtonSpec { Label = "Menü", OnClick = () => Game.ShowMenu(), Secondary = true }
            });
            loseSub.text = "Sorun değil, bir daha dene.";
            winPanel.SetActive(false);
            losePanel.SetActive(false);
        }

        GameObject ResultPanel(string name, string title, out Text subtitle, ButtonSpec[] buttons)
        {
            RectTransform dim = Panel(name, Canvas.transform, new Color(0, 0, 0, 0.6f));
            Anchor(dim, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            float cardHalf = 230 + buttons.Length * 80;
            RectTransform card = Panel("Card", dim, Palette.UiPanel);
            Anchor(card, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(-440, -cardHalf), new Vector2(440, cardHalf));

            Text t = Label("Title", card, title, 90, TextAnchor.MiddleCenter);
            t.fontStyle = FontStyle.Bold;
            Anchor(t.rectTransform, new Vector2(0, 1), new Vector2(1, 1), new Vector2(20, -200), new Vector2(-20, -40));
            subtitle = Label("Subtitle", card, "", 44, TextAnchor.MiddleCenter);
            Anchor(subtitle.rectTransform, new Vector2(0, 1), new Vector2(1, 1), new Vector2(20, -300), new Vector2(-20, -200));

            for (int i = 0; i < buttons.Length; i++)
            {
                ButtonSpec spec = buttons[i];
                Image img;
                Text txt;
                Button b = MakeButton("Button" + i, card, spec.Label, out img, out txt);
                if (spec.Secondary) img.color = new Color(0.35f, 0.38f, 0.5f);
                float bottomY = 50 + (buttons.Length - 1 - i) * 160;
                Anchor((RectTransform)b.transform, new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(-330, bottomY), new Vector2(330, bottomY + 140));
                Action onClick = spec.OnClick;
                b.onClick.AddListener(() => { Sfx.Instance.Click(); onClick(); });
            }
            return dim.gameObject;
        }

        // --- ortak yapı taşları (menü de kullanır) ---------------------------------------

        public static RectTransform Panel(string name, Transform parent, Color color)
        {
            GameObject go = new GameObject(name);
            go.transform.SetParent(parent, false);
            Image img = go.AddComponent<Image>();
            img.color = color;
            img.raycastTarget = color.a > 0.3f;
            return (RectTransform)go.transform;
        }

        public static Text Label(string name, Transform parent, string text, int size, TextAnchor anchor)
        {
            GameObject go = new GameObject(name);
            go.transform.SetParent(parent, false);
            Text t = go.AddComponent<Text>();
            t.font = Palette.Font;
            t.fontSize = size;
            t.text = text;
            t.alignment = anchor;
            t.color = Palette.UiText;
            t.raycastTarget = false;
            t.horizontalOverflow = HorizontalWrapMode.Wrap;
            t.verticalOverflow = VerticalWrapMode.Overflow;
            return t;
        }

        public static Button MakeButton(string name, Transform parent, string label, out Image image, out Text text)
        {
            GameObject go = new GameObject(name);
            go.transform.SetParent(parent, false);
            image = go.AddComponent<Image>();
            image.color = Palette.UiButton;
            Button b = go.AddComponent<Button>();
            b.targetGraphic = image;
            ColorBlock cb = b.colors;
            cb.pressedColor = new Color(0.8f, 0.8f, 0.8f);
            cb.disabledColor = new Color(1f, 1f, 1f, 0.35f);
            b.colors = cb;
            text = Label("Label", go.transform, label, 48, TextAnchor.MiddleCenter);
            text.fontStyle = FontStyle.Bold;
            Anchor(text.rectTransform, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            return b;
        }

        public static void Anchor(RectTransform rt, Vector2 min, Vector2 max, Vector2 offsetMin, Vector2 offsetMax)
        {
            rt.anchorMin = min;
            rt.anchorMax = max;
            rt.offsetMin = offsetMin;
            rt.offsetMax = offsetMax;
        }
    }
}
