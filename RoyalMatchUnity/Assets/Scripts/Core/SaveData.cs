using System;
using System.Collections.Generic;
using UnityEngine;

namespace RoyalMatch
{
    [Serializable]
    public class SaveData
    {
        public int level = 1;
        public int coins = 1000;
        public int stars = 0;
        public int lives = 5;
        public string lifeTimerStart = "";   // DateTime.UtcNow.Ticks (string: JsonUtility long desteği için güvenli)
        public int streak = 0;
        public int rockets = 3, tnts = 3, lightBalls = 3;
        public int hammers = 3, arrows = 3, cannons = 3, jesters = 3;
        public int roomIndex = 0;
        public List<int> taskChoices = new List<int>(); // mevcut odadaki görev → stil (−1: yapılmadı)
        public int completedRooms = 0;
        public bool sound = true;
        public bool seenTutorial = false;
    }

    /// <summary>PlayerPrefs üzerinde JSON kayıt; can yenilenme süresi 30 dk.</summary>
    public static class Save
    {
        public const int MaxLives = 5;
        public const int LifeSeconds = 30 * 60;
        public const int ContinueCost = 900;
        public const int RefillLivesCost = 900;
        public const int BoosterCost = 400;
        public const int StartBoosterCost = 250;
        private const string Key = "royalmatch_save_v1";
        private static SaveData data;

        public static SaveData Data
        {
            get
            {
                if (data == null)
                {
                    string json = PlayerPrefs.GetString(Key, "");
                    data = string.IsNullOrEmpty(json) ? new SaveData() : (JsonUtility.FromJson<SaveData>(json) ?? new SaveData());
                    if (data.taskChoices == null) data.taskChoices = new List<int>();
                    RefreshLives();
                }
                return data;
            }
        }

        public static void Store()
        {
            if (data == null) return;
            PlayerPrefs.SetString(Key, JsonUtility.ToJson(data));
            PlayerPrefs.Save();
        }

        public static void Reset() { data = new SaveData(); Store(); }

        private static long Now { get { return DateTime.UtcNow.Ticks; } }

        private static long TimerStart
        {
            get { long t; return long.TryParse(data.lifeTimerStart, out t) ? t : 0; }
            set { data.lifeTimerStart = value.ToString(); }
        }

        /// <summary>Geçen süreye göre canları yeniler.</summary>
        public static void RefreshLives()
        {
            if (data.lives >= MaxLives) { data.lifeTimerStart = ""; return; }
            long start = TimerStart;
            if (start == 0) { TimerStart = Now; return; }
            long elapsed = (Now - start) / TimeSpan.TicksPerSecond;
            int gained = (int)(elapsed / LifeSeconds);
            if (gained > 0)
            {
                data.lives = Mathf.Min(MaxLives, data.lives + gained);
                if (data.lives >= MaxLives) data.lifeTimerStart = "";
                else TimerStart = start + gained * LifeSeconds * TimeSpan.TicksPerSecond;
            }
        }

        /// <summary>Sonraki cana kalan saniye (tam canda 0).</summary>
        public static int SecondsToNextLife()
        {
            RefreshLives();
            if (data.lives >= MaxLives) return 0;
            long elapsed = (Now - TimerStart) / TimeSpan.TicksPerSecond;
            return Mathf.Max(0, LifeSeconds - (int)elapsed);
        }

        public static bool SpendLife()
        {
            RefreshLives();
            if (data.lives <= 0) return false;
            if (data.lives == MaxLives) TimerStart = Now;
            data.lives--;
            Store();
            return true;
        }

        public static void RefillLives() { data.lives = MaxLives; data.lifeTimerStart = ""; Store(); }

        public static bool SpendCoins(int n)
        {
            if (data.coins < n) return false;
            data.coins -= n; Store(); return true;
        }

        public static int GetInGame(InGameBooster b)
        {
            switch (b) { case InGameBooster.Hammer: return data.hammers; case InGameBooster.Arrow: return data.arrows; case InGameBooster.Cannon: return data.cannons; default: return data.jesters; }
        }

        public static void AddInGame(InGameBooster b, int n)
        {
            switch (b) { case InGameBooster.Hammer: data.hammers += n; break; case InGameBooster.Arrow: data.arrows += n; break; case InGameBooster.Cannon: data.cannons += n; break; default: data.jesters += n; break; }
            Store();
        }

        public static int GetStart(StartBooster b)
        {
            switch (b) { case StartBooster.Rocket: return data.rockets; case StartBooster.Tnt: return data.tnts; default: return data.lightBalls; }
        }

        public static void AddStart(StartBooster b, int n)
        {
            switch (b) { case StartBooster.Rocket: data.rockets += n; break; case StartBooster.Tnt: data.tnts += n; break; default: data.lightBalls += n; break; }
            Store();
        }

        public static string FormatTime(int seconds)
        {
            return string.Format("{0:00}:{1:00}", seconds / 60, seconds % 60);
        }
    }
}
