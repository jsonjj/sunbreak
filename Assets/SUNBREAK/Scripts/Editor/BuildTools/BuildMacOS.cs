using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace SUNBREAK.BuildTools
{
    /// <summary>
    /// Builds a StandaloneOSX .app into <c>./Builds/SUNBREAK.app</c> via BuildPipeline, headlessly.
    /// Invoke with <c>-executeMethod SUNBREAK.BuildTools.BuildMacOS.Build</c>. Exits 0 on a
    /// succeeded report, 1 otherwise, logging a clear sentinel either way.
    /// </summary>
    public static class BuildMacOS
    {
        public static void Build()
        {
            try
            {
                string appPath = SunbreakPaths.AppPath;
                Directory.CreateDirectory(SunbreakPaths.BuildsDir);

                var options = new BuildPlayerOptions
                {
                    scenes = ScenesForBuild(),
                    locationPathName = appPath,
                    target = BuildTarget.StandaloneOSX,
                    targetGroup = BuildTargetGroup.Standalone,
                    options = BuildOptions.None,
                };

                BuildReport report = BuildPipeline.BuildPlayer(options);
                BuildSummary summary = report.summary;

                if (summary.result == BuildResult.Succeeded)
                {
                    Debug.Log($"SUNBREAK_BUILD_OK: {appPath} " +
                              $"(size={summary.totalSize} bytes, time={summary.totalTime}, " +
                              $"warnings={summary.totalWarnings})");
                    EditorApplication.Exit(0);
                }
                else
                {
                    Debug.LogError($"SUNBREAK_BUILD_FAIL: result={summary.result}, " +
                                   $"errors={summary.totalErrors}");
                    EditorApplication.Exit(1);
                }
            }
            catch (Exception e)
            {
                Debug.LogError("SUNBREAK_BUILD_EXCEPTION: " + e);
                EditorApplication.Exit(1);
            }
        }

        [MenuItem("SUNBREAK/Build macOS Player")]
        static void Menu() => Build();

        static string[] ScenesForBuild()
        {
            var paths = new List<string>();
            foreach (var s in EditorBuildSettings.scenes)
                if (s.enabled) paths.Add(s.path);

            if (paths.Count == 0 && File.Exists(SunbreakPaths.ScenePath))
                paths.Add(SunbreakPaths.ScenePath);

            if (paths.Count == 0)
                throw new Exception("No scenes to build. Generate the greybox scene first.");

            return paths.ToArray();
        }
    }
}
