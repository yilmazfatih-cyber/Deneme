using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace RoyalMatch
{
    /// <summary>Ekran akışı: Harita → Seviye öncesi → Oyun → Kazan/Kaybet → Harita; Şato odaları; Mağaza.</summary>
    public class GameManager : MonoBehaviour
    {
        public static GameManager I;
        public Camera Cam;
        public RectTransform UiRoot;
        public Transform World;
        private BoardController board;
        private HudScreen hud;
        private SpriteRenderer worldBackdrop;

        private void Awake()
        {
            if (I != null && I != this) { Destroy(gameObject); return; }
            I = this;
            DontDestroyOnLoad(gameObject);
            Application.targetFrameRate = 60;
            Screen.sleepTimeout = SleepTimeout.NeverSleep;
            BuildCamera();
            BuildCanvas();
            gameObject.AddComponent<Sfx>();
            World = new GameObject("World").transform;
            World.SetParent(transform, false);
        }

        private void Start() { ShowMap(); }

        private void BuildCamera()
        {
            Camera existing = Camera.main;
            if (existing != null) { Cam = existing; }
            else
            {
                var go = new GameObject("Main Camera");
                go.tag = "MainCamera";
                Cam = go.AddComponent<Camera>();
            }
            Cam.orthographic = true;
            Cam.orthographicSize = 8f;
            Cam.clearFlags = CameraClearFlags.SolidColor;
            Cam.backgroundColor = Art.Hex("#2A5BB8");
            Cam.transform.position = new Vector3(0f, 0f, -10f);
            Cam.nearClipPlane = 0.1f; Cam.farClipPlane = 100f;
        }

        private void BuildCanvas()
        {
            var go = new GameObject("Canvas");
            var canvas = go.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 100;
            var scaler = go.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(Ui.RefW, Ui.RefH);
            scaler.screenMatchMode = CanvasScaler.ScreenMatchMode.MatchWidthOrHeight;
            scaler.matchWidthOrHeight = 0.5f;
            go.AddComponent<GraphicRaycaster>();
            go.transform.SetParent(transform, false);
            UiRoot = go.GetComponent<RectTransform>();

            if (EventSystem.current == null)
            {
                var es = new GameObject("EventSystem");
                es.AddComponent<EventSystem>();
                es.AddComponent<StandaloneInputModule>();
                es.transform.SetParent(transform, false);
            }
        }

        public void ClearAll()
        {
            for (int i = UiRoot.childCount - 1; i >= 0; i--) Destroy(UiRoot.GetChild(i).gameObject);
            for (int i = World.childCount - 1; i >= 0; i--) Destroy(World.GetChild(i).gameObject);
            board = null; hud = null; worldBackdrop = null;
            Cam.transform.position = new Vector3(0f, 0f, -10f);
        }

        // ---------------- Ekranlar ----------------
        public void ShowMap() { ClearAll(); MapScreen.Build(UiRoot); }
        public void ShowRooms() { ClearAll(); RoomScreen.Build(UiRoot); }

        public void StartLevel(List<StartBooster> picks)
        {
            ClearAll();
            LevelData lv = LevelGenerator.Generate(Save.Data.level);
            var go = new GameObject("BoardController");
            go.transform.SetParent(World, false);
            board = go.AddComponent<BoardController>();
            hud = HudScreen.Build(UiRoot, lv, board);
            board.Setup(lv, picks, hud, Cam);
            BuildWorldBackdrop();
        }

        /// <summary>Oyun ekranının arkasına şato manzarası (kamera alanını kaplar).</summary>
        private void BuildWorldBackdrop()
        {
            worldBackdrop = Fx.Spawn(World, Art.Castle(), new Vector3(0f, Cam.transform.position.y, 5f), new Color(0.75f, 0.8f, 0.9f, 1f), -10);
            float h = Cam.orthographicSize * 2f, w = h * Cam.aspect;
            float sx = w / 2.56f, sy = h / 5.12f;
            float s = Mathf.Max(sx, sy);
            worldBackdrop.transform.localScale = new Vector3(s, s, 1f);
        }

        public void OnLevelWon(int bonusMoves)
        {
            var d = Save.Data;
            int coins = 25 + bonusMoves * 5;
            d.coins += coins;
            d.stars += 1;
            d.streak += 1;
            d.level += 1;
            Save.Store();
            Sfx.Play(SfxKind.Win);
            if (hud != null) hud.ShowWin(coins);
        }

        public void OnLevelLostFinal()
        {
            Save.Data.streak = 0;
            Save.Store();
            ShowMap();
        }

        public bool TryContinue()
        {
            if (!Save.SpendCoins(Save.ContinueCost)) return false;
            if (board != null) board.AddMoves(5);
            return true;
        }

        public void QuitLevel()
        {
            Save.Data.streak = 0; Save.Store();
            ShowMap();
        }
    }
}
