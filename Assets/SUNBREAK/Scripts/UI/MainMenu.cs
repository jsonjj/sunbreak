using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.UI;
using UnityEngine.SceneManagement;
using UnityEngine.UI;
using SUNBREAK.Save;

namespace SUNBREAK.UI
{
    /// <summary>
    /// Boot menu: New Game / Load slot / Quit, then into the world — mirroring the web build's flow.
    /// In headless batch mode (the launch smoke test) it auto-starts a new game so the island scene
    /// is still exercised.
    /// </summary>
    public sealed class MainMenu : MonoBehaviour
    {
        public string worldScene = "Island";

        static bool _booted; // guard so batch/-sunbreakshot auto-start fires ONCE, not on every return

        Font _font;
        GameObject _menuRoot;
        SettingsPanel _settings;

        void Start()
        {
            Time.timeScale = 1f;
            Cursor.visible = true;
            Cursor.lockState = CursorLockMode.None;
            Overlay.Reset();
            Settings.Apply();

            // Auto-start into the world for the headless smoke + the build-render screenshot pass —
            // but only the first time, so Quit-to-Menu returns to a real menu instead of re-looping.
            if ((Application.isBatchMode || HasArg("-sunbreakshot")) && !_booted) { _booted = true; StartNewGame(); return; }

            EnsureEventSystem();
            EnsureCamera();
            BuildUI();
        }

        static bool HasArg(string a)
        {
            foreach (var x in System.Environment.GetCommandLineArgs()) if (x == a) return true;
            return false;
        }

        void StartNewGame()
        {
            SaveSystem.PendingLoad = null;
            SaveSystem.NewGame = true;
            SceneManager.LoadScene(worldScene);
        }

        void LoadSlot(int slot)
        {
            var data = SaveSystem.Read(slot);
            if (data == null) return;
            SaveSystem.PendingLoad = data;
            SaveSystem.NewGame = false;
            SceneManager.LoadScene(worldScene);
        }

        void Quit()
        {
#if UNITY_EDITOR
            UnityEditor.EditorApplication.isPlaying = false;
#else
            Application.Quit();
#endif
        }

        // ── UI ──────────────────────────────────────────────────────────────────
        void BuildUI()
        {
            var go = new GameObject("Menu Canvas");
            var canvas = go.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 100;
            var scaler = go.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920, 1080);
            go.AddComponent<GraphicRaycaster>();

            _menuRoot = new GameObject("MenuRoot", typeof(RectTransform));
            _menuRoot.transform.SetParent(go.transform, false);
            var mrt = (RectTransform)_menuRoot.transform;
            mrt.anchorMin = Vector2.zero; mrt.anchorMax = Vector2.one; mrt.offsetMin = Vector2.zero; mrt.offsetMax = Vector2.zero;

            Populate(_menuRoot.transform, Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf"));

            _settings = SettingsPanel.Create(go.transform, _font, CloseSettings);
            _settings.gameObject.SetActive(false);
        }

        void OpenSettings() { if (_settings == null) return; _menuRoot.SetActive(false); _settings.gameObject.SetActive(true); _settings.Refresh(); }
        void CloseSettings() { if (_settings == null) return; _settings.gameObject.SetActive(false); _menuRoot.SetActive(true); }

        /// <summary>Build the menu widgets into a canvas. Public so the capture tool can render the
        /// menu into a camera-space canvas for a screenshot.</summary>
        public void Populate(Transform go, Font font)
        {
            _font = font;

            // Gradient backdrop (deep night → black) for a premium feel.
            var bg = new GameObject("BG", typeof(RawImage));
            bg.transform.SetParent(go.transform, false);
            var raw = bg.GetComponent<RawImage>();
            raw.texture = Gradient(new Color(0.05f, 0.07f, 0.13f), new Color(0.01f, 0.01f, 0.02f));
            var brt = raw.rectTransform;
            brt.anchorMin = Vector2.zero; brt.anchorMax = Vector2.one; brt.offsetMin = Vector2.zero; brt.offsetMax = Vector2.zero;

            // Warm accent stripe behind the title.
            var accent = new GameObject("Accent", typeof(RawImage));
            accent.transform.SetParent(go.transform, false);
            var ar = accent.GetComponent<RawImage>();
            ar.texture = Gradient(new Color(1f, 0.42f, 0.2f, 0.0f), new Color(1f, 0.55f, 0.2f, 0.22f));
            var art = ar.rectTransform;
            art.anchorMin = new Vector2(0f, 0.55f); art.anchorMax = new Vector2(1f, 1f);
            art.offsetMin = Vector2.zero; art.offsetMax = Vector2.zero;

            Text("SUNBREAK", 96, FontStyle.Bold, new Color(1f, 0.96f, 0.9f),
                TextAnchor.MiddleCenter, new Vector2(0, 300), new Vector2(1200, 130), go.transform);
            Text("SOUTH MIRAGE  ·  SINGLE PLAYER", 26, FontStyle.Normal, new Color(1f, 0.7f, 0.4f),
                TextAnchor.MiddleCenter, new Vector2(0, 220), new Vector2(1200, 44), go.transform);

            float y = 60f;
            Button("NEW GAME", new Vector2(0, y), go.transform, StartNewGame);
            for (int i = 1; i <= SaveSystem.Slots; i++)
            {
                int slot = i;
                bool has = SaveSystem.Has(slot);
                string label = has ? $"LOAD SLOT {slot}   ·   {SaveSystem.SlotLabel(slot)}" : $"SLOT {slot} — Empty";
                var b = Button(label, new Vector2(0, y - i * 84), go.transform, () => LoadSlot(slot));
                if (!has) b.interactable = false;
            }
            Button("SETTINGS", new Vector2(0, y - (SaveSystem.Slots + 1) * 84), go.transform, OpenSettings);
            Button("QUIT TO DESKTOP", new Vector2(0, y - (SaveSystem.Slots + 2) * 84), go.transform, Quit);

            Text(Controls.OneLine,
                18, FontStyle.Normal, new Color(1f, 1f, 1f, 0.55f), TextAnchor.LowerCenter,
                new Vector2(0, 30), new Vector2(1800, 30), go.transform);
        }

        Button Button(string label, Vector2 pos, Transform parent, UnityEngine.Events.UnityAction onClick)
        {
            var go = new GameObject("Btn " + label, typeof(Image), typeof(Button));
            go.transform.SetParent(parent, false);
            var img = go.GetComponent<Image>();
            img.color = new Color(1f, 1f, 1f, 0.06f);
            var rt = img.rectTransform;
            rt.anchorMin = new Vector2(0.5f, 0.5f); rt.anchorMax = new Vector2(0.5f, 0.5f);
            rt.sizeDelta = new Vector2(680, 68); rt.anchoredPosition = pos;

            var btn = go.GetComponent<Button>();
            var colors = btn.colors;
            colors.normalColor = new Color(1f, 1f, 1f, 0.06f);
            colors.highlightedColor = new Color(1f, 0.55f, 0.25f, 0.28f);
            colors.pressedColor = new Color(1f, 0.55f, 0.25f, 0.45f);
            colors.disabledColor = new Color(1f, 1f, 1f, 0.03f);
            btn.colors = colors;
            btn.onClick.AddListener(onClick);

            var t = Text(label, 24, FontStyle.Bold, Color.white, TextAnchor.MiddleCenter, Vector2.zero, new Vector2(660, 60), go.transform);
            return btn;
        }

        Text Text(string text, int size, FontStyle style, Color color, TextAnchor anchor, Vector2 pos, Vector2 sizeDelta, Transform parent)
        {
            var go = new GameObject("Text", typeof(Text));
            go.transform.SetParent(parent, false);
            var t = go.GetComponent<Text>();
            t.text = text; t.font = _font; t.fontSize = size; t.fontStyle = style;
            t.alignment = anchor; t.color = color; t.horizontalOverflow = HorizontalWrapMode.Overflow;
            var rt = t.rectTransform;
            rt.anchorMin = new Vector2(0.5f, 0.5f); rt.anchorMax = new Vector2(0.5f, 0.5f);
            rt.sizeDelta = sizeDelta; rt.anchoredPosition = pos;
            return t;
        }

        static Texture2D Gradient(Color bottom, Color top)
        {
            var tex = new Texture2D(1, 64);
            for (int y = 0; y < 64; y++) tex.SetPixel(0, y, Color.Lerp(bottom, top, y / 63f));
            tex.wrapMode = TextureWrapMode.Clamp; tex.Apply();
            return tex;
        }

        static void EnsureEventSystem()
        {
            if (FindFirstObjectByType<EventSystem>() != null) return;
            var es = new GameObject("EventSystem", typeof(EventSystem));
            es.AddComponent<InputSystemUIInputModule>();
        }

        static void EnsureCamera()
        {
            if (Camera.main != null) return;
            var cam = new GameObject("Menu Camera", typeof(Camera));
            cam.tag = "MainCamera";
            cam.GetComponent<Camera>().backgroundColor = Color.black;
        }
    }
}
