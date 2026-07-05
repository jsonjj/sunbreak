using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using SUNBREAK.Combat;
using SUNBREAK.Missions;
using SUNBREAK.Player;
using SUNBREAK.Save;
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
            yield return new WaitForSecondsRealtime(6f); // let city gen + NPC spawn + weapon attach settle
            Debug.Log("SUNBREAK_STAGE: start");
            MissionSystem.Instance?.StartAvailable(); // show the mission HUD panel in the proof shots
            yield return new WaitForSecondsRealtime(0.4f);
            yield return Grab("build_shot.png");   // pistol (default loadout)

            // Swap to a rifle so grip can be verified for both weapon classes.
            var combat = GameRefs.Player != null ? GameRefs.Player.GetComponent<PlayerCombat>() : null;
            combat?.Pickup("rifle_carbine");
            yield return new WaitForSecondsRealtime(1.8f);
            yield return Grab("build_shot2.png");  // rifle

            // Minimap clarity: stand where several POI types cluster so the icons read distinctly.
            yield return ShootMinimap();

            // Police "world comes alive" response — heli + SWAT + roadblock (captured early so it's
            // within the render window), then heat is cleared so the later shots stay clean.
            yield return ShootChase();
            WantedSystem.Instance?.ForceStars(0);

            // Line up every character model in front of the player to prove none render green/white.
            SpawnLineup();
            yield return new WaitForSecondsRealtime(1.2f);
            yield return Grab("build_shot3.png");  // NPC material audit

            // Traversal craft — boat on the water, heli + plane at the airfield (offset so the
            // player doesn't occlude the craft directly ahead).
            yield return ShootFrom(new Vector3(-250f, 0f, 424f), 0f, "build_boat.png");
            yield return ShootFrom(new Vector3(386f, 0f, 276f), 38f, "build_heli.png");
            yield return ShootFrom(new Vector3(330f, 0f, 250f), 48f, "build_plane.png");

            // Service building signage (teleport to the hospital + look at it).
            Debug.Log("SUNBREAK_STAGE: service");
            yield return ShootService();

            // New this slice: a walk-in interior, a melee attack, and an arrest attempt.
            Debug.Log("SUNBREAK_STAGE: interior");
            yield return ShootInterior();
            Debug.Log("SUNBREAK_STAGE: melee");
            yield return ShootMelee();
            Debug.Log("SUNBREAK_STAGE: arrest");
            yield return ShootArrest();
            Debug.Log("SUNBREAK_STAGE: post-arrest");

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
            yield return new WaitForSecondsRealtime(3.5f);
            yield return Grab("build_rain.png");
            if (weather != null) weather.Force(WeatherSystem.Weather.Clear);
            if (day != null) day.SetTime(1f * 60f);   // 01:00
            yield return new WaitForSecondsRealtime(1.5f);
            yield return Grab("build_night.png");
            if (day != null) day.SetTime(9f * 60f);    // back to daylight

            // Street race checkpoint ring.
            var race = FindFirstObjectByType<StreetRace>();
            if (race != null && GameRefs.Player != null)
            {
                race.Interact(GameRefs.Player.gameObject);
                yield return new WaitForSecondsRealtime(0.5f);
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

            // Wanted-clear self-check: raise 4★ (deploys cops/cars/heli/roadblocks), then Bust — the
            // respawn must zero stars AND clear every deployed unit (headless log confirms it).
            var ws = WantedSystem.Instance;
            var pst = GameRefs.PlayerState;
            if (ws != null && pst != null && GameRefs.Player != null)
            {
                var pcw = GameRefs.Player.GetComponent<PlayerController>();
                if (pcw != null) pcw.Teleport(new Vector3(20f, 2f, 12f), 0f);
                pst.Invulnerable = true;
                ws.ForceStars(4);
                // Deterministically deploy a few officers so the unit count is non-zero before the Bust.
                Vector3 pp = GameRefs.Player.position, fwd = GameRefs.Player.forward; fwd.y = 0f; fwd.Normalize();
                Vector3 right = Vector3.Cross(Vector3.up, fwd);
                ws.SpawnFootCop(pp + fwd * 16f, ws.TierFor(4), 4);
                ws.SpawnFootCop(pp - fwd * 16f, ws.TierFor(4), 4);
                ws.SpawnFootCop(pp + right * 16f, ws.TierFor(4), 4);
                yield return new WaitForSecondsRealtime(2.5f);
                int starsBefore = ws.Stars, unitsBefore = ws.CopCount;
                WastedBusted.Instance?.Bust();
                yield return new WaitForSecondsRealtime(4.5f); // busted card + respawn
                Debug.Log($"SUNBREAK_WANTEDCLEAR: starsBefore={starsBefore} unitsBefore={unitsBefore} starsAfter={ws.Stars} unitsAfter={ws.CopCount} searching={ws.Searching} resisting={ws.Resisting}");
                pst.Invulnerable = false;
            }

            // Persistence round-trip self-check (the headless smoke log confirms full-state save/load).
            HiddenPackage.FoundIds.Add(424242);
            ActivityUtil.Completed = 5;
            WeatherSystem.Instance?.Force(WeatherSystem.Weather.Rain);
            GameSession.Instance?.SaveToSlot(3);
            var back = SaveSystem.Read(3);
            if (back != null)
                Debug.Log($"SUNBREAK_SAVETEST: weather={back.weather} activities={back.activitiesDone} packages={back.foundPackages.Count} rep={back.missions.totalRep} minutes={back.gameMinutes:0} tutorial={back.tutorialDone}");

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
            yield return new WaitForSecondsRealtime(9f); // response time + units close in
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
            yield return new WaitForSecondsRealtime(1.5f); // let the follow camera settle
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
            yield return new WaitForSecondsRealtime(1.4f); // let the follow camera settle
            yield return Grab("build_service.png");
        }

        /// <summary>Teleport to a POI-dense downtown spot so the minimap shows distinct type icons.</summary>
        static IEnumerator ShootMinimap()
        {
            var pc = GameRefs.Player != null ? GameRefs.Player.GetComponent<PlayerController>() : null;
            if (pc == null) yield break;
            Vector3 spot = new Vector3(34f, 0f, -20f); // near bank / hospital / dealer / spawn car
            if (Physics.Raycast(spot + Vector3.up * 140f, Vector3.down, out var hit, 260f, ~0, QueryTriggerInteraction.Ignore))
                spot.y = hit.point.y + 1.6f;
            pc.Teleport(spot, 20f);
            yield return new WaitForSecondsRealtime(1.6f);
            yield return Grab("build_minimap.png");

            // Full map (M) — the clearest showcase of the per-POI icon + label scheme.
            var map = FindFirstObjectByType<MapScreen>();
            if (map != null)
            {
                map.DebugOpen(230f);
                yield return new WaitForSecondsRealtime(1.0f);
                yield return Grab("build_fullmap.png");
                map.Close();
                yield return new WaitForSecondsRealtime(0.4f);
            }
        }

        /// <summary>Walk into an enterable building (dealership showroom) and capture the interior.</summary>
        static IEnumerator ShootInterior()
        {
            var player = GameRefs.Player;
            if (player == null) yield break;
            EnterableShop dealership = null;
            foreach (var s in FindObjectsByType<EnterableShop>(FindObjectsSortMode.None))
                if (!s.safehouse && s.kind == UI.ShopKind.CarDealer) { dealership = s; break; }
            if (dealership == null) yield break;
            dealership.Interact(player.gameObject);
            yield return new WaitForSecondsRealtime(1.6f); // teleport in + camera settle
            yield return Grab("build_interior.png");
            dealership.ExitToStreet();
            yield return new WaitForSecondsRealtime(0.6f);
        }

        /// <summary>Show the unarmed combo (advancing to the kick) and the shared bat/machete swing.</summary>
        static IEnumerator ShootMelee()
        {
            var player = GameRefs.Player;
            var combat = player != null ? player.GetComponent<PlayerCombat>() : null;
            var melee = player != null ? player.GetComponent<MeleeAnimator>() : null;
            var pc = player != null ? player.GetComponent<PlayerController>() : null;
            if (player == null || combat == null || melee == null || pc == null) yield break;

            // Move to a clean, open spot (the airfield apron) so nothing occludes the pose.
            Vector3 spot = new Vector3(408f, 0f, 300f);
            if (Physics.Raycast(spot + Vector3.up * 140f, Vector3.down, out var hit, 260f, ~0, QueryTriggerInteraction.Ignore))
                spot.y = hit.point.y + 1.2f;
            pc.Teleport(spot, 20f);
            yield return new WaitForSecondsRealtime(0.5f);

            // Unarmed combo: punchL → punchR → kick, captured mid-kick.
            combat.Pickup("fists");
            yield return new WaitForSecondsRealtime(0.3f);
            SpawnDummyInFront(2.2f);
            yield return new WaitForSecondsRealtime(0.2f);
            melee.Play(MeleeAnimator.Move.PunchL); yield return new WaitForSecondsRealtime(0.34f);
            melee.Play(MeleeAnimator.Move.PunchR); yield return new WaitForSecondsRealtime(0.34f);
            melee.Play(MeleeAnimator.Move.Kick); yield return new WaitForSecondsRealtime(0.2f);
            yield return Grab("build_melee.png");

            // Machete equipped (shares the baseball stance + swing).
            combat.Pickup("machete");
            yield return new WaitForSecondsRealtime(0.7f);
            melee.Play(MeleeAnimator.Move.Swing);
            yield return new WaitForSecondsRealtime(0.2f);
            yield return Grab("build_meleebat.png");
            combat.Pickup("pistol_9mm");
        }

        /// <summary>Force 1★ + an approaching (holstered) officer, showing the surrender prompt.</summary>
        static IEnumerator ShootArrest()
        {
            var ws = WantedSystem.Instance;
            var player = GameRefs.Player;
            var pc = player != null ? player.GetComponent<PlayerController>() : null;
            var crowd = CrowdFactory.Instance;
            if (ws == null || player == null || pc == null || crowd == null) yield break;

            Vector3 spot = new Vector3(20f, 0f, 12f);
            if (Physics.Raycast(spot + Vector3.up * 60f, Vector3.down, out var hit, 120f, ~0, QueryTriggerInteraction.Ignore))
                spot.y = hit.point.y + 1.2f;
            pc.Teleport(spot, 0f);
            var st = GameRefs.PlayerState; if (st != null) st.Invulnerable = true;
            yield return new WaitForSecondsRealtime(0.4f);

            ws.ForceStars(1); // 1★ = arrest posture (guns holstered)
            Vector3 fwd = player.forward; fwd.y = 0f; fwd.Normalize();
            // Spawn a TRACKED officer (in the wanted system) so the arrest/surrender prompt drives itself.
            ws.SpawnFootCop(player.position + fwd * 12f, ws.TierFor(1), 1);
            yield return new WaitForSecondsRealtime(1.3f); // officer closes in, still non-lethal
            yield return Grab("build_arrest.png");
            ws.ForceStars(0);
            GameHUD.SetAlert(null);
            if (st != null) st.Invulnerable = false;
        }

        static void SpawnDummyInFront(float dist)
        {
            var crowd = CrowdFactory.Instance;
            var player = GameRefs.Player;
            if (crowd == null || player == null || crowd.roster == null || crowd.roster.Length == 0) return;
            var model = crowd.roster[0];
            if (model == null) return;
            var go = Instantiate(model);
            var b = Bounds(go);
            float h = Mathf.Max(0.01f, b.size.y);
            go.transform.localScale = Vector3.one * (1.8f / h);
            Vector3 fwd = player.forward; fwd.y = 0f; fwd.Normalize();
            Vector3 pos = player.position + fwd * dist;
            go.transform.position = new Vector3(pos.x, player.position.y - 0.9f, pos.z);
            go.transform.rotation = Quaternion.LookRotation(-fwd);
            CrowdFactory.ApplyMaterial(go, crowd.rosterMaterials != null && crowd.rosterMaterials.Length > 0 ? crowd.rosterMaterials[0] : null);
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
