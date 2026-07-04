using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.SceneManagement;
using UnityEngine.UI;
using SUNBREAK.Save;

namespace SUNBREAK.UI
{
    /// <summary>Esc opens a pause overlay: resume, save to a slot (F1–F3), or quit to the main menu.
    /// Yields to the shop menu so Esc closes a shop first.</summary>
    public sealed class PauseMenu : MonoBehaviour
    {
        public string menuScene = "MainMenu";

        Font _font;
        Canvas _canvas;
        Text _info;
        bool _open;
        InputAction _esc, _quit;
        InputAction[] _slots;

        void Awake()
        {
            _esc = new InputAction("Pause", InputActionType.Button, "<Keyboard>/escape");
            _quit = new InputAction("QuitToMenu", InputActionType.Button, "<Keyboard>/q");
            _slots = new[]
            {
                new InputAction("Save1", InputActionType.Button, "<Keyboard>/f1"),
                new InputAction("Save2", InputActionType.Button, "<Keyboard>/f2"),
                new InputAction("Save3", InputActionType.Button, "<Keyboard>/f3"),
            };
        }

        void OnEnable() { _esc.Enable(); _quit.Enable(); foreach (var s in _slots) s.Enable(); }
        void OnDisable() { _esc.Disable(); _quit.Disable(); foreach (var s in _slots) s.Disable(); }

        void Update()
        {
            bool shopOpen = ShopMenu.Instance != null && ShopMenu.Instance.IsOpen;
            if (_esc.WasPressedThisFrame() && !shopOpen) Toggle();
            if (!_open) return;

            for (int i = 0; i < _slots.Length; i++)
                if (_slots[i].WasPressedThisFrame()) { GameSession.Instance?.SaveToSlot(i + 1); Refresh(); }
            if (_quit.WasPressedThisFrame()) QuitToMenu();
        }

        void Toggle()
        {
            _open = !_open;
            if (_canvas == null) BuildUI();
            _canvas.gameObject.SetActive(_open);
            Time.timeScale = _open ? 0f : 1f;
            if (_open) Refresh();
        }

        void QuitToMenu()
        {
            Time.timeScale = 1f;
            SceneManager.LoadScene(menuScene);
        }

        void Refresh()
        {
            if (_info == null) return;
            _info.text =
                "<b>PAUSED</b>\n" +
                "Esc — Resume        Q — Quit to Main Menu\n" +
                $"F1 — Save Slot 1  ({SaveSystem.SlotLabel(1)})\n" +
                $"F2 — Save Slot 2  ({SaveSystem.SlotLabel(2)})\n" +
                $"F3 — Save Slot 3  ({SaveSystem.SlotLabel(3)})\n" +
                "\n<b>CONTROLS</b>\n" +
                Controls.Full;
        }

        void BuildUI()
        {
            _font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            var go = new GameObject("Pause Canvas");
            go.transform.SetParent(transform, false);
            _canvas = go.AddComponent<Canvas>();
            _canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            _canvas.sortingOrder = 60;
            var scaler = go.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920, 1080);
            go.AddComponent<GraphicRaycaster>();

            var bgGo = new GameObject("Dim", typeof(Image));
            bgGo.transform.SetParent(go.transform, false);
            var bg = bgGo.GetComponent<Image>();
            bg.color = new Color(0f, 0f, 0f, 0.72f);
            var rt = bg.rectTransform;
            rt.anchorMin = Vector2.zero; rt.anchorMax = Vector2.one; rt.offsetMin = Vector2.zero; rt.offsetMax = Vector2.zero;

            var textGo = new GameObject("Info", typeof(Text));
            textGo.transform.SetParent(go.transform, false);
            _info = textGo.GetComponent<Text>();
            _info.font = _font; _info.fontSize = 24; _info.alignment = TextAnchor.UpperCenter;
            _info.color = Color.white; _info.lineSpacing = 1.25f; _info.supportRichText = true;
            _info.horizontalOverflow = HorizontalWrapMode.Overflow;
            var trt = _info.rectTransform;
            trt.anchorMin = new Vector2(0.5f, 0.5f); trt.anchorMax = new Vector2(0.5f, 0.5f);
            trt.sizeDelta = new Vector2(1400, 760); trt.anchoredPosition = Vector2.zero;
        }
    }
}
