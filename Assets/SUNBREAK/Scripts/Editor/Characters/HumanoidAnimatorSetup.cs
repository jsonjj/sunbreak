using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.Animations;
using UnityEngine;

namespace SUNBREAK.EditorTools.Characters
{
    /// <summary>
    /// Imports the Mixamo drop as Humanoid and builds the shared animator controller:
    /// a base locomotion blend tree (plain Idle/Walk/Run) plus ARMED states (Pistol / Rifle
    /// idle→run blends) and a Fire state, switched by Armed / WeaponType / Fire params so weapons
    /// get a real hold + firing pose. Also collects EVERY skinned character FBX (for crowd variety)
    /// and designates a police/SWAT model. Weapon-specific fire/reload clips that are missing are
    /// reported by <see cref="Result.note"/> so the user knows exactly what to add.
    /// </summary>
    public static class HumanoidAnimatorSetup
    {
        public const string CharDir = "Assets/SUNBREAK/Art/Characters";
        public const string MixamoDir = CharDir + "/Mixamo";
        public const string ControllerPath = CharDir + "/PlayerLocomotion.controller";

        // Filename substring that marks the intended police/SWAT model (case-insensitive). The user
        // designated Ch15 as the SWAT rig; other hints are kept for future drops. If none match, the
        // last character in the roster is used so police still look distinct.
        static readonly string[] PoliceHints = { "ch15", "swat", "police", "cop", "tactical" };

        public struct Result
        {
            public AnimatorController controller;
            public bool clipsWired;
            public int humanoidModels;
            public GameObject characterModel;   // player rig (roster[0])
            public Avatar characterAvatar;
            public GameObject[] characterModels; // full roster (crowd variety)
            public Avatar[] characterAvatars;
            public GameObject policeModel;       // SWAT / police
            public Avatar policeAvatar;
            public string note;
        }

        public static Result Build()
        {
            EnsureFolder(CharDir);
            EnsureFolder(MixamoDir);

            var clips = new Dictionary<string, AnimationClip>();
            var models = new List<GameObject>();
            var avatars = new List<Avatar>();
            int policeIdx = -1;
            int humanoidCount = 0;

            foreach (var guid in AssetDatabase.FindAssets("t:Model", new[] { MixamoDir }))
            {
                string path = AssetDatabase.GUIDToAssetPath(guid);
                if (AssetImporter.GetAtPath(path) is not ModelImporter mi) continue;

                string lower = Path.GetFileNameWithoutExtension(path).ToLowerInvariant();
                string role = RoleFor(lower);
                bool wantLoop = LoopRole(role);

                bool reimport = false;
                if (mi.animationType != ModelImporterAnimationType.Human)
                {
                    mi.animationType = ModelImporterAnimationType.Human;
                    mi.avatarSetup = ModelImporterAvatarSetup.CreateFromThisModel;
                    reimport = true;
                }
                if (wantLoop) reimport |= SetClipsLooping(mi);

                var asset = AssetDatabase.LoadAssetAtPath<GameObject>(path);
                bool isCharacter = asset != null && asset.GetComponentInChildren<SkinnedMeshRenderer>() != null && role == null && !IsAnimName(lower);

                if (isCharacter && mi.materialImportMode != ModelImporterMaterialImportMode.ImportViaMaterialDescription)
                {
                    mi.materialImportMode = ModelImporterMaterialImportMode.ImportViaMaterialDescription;
                    reimport = true;
                }
                if (reimport) mi.SaveAndReimport();
                humanoidCount++;

                if (isCharacter)
                {
                    var model = AssetDatabase.LoadAssetAtPath<GameObject>(path);
                    Avatar av = null;
                    foreach (var obj in AssetDatabase.LoadAllAssetsAtPath(path))
                        if (obj is Avatar a) { av = a; break; }
                    models.Add(model); avatars.Add(av);
                    foreach (var h in PoliceHints) if (lower.Contains(h)) { policeIdx = models.Count - 1; break; }
                    continue;
                }

                // Animation clip → keyed by role (base + weapon + reactions).
                if (role == null) continue;
                foreach (var obj in AssetDatabase.LoadAllAssetsAtPath(path))
                    if (obj is AnimationClip clip && !clip.name.StartsWith("__preview") && !clips.ContainsKey(role))
                        clips[role] = clip;
            }

            // Textures for the character we extracted earlier already exist; other rigs use the
            // embedded material description import so they aren't blank grey.
            if (models.Count > 0)
            {
                var mi0 = AssetImporter.GetAtPath(AssetDatabase.GetAssetPath(models[0])) as ModelImporter;
                if (mi0 != null) TryExtractTextures(mi0);
            }

            if (policeIdx < 0 && models.Count > 1) policeIdx = models.Count - 1; // distinct from civilians

            var controller = BuildController(clips);

            GameObject policeModel = policeIdx >= 0 && policeIdx < models.Count ? models[policeIdx] : null;
            Avatar policeAvatar = policeIdx >= 0 && policeIdx < avatars.Count ? avatars[policeIdx] : null;

            // Civilian roster EXCLUDES the police/SWAT rig so cops stay visually distinct.
            var civModels = new List<GameObject>();
            var civAvatars = new List<Avatar>();
            for (int i = 0; i < models.Count; i++)
            {
                if (i == policeIdx) continue;
                civModels.Add(models[i]); civAvatars.Add(i < avatars.Count ? avatars[i] : null);
            }
            if (civModels.Count == 0) { civModels.AddRange(models); civAvatars.AddRange(avatars); }

            GameObject playerModel = civModels.Count > 0 ? civModels[0] : policeModel;
            Avatar playerAvatar = civAvatars.Count > 0 ? civAvatars[0] : policeAvatar;
            if (playerAvatar == null) foreach (var a in civAvatars) if (a != null) { playerAvatar = a; break; }

            bool wired = clips.ContainsKey("idle") || clips.ContainsKey("walk") || clips.ContainsKey("run");
            return new Result
            {
                controller = controller,
                clipsWired = wired,
                humanoidModels = humanoidCount,
                characterModel = playerModel,
                characterAvatar = playerAvatar,
                characterModels = civModels.ToArray(),
                characterAvatars = civAvatars.ToArray(),
                policeModel = policeModel ?? playerModel,
                policeAvatar = policeModel != null ? policeAvatar : playerAvatar,
                note = BuildNote(clips, civModels, policeModel),
            };
        }

        static AnimatorController BuildController(Dictionary<string, AnimationClip> clips)
        {
            AssetDatabase.DeleteAsset(ControllerPath);
            var controller = AnimatorController.CreateAnimatorControllerAtPath(ControllerPath);
            controller.AddParameter("Speed", AnimatorControllerParameterType.Float);
            controller.AddParameter("MotionSpeed", AnimatorControllerParameterType.Float);
            controller.AddParameter("Grounded", AnimatorControllerParameterType.Bool);
            controller.AddParameter("Jump", AnimatorControllerParameterType.Trigger);
            controller.AddParameter("Armed", AnimatorControllerParameterType.Bool);
            controller.AddParameter("WeaponType", AnimatorControllerParameterType.Int); // 0 unarmed,1 pistol,2 rifle
            controller.AddParameter("Fire", AnimatorControllerParameterType.Trigger);

            var sm = controller.layers[0].stateMachine;

            clips.TryGetValue("idle", out var idle);
            clips.TryGetValue("walk", out var walk);
            clips.TryGetValue("run", out var run);
            var unarmed = sm.AddState("Unarmed");
            unarmed.motion = MoveTree(controller, "Locomotion", idle, walk, run);
            sm.defaultState = unarmed;

            clips.TryGetValue("pistol_idle", out var pIdle);
            clips.TryGetValue("pistol_run", out var pRun);
            var pistol = sm.AddState("PistolMove");
            pistol.motion = MoveTree(controller, "PistolMove", pIdle ?? idle, pIdle ?? walk, pRun ?? run);

            clips.TryGetValue("rifle_idle", out var rIdle);
            clips.TryGetValue("rifle_run", out var rRun);
            var rifle = sm.AddState("RifleMove");
            rifle.motion = MoveTree(controller, "RifleMove", rIdle ?? idle, rIdle ?? walk, rRun ?? run);

            clips.TryGetValue("fire", out var fire);
            var fireState = sm.AddState("Fire");
            fireState.motion = fire ?? rIdle ?? idle;

            // Transitions: switch armed states by WeaponType, fire from armed → back.
            ArmedTransition(unarmed, pistol, 1);
            ArmedTransition(unarmed, rifle, 2);
            ArmedTransition(pistol, unarmed, 0);
            ArmedTransition(pistol, rifle, 2);
            ArmedTransition(rifle, unarmed, 0);
            ArmedTransition(rifle, pistol, 1);

            foreach (var armed in new[] { pistol, rifle })
            {
                var toFire = armed.AddTransition(fireState);
                toFire.AddCondition(AnimatorConditionMode.If, 0f, "Fire");
                toFire.hasExitTime = false; toFire.duration = 0.02f;
            }
            var back = fireState.AddTransition(rifle);
            back.AddCondition(AnimatorConditionMode.Equals, 2, "WeaponType");
            back.hasExitTime = true; back.exitTime = 0.5f; back.duration = 0.1f;
            var backP = fireState.AddTransition(pistol);
            backP.AddCondition(AnimatorConditionMode.Equals, 1, "WeaponType");
            backP.hasExitTime = true; backP.exitTime = 0.5f; backP.duration = 0.1f;

            EditorUtility.SetDirty(controller);
            return controller;
        }

        static void ArmedTransition(AnimatorState from, AnimatorState to, int weaponType)
        {
            var t = from.AddTransition(to);
            t.AddCondition(AnimatorConditionMode.Equals, weaponType, "WeaponType");
            t.hasExitTime = false; t.duration = 0.15f;
        }

        static BlendTree MoveTree(AnimatorController c, string name, Motion idle, Motion walk, Motion run)
        {
            var tree = new BlendTree { name = name, blendType = BlendTreeType.Simple1D, blendParameter = "Speed", useAutomaticThresholds = false };
            AssetDatabase.AddObjectToAsset(tree, c);
            tree.children = new[]
            {
                new ChildMotion { motion = idle, threshold = 0f, timeScale = 1f },
                new ChildMotion { motion = walk, threshold = 2.0f, timeScale = 1f },
                new ChildMotion { motion = run, threshold = 5.5f, timeScale = 1f },
            };
            return tree;
        }

        static string BuildNote(Dictionary<string, AnimationClip> clips, List<GameObject> civModels, GameObject policeModel)
        {
            string Have(string k) => clips.ContainsKey(k) ? "ok" : "MISSING";
            string police = policeModel != null ? policeModel.name : "none";
            return $"civilians={civModels.Count}, police='{police}'. " +
                   $"base idle/walk/run={Have("idle")}/{Have("walk")}/{Have("run")}; " +
                   $"pistol idle/run={Have("pistol_idle")}/{Have("pistol_run")}; " +
                   $"rifle idle/run/fire={Have("rifle_idle")}/{Have("rifle_run")}/{Have("fire")}. " +
                   "MISSING for full combat: pistol FIRE, pistol/rifle RELOAD, unarmed death, per-weapon shotgun/smg/sniper/rpg fire.";
        }

        static void TryExtractTextures(ModelImporter mi)
        {
            try
            {
                string texDir = MixamoDir + "/Textures";
                bool already = AssetDatabase.IsValidFolder(texDir) &&
                               AssetDatabase.FindAssets("t:Texture2D", new[] { texDir }).Length > 0;
                if (mi.materialImportMode != ModelImporterMaterialImportMode.ImportViaMaterialDescription)
                    mi.materialImportMode = ModelImporterMaterialImportMode.ImportViaMaterialDescription;
                if (!already) { EnsureFolder(texDir); mi.ExtractTextures(texDir); AssetDatabase.Refresh(); }
                mi.SaveAndReimport();
            }
            catch (System.Exception e) { Debug.LogWarning("[HumanoidAnimatorSetup] texture extract failed: " + e.Message); }
        }

        static bool SetClipsLooping(ModelImporter mi)
        {
            var clips = mi.clipAnimations;
            if (clips == null || clips.Length == 0) clips = mi.defaultClipAnimations;
            if (clips == null || clips.Length == 0) return false;
            bool changed = false;
            for (int i = 0; i < clips.Length; i++) if (!clips[i].loopTime) { clips[i].loopTime = true; changed = true; }
            if (changed) mi.clipAnimations = clips;
            return changed;
        }

        static bool LoopRole(string role) =>
            role is "idle" or "walk" or "run" or "pistol_idle" or "pistol_run" or "rifle_idle" or "rifle_run";

        static bool IsAnimName(string n) =>
            n.Contains("idle") || n.Contains("walk") || n.Contains("run") || n.Contains("jog") || n.Contains("sprint") ||
            n.Contains("jump") || n.Contains("fire") || n.Contains("firing") || n.Contains("hit") || n.Contains("death") ||
            n.Contains("kneel") || n.Contains("put away") || n.Contains("stomach") || n.Contains("reaction") ||
            n.Contains("pistol") || n.Contains("rifle") || n.Contains("shot") || n.Contains("aim");

        /// <summary>Map a filename to an animation role (weapon-specific first, then plain locomotion).</summary>
        static string RoleFor(string n)
        {
            if (n.Contains("pistol") && n.Contains("idle")) return "pistol_idle";
            if (n.Contains("pistol") && n.Contains("run")) return "pistol_run";
            if (n.Contains("rifle") && n.Contains("idle")) return "rifle_idle";
            if (n.Contains("rifle") && n.Contains("run")) return "rifle_run";
            if (n.Contains("firing") || (n.Contains("rifle") && n.Contains("fire"))) return "fire";
            bool weapon = n.Contains("pistol") || n.Contains("rifle") || n.Contains("firing") || n.Contains("aim") || n.Contains("shot");
            if (weapon) return null; // other weapon clips (kneeling/walk-back/put-away/death) unused for now
            if (n.Contains("idle")) return "idle";
            if (n.Contains("run") || n.Contains("jog") || n.Contains("sprint")) return "run";
            if (n.Contains("walk")) return "walk";
            return null;
        }

        static void EnsureFolder(string path)
        {
            if (AssetDatabase.IsValidFolder(path)) return;
            string parent = Path.GetDirectoryName(path).Replace('\\', '/');
            string leaf = Path.GetFileName(path);
            if (!AssetDatabase.IsValidFolder(parent)) EnsureFolder(parent);
            AssetDatabase.CreateFolder(parent, leaf);
        }
    }
}
