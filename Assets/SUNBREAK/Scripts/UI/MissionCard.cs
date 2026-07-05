using System;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.UI;
using UnityEngine.UI;

namespace SUNBREAK.UI
{
    /// <summary>
    /// Centered mission cards: an INTRO / COMPLETE banner (auto-dismiss) and a MISSION FAILED panel
    /// with Retry / Abort (pauses, click or R/Esc). Driven by <see cref="SUNBREAK.Missions.MissionSystem"/>.
    /// </summary>
    public sealed class MissionCard : MonoBehaviour
    {
        public static MissionCard Instance { get; private set; }

        Font _font;
        Canvas _canvas;
        Image _bg;
        Text _title, _sub;
        GameObject _buttons;
        Action _onRetry, _onAbort;
        float _dismissAt = -1f;
        bool _failOpen;
        InputAction _retryKey, _abortKey;

        void Awake()
        {
            Instance = this;
            _retryKey = new InputAction("Retry", InputActionType.Button, "<Keyboard>/r");
            _abortKey = new InputAction("Abort", InputActionType.Button, "<Keyboard>/escape");
        }
        void OnEnable() { _retryKey.Enable(); _abortKey.Enable(); }
        void OnDisable() { _retryKey.Disable(); _abortKey.Disable(); }
        void OnDestroy() { if (Instance == this) Instance = null; }

        public static void Intro(string title, string sub) => Instance?.ShowBanner(title, sub, new Color(1f, 0.85f, 0.4f));
        public static void Complete(string title, string sub) => Instance?.ShowBanner(title, sub, new Color(0.5f, 0.92f, 0.62f));
        public static void Fail(string title, string reason, Action onRetry, Action onAbort) => Instance?.ShowFail(reason, onRetry, onAbort);

        void ShowBanner(string title, string sub, Color c)
        {
            if (_canvas == null) Build();
            _failOpen = false; _buttons.SetActive(false);
            _title.text = title != null ? title.ToUpperInvariant() : "";
            _title.color = c; _sub.text = sub ?? "";
            _bg.color = new Color(0f, 0f, 0f, 0.45f);
            _canvas.gameObject.SetActive(true);
            _dismissAt = Time.unscaledTime + 3.2f;
        }

        void ShowFail(string reason, Action onRetry, Action onAbort)
        {
            if (_canvas == null) Build();
            _failOpen = true; _onRetry = onRetry; _onAbort = onAbort;
            _title.text = "MISSION FAILED"; _title.color = new Color(1f, 0.35f, 0.3f);
            _sub.text = reason ?? "";
            _buttons.SetActive(true);
            _bg.color = new Color(0f, 0f, 0f, 0.82f);
            _canvas.gameObject.SetActive(true);
            _dismissAt = -1f;
            Time.timeScale = 0f;
            Cursor.visible = true; Cursor.lockState = CursorLockMode.None;
        }

        void Retry() { Close(); _onRetry?.Invoke(); }
        void Abort() { Close(); _onAbort?.Invoke(); }

        void Close()
        {
            _failOpen = false;
            if (_canvas != null) _canvas.gameObject.SetActive(false);
            Time.timeScale = 1f;
            Cursor.visible = false; Cursor.lockState = CursorLockMode.Locked;
        }

        void Update()
        {
            if (_failOpen)
            {
                if (_retryKey.WasPressedThisFrame()) Retry();
                else if (_abortKey.WasPressedThisFrame()) Abort();
                return;
            }
            if (_dismissAt > 0f && Time.unscaledTime >= _dismissAt)
            {
                _dismissAt = -1f;
                if (_canvas != null) _canvas.gameObject.SetActive(false);
            }
        }

        void Build()
        {
            EnsureEventSystem();
            _font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            var go = new GameObject("MissionCard Canvas");
            go.transform.SetParent(transform, false);
            _canvas = go.AddComponent<Canvas>();
            _canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            _canvas.sortingOrder = 110;
            var scaler = go.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920, 1080);
            go.AddComponent<GraphicRaycaster>();

            _bg = Img(go.transform, new Color(0f, 0f, 0f, 0.5f));
            var brt = _bg.rectTransform; brt.anchorMin = Vector2.zero; brt.anchorMax = Vector2.one; brt.offsetMin = Vector2.zero; brt.offsetMax = Vector2.zero;

            _title = Label(go.transform, "", 70, TextAnchor.MiddleCenter, new Vector2(0, 70), new Vector2(1400, 110), FontStyle.Bold);
            _sub = Label(go.transform, "", 28, TextAnchor.MiddleCenter, new Vector2(0, -10), new Vector2(1200, 60), FontStyle.Normal);
            _sub.color = new Color(0.92f, 0.94f, 1f);

            _buttons = new GameObject("Buttons", typeof(RectTransform));
            _buttons.transform.SetParent(go.transform, false);
            var rt = (RectTransform)_buttons.transform;
            rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0.5f); rt.anchoredPosition = new Vector2(0, -110); rt.sizeDelta = new Vector2(700, 80);
            Button(_buttons.transform, "RETRY  (R)", new Vector2(-170, 0), Retry);
            Button(_buttons.transform, "ABORT  (Esc)", new Vector2(170, 0), Abort);
            _buttons.SetActive(false);

            _canvas.gameObject.SetActive(false);
        }

        static void EnsureEventSystem()
        {
            if (FindFirstObjectByType<EventSystem>() != null) return;
            var es = new GameObject("EventSystem", typeof(EventSystem));
            es.AddComponent<InputSystemUIInputModule>();
        }

        static Image Img(Transform p, Color c)
        {
            var go = new GameObject("Img", typeof(Image));
            go.transform.SetParent(p, false);
            var i = go.GetComponent<Image>(); i.color = c; return i;
        }

        Text Label(Transform p, string text, int size, TextAnchor a, Vector2 pos, Vector2 sd, FontStyle style)
        {
            var go = new GameObject("Label", typeof(Text));
            go.transform.SetParent(p, false);
            var t = go.GetComponent<Text>();
            t.text = text; t.font = _font; t.fontSize = size; t.alignment = a; t.color = Color.white; t.fontStyle = style;
            t.horizontalOverflow = HorizontalWrapMode.Overflow;
            var rt = t.rectTransform; rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0.5f); rt.pivot = new Vector2(0.5f, 0.5f);
            rt.sizeDelta = sd; rt.anchoredPosition = pos;
            return t;
        }

        void Button(Transform p, string label, Vector2 pos, UnityEngine.Events.UnityAction onClick)
        {
            var go = new GameObject("Btn " + label, typeof(Image), typeof(Button));
            go.transform.SetParent(p, false);
            var img = go.GetComponent<Image>(); img.color = new Color(1f, 1f, 1f, 0.1f);
            var rt = img.rectTransform; rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0.5f); rt.sizeDelta = new Vector2(300, 70); rt.anchoredPosition = pos;
            var btn = go.GetComponent<Button>();
            var col = btn.colors; col.highlightedColor = new Color(1f, 0.55f, 0.25f, 0.35f); col.pressedColor = new Color(1f, 0.55f, 0.25f, 0.5f); btn.colors = col;
            btn.onClick.AddListener(onClick);
            Label(go.transform, label, 24, TextAnchor.MiddleCenter, Vector2.zero, new Vector2(290, 66), FontStyle.Bold);
        }
    }
}
