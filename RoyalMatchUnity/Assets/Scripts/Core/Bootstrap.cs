using UnityEngine;

namespace RoyalMatch
{
    /// <summary>
    /// Sahnede hiçbir nesne gerekmez: oyun açılışta kendini kurar.
    /// Boş Main.unity sahnesiyle "Play"e basmak yeterlidir.
    /// </summary>
    public static class Bootstrap
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Init()
        {
            if (GameManager.I != null) return;
            var go = new GameObject("RoyalMatchGame");
            go.AddComponent<GameManager>();
        }
    }
}
