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

        /// <summary>Absolute path to the project root (the folder that contains Assets/).</summary>
        public static string ProjectRoot => Path.GetFullPath(Path.Combine(Application.dataPath, ".."));
        public static string BuildsDir => Path.Combine(ProjectRoot, "Builds");
        public static string BuildLogsDir => Path.Combine(ProjectRoot, "BuildLogs");
        public static string ShotsDir => Path.Combine(BuildLogsDir, "shots");
        public static string AppPath => Path.Combine(BuildsDir, "SUNBREAK.app");
    }
}
