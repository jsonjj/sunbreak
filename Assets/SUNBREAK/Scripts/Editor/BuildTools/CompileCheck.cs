using UnityEditor;
using UnityEditor.Compilation;
using UnityEngine;

namespace SUNBREAK.BuildTools
{
    /// <summary>
    /// Headless compile smoke test. Reaching <see cref="Run"/> proves every assembly compiled
    /// (Unity will not invoke -executeMethod targets when scripts fail to build), so this logs a
    /// clear sentinel and exits 0. The wrapper additionally scans the log for "error CS".
    /// </summary>
    public static class CompileCheck
    {
        public static void Run()
        {
            int playerAsms = CompilationPipeline.GetAssemblies(AssembliesType.Player).Length;
            int editorAsms = CompilationPipeline.GetAssemblies(AssembliesType.Editor).Length;
            Debug.Log($"SUNBREAK_COMPILE_OK: Unity {Application.unityVersion}; " +
                      $"player assemblies={playerAsms}, editor assemblies={editorAsms}.");
            EditorApplication.Exit(0);
        }

        [MenuItem("SUNBREAK/Log Compile Info")]
        static void Menu()
        {
            Debug.Log($"SUNBREAK compile info: Unity {Application.unityVersion}; " +
                      $"player asms={CompilationPipeline.GetAssemblies(AssembliesType.Player).Length}, " +
                      $"editor asms={CompilationPipeline.GetAssemblies(AssembliesType.Editor).Length}.");
        }
    }
}
