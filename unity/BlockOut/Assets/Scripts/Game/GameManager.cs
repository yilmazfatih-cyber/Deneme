using System;
using System.Collections.Generic;
using BlockOut.Core;
using UnityEngine;

namespace BlockOut.Game
{
    public enum StepResult
    {
        Blocked,
        Moved,
        Exited
    }

    /// <summary>Bölüm akışı, süre, geri alma, çekiç ve kayıt.</summary>
    public class GameManager : MonoBehaviour
    {
        public BoardView BoardView;
        public UIController UI;
        public MenuController Menu;

        public int LevelIndex { get; private set; }
        public Board Board { get; private set; }
        public float TimeLeft { get; private set; }
        public bool Running { get; private set; }
        public bool HammerMode { get; private set; }
        public int Hammers { get; private set; }
        public int Moves { get; private set; }
        public bool CanUndo { get { return undoStack.Count > 0; } }
        public LevelDef Level { get; private set; }
        /// <summary>Açılmış en yüksek bölüm dizini (0 tabanlı).</summary>
        public int UnlockedIndex { get; private set; }
        public bool InMenu { get; private set; }

        const string LevelKey = "bo_level";
        const string HammerKey = "bo_hammers";

        List<LevelDef> handmade = new List<LevelDef>();
        readonly List<Board> undoStack = new List<Board>();
        bool snapshotPending;
        bool dragMoved;

        void Awake()
        {
            TextAsset text = Resources.Load<TextAsset>("levels");
            if (text != null)
            {
                try { handmade = LevelParser.ParseAll(text.text); }
                catch (Exception e) { Debug.LogError("levels.txt okunamadı: " + e.Message); }
            }
            Hammers = PlayerPrefs.GetInt(HammerKey, 3);
            UnlockedIndex = PlayerPrefs.GetInt(LevelKey, 0);
            LevelIndex = UnlockedIndex;
        }

        void Start()
        {
            ShowMenu();
        }

        /// <summary>Ana menüye döner; tahta gizlenir, süre durur.</summary>
        public void ShowMenu()
        {
            Running = false;
            InMenu = true;
            HammerMode = false;
            BoardView.SetVisible(false);
            if (UI != null) UI.ShowHud(false);
            if (Menu != null) Menu.Show();
        }

        /// <summary>Menüden bölüm başlatır.</summary>
        public void Play(int index)
        {
            InMenu = false;
            if (Menu != null) Menu.Hide();
            BoardView.SetVisible(true);
            LoadLevel(Mathf.Clamp(index, 0, UnlockedIndex));
        }

        public LevelDef GetLevel(int index)
        {
            if (index < handmade.Count) return handmade[index];
            return LevelGenerator.Generate(index + 1);
        }

        public void LoadLevel(int index)
        {
            LevelIndex = index;
            Level = GetLevel(index);
            Board = new Board(Level);
            undoStack.Clear();
            snapshotPending = false;
            Moves = 0;
            HammerMode = false;
            TimeLeft = Level.TimeSeconds;
            Running = true;
            BoardView.Build(Board);
            if (UI != null) UI.OnLevelLoaded();
        }

        public void Restart()
        {
            LoadLevel(LevelIndex);
        }

        public void NextLevel()
        {
            LoadLevel(LevelIndex + 1);
        }

        void Update()
        {
            if (!Running) return;
            TimeLeft -= Time.deltaTime;
            if (TimeLeft <= 0f)
            {
                TimeLeft = 0f;
                Running = false;
                if (Sfx.Instance != null) Sfx.Instance.Lose();
                if (UI != null) UI.ShowTimeOver();
            }
        }

        // --- hamleler --------------------------------------------------------------------

        /// <summary>Sürükleme başında çağrılır; ilk gerçek değişiklikte anlık görüntü alınır.</summary>
        public void BeginDrag(Block b)
        {
            snapshotPending = true;
            dragMoved = false;
        }

        public void EndDrag()
        {
            snapshotPending = false;
            if (dragMoved && Sfx.Instance != null) Sfx.Instance.Move();
            dragMoved = false;
        }

        void EnsureSnapshot()
        {
            if (!snapshotPending) return;
            snapshotPending = false;
            undoStack.Add(Board.Clone());
            if (undoStack.Count > 50) undoStack.RemoveAt(0);
            Moves++;
        }

        /// <summary>Bloğu bir hücre kaydırmayı, kenardaysa kapıdan çıkarmayı dener.</summary>
        public StepResult TryStep(Block b, Dir d)
        {
            if (!Running || !Board.Blocks.Contains(b)) return StepResult.Blocked;
            if (Board.CanMove(b, d))
            {
                EnsureSnapshot();
                Board.Move(b, d);
                BoardView.OnBlockMoved(b);
                dragMoved = true;
                return StepResult.Moved;
            }
            if (Board.CanExit(b, d))
            {
                EnsureSnapshot();
                Board.Remove(b);
                BoardView.OnBlockExited(b, d);
                dragMoved = false;
                if (Sfx.Instance != null) Sfx.Instance.Exit();
                AfterChange();
                return StepResult.Exited;
            }
            return StepResult.Blocked;
        }

        /// <summary>Blok kenara dayalı ve kapı uygunsa (dokunmadan da) çıkabilir mi? Arayüz ipucu için.</summary>
        public bool CanExitAnywhere(Block b)
        {
            foreach (Dir d in DirUtil.All) if (Board.CanExit(b, d)) return true;
            return false;
        }

        void AfterChange()
        {
            BoardView.RefreshFrozen();
            if (UI != null) UI.Refresh();
            if (Board.IsCleared)
            {
                Running = false;
                int next = LevelIndex + 1;
                if (next > UnlockedIndex)
                {
                    UnlockedIndex = next;
                    PlayerPrefs.SetInt(LevelKey, next);
                    if (next % 3 == 0)
                    {
                        Hammers++;
                        PlayerPrefs.SetInt(HammerKey, Hammers);
                    }
                    PlayerPrefs.Save();
                }
                if (Sfx.Instance != null) Sfx.Instance.Win();
                if (UI != null) UI.ShowWin();
            }
        }

        public void Undo()
        {
            if (!Running || undoStack.Count == 0) return;
            Board = undoStack[undoStack.Count - 1];
            undoStack.RemoveAt(undoStack.Count - 1);
            snapshotPending = false;
            HammerMode = false;
            BoardView.Build(Board);
            if (UI != null) UI.Refresh();
        }

        // --- çekiç -----------------------------------------------------------------------

        public void ToggleHammer()
        {
            if (!Running) return;
            if (Hammers <= 0) { HammerMode = false; }
            else HammerMode = !HammerMode;
            if (UI != null) UI.Refresh();
        }

        /// <summary>Çekiç modunda bir bloğa dokunulduğunda: blok kırılır (çıkmış sayılır).</summary>
        public bool UseHammer(Block b)
        {
            if (!Running || !HammerMode || Hammers <= 0 || !Board.Blocks.Contains(b)) return false;
            snapshotPending = true;
            EnsureSnapshot();
            Hammers--;
            PlayerPrefs.SetInt(HammerKey, Hammers);
            HammerMode = false;
            Board.Remove(b);
            BoardView.OnBlockExited(b, Dir.Up);
            if (Sfx.Instance != null) Sfx.Instance.Hammer();
            AfterChange();
            return true;
        }

        public void AddTime(float seconds)
        {
            TimeLeft += seconds;
            Running = true;
            if (UI != null) UI.HidePanels();
        }
    }
}
