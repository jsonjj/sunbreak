using UnityEngine;
using UnityEngine.UI;
using SUNBREAK.Audio;
using SUNBREAK.Cameras;
using SUNBREAK.Player;
using SUNBREAK.World;

namespace SUNBREAK.UI
{
    /// <summary>
    /// Persistent player options (PlayerPrefs) shared by the pause + main-menu settings panels.
    /// <see cref="Apply"/> wires the live values into the audio buses, look sensitivity/invert,
    /// camera FOV, and a screen brightness overlay. Values are clamped to sane ranges.
    /// </summary>
    public static class Settings
    {
        public static float Master = 0.9f, Music = 0.75f, Sfx = 0.9f;
        public static float Sensitivity = 0.12f;   // degrees of look per pixel of mouse delta
        public static bool InvertY = false;
        public static bool AimAssist = true;       // soft-lock aim toward the nearest target while ADS
        public static float Fov = 52f;             // third-person base vertical FOV
        public static float Brightness = 1f;       // 0.6 (dark) .. 1.4 (bright)

        public const float SensMin = 0.03f, SensMax = 0.30f;
        public const float FovMin = 40f, FovMax = 75f;
        public const float BrightMin = 0.6f, BrightMax = 1.4f;

        const string P = "sb_";
        static bool _loaded;

        public static void Load()
        {
            if (_loaded) return;
            _loaded = true;
            Master = PlayerPrefs.GetFloat(P + "master", Master);
            Music = PlayerPrefs.GetFloat(P + "music", Music);
            Sfx = PlayerPrefs.GetFloat(P + "sfx", Sfx);
            Sensitivity = PlayerPrefs.GetFloat(P + "sens", Sensitivity);
            InvertY = PlayerPrefs.GetInt(P + "invy", 0) != 0;
            AimAssist = PlayerPrefs.GetInt(P + "aim", 1) != 0;
            Fov = PlayerPrefs.GetFloat(P + "fov", Fov);
            Brightness = PlayerPrefs.GetFloat(P + "bright", Brightness);
        }

        public static void Save()
        {
            PlayerPrefs.SetFloat(P + "master", Master);
            PlayerPrefs.SetFloat(P + "music", Music);
            PlayerPrefs.SetFloat(P + "sfx", Sfx);
            PlayerPrefs.SetFloat(P + "sens", Sensitivity);
            PlayerPrefs.SetInt(P + "invy", InvertY ? 1 : 0);
            PlayerPrefs.SetInt(P + "aim", AimAssist ? 1 : 0);
            PlayerPrefs.SetFloat(P + "fov", Fov);
            PlayerPrefs.SetFloat(P + "bright", Brightness);
            PlayerPrefs.Save();
        }

        /// <summary>Push the current values into every live system + persist.</summary>
        public static void Apply()
        {
            Load();
            Master = Mathf.Clamp01(Master); Music = Mathf.Clamp01(Music); Sfx = Mathf.Clamp01(Sfx);
            Sensitivity = Mathf.Clamp(Sensitivity, SensMin, SensMax);
            Fov = Mathf.Clamp(Fov, FovMin, FovMax);
            Brightness = Mathf.Clamp(Brightness, BrightMin, BrightMax);

            var audio = GameAudio.Instance;
            if (audio != null) { audio.master = Master; audio.music = Music; audio.sfx = Sfx; }
            AudioListener.volume = Master;

            if (GameRefs.Player != null && GameRefs.Player.TryGetComponent<PlayerController>(out var pc))
            {
                pc.mouseSensitivity = Sensitivity;
                pc.invertY = InvertY;
            }
            var cam = Object.FindFirstObjectByType<PlayerCameraController>();
            if (cam != null) cam.ApplyFov(Fov);

            BrightnessOverlay.Set(Brightness);
            Save();
        }
    }

    /// <summary>A single full-screen tint that darkens/brightens the frame for the brightness slider.</summary>
    public sealed class BrightnessOverlay : MonoBehaviour
    {
        static BrightnessOverlay _instance;
        Image _img;

        public static void Set(float brightness)
        {
            if (_instance == null)
            {
                var go = new GameObject("BrightnessOverlay");
                DontDestroyOnLoad(go);
                _instance = go.AddComponent<BrightnessOverlay>();
                _instance.Build();
            }
            // <1 darkens (black veil), >1 brightens (white veil). Never fully opaque.
            float b = Mathf.Clamp(brightness, Settings.BrightMin, Settings.BrightMax);
            if (b < 1f) _instance._img.color = new Color(0f, 0f, 0f, Mathf.Clamp01((1f - b) * 0.9f));
            else _instance._img.color = new Color(1f, 1f, 1f, Mathf.Clamp01((b - 1f) * 0.55f));
        }

        void Build()
        {
            var canvas = gameObject.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 90; // above HUD/menus, below nothing important
            var imgGo = new GameObject("Veil", typeof(Image));
            imgGo.transform.SetParent(transform, false);
            _img = imgGo.GetComponent<Image>();
            _img.raycastTarget = false;
            _img.color = new Color(0f, 0f, 0f, 0f);
            var rt = _img.rectTransform;
            rt.anchorMin = Vector2.zero; rt.anchorMax = Vector2.one; rt.offsetMin = Vector2.zero; rt.offsetMax = Vector2.zero;
        }
    }
}
