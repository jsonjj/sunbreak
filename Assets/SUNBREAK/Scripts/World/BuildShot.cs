using System.Collections;
using UnityEngine;
using SUNBREAK.Combat;

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
            Shot("build_shot.png");              // pistol (default loadout)

            // Swap to a rifle so grip can be verified for both weapon classes.
            yield return new WaitForSeconds(0.7f);
            var combat = GameRefs.Player != null ? GameRefs.Player.GetComponent<PlayerCombat>() : null;
            combat?.Pickup("rifle_carbine");
            yield return new WaitForSeconds(1.8f);
            Shot("build_shot2.png");             // rifle

            yield return new WaitForSeconds(1.5f);
            Application.Quit();
        }

        static void Shot(string name)
        {
            ScreenCapture.CaptureScreenshot(System.IO.Path.Combine(Application.persistentDataPath, name), 1);
        }
    }
}
