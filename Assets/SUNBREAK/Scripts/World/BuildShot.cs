using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using SUNBREAK.Combat;
using SUNBREAK.Missions;
using SUNBREAK.Player;
using SUNBREAK.UI;

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
            yield return Grab("build_shot.png");   // pistol (default loadout)

            // Swap to a rifle so grip can be verified for both weapon classes.
            var combat = GameRefs.Player != null ? GameRefs.Player.GetComponent<PlayerCombat>() : null;
            combat?.Pickup("rifle_carbine");
            yield return new WaitForSeconds(1.8f);
            yield return Grab("build_shot2.png");  // rifle

            // Police "world comes alive" response — heli + SWAT + roadblock (captured early so it's
            // within the render window), then heat is cleared so the later shots stay clean.
            yield return ShootChase();
            WantedSystem.Instance?.ForceStars(0);

            // Line up every character model in front of the player to prove none render green/white.
            SpawnLineup();
            yield return new WaitForSeconds(1.2f);
            yield return Grab("build_shot3.png");  // NPC material audit

            // Traversal craft — boat on the water, heli + plane at the airfield (offset so the
            // player doesn't occlude the craft directly ahead).
            yield return ShootFrom(new Vector3(-250f, 0f, 424f), 0f, "build_boat.png");
            yield return ShootFrom(new Vector3(386f, 0f, 276f), 38f, "build_heli.png");
            yield return ShootFrom(new Vector3(330f, 0f, 250f), 48f, "build_plane.png");

            // Service building signage (teleport to the hospital + look at it).
            yield return ShootService();

            // Pause menu + settings (real UI render proof).
            var pause = FindFirstObjectByType<PauseMenu>();
            if (pause != null)
            {
                pause.DebugOpen(false);
                yield return new WaitForSecondsRealtime(0.8f);
                yield return Grab("build_pause.png");
                pause.DebugOpen(true);           // settings tab
                yield return new WaitForSecondsRealtime(0.8f);
                yield return Grab("build_settings.png");
                pause.Close();
                yield return new WaitForSecondsRealtime(0.4f);
            }

            // Weather + day-night proof: a rainy street, then a night scene.
            var weather = FindFirstObjectByType<WeatherSystem>();
            var day = DayNightSystem.Instance;
            if (day != null) day.SetTime(13f * 60f);
            if (weather != null) weather.Force(WeatherSystem.Weather.Rain);
            yield return new WaitForSeconds(3.5f);
            yield return Grab("build_rain.png");
            if (weather != null) weather.Force(WeatherSystem.Weather.Clear);
            if (day != null) day.SetTime(1f * 60f);   // 01:00
            yield return new WaitForSeconds(1.5f);
            yield return Grab("build_night.png");
            if (day != null) day.SetTime(9f * 60f);    // back to daylight

            // Street race checkpoint ring.
            var race = FindFirstObjectByType<StreetRace>();
            if (race != null && GameRefs.Player != null)
            {
                race.Interact(GameRefs.Player.gameObject);
                yield return new WaitForSeconds(0.5f);
                if (NavRoute.ActivityWaypoint.HasValue)
                {
                    Vector3 cp = NavRoute.ActivityWaypoint.Value - new Vector3(0f, 0f, 11f);
                    yield return ShootFrom(cp, 0f, "build_race.png");
                }
            }

            // SP-completeness proof: an activity marker, then the MISSION FAILED panel.
            yield return ShootFrom(new Vector3(120f, 0f, 111f), 0f, "build_activity.png");
            MissionCard.Fail("First Score", "You were wasted", null, null);
            yield return new WaitForSecondsRealtime(0.9f);
            yield return Grab("build_fail.png");

            Application.Quit();
        }

        static IEnumerator ShootChase()
        {
            var ws = WantedSystem.Instance;
            var pc = GameRefs.Player != null ? GameRefs.Player.GetComponent<PlayerController>() : null;
            if (ws == null || pc == null) yield break;
            // Stand on the big flat airfield apron for a clear view of the aerial + ground response.
            Vector3 spot = new Vector3(408f, 0f, 300f);
            if (Physics.Raycast(new Vector3(spot.x, 140f, spot.z), Vector3.down, out var hit, 260f, ~0, QueryTriggerInteraction.Ignore))
                spot.y = hit.point.y + 1.5f;
            pc.Teleport(spot, 0f);
            var st = GameRefs.PlayerState;
            if (st != null) st.Invulnerable = true; // survive the shot without dying
            ws.ForceStars(4); // SWAT + helicopter + roadblocks
            yield return new WaitForSeconds(9f); // response time + units close in
            yield return Grab("build_chase.png");
            if (st != null) st.Invulnerable = false;
        }

        /// <summary>Teleport the player to a ground-snapped viewpoint, face a heading, capture.</summary>
        static IEnumerator ShootFrom(Vector3 xz, float yaw, string name)
        {
            var pc = GameRefs.Player != null ? GameRefs.Player.GetComponent<PlayerController>() : null;
            if (pc == null) yield break;
            float y = 2f;
            if (Physics.Raycast(new Vector3(xz.x, 140f, xz.z), Vector3.down, out var hit, 260f, ~0, QueryTriggerInteraction.Ignore))
                y = hit.point.y + 1.6f;
            pc.Teleport(new Vector3(xz.x, y, xz.z), yaw);
            yield return new WaitForSeconds(1.5f); // let the follow camera settle
            yield return Grab(name);
        }

        static IEnumerator ShootService()
        {
            var player = GameRefs.Player;
            var pc = player != null ? player.GetComponent<PlayerController>() : null;
            if (pc == null) yield break;
            Vector3 hosp = ServiceBuilding.NearestHospital(player.position);
            Vector3 spot = hosp - new Vector3(0f, 0f, 11f); // stand south, face +Z toward the signage
            if (Physics.Raycast(spot + Vector3.up * 60f, Vector3.down, out var hit, 120f, ~0, QueryTriggerInteraction.Ignore))
                spot.y = hit.point.y + 1.2f;
            pc.Teleport(spot, 0f);
            yield return new WaitForSeconds(1.4f); // let the follow camera settle
            yield return Grab("build_service.png");
        }

        /// <summary>Capture at end-of-frame, then wait for the async file write to flush BEFORE any
        /// state change — otherwise ScreenCapture's lag binds the file to the next screen.</summary>
        static IEnumerator Grab(string name)
        {
            yield return new WaitForEndOfFrame();
            ScreenCapture.CaptureScreenshot(System.IO.Path.Combine(Application.persistentDataPath, name), 1);
            yield return new WaitForEndOfFrame();
            yield return new WaitForEndOfFrame();
            yield return new WaitForSecondsRealtime(0.6f);
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
    }
}
