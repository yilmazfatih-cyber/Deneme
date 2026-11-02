using UnityEngine;
using UnityEngine.UI;

namespace RoyalMatch
{
    /// <summary>Ana ekran: can/altın/yıldız, Kral, seviye düğmesi, şato ve mağaza.</summary>
    public class MapScreen : MonoBehaviour
    {
        private Text livesText, timerText, coinsText, starsText;
        private float tick;

        public static MapScreen Build(RectTransform parent)
        {
            var root = Ui.Node(parent, "Map");
            Ui.Stretch(root);
            var ms = root.gameObject.AddComponent<MapScreen>();
            var d = Save.Data;

            var bg = Ui.Img(root, Art.Castle(), Color.white, Vector2.zero, Vector2.zero, null, false, "Bg");
            Ui.Stretch(bg.rectTransform); bg.preserveAspect = false;

            // Üst şerit
            ms.livesText = Ui.Pill(root, Art.Heart(), d.lives.ToString(), new Vector2(30f, -40f), new Vector2(300f, 90f), new Vector2(0f, 1f));
            ms.timerText = Ui.Txt(ms.livesText.transform.parent, "", 28, Art.Hex("#FFE37A"), new Vector2(0f, -36f), new Vector2(300f, 36f), new Vector2(0.5f, 0f));
            ms.coinsText = Ui.Pill(root, Art.Coin(), d.coins.ToString(), new Vector2(0f, -40f), new Vector2(300f, 90f), new Vector2(0.5f, 1f));
            var coinsPill = ms.coinsText.transform.parent.gameObject;
            var coinBtn = coinsPill.AddComponent<Button>(); coinBtn.onClick.AddListener(() => ShopPopup.Show(root));
            Ui.Img(coinsPill.transform, Art.Plus(), Art.Hex("#4CC94A"), new Vector2(40f, 40f), new Vector2(-16f, 0f), new Vector2(1f, 0.5f));
            ms.starsText = Ui.Pill(root, Art.StarIcon(), d.stars.ToString(), new Vector2(-30f, -40f), new Vector2(300f, 90f), new Vector2(1f, 1f));

            // Kral ve konuşma
            Ui.Img(root, Art.King(), Color.white, new Vector2(520f, 520f), new Vector2(0f, 140f));
            var bubble = Ui.Panel(root, Color.white, new Vector2(620f, 130f), new Vector2(0f, 460f));
            Ui.Txt(bubble.rectTransform, Greeting(d), 38, Art.Hex("#2B1B10"), Vector2.zero, new Vector2(580f, 120f), null, TextAnchor.MiddleCenter, false);

            // Oda ilerlemesi
            var room = Rooms.Get(d.roomIndex);
            int done = 0; for (int i = 0; i < room.tasks.Length; i++) if (Rooms.Choice(i) >= 0) done++;
            var roomPanel = Ui.Panel(root, new Color(0.08f, 0.1f, 0.25f, 0.75f), new Vector2(700f, 100f), new Vector2(0f, -200f));
            Ui.Img(roomPanel.rectTransform, Art.Home(), Color.white, new Vector2(60f, 60f), new Vector2(50f, 0f), new Vector2(0f, 0.5f));
            Ui.Txt(roomPanel.rectTransform, room.name + "  " + done + "/" + room.tasks.Length, 36, Color.white, new Vector2(20f, 0f), new Vector2(560f, 90f));
            var rb = roomPanel.gameObject.AddComponent<Button>(); rb.onClick.AddListener(() => GameManager.I.ShowRooms());

            // Seviye düğmesi
            LevelData lv = LevelGenerator.Generate(d.level);
            Color btnCol = lv.difficulty == Difficulty.SuperHard ? Art.Hex("#8E1C1C") : lv.difficulty == Difficulty.Hard ? Art.Hex("#A64BE0") : Art.GreenBtn;
            if (lv.difficulty != Difficulty.Normal)
                Ui.Txt(root, lv.difficulty == Difficulty.Hard ? "ZOR SEVİYE" : "ÇOK ZOR SEVİYE", 34, Art.Hex("#FFE37A"), new Vector2(0f, -330f), new Vector2(500f, 50f));
            Ui.Btn(root, "SEVİYE " + d.level, btnCol, new Vector2(560f, 170f), new Vector2(0f, -450f), () => PreLevelPopup.Show(root), null, 64);
            if (d.streak >= 1)
                Ui.Txt(root, "Kazanma serisi: " + d.streak + " — ücretsiz güçlendirici!", 30, Art.Hex("#FFE37A"), new Vector2(0f, -560f), new Vector2(800f, 50f));

            // Alt çubuk
            var bar = Ui.Panel(root, new Color(0.08f, 0.1f, 0.25f, 0.8f), new Vector2(1080f, 190f), new Vector2(0f, 0f), new Vector2(0.5f, 0f));
            Ui.IconBtn(bar.rectTransform, Art.Home(), Art.Hex("#2F6FD0"), 140f, new Vector2(-300f, 10f), () => GameManager.I.ShowRooms());
            Ui.Txt(bar.rectTransform, "Şato", 30, Color.white, new Vector2(-300f, -70f), new Vector2(200f, 40f));
            Ui.IconBtn(bar.rectTransform, Art.Coin(), Art.Hex("#B9831A"), 140f, new Vector2(0f, 10f), () => ShopPopup.Show(root), null, 0.75f);
            Ui.Txt(bar.rectTransform, "Mağaza", 30, Color.white, new Vector2(0f, -70f), new Vector2(200f, 40f));
            Ui.IconBtn(bar.rectTransform, Art.Gear(), Art.Hex("#5C6676"), 140f, new Vector2(300f, 10f), () => SettingsPopup.Show(root));
            Ui.Txt(bar.rectTransform, "Ayarlar", 30, Color.white, new Vector2(300f, -70f), new Vector2(200f, 40f));
            return ms;
        }

        private static string Greeting(SaveData d)
        {
            if (d.level == 1) return "Hoş geldin! Şatomu birlikte onaralım.";
            if (d.stars > 0) return "Yıldızların var, şatoya bir şey ekleyelim!";
            if (d.streak >= 2) return "Harika gidiyorsun, seri devam ediyor!";
            return "Seviye " + d.level + " seni bekliyor.";
        }

        private void Update()
        {
            tick += Time.unscaledDeltaTime;
            if (tick < 0.5f) return;
            tick = 0f;
            var d = Save.Data;
            Save.RefreshLives();
            if (livesText != null) livesText.text = d.lives.ToString();
            if (coinsText != null) coinsText.text = d.coins.ToString();
            if (starsText != null) starsText.text = d.stars.ToString();
            int s = Save.SecondsToNextLife();
            if (timerText != null) timerText.text = s > 0 ? Save.FormatTime(s) : "Dolu";
        }
    }

    /// <summary>Seviye öncesi pencere: hedefler, başlangıç güçlendiricileri, oyna.</summary>
    public static class PreLevelPopup
    {
        public static void Show(RectTransform parent)
        {
            var d = Save.Data;
            LevelData lv = LevelGenerator.Generate(d.level);
            Color ribbon = lv.difficulty == Difficulty.SuperHard ? Art.Hex("#8E1C1C") : lv.difficulty == Difficulty.Hard ? Art.Hex("#A64BE0") : Art.Hex("#2F6FD0");
            var p = Ui.Popup(parent, "SEVİYE " + d.level, new Vector2(860f, 1080f), ribbon);
            Ui.CloseButton(p);
            Ui.Txt(p, "Hedefler", 40, Art.Hex("#8B5A2B"), new Vector2(0f, 340f), new Vector2(600f, 60f), null, TextAnchor.MiddleCenter, false);
            int n = lv.goals.Count;
            for (int i = 0; i < n; i++)
            {
                float x = (i - (n - 1) * 0.5f) * 180f;
                Ui.Img(p, Ui.GoalIcon(lv.goals[i].type), Color.white, new Vector2(130f, 130f), new Vector2(x, 230f));
                Ui.Txt(p, lv.goals[i].count.ToString(), 44, Color.white, new Vector2(x + 50f, 180f), new Vector2(100f, 60f));
            }
            Ui.Txt(p, "Hamle: " + lv.moves, 36, Art.Hex("#2B1B10"), new Vector2(0f, 110f), new Vector2(600f, 50f), null, TextAnchor.MiddleCenter, false);

            Ui.Txt(p, "Başlangıç güçlendiricileri", 36, Art.Hex("#8B5A2B"), new Vector2(0f, 40f), new Vector2(700f, 50f), null, TextAnchor.MiddleCenter, false);
            var kinds = new[] { StartBooster.Rocket, StartBooster.Tnt, StartBooster.LightBall };
            var icons = new[] { Art.Rocket(RocketDir.Vertical), Art.Tnt(), Art.LightBall() };
            bool[] selected = new bool[3];
            bool[] free = new bool[3];
            for (int i = 0; i < 3; i++) if (d.streak >= i + 1) { free[i] = true; selected[i] = true; }
            Image[] frames = new Image[3];
            Text[] counts = new Text[3];
            for (int i = 0; i < 3; i++)
            {
                int idx = i;
                float x = (i - 1) * 220f;
                var slot = Ui.Node(p, "Start_" + kinds[i]);
                Ui.Place(slot, new Vector2(0.5f, 0.5f), new Vector2(x, -110f), new Vector2(190f, 190f));
                var bg = slot.gameObject.AddComponent<Image>(); bg.sprite = Art.RoundRect(); bg.type = Image.Type.Sliced;
                frames[i] = bg;
                Ui.Img(slot, icons[i], Color.white, new Vector2(130f, 130f), new Vector2(0f, 10f));
                var badge = Ui.Img(slot, Art.CircleUi(), Art.Hex("#4CC94A"), new Vector2(60f, 60f), new Vector2(70f, 70f));
                counts[i] = Ui.Txt(badge.rectTransform, "", 32, Color.white, Vector2.zero, new Vector2(60f, 60f));
                if (free[i]) Ui.Txt(slot, "Seri bonusu", 24, Art.Hex("#A64BE0"), new Vector2(0f, -78f), new Vector2(190f, 30f), null, TextAnchor.MiddleCenter, false);
                var b = slot.gameObject.AddComponent<Button>(); b.targetGraphic = bg;
                b.onClick.AddListener(() =>
                {
                    Sfx.Play(SfxKind.Click);
                    if (free[idx]) return;
                    if (!selected[idx] && Save.GetStart(kinds[idx]) <= 0)
                    {
                        if (Save.SpendCoins(Save.StartBoosterCost)) { Save.AddStart(kinds[idx], 1); Sfx.Play(SfxKind.Coin); }
                        else return;
                    }
                    selected[idx] = !selected[idx];
                    Refresh(frames, counts, kinds, selected, free);
                });
            }
            Refresh(frames, counts, kinds, selected, free);

            var play = Ui.Btn(p, "OYNA", Art.GreenBtn, new Vector2(480f, 140f), new Vector2(0f, -330f), () =>
            {
                Save.RefreshLives();
                if (d.lives <= 0)
                {
                    Ui.ClosePopup(p);
                    LivesPopup.Show(parent);
                    return;
                }
                var picks = new System.Collections.Generic.List<StartBooster>();
                for (int i = 0; i < 3; i++)
                    if (selected[i]) { picks.Add(kinds[i]); if (!free[i]) Save.AddStart(kinds[i], -1); }
                Save.SpendLife();
                GameManager.I.StartLevel(picks);
            }, null, 60);
            Ui.Img(play.transform, Art.Heart(), Color.white, new Vector2(64f, 64f), new Vector2(-150f, 4f));
            Ui.Txt(play.transform, "-1", 30, Color.white, new Vector2(-105f, -16f), new Vector2(60f, 30f));
            Ui.Txt(p, "Canların: " + d.lives, 30, Art.Hex("#8B5A2B"), new Vector2(0f, -430f), new Vector2(500f, 40f), null, TextAnchor.MiddleCenter, false);
        }

        private static void Refresh(Image[] frames, Text[] counts, StartBooster[] kinds, bool[] selected, bool[] free)
        {
            for (int i = 0; i < 3; i++)
            {
                frames[i].color = selected[i] ? Art.Hex("#FFE37A") : Art.Hex("#E6D5B0");
                int c = Save.GetStart(kinds[i]);
                counts[i].text = free[i] ? "1" : (c > 0 ? c.ToString() : "+");
                counts[i].transform.parent.GetComponent<Image>().color = free[i] ? Art.Hex("#A64BE0") : (c > 0 ? Art.Hex("#4CC94A") : Art.Hex("#E8403A"));
            }
        }
    }

    public static class LivesPopup
    {
        public static void Show(RectTransform parent)
        {
            var p = Ui.Popup(parent, "CANIN KALMADI", new Vector2(760f, 700f), Art.Hex("#E8403A"));
            Ui.CloseButton(p);
            Ui.Img(p, Art.HeartEmpty(), Color.white, new Vector2(220f, 220f), new Vector2(0f, 120f));
            Ui.Txt(p, "Sonraki can: " + Save.FormatTime(Save.SecondsToNextLife()), 40, Art.Hex("#2B1B10"), new Vector2(0f, -40f), new Vector2(600f, 60f), null, TextAnchor.MiddleCenter, false);
            Ui.Btn(p, "DOLDUR  " + Save.RefillLivesCost, Art.GreenBtn, new Vector2(460f, 120f), new Vector2(0f, -180f), () =>
            {
                if (Save.SpendCoins(Save.RefillLivesCost)) { Save.RefillLives(); Sfx.Play(SfxKind.Coin); Ui.ClosePopup(p); }
            }, null, 44);
            Ui.Img(p, Art.Coin(), Color.white, new Vector2(56f, 56f), new Vector2(-180f, -180f));
        }
    }

    public static class ShopPopup
    {
        public static void Show(RectTransform parent)
        {
            var p = Ui.Popup(parent, "MAĞAZA", new Vector2(900f, 1300f), Art.Hex("#B9831A"));
            Ui.CloseButton(p);
            var coinsText = Ui.Pill(p, Art.Coin(), Save.Data.coins.ToString(), new Vector2(0f, 540f), new Vector2(300f, 80f));
            Ui.Txt(p, "Altınlar seviye kazanınca gelir. Gerçek para yok, reklam yok.", 28, Art.Hex("#8B5A2B"), new Vector2(0f, 470f), new Vector2(800f, 40f), null, TextAnchor.MiddleCenter, false);
            float y = 380f;
            Row(p, Art.Hammer(), "Çekiç", Save.BoosterCost, y, () => Save.AddInGame(InGameBooster.Hammer, 1), coinsText); y -= 130f;
            Row(p, Art.Arrow(), "Ok", Save.BoosterCost, y, () => Save.AddInGame(InGameBooster.Arrow, 1), coinsText); y -= 130f;
            Row(p, Art.Cannon(), "Top", Save.BoosterCost, y, () => Save.AddInGame(InGameBooster.Cannon, 1), coinsText); y -= 130f;
            Row(p, Art.JesterHat(), "Soytarı Şapkası", Save.BoosterCost, y, () => Save.AddInGame(InGameBooster.JesterHat, 1), coinsText); y -= 130f;
            Row(p, Art.Rocket(RocketDir.Vertical), "Roket", Save.StartBoosterCost, y, () => Save.AddStart(StartBooster.Rocket, 1), coinsText); y -= 130f;
            Row(p, Art.Tnt(), "TNT", Save.StartBoosterCost, y, () => Save.AddStart(StartBooster.Tnt, 1), coinsText); y -= 130f;
            Row(p, Art.LightBall(), "Işık Topu", Save.StartBoosterCost, y, () => Save.AddStart(StartBooster.LightBall, 1), coinsText); y -= 130f;
            Row(p, Art.Heart(), "Canları doldur", Save.RefillLivesCost, y, () => Save.RefillLives(), coinsText);
        }

        private static void Row(RectTransform p, Sprite icon, string name, int cost, float y, System.Action buy, Text coinsText)
        {
            var row = Ui.Panel(p, Art.Hex("#FFF3D6"), new Vector2(780f, 110f), new Vector2(0f, y), null, true);
            Ui.Img(row.rectTransform, icon, Color.white, new Vector2(90f, 90f), new Vector2(20f, 0f), new Vector2(0f, 0.5f));
            Ui.Txt(row.rectTransform, name, 36, Art.Hex("#2B1B10"), new Vector2(130f, 0f), new Vector2(360f, 100f), new Vector2(0f, 0.5f), TextAnchor.MiddleLeft, false);
            var b = Ui.Btn(row.rectTransform, cost.ToString(), Art.GreenBtn, new Vector2(220f, 80f), new Vector2(-20f, 0f), () =>
            {
                if (Save.SpendCoins(cost)) { buy(); Sfx.Play(SfxKind.Coin); coinsText.text = Save.Data.coins.ToString(); }
                else Sfx.Play(SfxKind.Invalid);
            }, new Vector2(1f, 0.5f), 36);
            Ui.Img(b.transform, Art.Coin(), Color.white, new Vector2(44f, 44f), new Vector2(-80f, 4f));
        }
    }

    public static class SettingsPopup
    {
        public static void Show(RectTransform parent)
        {
            var p = Ui.Popup(parent, "AYARLAR", new Vector2(760f, 760f), Art.Hex("#5C6676"));
            Ui.CloseButton(p);
            Text label = null;
            var b = Ui.Btn(p, Save.Data.sound ? "Ses: Açık" : "Ses: Kapalı", Art.BlueBtn, new Vector2(460f, 110f), new Vector2(0f, 120f), () =>
            {
                Save.Data.sound = !Save.Data.sound; Save.Store();
                if (label != null) label.text = Save.Data.sound ? "Ses: Açık" : "Ses: Kapalı";
            }, null, 40);
            label = b.GetComponentInChildren<Text>();
            Ui.Txt(p, "Sürüm 1.0 — Unity ile yapıldı.\nTüm görseller ve sesler kodla üretilir.", 28, Art.Hex("#8B5A2B"), new Vector2(0f, -10f), new Vector2(640f, 80f), null, TextAnchor.MiddleCenter, false);
            bool armed = false;
            Text resetLabel = null;
            var rb = Ui.Btn(p, "İlerlemeyi sıfırla", Art.RedBtn, new Vector2(460f, 100f), new Vector2(0f, -150f), () =>
            {
                if (!armed) { armed = true; if (resetLabel != null) resetLabel.text = "Emin misin? Tekrar dokun"; return; }
                Save.Reset();
                GameManager.I.ShowMap();
            }, null, 36);
            resetLabel = rb.GetComponentInChildren<Text>();
        }
    }
}
