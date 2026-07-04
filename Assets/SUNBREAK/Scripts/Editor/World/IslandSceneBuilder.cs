using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.AI;
using UnityEngine.Rendering.Universal;
using UnityEngine.SceneManagement;
using Unity.Cinemachine;
using Unity.AI.Navigation;
using SUNBREAK.BuildTools;
using SUNBREAK.Cameras;
using SUNBREAK.Combat;
using SUNBREAK.EditorTools.Characters;
using SUNBREAK.EditorTools.Kits;
using SUNBREAK.Player;
using SUNBREAK.UI;
using SUNBREAK.Vehicles;
using SUNBREAK.World;

namespace SUNBREAK.EditorTools.World
{
    /// <summary>
    /// Slice 2 — assembles the full playable island scene. The heavy world (terrain, roads,
    /// all districts, landmarks, cars) is produced at RUNTIME by <see cref="CityGenerator"/>
    /// so the saved scene stays tiny (repo-lean); this builder just creates the look, wires the
    /// generator's asset references, and sets up the player, cameras, vehicles, HUD, minimap,
    /// and world-bounds. Reuses the Slice 1 look + ported car + Mixamo character.
    /// Run: <c>-executeMethod SUNBREAK.EditorTools.World.IslandSceneBuilder.Build</c>.
    /// </summary>
    public static class IslandSceneBuilder
    {
        const string MatDir = "Assets/SUNBREAK/Art/Materials";

        public static void Build()
        {
            try
            {
                BuildInternal();
                Debug.Log("SUNBREAK_ISLAND_OK: " + SunbreakPaths.IslandScenePath);
                EditorApplication.Exit(0);
            }
            catch (Exception e)
            {
                Debug.LogError("SUNBREAK_ISLAND_FAIL: " + e);
                EditorApplication.Exit(1);
            }
        }

        [MenuItem("SUNBREAK/Build Island Scene")]
        static void Menu()
        {
            BuildInternal();
            EditorUtility.DisplayDialog("SUNBREAK", "Island scene rebuilt:\n" + SunbreakPaths.IslandScenePath, "OK");
        }

        static void BuildInternal()
        {
            KitLibrary.ClearCache();
            EnsureFolders();
            // Shaders created at runtime via Shader.Find (combat VFX, pickups, health bars) get
            // stripped from the build unless always-included — this caused ArgumentNullException on
            // launch. Pin them so they ship.
            EnsureAlwaysIncludedShaders("Universal Render Pipeline/Unlit", "SUNBREAK/VertexColorLit");
            // Nature palms keep their imported colours (materials-on import).
            AssetDatabase.ImportAsset(KitLibrary.NatureKit, ImportAssetOptions.ForceUpdate | ImportAssetOptions.ImportRecursive);

            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            // 1) The Slice 1 look, unchanged (the day-night system takes over the sun at runtime).
            SunbreakLook.ConfigureGroundTextureImporters();
            SunbreakLook.SetupSky();
            var sun = SunbreakLook.CreateSun();
            SunbreakLook.ConfigureFog();
            SunbreakLook.CreateVolume();

            // 2) Materials (asset refs so the scene serialises cleanly).
            Material cityMat = Instanced(KitLibrary.GetKitMaterial(KitLibrary.CommercialKit));
            Material carMat = Instanced(KitLibrary.GetKitMaterial(KitLibrary.CarKit));
            Material propMat = Instanced(KitLibrary.GetKitMaterial(KitLibrary.RoadsKit));
            Material roadMat = Instanced(SunbreakLook.MakePbrGround("Island_Road_Asphalt",
                "Assets/SUNBREAK/Art/Environment/Textures/Asphalt025A", "Asphalt025A_2K-JPG",
                new Vector2(1f, 1f), 0.3f));
            Material terrainMat = VtxColorMat("Island_Ground");
            Material seaMat = SeaMat();

            // 3) The runtime generator + its model/material references.
            var genGo = new GameObject("CityGenerator");
            var gen = genGo.AddComponent<CityGenerator>();
            gen.midRise = LoadList(KitLibrary.CommercialKit, Series("building-", 'a', 'n'));
            gen.skyscrapers = LoadList(KitLibrary.CommercialKit, Series("building-skyscraper-", 'a', 'e'));
            var low = new List<string>(Series("low-detail-building-", 'a', 'n')) { "low-detail-building-wide-a", "low-detail-building-wide-b" };
            gen.lowDetail = LoadList(KitLibrary.CommercialKit, low.ToArray());
            gen.palms = LoadList(KitLibrary.NatureKit, new[]
            {
                "tree_palmDetailedTall", "tree_palmDetailedShort", "tree_palm",
                "tree_palmBend", "tree_palmShort", "tree_palmTall",
            });
            gen.streetlight = KitLibrary.Has(KitLibrary.RoadsKit, "light-curved")
                ? KitLibrary.LoadModel(KitLibrary.RoadsKit, "light-curved")
                : KitLibrary.LoadModel(KitLibrary.RoadsKit, "light-square");
            gen.carBody = KitLibrary.LoadModel(KitLibrary.CarKit, "sedan");
            gen.carWheel = KitLibrary.LoadModel(KitLibrary.CarKit, "wheel-default");
            gen.cityMat = cityMat; gen.carMat = carMat; gen.propMat = propMat;
            gen.terrainMat = terrainMat; gen.roadMat = roadMat; gen.seaMat = seaMat;

            // 4) Player + character + systems.
            var animResult = HumanoidAnimatorSetup.Build();
            var player = BuildPlayer(animResult, out GameObject characterVisual, out Transform camTarget, out Transform headTarget);
            var state = player.gameObject.AddComponent<PlayerState>();

            // 5) Cameras.
            BuildCameras(player, camTarget, headTarget, out PlayerCameraController camCtrl);

            // 6) Vehicle interaction.
            var vehicle = player.gameObject.AddComponent<VehicleInteraction>();
            vehicle.player = player;
            vehicle.cam = camCtrl;
            vehicle.characterController = player.GetComponent<CharacterController>();
            vehicle.playerVisual = characterVisual;
            vehicle.onFootCameraTarget = camTarget;

            // 7) Crime loop — combat VFX, crowd factory, wanted/police, peds, traffic, NavMesh.
            new GameObject("CombatFx").AddComponent<CombatFx>();

            var crowd = new GameObject("CrowdFactory").AddComponent<CrowdFactory>();
            crowd.characterModel = animResult.characterModel;
            crowd.avatar = animResult.characterAvatar;
            crowd.controller = animResult.controller;

            var wanted = new GameObject("WantedSystem").AddComponent<WantedSystem>();
            wanted.player = player.transform; wanted.playerState = state; wanted.crowd = crowd; wanted.city = gen;

            var peds = new GameObject("PedManager").AddComponent<PedManager>();
            peds.crowd = crowd;

            var traffic = new GameObject("TrafficManager").AddComponent<TrafficManager>();
            traffic.city = gen;

            var dayNight = new GameObject("DayNight").AddComponent<DayNightSystem>();
            dayNight.sun = sun; dayNight.cityMat = cityMat; dayNight.propMat = propMat;

            var navGo = new GameObject("NavMesh");
            var surface = navGo.AddComponent<NavMeshSurface>();
            surface.collectObjects = CollectObjects.Volume;
            surface.center = Vector3.zero;
            surface.size = new Vector3(Geography.CITY_HALF * 2f + 80f, 60f, Geography.CITY_HALF * 2f + 80f);
            surface.useGeometry = NavMeshCollectGeometry.PhysicsColliders;
            navGo.AddComponent<RuntimeNavMesh>();

            var combat = player.gameObject.AddComponent<PlayerCombat>();
            combat.controller = player; combat.cameraController = camCtrl;

            var pickup = new GameObject("WeaponPickup").AddComponent<WeaponPickup>();
            pickup.transform.position = Geography.PLAYER_SPAWN.position + new Vector3(3f, 1f, 3f);
            pickup.weaponId = "rifle_carbine";

            // 7b) Slice 4 — interaction, economy shops, missions, save session, menus.
            player.gameObject.AddComponent<PlayerInteractor>();
            new GameObject("ShopMenu").AddComponent<ShopMenu>();
            new GameObject("PauseMenu").AddComponent<PauseMenu>();
            var missions = new GameObject("MissionSystem").AddComponent<Missions.MissionSystem>();
            var session = new GameObject("GameSession").AddComponent<Save.GameSession>();
            session.state = state; session.player = player; session.combat = combat;
            BuildEconomy();

            // 7c) Audio — bus + ambient bed, footsteps, car radio (engine audio is per-car).
            new GameObject("GameAudio").AddComponent<Audio.GameAudio>();
            player.gameObject.AddComponent<Audio.FootstepAudio>().controller = player;
            var radio = player.gameObject.AddComponent<Audio.CarRadio>();
            radio.vehicle = vehicle;

            // 8) Minimap + HUD.
            var mmGo = new GameObject("Minimap Camera");
            var minimap = mmGo.AddComponent<MinimapController>();
            minimap.target = player.transform;

            var hudGo = new GameObject("Game HUD");
            var hud = hudGo.AddComponent<GameHUD>();
            hud.state = state; hud.player = player.transform; hud.minimap = minimap; hud.vehicle = vehicle;
            hud.wanted = wanted; hud.combat = combat;
            hud.interactor = player.GetComponent<PlayerInteractor>();
            hud.missions = missions; hud.dayNight = dayNight; hud.radio = radio;

            // 9) World bounds (respawn on fall/out-of-bounds + on death; clears wanted).
            var boundsGo = new GameObject("World Bounds");
            var bounds = boundsGo.AddComponent<WorldBounds>();
            bounds.player = player; bounds.vehicle = vehicle; bounds.state = state; bounds.wanted = wanted;

            // NOTE: the city is intentionally NOT generated into the saved scene — it is built
            // at runtime (CityGenerator.Awake) and by the capture tool, so the .unity file stays
            // tiny (a few KB) and the repo stays lean. Use the component's "Generate (preview)"
            // context menu to see it in the editor.

            EditorSceneManager.MarkSceneDirty(scene);
            if (!EditorSceneManager.SaveScene(scene, SunbreakPaths.IslandScenePath))
                throw new Exception("Failed to save scene to " + SunbreakPaths.IslandScenePath);
            SetAsFirstBuildScene(SunbreakPaths.IslandScenePath);
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            Debug.Log($"SUNBREAK_ISLAND_CHARACTER: {animResult.note}");
        }

        // ── Player ───────────────────────────────────────────────────────────────
        static PlayerController BuildPlayer(HumanoidAnimatorSetup.Result anim, out GameObject characterVisual,
            out Transform camTarget, out Transform headTarget)
        {
            Vector3 spawn = Geography.PLAYER_SPAWN.position + Vector3.up * 0.5f;
            var player = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            player.name = "Player";
            player.tag = "Player";
            UnityEngine.Object.DestroyImmediate(player.GetComponent<Collider>());
            player.transform.SetPositionAndRotation(spawn, Quaternion.Euler(0f, Geography.PLAYER_SPAWN.yaw, 0f));
            var capsuleMr = player.GetComponent<MeshRenderer>();
            capsuleMr.enabled = false;

            var cc = player.AddComponent<CharacterController>();
            cc.height = 2f; cc.radius = 0.4f; cc.center = Vector3.zero; cc.slopeLimit = 55f; cc.stepOffset = 0.4f;

            var controller = player.AddComponent<PlayerController>();
            var locomotion = player.AddComponent<PlayerLocomotionAnimator>();

            Animator animator;
            characterVisual = null;
            if (anim.characterModel != null)
            {
                var charGo = (GameObject)PrefabUtility.InstantiatePrefab(anim.characterModel);
                charGo.name = "Character";
                charGo.transform.SetParent(player.transform, false);
                charGo.transform.localScale = Vector3.one;
                Bounds b = KitLibrary.WorldBounds(charGo);
                charGo.transform.localScale = Vector3.one * (1.9f / Mathf.Max(0.01f, b.size.y));
                b = KitLibrary.WorldBounds(charGo);
                float localFeet = b.min.y - player.transform.position.y;
                charGo.transform.localPosition += new Vector3(0f, -1f - localFeet, 0f);
                animator = charGo.GetComponent<Animator>() ?? charGo.AddComponent<Animator>();
                if (anim.characterAvatar != null) animator.avatar = anim.characterAvatar;
                characterVisual = charGo;
            }
            else
            {
                capsuleMr.enabled = true;
                animator = player.AddComponent<Animator>();
            }
            animator.runtimeAnimatorController = anim.controller;
            animator.applyRootMotion = false;
            locomotion.animator = animator;

            camTarget = new GameObject("CameraTarget").transform;
            camTarget.SetParent(player.transform, false);
            camTarget.localPosition = new Vector3(0f, 0.6f, 0f);
            headTarget = new GameObject("HeadTarget").transform;
            headTarget.SetParent(player.transform, false);
            headTarget.localPosition = new Vector3(0f, 0.75f, 0.1f);
            return controller;
        }

        static void BuildCameras(PlayerController player, Transform camTarget, Transform headTarget,
            out PlayerCameraController camCtrl)
        {
            var camGo = new GameObject("Main Camera");
            camGo.tag = "MainCamera";
            var cam = camGo.AddComponent<Camera>();
            cam.nearClipPlane = 0.1f; cam.farClipPlane = 1400f;
            var camData = cam.GetUniversalAdditionalCameraData();
            camData.renderPostProcessing = true;
            camData.antialiasing = AntialiasingMode.SubpixelMorphologicalAntiAliasing;
            camGo.AddComponent<CinemachineBrain>();
            camGo.transform.position = camTarget.position + new Vector3(2f, 2f, -6f);

            var tpGo = new GameObject("CM ThirdPerson");
            var tp = tpGo.AddComponent<CinemachineCamera>();
            tp.Follow = camTarget; tp.LookAt = camTarget; tp.Lens.FieldOfView = 52f; tp.Priority = 20;
            var orbital = tpGo.AddComponent<CinemachineOrbitalFollow>();
            orbital.OrbitStyle = CinemachineOrbitalFollow.OrbitStyles.Sphere;
            orbital.Radius = 6.5f;
            orbital.HorizontalAxis.Range = new Vector2(-180f, 180f);
            orbital.HorizontalAxis.Wrap = true;
            orbital.VerticalAxis.Range = new Vector2(-30f, 70f);
            orbital.VerticalAxis.Value = 12f;
            orbital.HorizontalAxis.Value = Geography.PLAYER_SPAWN.yaw;
            tpGo.AddComponent<CinemachineRotationComposer>();

            var fpGo = new GameObject("CM FirstPerson");
            var fp = fpGo.AddComponent<CinemachineCamera>();
            fp.Lens.FieldOfView = 62f; fp.Priority = 0;

            camCtrl = camGo.AddComponent<PlayerCameraController>();
            camCtrl.player = player;
            camCtrl.thirdPersonCam = tp;
            camCtrl.orbital = orbital;
            camCtrl.firstPersonCam = fp;
            camCtrl.headTarget = headTarget;
        }

        // ── Economy placement (shops + cash) ─────────────────────────────────────
        static void BuildEconomy()
        {
            Vector3 s = Geography.PLAYER_SPAWN.position;
            MakeShop("Gun Store", ShopKind.GunStore, s + new Vector3(12f, 1f, -9f));
            MakeShop("Bank", ShopKind.Bank, s + new Vector3(-15f, 1f, -7f));
            MakeShop("Car Dealership", ShopKind.CarDealer, s + new Vector3(27f, 1f, -20f));
            // Extra storefronts across the districts.
            MakeShop("Gun Store (Uptown)", ShopKind.GunStore, s + new Vector3(-70f, 1f, 96f));
            MakeShop("Bank (Waterfront)", ShopKind.Bank, s + new Vector3(128f, 1f, 12f));
            MakeShop("Car Dealership (Docks)", ShopKind.CarDealer, s + new Vector3(60f, 1f, -120f));

            MakeCash(s + new Vector3(5f, 1f, 20f), 200);
            MakeCash(s + new Vector3(-24f, 1f, 16f), 250);
            MakeCash(s + new Vector3(44f, 1f, 34f), 300);
            MakeCash(s + new Vector3(2f, 1f, 66f), 250);
            MakeCash(s + new Vector3(-40f, 1f, -30f), 300);
        }

        static void MakeShop(string name, ShopKind kind, Vector3 pos)
        {
            var go = new GameObject(name) { transform = { position = pos } };
            var shop = go.AddComponent<Shop>();
            shop.kind = kind; shop.range = 4.5f;
        }

        static void MakeCash(Vector3 pos, int amount)
        {
            var go = new GameObject("Cash") { transform = { position = pos } };
            go.AddComponent<CashPickup>().amount = amount;
        }

        // ── Materials ──────────────────────────────────────────────────────────
        static Material Instanced(Material m)
        {
            if (m != null) { m.enableInstancing = true; EditorUtility.SetDirty(m); }
            return m;
        }

        static Material VtxColorMat(string name)
        {
            string path = $"{MatDir}/{name}.mat";
            var mat = AssetDatabase.LoadAssetAtPath<Material>(path);
            Shader sh = Shader.Find("SUNBREAK/VertexColorLit") ?? Shader.Find("Universal Render Pipeline/Lit");
            if (mat == null) { mat = new Material(sh) { name = name }; AssetDatabase.CreateAsset(mat, path); }
            else mat.shader = sh;
            if (mat.HasProperty("_Smoothness")) mat.SetFloat("_Smoothness", 0.05f);
            mat.enableInstancing = true;
            EditorUtility.SetDirty(mat);
            return mat;
        }

        static Material SeaMat()
        {
            string path = $"{MatDir}/Island_Sea.mat";
            var mat = AssetDatabase.LoadAssetAtPath<Material>(path);
            Shader lit = Shader.Find("Universal Render Pipeline/Lit");
            if (mat == null) { mat = new Material(lit) { name = "Island_Sea" }; AssetDatabase.CreateAsset(mat, path); }
            else mat.shader = lit;
            mat.SetColor("_BaseColor", new Color(0.08f, 0.24f, 0.34f));
            if (mat.HasProperty("_Smoothness")) mat.SetFloat("_Smoothness", 0.85f);
            if (mat.HasProperty("_Metallic")) mat.SetFloat("_Metallic", 0.1f);
            mat.enableInstancing = true;
            EditorUtility.SetDirty(mat);
            return mat;
        }

        // ── Helpers ────────────────────────────────────────────────────────────
        static string[] Series(string prefix, char from, char to)
        {
            var l = new List<string>();
            for (char c = from; c <= to; c++) l.Add(prefix + c);
            return l.ToArray();
        }

        static GameObject[] LoadList(string kitDir, string[] names)
        {
            var l = new List<GameObject>();
            foreach (var n in names)
            {
                if (!KitLibrary.Has(kitDir, n)) continue;
                var go = KitLibrary.LoadModel(kitDir, n);
                if (go != null) l.Add(go);
            }
            return l.ToArray();
        }

        /// <summary>Pin shaders that are only referenced via runtime Shader.Find so the build ships them.</summary>
        static void EnsureAlwaysIncludedShaders(params string[] names)
        {
            var gs = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/GraphicsSettings.asset");
            if (gs == null || gs.Length == 0) return;
            var so = new SerializedObject(gs[0]);
            var arr = so.FindProperty("m_AlwaysIncludedShaders");
            if (arr == null) return;
            bool changed = false;
            foreach (var name in names)
            {
                var sh = Shader.Find(name);
                if (sh == null) continue;
                bool present = false;
                for (int i = 0; i < arr.arraySize; i++)
                    if (arr.GetArrayElementAtIndex(i).objectReferenceValue == sh) { present = true; break; }
                if (present) continue;
                arr.InsertArrayElementAtIndex(arr.arraySize);
                arr.GetArrayElementAtIndex(arr.arraySize - 1).objectReferenceValue = sh;
                changed = true;
            }
            if (changed) { so.ApplyModifiedProperties(); AssetDatabase.SaveAssets(); }
        }

        static void EnsureFolders()
        {
            foreach (var (p, c) in new[] { ("Assets/SUNBREAK", "Scenes"), ("Assets/SUNBREAK", "Settings"),
                ("Assets/SUNBREAK/Art", "Materials") })
                if (!AssetDatabase.IsValidFolder(p + "/" + c)) AssetDatabase.CreateFolder(p, c);
        }

        static void SetAsFirstBuildScene(string scenePath)
        {
            var scenes = new List<EditorBuildSettingsScene> { new EditorBuildSettingsScene(scenePath, true) };
            foreach (var s in EditorBuildSettings.scenes)
                if (s.path != scenePath) scenes.Add(new EditorBuildSettingsScene(s.path, false));
            EditorBuildSettings.scenes = scenes.ToArray();
        }
    }
}
