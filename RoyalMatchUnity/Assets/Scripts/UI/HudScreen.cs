using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace RoyalMatch
{
    /// <summary>Oyun ekranı arayüzü: ahşap üst pano (hamle + hedefler), güçlendirici tepsisi, pencereler ve uçan hedef simgeleri.</summary>
    public class HudScreen : MonoBehaviour, IBoardListener
    {
        private BoardController board;
        private LevelData level;
        private Text movesText;
        private RectTransform movesBox, topPanel, bottomPanel;
        private readonly Dictionary<GoalType, Text> goalTexts = new Dictionary<GoalType, Text>();
        private readonly Dictionary<GoalType, Image> goalChecks = new Dictionary<GoalType, Image>();
        private readonly Dictionary<GoalType, RectTransform> goalIcons = new Dictionary<GoalType, RectTransform>();
        private readonly Dictionary<GoalType, int> shown = new Dictionary<GoalType, int>();
        private readonly Dictionary<InGameBooster, Text> boosterCounts = new Dictionary<InGameBooster, Text>();
        private readonly Dictionary<InGameBooster, Image> boosterBg = new Dictionary<InGameBooster, Image>();
        private Text toast, modeHint;
        private RectTransform popupLayer, flyLayer;
        private Coroutine toastRoutine, lowMovesRoutine;
        private RectTransform Canvas { get { return GameManager.I.UiRoot; } }

        public static HudScreen Build(RectTransform parent, LevelData lv, BoardController board)
        {
            var root = Ui.Node(parent, "HUD");
            Ui.Stretch(root);
            var hud = root.gameObject.AddComponent<HudScreen>();
            hud.level = lv; hud.board = board;
            hud.BuildTop();
            hud.BuildBottom();
            hud.flyLayer = Ui.Node(root, "Fly"); Ui.Stretch(hud.flyLayer);
            hud.toast = Ui.Txt(root, "", 54, Color.white, new Vector2(0f, 380f), new Vector2(900f, 120f));
            hud.toast.gameObject.SetActive(false);
            hud.modeHint = Ui.Txt(root, "", 38, Art.Hex("#FFE37A"), new Vector2(0f, 290f), new Vector2(900f, 80f), new Vector2(0.5f, 0f));
            hud.modeHint.gameObject.SetActive(false);
            hud.popupLayer = Ui.Node(root, "Popups"); Ui.Stretch(hud.popupLayer);
            hud.StartCoroutine(hud.Intro());
            if (lv.number == 1) hud.OnMessage("Aynı renkten 3 taşı yan yana getir");
            return hud;
        }

        /// <summary>Üst pano yukarıdan, alt tepsi aşağıdan yaylanarak gelir.</summary>
        private IEnumerator Intro()
        {
            Vector2 top = topPanel.anchoredPosition, bottom = bottomPanel.anchoredPosition;
            Vector2 topFrom = top + new Vector2(0f, 300f), bottomFrom = bottom - new Vector2(0f, 300f);
            topPanel.anchoredPosition = topFrom;
            bottomPanel.anchoredPosition = bottomFrom;
            float t = 0f;
            while (t < 1f)
            {
                t += Time.deltaTime / 0.45f;
                float k = Ease.OutBack(Mathf.Clamp01(t));
                topPanel.anchoredPosition = Vector2.LerpUnclamped(topFrom, top, k);
                bottomPanel.anchoredPosition = Vector2.LerpUnclamped(bottomFrom, bottom, k);
                yield return null;
            }
        }

        private void BuildTop()
        {
            var rt = (RectTransform)transform;
            var panel = Ui.Wood(rt, new Vector2(1040f, 230f), new Vector2(0f, -36f), new Vector2(0.5f, 1f), "Top");
            topPanel = panel.rectTransform;

            // Hamle kutusu
            var box = Ui.Glass(topPanel, new Vector2(200f, 172f), new Vector2(40f, 0f), new Vector2(0f, 0.5f), "Moves");
            movesBox = box.rectTransform;
            Ui.Txt(movesBox, "HAMLE", 26, Art.Hex("#FFE37A"), new Vector2(0f, 56f), new Vector2(190f, 36f));
            movesText = Ui.Txt(movesBox, "0", 92, Color.white, new Vector2(0f, -12f), new Vector2(190f, 110f));

            // Hedefler
            Ui.Txt(topPanel, "HEDEFLER", 26, Art.Hex("#8B5A2B"), new Vector2(60f, 66f), new Vector2(400f, 36f), null, TextAnchor.MiddleCenter, false);
            int n = level.goals.Count;
            float step = Mathf.Min(150f, 560f / Mathf.Max(1, n));
            for (int i = 0; i < n; i++)
            {
                GoalType g = level.goals[i].type;
                float x = 60f + (i - (n - 1) * 0.5f) * step;
                var icon = Ui.Img(topPanel, Ui.GoalIcon(g), Color.white, new Vector2(112f, 112f), new Vector2(x, -14f));
                goalIcons[g] = icon.rectTransform;
                goalTexts[g] = Ui.Badge(topPanel, level.goals[i].count.ToString(), Art.NavyUi, 58f, new Vector2(x + 44f, -54f));
                shown[g] = level.goals[i].count;
                var ck = Ui.Img(topPanel, Art.Check(), Art.Hex("#52C83C"), new Vector2(56f, 56f), new Vector2(x + 44f, -54f));
                ck.gameObject.SetActive(false);
                goalChecks[g] = ck;
            }

            Ui.IconBtn(topPanel, Art.Gear(), Art.Hex("#2F6FD0"), 120f, new Vector2(-40f, 0f), ShowPause, new Vector2(1f, 0.5f));

            if (level.difficulty != Difficulty.Normal)
                Ui.RibbonTitle(rt, level.difficulty == Difficulty.Hard ? "ZOR SEVİYE" : "ÇOK ZOR SEVİYE",
                    level.difficulty == Difficulty.Hard ? Art.Hex("#A94BE6") : Art.Hex("#8E1C1C"), new Vector2(0f, -300f), 420f, 30);
        }

        private void BuildBottom()
        {
            var rt = (RectTransform)transform;
            var bar = Ui.Wood(rt, new Vector2(980f, 230f), new Vector2(0f, 36f), new Vector2(0.5f, 0f), "Bottom");
            bottomPanel = bar.rectTransform;
            var items = new[] { InGameBooster.Hammer, InGameBooster.Arrow, InGameBooster.Cannon, InGameBooster.JesterHat };
            var icons = new[] { Art.Hammer(), Art.Arrow(), Art.Cannon(), Art.JesterHat() };
            for (int i = 0; i < items.Length; i++)
            {
                InGameBooster b = items[i];
                float x = (i - 1.5f) * 215f;
                var slot = Ui.Node(bottomPanel, "Booster_" + b);
                Ui.Place(slot, new Vector2(0.5f, 0.5f), new Vector2(x, 0f), new Vector2(180f, 180f));
                var bg = slot.gameObject.AddComponent<Image>(); bg.sprite = Art.RoundRect(); bg.type = Image.Type.Sliced; bg.color = Art.Hex("#FFF4DF");
                boosterBg[b] = bg;
                Ui.Img(slot, icons[i], Color.white, new Vector2(124f, 124f), new Vector2(0f, 8f));
                boosterCounts[b] = Ui.Badge(slot, "0", Art.Hex("#52C83C"), 60f, new Vector2(66f, -66f));
                var btn = slot.gameObject.AddComponent<Button>();
                btn.targetGraphic = bg;
                slot.gameObject.AddComponent<PressScale>();
                btn.onClick.AddListener(() => OnBoosterClicked(b));
            }
            RefreshBoosterCounts();
        }

        private void RefreshBoosterCounts()
        {
            foreach (var kv in boosterCounts)
            {
                int c = Save.GetInGame(kv.Key);
                kv.Value.text = c > 0 ? c.ToString() : "+";
                var badge = kv.Value.transform.parent.GetComponent<Image>();
                if (badge != null) badge.color = c > 0 ? Art.Hex("#52C83C") : Art.Hex("#E8403A");
            }
        }

        private void OnBoosterClicked(InGameBooster b)
        {
            if (board == null || board.Busy) return;
            Sfx.Play(SfxKind.Click);
            if (Save.GetInGame(b) <= 0)
            {
                if (Save.SpendCoins(Save.BoosterCost)) { Save.AddInGame(b, 1); Sfx.Play(SfxKind.Coin); RefreshBoosterCounts(); OnMessage(BoosterName(b) + " alındı"); }
                else OnMessage("Yeterli altın yok (" + Save.BoosterCost + ")");
                return;
            }
            board.BeginBoosterMode(b);
        }

        public static string BoosterName(InGameBooster b)
        {
            switch (b) { case InGameBooster.Hammer: return "Çekiç"; case InGameBooster.Arrow: return "Ok"; case InGameBooster.Cannon: return "Top"; default: return "Soytarı Şapkası"; }
        }

        // ---------------- IBoardListener ----------------
        public void OnMoves(int left)
        {
            movesText.text = left.ToString();
            movesText.color = left <= 5 ? Art.Hex("#FF7B6B") : Color.white;
            StartCoroutine(Ui.Punch(movesBox, 1.12f, 0.2f));
            if (left <= 5 && lowMovesRoutine == null) lowMovesRoutine = StartCoroutine(LowMoves());
        }

        private IEnumerator LowMoves()
        {
            var img = movesBox.GetComponent<Image>();
            float t = 0f;
            while (true)
            {
                t += Time.deltaTime * 4f;
                if (img != null) img.color = Color.Lerp(Color.white, new Color(1f, 0.55f, 0.5f, 1f), (Mathf.Sin(t) + 1f) * 0.5f);
                yield return null;
            }
        }

        /// <summary>Hedef ilerlemesi: simge tahtadan panoya uçar, varınca sayaç düşer.</summary>
        public void OnGoal(GoalType g, int remaining, Vector3 worldPos)
        {
            if (!goalTexts.ContainsKey(g)) return;
            if (worldPos == Vector3.zero) { ApplyGoal(g, remaining); return; }
            Vector2 from = Ui.WorldToCanvas(Canvas, GameManager.I.Cam, worldPos);
            Vector2 to = Ui.CanvasLocal(Canvas, goalIcons[g]);
            StartCoroutine(Ui.FlyIcon(flyLayer, Ui.GoalIcon(g), from, to, 90f, 0.45f, () => ApplyGoal(g, remaining)));
        }

        private void ApplyGoal(GoalType g, int remaining)
        {
            int cur; shown.TryGetValue(g, out cur);
            int v = Mathf.Min(cur, Mathf.Max(0, remaining));
            shown[g] = v;
            goalTexts[g].text = v.ToString();
            bool done = v <= 0;
            goalTexts[g].transform.parent.gameObject.SetActive(!done);
            goalChecks[g].gameObject.SetActive(done);
            StartCoroutine(Ui.Punch(goalIcons[g], 1.25f, 0.25f));
            if (done) StartCoroutine(Ui.Punch(goalChecks[g].transform, 1.5f, 0.35f));
        }

        public void OnBoosterModeChanged(InGameBooster? active)
        {
            foreach (var kv in boosterBg)
            {
                bool sel = active == kv.Key;
                kv.Value.color = sel ? Art.Hex("#FFE37A") : Art.Hex("#FFF4DF");
                var pulse = kv.Value.GetComponent<Pulse>();
                if (sel && pulse == null) kv.Value.gameObject.AddComponent<Pulse>();
                if (!sel && pulse != null) { Destroy(pulse); kv.Value.transform.localScale = Vector3.one; }
            }
            modeHint.gameObject.SetActive(active != null && active != InGameBooster.JesterHat);
            if (active == InGameBooster.Hammer) modeHint.text = "Kırmak için bir taşa dokun";
            else if (active == InGameBooster.Arrow) modeHint.text = "Temizlemek için bir satıra dokun";
            else if (active == InGameBooster.Cannon) modeHint.text = "Temizlemek için bir sütuna dokun";
            RefreshBoosterCounts();
        }

        public void OnWon(int bonusMoves) { GameManager.I.OnLevelWon(bonusMoves); }
        public void OnLost() { ShowLose(); }
        public void OnFlash() { StartCoroutine(Ui.Flash(popupLayer, 0.45f, 0.25f)); }

        public void OnMessage(string text)
        {
            if (toastRoutine != null) StopCoroutine(toastRoutine);
            toastRoutine = StartCoroutine(Toast(text));
        }

        private IEnumerator Toast(string text)
        {
            toast.text = text; toast.gameObject.SetActive(true);
            toast.transform.localScale = Vector3.one * 0.6f;
            yield return Tween.Scale(toast.transform, Vector3.one, 0.22f, Ease.OutBack);
            yield return Tween.Delay(1.5f);
            yield return Tween.Scale(toast.transform, Vector3.zero, 0.15f, Ease.InCubic);
            toast.gameObject.SetActive(false);
        }

        // ---------------- Pencereler ----------------
        public void ShowWin(int coins)
        {
            board.InputEnabled = false;
            StartCoroutine(WinSequence(coins));
        }

        /// <summary>Kazanma sahnesi: konfeti, sırayla beliren yıldızlar, artan altın, yaylanan düğme.</summary>
        private IEnumerator WinSequence(int coins)
        {
            StartCoroutine(Ui.Confetti(popupLayer));
            var p = Ui.Popup(popupLayer, "SEVİYE TAMAMLANDI!", new Vector2(860f, 980f), Art.Hex("#52C83C"));
            var stars = new RectTransform[3];
            for (int i = 0; i < 3; i++)
            {
                float dx = (i - 1) * 190f; float size = i == 1 ? 230f : 180f;
                Ui.Img(p, Art.StarEmpty(), Color.white, new Vector2(size, size), new Vector2(dx, 250f + (i == 1 ? 40f : 0f)));
                var star = Ui.Img(p, Art.StarIcon(), Color.white, new Vector2(size, size), new Vector2(dx, 250f + (i == 1 ? 40f : 0f)));
                star.transform.localScale = Vector3.zero;
                stars[i] = star.rectTransform;
            }
            Ui.Img(p, Art.King(), Color.white, new Vector2(260f, 260f), new Vector2(-260f, -70f)).gameObject.AddComponent<Bob>();
            Ui.Txt(p, "Seviye " + level.number, 56, Art.Hex("#2B1B10"), new Vector2(60f, 10f), new Vector2(500f, 80f), null, TextAnchor.MiddleCenter, false);
            Ui.Img(p, Art.Coin(), Color.white, new Vector2(80f, 80f), new Vector2(-20f, -90f));
            var coinText = Ui.Txt(p, "+0", 60, Art.Hex("#B9831A"), new Vector2(110f, -90f), new Vector2(240f, 80f), null, TextAnchor.MiddleCenter, false);
            Ui.Img(p, Art.StarIcon(), Color.white, new Vector2(80f, 80f), new Vector2(-20f, -180f));
            Ui.Txt(p, "+1", 60, Art.Hex("#B9831A"), new Vector2(110f, -180f), new Vector2(240f, 80f), null, TextAnchor.MiddleCenter, false);
            if (Save.Data.streak >= 2) Ui.Txt(p, "Kazanma serisi: " + Save.Data.streak, 34, Art.Hex("#A94BE6"), new Vector2(0f, -270f), new Vector2(700f, 60f), null, TextAnchor.MiddleCenter, false);
            var btn = Ui.Btn(p, "DEVAM", Art.GreenBtn, new Vector2(480f, 140f), new Vector2(0f, -380f), () => GameManager.I.ShowMap(), null, 60);
            btn.transform.localScale = Vector3.zero;
            yield return Tween.Delay(0.35f);
            for (int i = 0; i < 3; i++)
            {
                Sfx.Play(SfxKind.Star);
                StartCoroutine(Tween.Scale(stars[i], Vector3.one, 0.35f, Ease.OutBack));
                yield return Tween.Delay(0.22f);
            }
            Sfx.Play(SfxKind.Coin);
            yield return Ui.CountUp(coinText, 0, coins, 0.8f, "+");
            yield return Tween.Scale(btn.transform, Vector3.one, 0.3f, Ease.OutBack);
            btn.gameObject.AddComponent<Pulse>().amp = 0.03f;
        }

        private void ShowLose()
        {
            board.InputEnabled = false;
            Sfx.Play(SfxKind.Lose);
            var p = Ui.Popup(popupLayer, "HAMLE BİTTİ!", new Vector2(840f, 1000f), Art.Hex("#E8403A"));
            Ui.Img(p, Art.King(), Color.white, new Vector2(300f, 300f), new Vector2(0f, 200f)).gameObject.AddComponent<Bob>();
            Ui.Txt(p, "Hedefe çok yakınsın!\n+5 hamle ile devam et.", 40, Art.Hex("#2B1B10"), new Vector2(0f, -20f), new Vector2(700f, 120f), null, TextAnchor.MiddleCenter, false);
            var glass = Ui.Glass(p, new Vector2(360f, 90f), new Vector2(0f, -150f));
            Ui.Img(glass.rectTransform, Art.Coin(), Color.white, new Vector2(72f, 72f), new Vector2(-110f, 0f));
            Ui.Txt(glass.rectTransform, Save.ContinueCost.ToString(), 46, Color.white, new Vector2(30f, 0f), new Vector2(200f, 80f));
            Ui.Txt(p, "Altının: " + Save.Data.coins, 32, Art.Hex("#8B5A2B"), new Vector2(0f, -220f), new Vector2(700f, 50f), null, TextAnchor.MiddleCenter, false);
            Ui.Btn(p, "DEVAM ET (+5)", Art.GreenBtn, new Vector2(520f, 140f), new Vector2(0f, -320f), () =>
            {
                if (GameManager.I.TryContinue()) { Ui.ClosePopup(p); board.InputEnabled = true; Sfx.Play(SfxKind.Coin); }
                else OnMessage("Yeterli altın yok");
            }, null, 50);
            Ui.Btn(p, "Vazgeç", Art.Hex("#8A94A6"), new Vector2(300f, 90f), new Vector2(0f, -440f), () => GameManager.I.OnLevelLostFinal(), null, 36);
        }

        private void ShowPause()
        {
            if (board == null) return;
            board.InputEnabled = false;
            var p = Ui.Popup(popupLayer, "DURAKLATILDI", new Vector2(760f, 780f));
            Ui.Txt(p, "Seviye " + level.number, 48, Art.Hex("#2B1B10"), new Vector2(0f, 180f), new Vector2(600f, 80f), null, TextAnchor.MiddleCenter, false);
            Text soundLabel = null;
            Button soundBtn = Ui.Btn(p, Save.Data.sound ? "Ses: Açık" : "Ses: Kapalı", Art.BlueBtn, new Vector2(460f, 110f), new Vector2(0f, 60f), () =>
            {
                Save.Data.sound = !Save.Data.sound; Save.Store();
                if (soundLabel != null) soundLabel.text = Save.Data.sound ? "Ses: Açık" : "Ses: Kapalı";
            }, null, 40);
            soundLabel = soundBtn.GetComponentInChildren<Text>();
            Ui.Btn(p, "DEVAM", Art.GreenBtn, new Vector2(460f, 120f), new Vector2(0f, -80f), () => { Ui.ClosePopup(p); board.InputEnabled = true; });
            Ui.Btn(p, "Seviyeden çık", Art.RedBtn, new Vector2(460f, 100f), new Vector2(0f, -220f), () => GameManager.I.QuitLevel(), null, 36);
        }
    }
}
