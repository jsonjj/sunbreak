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
    /// The pause overlay + the single Esc authority. Esc closes whatever overlay is open (weapon
    /// wheel / map / shop / pause) with priority, else opens pause. Pause offers Resume, Settings,
    /// Save (3 slots), Quit to Main Menu, and Quit to Desktop as clickable buttons (plus F1–F3 quick
    /// save). Settings is a sub-panel; Esc backs out of it to the pause list.
    /// </summary>
    public sealed class PauseMenu : MonoBehaviour
    {
        public string menuScene = "MainMenu";

        Font _font;
        Canvas _canvas;
        GameObject _pausePanel;
        SettingsPanel _settings;
        Text _info;
        InputAction _esc;
        InputAction[] _slots;
        bool _settingsOpen;

        bool IsPaused => Overlay.Current == Overlay.Kind.Pause;

        void Awake()
        {
            _esc = new InputAction("Esc", InputActionType.Button, "<Keyboard>/escape");
            _esc.AddBinding("<Gamepad>/start");
            _slots = new[]
            {
                new InputAction("Save1", InputActionType.Button, "<Keyboard>/f1"),
                new InputAction("Save2", InputActionType.Button, "<Keyboard>/f2"),
                new InputAction("Save3", InputActionType.Button, "<Keyboard>/f3"),
            };
        }

        void OnEnable() { _esc.Enable(); foreach (var s in _slots) s.Enable(); }
        void OnDisable() { _esc.Disable(); foreach (var s in _slots) s.Disable(); }

        void Update()
        {
            if (_esc.WasPressedThisFrame())
            {
                if (_settingsOpen) { CloseSettings(); return; }   // settings → back to pause list
                if (Overlay.CloseCurrent()) return;               // close shop / map / wheel / pause
                OpenPause();                                      // nothing open → open pause
                return;
            }
            if (IsPaused && !_settingsOpen)
                for (int i = 0; i < _slots.Length; i++)
                    if (_slots[i].WasPressedThisFrame()) { GameSession.Instance?.SaveToSlot(i + 1); RefreshInfo(); }
        }

        void OpenPause()
        {
            if (!Overlay.TryOpen(Overlay.Kind.Pause, Close)) return;
            if (_canvas == null) BuildUI();
            _canvas.gameObject.SetActive(true);
            ShowPausePanel();
            Time.timeScale = 0f;
            Cursor.visible = true; Cursor.lockState = CursorLockMode.None;
            RefreshInfo();
        }

        /// <summary>Registered closer + Resume button — safe to call directly or via Esc priority.</summary>
        public void Close()
        {
            Overlay.MarkClosed(Overlay.Kind.Pause);
            _settingsOpen = false;
            if (_settings != null) _settings.gameObject.SetActive(false);
            if (_canvas != null) _canvas.gameObject.SetActive(false);
            Time.timeScale = 1f;
            Cursor.visible = false; Cursor.lockState = CursorLockMode.Locked;
        }

        /// <summary>Verification hook (BuildShot): open the pause menu, optionally on the settings tab.</summary>
        public void DebugOpen(bool settings) { OpenPause(); if (settings) OpenSettings(); }

        void OpenSettings() { _settingsOpen = true; _pausePanel.SetActive(false); _settings.gameObject.SetActive(true); _settings.Refresh(); }
        void CloseSettings() { _settingsOpen = false; _settings.gameObject.SetActive(false); _pausePanel.SetActive(true); }
        void ShowPausePanel() { _settingsOpen = false; if (_settings != null) _settings.gameObject.SetActive(false); _pausePanel.SetActive(true); }

        void QuitToMenu()
        {
            Overlay.Reset();
            Time.timeScale = 1f;
            Cursor.visible = true; Cursor.lockState = CursorLockMode.None;
            SceneManager.LoadScene(menuScene);
        }

        void QuitToDesktop()
        {
            Settings.Save();
#if UNITY_EDITOR
            UnityEditor.EditorApplication.isPlaying = false;
#else
            Application.Quit();
#endif
        }

        void RefreshInfo()
        {
            if (_info == null) return;
            _info.text =
                $"Quick-save:  F1 ({SaveSystem.SlotLabel(1)})   ·   F2 ({SaveSystem.SlotLabel(2)})   ·   F3 ({SaveSystem.SlotLabel(3)})\n\n" +
                Controls.Full;
        }

        // ── UI ────────────────────────────────────────────────────────────────
        void BuildUI()
        {
            EnsureEventSystem();
            _font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");

            var go = new GameObject("Pause Canvas");
            go.transform.SetParent(transform, false);
            _canvas = go.AddComponent<Canvas>();
            _canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            _canvas.sortingOrder = 80;
            var scaler = go.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920, 1080);
            go.AddComponent<GraphicRaycaster>();

            _pausePanel = new GameObject("PausePanel", typeof(RectTransform));
            _pausePanel.transform.SetParent(go.transform, false);
            var prt = (RectTransform)_pausePanel.transform;
            prt.anchorMin = Vector2.zero; prt.anchorMax = Vector2.one; prt.offsetMin = Vector2.zero; prt.offsetMax = Vector2.zero;

            var dim = Image(_pausePanel.transform, new Color(0f, 0f, 0f, 0.75f));
            Stretch(dim.rectTransform);

            Label(_pausePanel.transform, "PAUSED", 64, TextAnchor.UpperCenter, new Vector2(0, -70), new Vector2(1200, 90),
                new Color(1f, 0.96f, 0.9f), FontStyle.Bold);

            // Button column (left of centre).
            float y = 150f, dy = 78f; var col = new Vector2(-360, 0);
            Button(_pausePanel.transform, "RESUME", col + new Vector2(0, y), Close); y -= dy;
            Button(_pausePanel.transform, "SETTINGS", col + new Vector2(0, y), OpenSettings); y -= dy;
            Button(_pausePanel.transform, "SAVE — SLOT 1", col + new Vector2(0, y), () => { GameSession.Instance?.SaveToSlot(1); RefreshInfo(); }); y -= dy;
            Button(_pausePanel.transform, "SAVE — SLOT 2", col + new Vector2(0, y), () => { GameSession.Instance?.SaveToSlot(2); RefreshInfo(); }); y -= dy;
            Button(_pausePanel.transform, "QUIT TO MAIN MENU", col + new Vector2(0, y), QuitToMenu); y -= dy;
            Button(_pausePanel.transform, "QUIT TO DESKTOP", col + new Vector2(0, y), QuitToDesktop);

            // Controls + save info (right side).
            _info = Label(_pausePanel.transform, "", 18, TextAnchor.UpperLeft, new Vector2(560, 150), new Vector2(760, 620),
                new Color(1f, 1f, 1f, 0.82f), FontStyle.Normal);
            _info.rectTransform.pivot = new Vector2(0.5f, 1f);

            _settings = SettingsPanel.Create(go.transform, _font, CloseSettings);
            _settings.gameObject.SetActive(false);
        }

        static void EnsureEventSystem()
        {
            if (FindFirstObjectByType<EventSystem>() != null) return;
            var es = new GameObject("EventSystem", typeof(EventSystem));
            es.AddComponent<InputSystemUIInputModule>();
        }

        static Image Image(Transform parent, Color c)
        {
            var go = new GameObject("Img", typeof(Image));
            go.transform.SetParent(parent, false);
            var img = go.GetComponent<Image>(); img.color = c;
            return img;
        }
        static void Stretch(RectTransform rt) { rt.anchorMin = Vector2.zero; rt.anchorMax = Vector2.one; rt.offsetMin = Vector2.zero; rt.offsetMax = Vector2.zero; }

        Text Label(Transform parent, string text, int size, TextAnchor anchor, Vector2 pos, Vector2 sd, Color color, FontStyle style)
        {
            var go = new GameObject("Label", typeof(Text));
            go.transform.SetParent(parent, false);
            var t = go.GetComponent<Text>();
            t.text = text; t.font = _font; t.fontSize = size; t.alignment = anchor; t.color = color; t.fontStyle = style;
            t.horizontalOverflow = HorizontalWrapMode.Overflow; t.verticalOverflow = VerticalWrapMode.Overflow; t.lineSpacing = 1.1f;
            var rt = t.rectTransform;
            rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0.5f); rt.pivot = new Vector2(0.5f, 0.5f);
            rt.sizeDelta = sd; rt.anchoredPosition = pos;
            return t;
        }

        Button Button(Transform parent, string label, Vector2 pos, UnityEngine.Events.UnityAction onClick)
        {
            var go = new GameObject("Btn " + label, typeof(Image), typeof(Button));
            go.transform.SetParent(parent, false);
            var img = go.GetComponent<Image>(); img.color = new Color(1f, 1f, 1f, 0.07f);
            var rt = img.rectTransform;
            rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0.5f); rt.sizeDelta = new Vector2(560, 62); rt.anchoredPosition = pos;
            var btn = go.GetComponent<Button>();
            var colors = btn.colors;
            colors.normalColor = new Color(1f, 1f, 1f, 0.07f);
            colors.highlightedColor = new Color(1f, 0.55f, 0.25f, 0.3f);
            colors.pressedColor = new Color(1f, 0.55f, 0.25f, 0.5f);
            btn.colors = colors;
            btn.onClick.AddListener(onClick);
            Label(go.transform, label, 24, TextAnchor.MiddleCenter, Vector2.zero, new Vector2(540, 58), Color.white, FontStyle.Bold);
            return btn;
        }
    }
}
