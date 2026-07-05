using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using SUNBREAK.Combat;
using SUNBREAK.Missions;

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
            MissionSystem.Instance?.StartAvailable(); // show the mission HUD panel in the proof shots
            yield return new WaitForSeconds(0.4f);
            Shot("build_shot.png");              // pistol (default loadout)

            // Swap to a rifle so grip can be verified for both weapon classes.
            yield return new WaitForSeconds(0.7f);
            var combat = GameRefs.Player != null ? GameRefs.Player.GetComponent<PlayerCombat>() : null;
            combat?.Pickup("rifle_carbine");
            yield return new WaitForSeconds(1.8f);
            Shot("build_shot2.png");             // rifle

            // Line up every character model in front of the player to prove none render green/white.
            yield return new WaitForSeconds(0.5f);
            SpawnLineup();
            yield return new WaitForSeconds(1.2f);
            Shot("build_shot3.png");             // NPC material audit

            yield return new WaitForSeconds(1.5f);
            Application.Quit();
        }

        static void SpawnLineup()
        {
            var crowd = CrowdFactory.Instance;
            var player = GameRefs.Player;
            if (crowd == null || player == null) return;

            var models = new List<GameObject>();
            var mats = new List<Material>();
            if (crowd.roster != null)
                for (int i = 0; i < crowd.roster.Length; i++)
                { models.Add(crowd.roster[i]); mats.Add(crowd.rosterMaterials != null && i < crowd.rosterMaterials.Length ? crowd.rosterMaterials[i] : null); }
            if (crowd.policeModel != null) { models.Add(crowd.policeModel); mats.Add(crowd.policeMaterial); }

            float spacing = 1.4f;
            float x0 = -(models.Count - 1) * 0.5f * spacing;
            Vector3 fwd = player.forward; fwd.y = 0f; fwd.Normalize();
            Vector3 right = Vector3.Cross(Vector3.up, fwd);
            for (int i = 0; i < models.Count; i++)
            {
                if (models[i] == null) continue;
                var go = Instantiate(models[i]);
                var b = Bounds(go);
                float h = Mathf.Max(0.01f, b.size.y);
                go.transform.localScale = Vector3.one * (1.8f / h);
                Vector3 pos = player.position + fwd * 6.5f + right * (x0 + i * spacing);
                go.transform.position = new Vector3(pos.x, player.position.y - 0.9f, pos.z);
                go.transform.rotation = Quaternion.LookRotation(-fwd);
                CrowdFactory.ApplyMaterial(go, mats[i]);
            }
        }

        static Bounds Bounds(GameObject go)
        {
            var rs = go.GetComponentsInChildren<Renderer>();
            if (rs.Length == 0) return new Bounds(go.transform.position, new Vector3(0.5f, 1.8f, 0.5f));
            Bounds b = rs[0].bounds;
            for (int i = 1; i < rs.Length; i++) b.Encapsulate(rs[i].bounds);
            return b;
        }

        static void Shot(string name)
        {
            ScreenCapture.CaptureScreenshot(System.IO.Path.Combine(Application.persistentDataPath, name), 1);
        }
    }
}
