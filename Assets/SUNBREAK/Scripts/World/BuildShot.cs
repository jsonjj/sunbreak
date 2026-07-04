using System.Collections;
using UnityEngine;

namespace SUNBREAK.World
{
    /// <summary>
    /// Verification helper: when the built player is launched with <c>-sunbreakshot</c>, waits for the
    /// world + characters to spawn, captures a real screenshot of the BUILD to persistentDataPath,
    /// then quits. Lets the smoke step eyeball the actual build render (catches white/untextured
    /// characters + placement issues that a headless, no-render smoke can't).
    /// </summary>
    public sealed class BuildShot : MonoBehaviour
    {
        void Start()
        {
            foreach (var a in System.Environment.GetCommandLineArgs())
                if (a == "-sunbreakshot") { StartCoroutine(Run()); return; }
        }

        IEnumerator Run()
        {
            yield return new WaitForSeconds(6f); // let city gen + NPC spawn + weapon attach settle
            string path = System.IO.Path.Combine(Application.persistentDataPath, "build_shot.png");
            ScreenCapture.CaptureScreenshot(path, 1);
            yield return new WaitForSeconds(2f);
            Application.Quit();
        }
    }
}
