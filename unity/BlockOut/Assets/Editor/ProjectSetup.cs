using System.IO;
using BlockOut.Game;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace BlockOut.EditorTools
{
    /// <summary>
    /// Sahne depoda hazır gelir (Assets/Scenes/Main.unity). Bu betik yalnızca
    ///  - oyuncu ayarlarını (dikey ekran, paket adı) ilk açılışta bir kez uygular,
    ///  - sahne silinmişse yeniden üretir,
    ///  - menüden tek tıkla Android APK derler.
    /// </summary>
    [InitializeOnLoad]
    public static class ProjectSetup
    {
        const string ScenePath = "Assets/Scenes/Main.unity";
        const string ApkPath = "Builds/BlockOut.apk";
        const string MarkerPath = "Library/blockout-setup.done";

        static ProjectSetup()
        {
            EditorApplication.delayCall += EnsureOnce;
        }

        static void EnsureOnce()
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode || EditorApplication.isCompiling) return;
            if (File.Exists(MarkerPath)) return;
            Setup();
            Directory.CreateDirectory("Library");
            File.WriteAllText(MarkerPath, "ok");
        }

        [MenuItem("Block Out/Projeyi hazırla (sahne + ayarlar)")]
        public static void Setup()
        {
            if (!File.Exists(ScenePath)) CreateScene();
            EnsureBuildScenes();
            ApplyPlayerSettings();
            Debug.Log("Block Out: proje hazır. Oynatmak için Play'e basın; APK için Block Out > Android APK derle.");
        }

        static void CreateScene()
        {
            Directory.CreateDirectory("Assets/Scenes");
            var scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);
            var go = new GameObject("Block Out");
            go.AddComponent<GameBootstrap>();
            EditorSceneManager.SaveScene(scene, ScenePath);
            AssetDatabase.Refresh();
        }

        static void EnsureBuildScenes()
        {
            foreach (EditorBuildSettingsScene s in EditorBuildSettings.scenes)
                if (s.path == ScenePath && s.enabled) return;
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
        }

        static void ApplyPlayerSettings()
        {
            PlayerSettings.companyName = "Minik Usta";
            PlayerSettings.productName = "Block Out";
            PlayerSettings.defaultInterfaceOrientation = UIOrientation.Portrait;
            PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.Android, "com.minikusta.blockout");
            PlayerSettings.Android.minSdkVersion = AndroidSdkVersions.AndroidApiLevel24;
            PlayerSettings.bundleVersion = "1.0.0";
            PlayerSettings.Android.bundleVersionCode = 1;
            AssetDatabase.SaveAssets();
        }

        [MenuItem("Block Out/Android APK derle")]
        public static void BuildAndroid()
        {
            Setup();
            Directory.CreateDirectory("Builds");
            var options = new BuildPlayerOptions
            {
                scenes = new[] { ScenePath },
                locationPathName = ApkPath,
                target = BuildTarget.Android,
                options = BuildOptions.None
            };
            var report = BuildPipeline.BuildPlayer(options);
            if (report.summary.result == UnityEditor.Build.Reporting.BuildResult.Succeeded)
            {
                Debug.Log("APK hazır: " + Path.GetFullPath(ApkPath));
                EditorUtility.RevealInFinder(ApkPath);
            }
            else
            {
                Debug.LogError("APK derlenemedi: " + report.summary.result + ". Unity Hub'dan Android Build Support modülünün kurulu olduğundan emin olun.");
            }
        }
    }
}
