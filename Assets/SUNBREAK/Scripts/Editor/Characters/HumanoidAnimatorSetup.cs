using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.Animations;
using UnityEngine;

namespace SUNBREAK.EditorTools.Characters
{
    /// <summary>
    /// Builds the Humanoid locomotion rig so dropping in a Mixamo character later is trivial:
    /// an AnimatorController with a 1D <c>Speed</c> blend tree (Idle → Walk → Run) plus
    /// Grounded/Jump params, driven at runtime by <c>PlayerLocomotionAnimator</c>.
    ///
    /// If Humanoid FBX are present under <c>Art/Characters/Mixamo/</c> it retargets them
    /// (sets Animation Type = Humanoid) and wires the Idle/Walk/Run clips into the tree by
    /// filename. If none are present it leaves the three blend slots empty and reports that
    /// the rig is awaiting the Mixamo drop — the greybox capsule stays as the placeholder.
    /// </summary>
    public static class HumanoidAnimatorSetup
    {
        public const string CharDir = "Assets/SUNBREAK/Art/Characters";
        public const string MixamoDir = CharDir + "/Mixamo";
        public const string ControllerPath = CharDir + "/PlayerLocomotion.controller";

        public struct Result
        {
            public AnimatorController controller;
            public bool clipsWired;
            public int humanoidModels;
            /// <summary>The skinned character FBX to use as the player visual (or null).</summary>
            public GameObject characterModel;
            /// <summary>The character's Humanoid avatar (or null).</summary>
            public Avatar characterAvatar;
            public string note;
        }

        public static Result Build()
        {
            EnsureFolder(CharDir);
            EnsureFolder(MixamoDir);

            // Discover + retarget any Mixamo humanoid FBX.
            var clips = new Dictionary<string, AnimationClip>(); // role -> clip
            int humanoidCount = 0;
            GameObject characterModel = null;
            Avatar characterAvatar = null;

            foreach (var guid in AssetDatabase.FindAssets("t:Model", new[] { MixamoDir }))
            {
                string path = AssetDatabase.GUIDToAssetPath(guid);
                if (AssetImporter.GetAtPath(path) is not ModelImporter mi) continue;

                string lower = Path.GetFileNameWithoutExtension(path).ToLowerInvariant();
                string role = RoleFor(lower);
                bool wantLoop = role == "idle" || role == "walk" || role == "run";

                bool reimport = false;
                if (mi.animationType != ModelImporterAnimationType.Human)
                {
                    mi.animationType = ModelImporterAnimationType.Human;
                    mi.avatarSetup = ModelImporterAvatarSetup.CreateFromThisModel;
                    reimport = true;
                }
                if (wantLoop) reimport |= SetClipsLooping(mi);
                if (reimport) mi.SaveAndReimport();
                humanoidCount++;

                var asset = AssetDatabase.LoadAssetAtPath<GameObject>(path);
                bool isSkinned = asset != null && asset.GetComponentInChildren<SkinnedMeshRenderer>() != null;

                // The character = a skinned mesh whose name isn't a locomotion role.
                if (isSkinned && role == null && characterModel == null)
                {
                    TryExtractTextures(mi);
                    characterModel = AssetDatabase.LoadAssetAtPath<GameObject>(path);
                    foreach (var obj in AssetDatabase.LoadAllAssetsAtPath(path))
                        if (obj is Avatar av) { characterAvatar = av; break; }
                }

                if (role == null) continue;
                foreach (var obj in AssetDatabase.LoadAllAssetsAtPath(path))
                    if (obj is AnimationClip clip && !clip.name.StartsWith("__preview") && !clips.ContainsKey(role))
                        clips[role] = clip;
            }

            // Fallback: if no dedicated character model, borrow the avatar from any humanoid FBX.
            if (characterAvatar == null)
            {
                foreach (var guid in AssetDatabase.FindAssets("t:Model", new[] { MixamoDir }))
                {
                    string path = AssetDatabase.GUIDToAssetPath(guid);
                    foreach (var obj in AssetDatabase.LoadAllAssetsAtPath(path))
                        if (obj is Avatar av) { characterAvatar = av; break; }
                    var asset = AssetDatabase.LoadAssetAtPath<GameObject>(path);
                    if (characterModel == null && asset != null &&
                        asset.GetComponentInChildren<SkinnedMeshRenderer>() != null)
                        characterModel = asset;
                    if (characterAvatar != null) break;
                }
            }

            AssetDatabase.DeleteAsset(ControllerPath);
            var controller = AnimatorController.CreateAnimatorControllerAtPath(ControllerPath);
            controller.AddParameter("Speed", AnimatorControllerParameterType.Float);
            controller.AddParameter("MotionSpeed", AnimatorControllerParameterType.Float);
            controller.AddParameter("Grounded", AnimatorControllerParameterType.Bool);
            controller.AddParameter("Jump", AnimatorControllerParameterType.Trigger);

            var tree = new BlendTree
            {
                name = "Locomotion",
                blendType = BlendTreeType.Simple1D,
                blendParameter = "Speed",
                useAutomaticThresholds = false,
            };
            AssetDatabase.AddObjectToAsset(tree, controller);

            clips.TryGetValue("idle", out var idle);
            clips.TryGetValue("walk", out var walk);
            clips.TryGetValue("run", out var run);
            tree.children = new[]
            {
                new ChildMotion { motion = idle, threshold = 0f,   timeScale = 1f },
                new ChildMotion { motion = walk, threshold = 2.0f, timeScale = 1f },
                new ChildMotion { motion = run,  threshold = 5.5f, timeScale = 1f },
            };

            var sm = controller.layers[0].stateMachine;
            var state = sm.AddState("Locomotion");
            state.motion = tree;
            sm.defaultState = state;

            EditorUtility.SetDirty(controller);

            bool wired = idle != null || walk != null || run != null;
            string charName = characterModel != null ? characterModel.name : "none";
            return new Result
            {
                controller = controller,
                clipsWired = wired,
                humanoidModels = humanoidCount,
                characterModel = characterModel,
                characterAvatar = characterAvatar,
                note = wired
                    ? $"Wired Mixamo Humanoid (character='{charName}', avatar={(characterAvatar != null)}): " +
                      $"idle={(idle != null)}, walk={(walk != null)}, run={(run != null)}."
                    : "AWAITING MIXAMO: blend-tree skeleton created with empty Idle/Walk/Run slots. " +
                      "Drop Humanoid FBX (names containing idle/walk/run) into Art/Characters/Mixamo/ and re-run.",
            };
        }

        /// <summary>Extract the character FBX's embedded textures + build URP materials so it isn't blank grey.</summary>
        static void TryExtractTextures(ModelImporter mi)
        {
            try
            {
                string texDir = MixamoDir + "/Textures";
                bool already = AssetDatabase.IsValidFolder(texDir) &&
                               AssetDatabase.FindAssets("t:Texture2D", new[] { texDir }).Length > 0;
                if (mi.materialImportMode != ModelImporterMaterialImportMode.ImportViaMaterialDescription)
                    mi.materialImportMode = ModelImporterMaterialImportMode.ImportViaMaterialDescription;
                if (!already)
                {
                    EnsureFolder(texDir);
                    mi.ExtractTextures(texDir);
                    AssetDatabase.Refresh();
                }
                mi.SaveAndReimport();
            }
            catch (System.Exception e)
            {
                Debug.LogWarning("[HumanoidAnimatorSetup] texture extract failed: " + e.Message);
            }
        }

        /// <summary>Force the FBX's animation take(s) to loop (for locomotion clips). Returns true if changed.</summary>
        static bool SetClipsLooping(ModelImporter mi)
        {
            var clips = mi.clipAnimations;
            if (clips == null || clips.Length == 0) clips = mi.defaultClipAnimations;
            if (clips == null || clips.Length == 0) return false;
            bool changed = false;
            for (int i = 0; i < clips.Length; i++)
            {
                if (!clips[i].loopTime) { clips[i].loopTime = true; changed = true; }
            }
            if (changed) mi.clipAnimations = clips;
            return changed;
        }

        static string RoleFor(string lower)
        {
            if (lower.Contains("idle")) return "idle";
            if (lower.Contains("run") || lower.Contains("jog") || lower.Contains("sprint")) return "run";
            if (lower.Contains("walk")) return "walk";
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
