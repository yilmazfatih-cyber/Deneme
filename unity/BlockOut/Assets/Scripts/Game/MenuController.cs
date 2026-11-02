using BlockOut.Core;
using UnityEngine;
using UnityEngine.UI;

namespace BlockOut.Game
{
    /// <summary>Ana menü ve bölüm seçme ekranı; tamamen kodla kurulur.</summary>
    public class MenuController : MonoBehaviour
    {
        public GameManager Game;
        public UIController UI;

        const int LevelButtons = 24;
        const int Columns = 4;

        GameObject menuRoot;
        GameObject levelsRoot;
        Text playLabel;
        Text soundLabel;
        Text vibrationLabel;
        readonly Button[] levelButtons = new Button[LevelButtons];
        readonly Image[] levelImages = new Image[LevelButtons];

        public void Build()
        {
            Transform canvas = UI.Canvas.transform;
            BuildMainMenu(canvas);
            BuildLevelSelect(canvas);
            Hide();
        }

        public void Show()
        {
            RefreshLabels();
            menuRoot.SetActive(true);
            levelsRoot.SetActive(false);
            menuRoot.transform.SetAsLastSibling();
        }

        public void Hide()
        {
            menuRoot.SetActive(false);
            levelsRoot.SetActive(false);
        }

        void ShowLevels()
        {
            int unlocked = Game.UnlockedIndex;
            for (int i = 0; i < LevelButtons; i++)
            {
                bool open = i <= unlocked;
                levelButtons[i].interactable = open;
                levelImages[i].color = i == unlocked ? Palette.UiButtonActive : open ? Palette.Get(BlockColorUtil.All[i % BlockColorUtil.All.Length]) : new Color(0.3f, 0.32f, 0.42f);
            }
            menuRoot.SetActive(false);
            levelsRoot.SetActive(true);
            levelsRoot.transform.SetAsLastSibling();
        }

        void RefreshLabels()
        {
            playLabel.text = Game.UnlockedIndex == 0 ? "Oyna" : "Devam et · Bölüm " + (Game.UnlockedIndex + 1);
            soundLabel.text = "Ses: " + (Sfx.Instance.SoundOn ? "Açık" : "Kapalı");
            vibrationLabel.text = "Titreşim: " + (Sfx.Instance.VibrationOn ? "Açık" : "Kapalı");
        }

        // --- kurulum ---------------------------------------------------------------------

        void BuildMainMenu(Transform canvas)
        {
            RectTransform root = UIController.Panel("Menu", canvas, Palette.Background);
            UIController.Anchor(root, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            menuRoot = root.gameObject;

            // Süs: renkli bloklar
            BlockColor[] colors = BlockColorUtil.All;
            for (int i = 0; i < 6; i++)
            {
                RectTransform sq = UIController.Panel("Deco" + i, root, Palette.Get(colors[i]));
                float x = -420 + i * 150;
                float y = 420 + (i % 2 == 0 ? 0 : 36);
                UIController.Anchor(sq, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(x, y), new Vector2(x + 120, y + 120));
            }

            Text title = UIController.Label("Title", root, "BLOCK OUT", 150, TextAnchor.MiddleCenter);
            title.fontStyle = FontStyle.Bold;
            UIController.Anchor(title.rectTransform, new Vector2(0, 0.5f), new Vector2(1, 0.5f), new Vector2(20, 180), new Vector2(-20, 400));
            Text sub = UIController.Label("Subtitle", root, "Renkli kapı bulmacası", 48, TextAnchor.MiddleCenter);
            sub.color = new Color(1, 1, 1, 0.75f);
            UIController.Anchor(sub.rectTransform, new Vector2(0, 0.5f), new Vector2(1, 0.5f), new Vector2(20, 100), new Vector2(-20, 180));

            Image img;
            Button play = UIController.MakeButton("Play", root, "Oyna", out img, out playLabel);
            playLabel.fontSize = 56;
            UIController.Anchor((RectTransform)play.transform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(-360, -120), new Vector2(360, 40));
            play.onClick.AddListener(() => { Sfx.Instance.Click(); Game.Play(Game.UnlockedIndex); });

            Text lvTxt;
            Button levels = UIController.MakeButton("Levels", root, "Bölümler", out img, out lvTxt);
            img.color = new Color(0.35f, 0.38f, 0.5f);
            UIController.Anchor((RectTransform)levels.transform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(-360, -290), new Vector2(360, -150));
            levels.onClick.AddListener(() => { Sfx.Instance.Click(); ShowLevels(); });

            Button sound = UIController.MakeButton("Sound", root, "Ses: Açık", out img, out soundLabel);
            img.color = new Color(0.25f, 0.27f, 0.38f);
            soundLabel.fontSize = 40;
            UIController.Anchor((RectTransform)sound.transform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(-360, -460), new Vector2(-20, -340));
            sound.onClick.AddListener(() => { Sfx.Instance.SetSound(!Sfx.Instance.SoundOn); Sfx.Instance.Click(); RefreshLabels(); });

            Button vib = UIController.MakeButton("Vibration", root, "Titreşim: Açık", out img, out vibrationLabel);
            img.color = new Color(0.25f, 0.27f, 0.38f);
            vibrationLabel.fontSize = 40;
            UIController.Anchor((RectTransform)vib.transform, new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(20, -460), new Vector2(360, -340));
            vib.onClick.AddListener(() => { Sfx.Instance.SetVibration(!Sfx.Instance.VibrationOn); Sfx.Instance.Click(); RefreshLabels(); });

            Text foot = UIController.Label("Footer", root, "Minik Usta", 34, TextAnchor.MiddleCenter);
            foot.color = new Color(1, 1, 1, 0.45f);
            UIController.Anchor(foot.rectTransform, new Vector2(0, 0), new Vector2(1, 0), new Vector2(20, 40), new Vector2(-20, 120));
        }

        void BuildLevelSelect(Transform canvas)
        {
            RectTransform root = UIController.Panel("Levels", canvas, Palette.Background);
            UIController.Anchor(root, Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            levelsRoot = root.gameObject;

            Text title = UIController.Label("Title", root, "Bölümler", 80, TextAnchor.MiddleCenter);
            title.fontStyle = FontStyle.Bold;
            UIController.Anchor(title.rectTransform, new Vector2(0, 1), new Vector2(1, 1), new Vector2(20, -260), new Vector2(-20, -120));
            Text note = UIController.Label("Note", root, "12. bölümden sonra bölümler kendiliğinden üretilir.", 36, TextAnchor.MiddleCenter);
            note.color = new Color(1, 1, 1, 0.7f);
            UIController.Anchor(note.rectTransform, new Vector2(0, 1), new Vector2(1, 1), new Vector2(40, -340), new Vector2(-40, -260));

            const float cell = 200f;
            const float gap = 32f;
            float gridW = Columns * cell + (Columns - 1) * gap;
            float startX = -gridW / 2f;
            float startY = -400f;
            for (int i = 0; i < LevelButtons; i++)
            {
                int index = i;
                int col = i % Columns;
                int row = i / Columns;
                Image img;
                Text txt;
                Button b = UIController.MakeButton("Level" + (i + 1), root, (i + 1).ToString(), out img, out txt);
                txt.fontSize = 64;
                float x = startX + col * (cell + gap);
                float y = startY - row * (cell + gap);
                UIController.Anchor((RectTransform)b.transform, new Vector2(0.5f, 1), new Vector2(0.5f, 1), new Vector2(x, y - cell), new Vector2(x + cell, y));
                b.onClick.AddListener(() => { Sfx.Instance.Click(); Game.Play(index); });
                levelButtons[i] = b;
                levelImages[i] = img;
            }

            Image backImg;
            Text backTxt;
            Button back = UIController.MakeButton("Back", root, "Geri", out backImg, out backTxt);
            backImg.color = new Color(0.35f, 0.38f, 0.5f);
            UIController.Anchor((RectTransform)back.transform, new Vector2(0.5f, 0), new Vector2(0.5f, 0), new Vector2(-300, 60), new Vector2(300, 190));
            back.onClick.AddListener(() => { Sfx.Instance.Click(); Show(); });
        }
    }
}
