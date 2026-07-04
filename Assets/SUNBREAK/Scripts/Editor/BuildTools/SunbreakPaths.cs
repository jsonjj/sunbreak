using System.IO;
using UnityEngine;

namespace SUNBREAK.BuildTools
{
    /// <summary>
    /// Central, headless-safe path constants for SUNBREAK build tooling. Keeps the greybox
    /// scene location and the out-of-project output dirs (Builds/, BuildLogs/) in one place so
    /// every -executeMethod entry point agrees.
    /// </summary>
    public static class SunbreakPaths
    {
        public const string SceneDir = "Assets/SUNBREAK/Scenes";
        public const string ScenePath = SceneDir + "/Greybox.unity";
        /// <summary>Slice 1 hero street scene (the current look-lock target).</summary>
        public const string HeroScenePath = SceneDir + "/HeroStreet.unity";
        /// <summary>Slice 2 full island scene (runtime-generated city).</summary>
        public const string IslandScenePath = SceneDir + "/Island.unity";

        /// <summary>Absolute path to the project root (the folder that contains Assets/).</summary>
        public static string ProjectRoot => Path.GetFullPath(Path.Combine(Application.dataPath, ".."));
        public static string BuildsDir => Path.Combine(ProjectRoot, "Builds");
        public static string BuildLogsDir => Path.Combine(ProjectRoot, "BuildLogs");
        public static string ShotsDir => Path.Combine(BuildLogsDir, "shots");
        public static string Slice1ShotsDir => Path.Combine(ShotsDir, "slice1");
        public static string Slice2ShotsDir => Path.Combine(ShotsDir, "slice2");
        public static string Slice3ShotsDir => Path.Combine(ShotsDir, "slice3");
        public static string Slice4ShotsDir => Path.Combine(ShotsDir, "slice4");
        public static string AppPath => Path.Combine(BuildsDir, "SUNBREAK.app");
    }
}
