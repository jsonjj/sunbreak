using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using SUNBREAK.BuildTools;

namespace SUNBREAK.EditorTools
{
    /// <summary>
    /// Builds a tiny MainMenu scene and pins the build order to [MainMenu, Island] so the game boots
    /// into the menu. Invoke headlessly with
    /// <c>-executeMethod SUNBREAK.EditorTools.MainMenuSceneBuilder.Build</c>.
    /// </summary>
    public static class MainMenuSceneBuilder
    {
        public const string MenuScenePath = SunbreakPaths.SceneDir + "/MainMenu.unity";

        public static void Build()
        {
            try
            {
                BuildInternal();
                Debug.Log("SUNBREAK_MENU_OK: " + MenuScenePath);
                EditorApplication.Exit(0);
            }
            catch (Exception e)
            {
                Debug.LogError("SUNBREAK_MENU_FAIL: " + e);
                EditorApplication.Exit(1);
            }
        }

        [MenuItem("SUNBREAK/Rebuild Main Menu Scene")]
        static void Menu() => BuildInternal();

        static void BuildInternal()
        {
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            var menu = new GameObject("MainMenu");
            menu.AddComponent<SUNBREAK.UI.MainMenu>();

            var camGo = new GameObject("Menu Camera", typeof(Camera));
            camGo.tag = "MainCamera";
            var cam = camGo.GetComponent<Camera>();
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = new Color(0.02f, 0.02f, 0.03f);

            Directory.CreateDirectory(SunbreakPaths.SceneDir);
            if (!EditorSceneManager.SaveScene(scene, MenuScenePath))
                throw new Exception("Failed to save MainMenu scene to " + MenuScenePath);

            var list = new List<EditorBuildSettingsScene> { new EditorBuildSettingsScene(MenuScenePath, true) };
            if (File.Exists(SunbreakPaths.IslandScenePath))
                list.Add(new EditorBuildSettingsScene(SunbreakPaths.IslandScenePath, true));
            EditorBuildSettings.scenes = list.ToArray();
        }
    }
}
