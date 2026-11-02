using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace RoyalMatch
{
    /// <summary>Oyun ekranı arayüzü: hamle, hedefler, güçlendirici çubuğu, pencereler.</summary>
    public class HudScreen : MonoBehaviour, IBoardListener
    {
        private BoardController board;
        private LevelData level;
        private Text movesText;
        private RectTransform movesPill;
        private readonly Dictionary<GoalType, Text> goalTexts = new Dictionary<GoalType, Text>();
        private readonly Dictionary<GoalType, Image> goalChecks = new Dictionary<GoalType, Image>();
        private readonly Dictionary<GoalType, RectTransform> goalIcons = new Dictionary<GoalType, RectTransform>();
        private readonly Dictionary<InGameBooster, Text> boosterCounts = new Dictionary<InGameBooster, Text>();
        private readonly Dictionary<InGameBooster, Image> boosterBg = new Dictionary<InGameBooster, Image>();
        private Text toast;
        private Text modeHint;
        private RectTransform popupLayer;
        private Coroutine toastRoutine;

        public static HudScreen Build(RectTransform parent, LevelData lv, BoardController board)
        {
            var root = Ui.Node(parent, "HUD");
            Ui.Stretch(root);
            var hud = root.gameObject.AddComponent<HudScreen>();
            hud.level = lv; hud.board = board;
            hud.BuildTop();
            hud.BuildBottom();
            hud.toast = Ui.Txt(root, "", 54, Color.white, new Vector2(0f, 420f), new Vector2(900f, 120f));
            hud.toast.gameObject.SetActive(false);
            hud.modeHint = Ui.Txt(root, "", 40, Art.Hex("#FFE37A"), new Vector2(0f, -600f), new Vector2(900f, 80f));
            hud.modeHint.gameObject.SetActive(false);
            hud.popupLayer = Ui.Node(root, "Popups"); Ui.Stretch(hud.popupLayer);
            if (lv.number == 1) hud.OnMessage("Aynı renkten 3 taşı yan yana getir");
            return hud;
        }

        private void BuildTop()
        {
            var rt = (RectTransform)transform;
            // Hamle
            movesPill = Ui.Node(rt, "Moves");
            Ui.Place(movesPill, new Vector2(0f, 1f), new Vector2(30f, -40f), new Vector2(190f, 190f));
            var mp = movesPill.gameObject.AddComponent<Image>(); mp.sprite = Art.RoundRect(); mp.type = Image.Type.Sliced; mp.color = Art.Hex("#F7E7C6");
            Ui.Img(movesPill, Art.RoundRectOutline(), Art.Hex("#8B5A2B"), new Vector2(190f, 190f), Vector2.zero, null, true);
            Ui.Txt(movesPill, "HAMLE", 28, Art.Hex("#8B5A2B"), new Vector2(0f, 60f), new Vector2(180f, 40f), null, TextAnchor.MiddleCenter, false);
            movesText = Ui.Txt(movesPill, "0", 84, Art.Hex("#2B1B10"), new Vector2(0f, -14f), new Vector2(180f, 110f), null, TextAnchor.MiddleCenter, false);

            // Hedefler
            var goalsPanel = Ui.Panel(rt, Art.Hex("#F7E7C6"), new Vector2(560f, 190f), new Vector2(0f, -40f), new Vector2(0.5f, 1f));
            Ui.Img(goalsPanel.rectTransform, Art.RoundRectOutline(), Art.Hex("#8B5A2B"), new Vector2(560f, 190f), Vector2.zero, null, true);
            Ui.Txt(goalsPanel.rectTransform, "HEDEF", 28, Art.Hex("#8B5A2B"), new Vector2(0f, 60f), new Vector2(300f, 40f), null, TextAnchor.MiddleCenter, false);
            int n = level.goals.Count;
            float step = Mathf.Min(150f, 520f / Mathf.Max(1, n));
            for (int i = 0; i < n; i++)
            {
                GoalType g = level.goals[i].type;
                float x = (i - (n - 1) * 0.5f) * step;
                var icon = Ui.Img(goalsPanel.rectTransform, Ui.GoalIcon(g), Color.white, new Vector2(96f, 96f), new Vector2(x - 10f, -16f));
                goalIcons[g] = icon.rectTransform;
                var t = Ui.Txt(goalsPanel.rectTransform, level.goals[i].count.ToString(), 40, Color.white, new Vector2(x + 44f, -46f), new Vector2(90f, 50f));
                goalTexts[g] = t;
                var ck = Ui.Img(goalsPanel.rectTransform, Art.Check(), Art.Hex("#4CC94A"), new Vector2(60f, 60f), new Vector2(x + 40f, -46f));
                ck.gameObject.SetActive(false);
                goalChecks[g] = ck;
            }

            // Duraklat
            Ui.IconBtn(rt, Art.Gear(), Art.Hex("#2F6FD0"), 130f, new Vector2(-40f, -60f), ShowPause, new Vector2(1f, 1f));

            // Zorluk şeridi
            if (level.difficulty != Difficulty.Normal)
            {
                var band = Ui.Img(rt, Art.Pill(), level.difficulty == Difficulty.Hard ? Art.Hex("#A64BE0") : Art.Hex("#8E1C1C"), new Vector2(360f, 56f), new Vector2(0f, -250f), new Vector2(0.5f, 1f), true);
                Ui.Txt(band.rectTransform, level.difficulty == Difficulty.Hard ? "ZOR SEVİYE" : "ÇOK ZOR SEVİYE", 30, Color.white, Vector2.zero, new Vector2(360f, 56f));
            }
        }

        private void BuildBottom()
        {
            var rt = (RectTransform)transform;
            var bar = Ui.Panel(rt, new Color(0.08f, 0.1f, 0.25f, 0.75f), new Vector2(900f, 200f), new Vector2(0f, 40f), new Vector2(0.5f, 0f));
            var items = new[] { InGameBooster.Hammer, InGameBooster.Arrow, InGameBooster.Cannon, InGameBooster.JesterHat };
            var icons = new[] { Art.Hammer(), Art.Arrow(), Art.Cannon(), Art.JesterHat() };
            for (int i = 0; i < items.Length; i++)
            {
                InGameBooster b = items[i];
                float x = (i - 1.5f) * 210f;
                var slot = Ui.Node(bar.rectTransform, "Booster_" + b);
                Ui.Place(slot, new Vector2(0.5f, 0.5f), new Vector2(x, 0f), new Vector2(170f, 170f));
                var bg = slot.gameObject.AddComponent<Image>(); bg.sprite = Art.RoundRect(); bg.type = Image.Type.Sliced; bg.color = Art.Hex("#F7E7C6");
                boosterBg[b] = bg;
                Ui.Img(slot, icons[i], Color.white, new Vector2(120f, 120f), new Vector2(0f, 8f));
                var badge = Ui.Img(slot, Art.CircleUi(), Art.Hex("#4CC94A"), new Vector2(60f, 60f), new Vector2(60f, 60f), null, false, "Badge");
                var count = Ui.Txt(badge.rectTransform, "0", 34, Color.white, Vector2.zero, new Vector2(60f, 60f));
                boosterCounts[b] = count;
                var btn = slot.gameObject.AddComponent<Button>();
                btn.targetGraphic = bg;
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
                if (badge != null) badge.color = c > 0 ? Art.Hex("#4CC94A") : Art.Hex("#E8403A");
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
            movesText.color = left <= 5 ? Art.Hex("#C8433A") : Art.Hex("#2B1B10");
            StartCoroutine(Punch(movesPill));
        }

        public void OnGoal(GoalType g, int remaining, Vector3 worldPos)
        {
            Text t;
            if (!goalTexts.TryGetValue(g, out t)) return;
            t.text = Mathf.Max(0, remaining).ToString();
            bool done = remaining <= 0;
            t.gameObject.SetActive(!done);
            goalChecks[g].gameObject.SetActive(done);
            if (worldPos != Vector3.zero) StartCoroutine(Punch(goalIcons[g]));
        }

        public void OnBoosterModeChanged(InGameBooster? active)
        {
            foreach (var kv in boosterBg) kv.Value.color = active == kv.Key ? Art.Hex("#FFE37A") : Art.Hex("#F7E7C6");
            modeHint.gameObject.SetActive(active != null && active != InGameBooster.JesterHat);
            if (active == InGameBooster.Hammer) modeHint.text = "Kırmak için bir taşa dokun";
            else if (active == InGameBooster.Arrow) modeHint.text = "Temizlemek için bir satıra dokun";
            else if (active == InGameBooster.Cannon) modeHint.text = "Temizlemek için bir sütuna dokun";
            RefreshBoosterCounts();
        }

        public void OnWon(int bonusMoves) { GameManager.I.OnLevelWon(bonusMoves); }

        public void OnLost() { ShowLose(); }

        public void OnMessage(string text)
        {
            if (toastRoutine != null) StopCoroutine(toastRoutine);
            toastRoutine = StartCoroutine(Toast(text));
        }

        private IEnumerator Toast(string text)
        {
            toast.text = text; toast.gameObject.SetActive(true);
            toast.transform.localScale = Vector3.one * 0.6f;
            yield return Tween.Scale(toast.transform, Vector3.one, 0.2f, Ease.OutBack);
            yield return Tween.Delay(1.6f);
            toast.gameObject.SetActive(false);
        }

        private IEnumerator Punch(Transform tr)
        {
            if (tr == null) yield break;
            yield return Tween.Scale(tr, Vector3.one * 1.15f, 0.08f);
            yield return Tween.Scale(tr, Vector3.one, 0.12f);
        }

        // ---------------- Pencereler ----------------
        public void ShowWin(int coins)
        {
            board.InputEnabled = false;
            var p = Ui.Popup(popupLayer, "SEVİYE TAMAMLANDI", new Vector2(820f, 900f), Art.Hex("#4CC94A"));
            Ui.Img(p, Art.StarIcon(), Color.white, new Vector2(260f, 260f), new Vector2(0f, 190f));
            Ui.Txt(p, "Seviye " + level.number, 56, Art.Hex("#2B1B10"), new Vector2(0f, 20f), new Vector2(700f, 80f), null, TextAnchor.MiddleCenter, false);
            Ui.Txt(p, "+1", 60, Art.Hex("#B9831A"), new Vector2(0f, -70f), new Vector2(300f, 80f), null, TextAnchor.MiddleCenter, false);
            Ui.Img(p, Art.StarIcon(), Color.white, new Vector2(70f, 70f), new Vector2(90f, -70f));
            Ui.Img(p, Art.Coin(), Color.white, new Vector2(80f, 80f), new Vector2(-120f, -170f));
            Ui.Txt(p, "+" + coins, 56, Art.Hex("#B9831A"), new Vector2(40f, -170f), new Vector2(300f, 80f), null, TextAnchor.MiddleCenter, false);
            if (Save.Data.streak >= 2) Ui.Txt(p, "Kazanma serisi: " + Save.Data.streak, 36, Art.Hex("#A64BE0"), new Vector2(0f, -260f), new Vector2(700f, 60f), null, TextAnchor.MiddleCenter, false);
            Ui.Btn(p, "DEVAM", Art.GreenBtn, new Vector2(460f, 130f), new Vector2(0f, -360f), () => GameManager.I.ShowMap());
            Sfx.Play(SfxKind.Star);
        }

        private void ShowLose()
        {
            board.InputEnabled = false;
            Sfx.Play(SfxKind.Lose);
            var p = Ui.Popup(popupLayer, "HAMLE BİTTİ!", new Vector2(820f, 960f), Art.Hex("#E8403A"));
            Ui.Img(p, Art.King(), Color.white, new Vector2(300f, 300f), new Vector2(0f, 180f));
            Ui.Txt(p, "Hedefe çok yakınsın! +5 hamle ile devam et.", 40, Art.Hex("#2B1B10"), new Vector2(0f, -40f), new Vector2(700f, 100f), null, TextAnchor.MiddleCenter, false);
            Ui.Img(p, Art.Coin(), Color.white, new Vector2(70f, 70f), new Vector2(-150f, -170f));
            Ui.Txt(p, Save.ContinueCost.ToString(), 50, Art.Hex("#B9831A"), new Vector2(-20f, -170f), new Vector2(300f, 80f), null, TextAnchor.MiddleCenter, false);
            Ui.Txt(p, "Altının: " + Save.Data.coins, 34, Art.Hex("#8B5A2B"), new Vector2(0f, -230f), new Vector2(700f, 60f), null, TextAnchor.MiddleCenter, false);
            Ui.Btn(p, "DEVAM ET (+5)", Art.GreenBtn, new Vector2(500f, 130f), new Vector2(0f, -320f), () =>
            {
                if (GameManager.I.TryContinue()) { Ui.ClosePopup(p); board.InputEnabled = true; Sfx.Play(SfxKind.Coin); }
                else OnMessage("Yeterli altın yok");
            });
            Ui.Btn(p, "Vazgeç", Art.Hex("#8A94A6"), new Vector2(300f, 90f), new Vector2(0f, -430f), () => GameManager.I.OnLevelLostFinal(), null, 36);
        }

        private void ShowPause()
        {
            if (board == null) return;
            board.InputEnabled = false;
            var p = Ui.Popup(popupLayer, "DURAKLATILDI", new Vector2(760f, 760f));
            Ui.Txt(p, "Seviye " + level.number, 48, Art.Hex("#2B1B10"), new Vector2(0f, 180f), new Vector2(600f, 80f), null, TextAnchor.MiddleCenter, false);
            Text soundLabel = null;
            Button soundBtn = Ui.Btn(p, Save.Data.sound ? "Ses: Açık" : "Ses: Kapalı", Art.BlueBtn, new Vector2(460f, 110f), new Vector2(0f, 60f), () =>
            {
                Save.Data.sound = !Save.Data.sound; Save.Store();
                if (soundLabel != null) soundLabel.text = Save.Data.sound ? "Ses: Açık" : "Ses: Kapalı";
            }, null, 40);
            soundLabel = soundBtn.GetComponentInChildren<Text>();
            Ui.Btn(p, "DEVAM", Art.GreenBtn, new Vector2(460f, 120f), new Vector2(0f, -80f), () =>
            {
                Ui.ClosePopup(p); board.InputEnabled = true;
            });
            Ui.Btn(p, "Seviyeden çık", Art.RedBtn, new Vector2(460f, 100f), new Vector2(0f, -220f), () => GameManager.I.QuitLevel(), null, 36);
        }
    }
}
