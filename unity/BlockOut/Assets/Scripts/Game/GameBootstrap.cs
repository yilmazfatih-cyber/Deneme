using UnityEngine;

namespace BlockOut.Game
{
    /// <summary>
    /// Oyunu sıfırdan kurar: kamera, ışık, tahta, giriş, arayüz. Sahnede bu bileşen yoksa
    /// oyun başlarken kendiliğinden oluşturulur; böylece boş bir sahnede bile çalışır.
    /// </summary>
    public class GameBootstrap : MonoBehaviour
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void AutoCreate()
        {
            if (FindFirstObjectByType<GameBootstrap>() != null) return;
            new GameObject("Block Out").AddComponent<GameBootstrap>();
        }

        void Awake()
        {
            Application.targetFrameRate = 60;
            Screen.orientation = ScreenOrientation.Portrait;
            Screen.sleepTimeout = SleepTimeout.SystemSetting;

            Camera cam = Camera.main;
            if (cam == null)
            {
                GameObject camGo = new GameObject("Main Camera");
                camGo.tag = "MainCamera";
                cam = camGo.AddComponent<Camera>();
                camGo.AddComponent<AudioListener>();
            }

            if (FindFirstObjectByType<Light>() == null)
            {
                GameObject lightGo = new GameObject("Directional Light");
                Light light = lightGo.AddComponent<Light>();
                light.type = LightType.Directional;
                light.intensity = 1.1f;
                light.color = new Color(1f, 0.97f, 0.92f);
                lightGo.transform.rotation = Quaternion.Euler(55f, -35f, 0f);
            }
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Flat;
            RenderSettings.ambientLight = new Color(0.45f, 0.47f, 0.55f);

            gameObject.AddComponent<Sfx>();

            BoardView board = gameObject.AddComponent<BoardView>();
            board.Cam = cam;

            UIController ui = gameObject.AddComponent<UIController>();

            GameManager game = gameObject.AddComponent<GameManager>();
            game.BoardView = board;
            game.UI = ui;
            ui.Game = game;

            MenuController menu = gameObject.AddComponent<MenuController>();
            menu.Game = game;
            menu.UI = ui;
            menu.Build();
            game.Menu = menu;

            InputController input = gameObject.AddComponent<InputController>();
            input.Cam = cam;
            input.BoardView = board;
            input.Game = game;
        }

        void Update()
        {
            // Android geri tuşu: oyundaysa menüye dön, menüdeyse çık.
            if (!Input.GetKeyDown(KeyCode.Escape)) return;
            GameManager game = GetComponent<GameManager>();
            if (game != null && !game.InMenu) game.ShowMenu();
            else Application.Quit();
        }
    }
}
