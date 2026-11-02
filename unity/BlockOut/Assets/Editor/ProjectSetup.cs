using System.IO;
using BlockOut.Game;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.SceneManagement;
using UnityEngine;

namespace BlockOut.EditorTools
{
    /// <summary>
    /// Proje ilk açıldığında sahneyi ve oyuncu ayarlarını kurar; menüden APK derlenir.
    /// Böylece depoda elle yazılmış .unity / ProjectSettings dosyası tutmak gerekmez.
    /// </summary>
    [InitializeOnLoad]
    public static class ProjectSetup
    {
        const string ScenePath = "Assets/Scenes/Main.unity";
        const string ApkPath = "Builds/BlockOut.apk";

        static ProjectSetup()
        {
            EditorApplication.delayCall += EnsureOnce;
        }

        static void EnsureOnce()
        {
            if (EditorApplication.isPlayingOrWillChangePlaymode || EditorApplication.isCompiling) return;
            if (File.Exists(ScenePath)) return;
            Setup();
        }

        [MenuItem("Block Out/Projeyi hazırla (sahne + ayarlar)")]
        public static void Setup()
        {
            CreateScene();
            ApplyPlayerSettings();
            Debug.Log("Block Out: sahne ve ayarlar hazır. Oynatmak için Play'e basın; APK için Block Out > Android APK derle.");
        }

        static void CreateScene()
        {
            Directory.CreateDirectory("Assets/Scenes");
            var scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);
            var go = new GameObject("Block Out");
            go.AddComponent<GameBootstrap>();
            EditorSceneManager.SaveScene(scene, ScenePath);
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
            AssetDatabase.Refresh();
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
            if (!File.Exists(ScenePath)) Setup();
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
