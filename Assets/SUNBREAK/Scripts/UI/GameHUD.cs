using UnityEngine;
using UnityEngine.UI;
using SUNBREAK.Vehicles;
using SUNBREAK.World;

namespace SUNBREAK.UI
{
    /// <summary>
    /// Builds a code-only uGUI HUD: a health bar + cash readout, a minimap (the
    /// <see cref="MinimapController"/>'s RenderTexture) with a heading blip, a speed readout
    /// while driving, and a controls hint. No prefabs/scene wiring needed so it survives
    /// headless scene generation.
    /// </summary>
    public sealed class GameHUD : MonoBehaviour
    {
        public PlayerState state;
        public Transform player;
        public MinimapController minimap;
        public VehicleInteraction vehicle;

        Font _font;
        Image _healthFill;
        Text _cashText, _speedText, _hintText;
        RectTransform _blip;

        void Start()
        {
            _font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            BuildUI();
            if (state != null) { state.Changed += Refresh; Refresh(); }
        }

        void OnDestroy() { if (state != null) state.Changed -= Refresh; }

        void Update()
        {
            if (_blip != null && player != null)
                _blip.localRotation = Quaternion.Euler(0f, 0f, -player.eulerAngles.y);

            if (_speedText != null)
            {
                bool driving = vehicle != null && vehicle.CurrentCar != null;
                _speedText.enabled = driving;
                if (driving)
                    _speedText.text = $"{Mathf.Abs(vehicle.CurrentCar.SpeedKmh):0} km/h";
            }
        }

        void Refresh()
        {
            if (_healthFill != null) _healthFill.fillAmount = state.Health01;
            if (_cashText != null) _cashText.text = $"$ {state.Cash:n0}";
        }

        // ── UI construction ─────────────────────────────────────────────────────
        void BuildUI()
        {
            var canvasGo = new GameObject("HUD Canvas");
            canvasGo.transform.SetParent(transform, false);
            var canvas = canvasGo.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            var scaler = canvasGo.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920, 1080);
            canvasGo.AddComponent<GraphicRaycaster>();
            var root = canvasGo.transform;

            // Health bar (bottom-left)
            var hpBg = Panel(root, new Vector2(0, 0), new Vector2(0, 0), new Vector2(30, 34),
                new Vector2(320, 26), new Color(0f, 0f, 0f, 0.5f));
            _healthFill = Panel(hpBg.transform, new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(3, 0),
                new Vector2(314, 20), new Color(0.35f, 0.8f, 0.4f, 0.95f));
            _healthFill.type = Image.Type.Filled;
            _healthFill.fillMethod = Image.FillMethod.Horizontal;
            _healthFill.fillOrigin = 0;
            var hpFillRt = _healthFill.rectTransform;
            hpFillRt.pivot = new Vector2(0f, 0.5f);
            hpFillRt.anchoredPosition = new Vector2(3, 0);
            Label(hpBg.transform, "HEALTH", 12, TextAnchor.MiddleLeft, new Vector2(0, 0.5f), new Vector2(8, 0), new Vector2(120, 22));

            // Cash (top-left, above health)
            _cashText = Label(root, "$ 500", 26, TextAnchor.LowerLeft, new Vector2(0, 0),
                new Vector2(32, 72), new Vector2(300, 34));
            _cashText.color = new Color(0.95f, 0.86f, 0.4f);

            // Speed (bottom-center)
            _speedText = Label(root, "", 30, TextAnchor.LowerCenter, new Vector2(0.5f, 0),
                new Vector2(0, 90), new Vector2(300, 40));
            _speedText.alignment = TextAnchor.LowerCenter;
            _speedText.rectTransform.anchoredPosition = new Vector2(0, 90);
            _speedText.enabled = false;

            // Minimap (bottom-right)
            var mmFrame = Panel(root, new Vector2(1, 0), new Vector2(1, 0), new Vector2(-234, 30),
                new Vector2(216, 216), new Color(0f, 0f, 0f, 0.6f));
            mmFrame.rectTransform.pivot = new Vector2(0f, 0f);
            mmFrame.rectTransform.anchoredPosition = new Vector2(-234, 30);
            var mmGo = new GameObject("Minimap", typeof(RawImage));
            mmGo.transform.SetParent(mmFrame.transform, false);
            var raw = mmGo.GetComponent<RawImage>();
            if (minimap != null) raw.texture = minimap.Texture;
            var rawRt = raw.rectTransform;
            rawRt.anchorMin = new Vector2(0, 0); rawRt.anchorMax = new Vector2(1, 1);
            rawRt.offsetMin = new Vector2(4, 4); rawRt.offsetMax = new Vector2(-4, -4);

            var blipGo = new GameObject("Blip", typeof(Image));
            blipGo.transform.SetParent(mmGo.transform, false);
            var blip = blipGo.GetComponent<Image>();
            blip.sprite = ArrowSprite();
            blip.color = new Color(0.4f, 0.75f, 1f);
            _blip = blip.rectTransform;
            _blip.anchorMin = _blip.anchorMax = new Vector2(0.5f, 0.5f);
            _blip.sizeDelta = new Vector2(18, 22);
            _blip.anchoredPosition = Vector2.zero;
            Label(mmFrame.transform, "SANTA VISTA", 12, TextAnchor.UpperCenter, new Vector2(0.5f, 1f), new Vector2(0, -2), new Vector2(200, 18));

            // Controls hint (top-center)
            _hintText = Label(root, "WASD move  ·  Shift sprint  ·  C crouch  ·  Space jump  ·  F enter/exit car  ·  RMB aim  ·  V first-person",
                14, TextAnchor.UpperCenter, new Vector2(0.5f, 1f), new Vector2(0, -14), new Vector2(1400, 24));
            _hintText.color = new Color(1f, 1f, 1f, 0.7f);
        }

        Image Panel(Transform parent, Vector2 aMin, Vector2 aMax, Vector2 pos, Vector2 size, Color col)
        {
            var go = new GameObject("Panel", typeof(Image));
            go.transform.SetParent(parent, false);
            var img = go.GetComponent<Image>();
            img.sprite = WhiteSprite();
            img.color = col;
            var rt = img.rectTransform;
            rt.anchorMin = aMin; rt.anchorMax = aMax;
            rt.pivot = new Vector2(aMin.x, aMin.y);
            rt.sizeDelta = size;
            rt.anchoredPosition = pos;
            return img;
        }

        Text Label(Transform parent, string text, int size, TextAnchor anchor, Vector2 anch, Vector2 pos, Vector2 sizeDelta)
        {
            var go = new GameObject("Label", typeof(Text));
            go.transform.SetParent(parent, false);
            var t = go.GetComponent<Text>();
            t.text = text; t.font = _font; t.fontSize = size; t.alignment = anchor;
            t.color = Color.white;
            t.horizontalOverflow = HorizontalWrapMode.Overflow;
            t.verticalOverflow = VerticalWrapMode.Overflow;
            var rt = t.rectTransform;
            rt.anchorMin = anch; rt.anchorMax = anch; rt.pivot = anch;
            rt.sizeDelta = sizeDelta; rt.anchoredPosition = pos;
            return t;
        }

        static Sprite _white;
        static Sprite WhiteSprite()
        {
            if (_white != null) return _white;
            var tex = new Texture2D(4, 4, TextureFormat.RGBA32, false);
            var px = new Color32[16];
            for (int i = 0; i < px.Length; i++) px[i] = new Color32(255, 255, 255, 255);
            tex.SetPixels32(px); tex.Apply();
            _white = Sprite.Create(tex, new Rect(0, 0, 4, 4), new Vector2(0.5f, 0.5f), 100f, 0, SpriteMeshType.FullRect);
            return _white;
        }

        static Sprite _arrow;
        static Sprite ArrowSprite()
        {
            if (_arrow != null) return _arrow;
            const int s = 32;
            var tex = new Texture2D(s, s, TextureFormat.RGBA32, false);
            var clear = new Color32(0, 0, 0, 0);
            var white = new Color32(255, 255, 255, 255);
            for (int y = 0; y < s; y++)
                for (int x = 0; x < s; x++)
                {
                    // Upward triangle: apex at top-center, base at bottom.
                    float t = y / (float)(s - 1);
                    float halfWidth = Mathf.Lerp(s * 0.5f, 1f, t); // wide at bottom, point at top
                    bool inside = Mathf.Abs(x - s * 0.5f) <= halfWidth * 0.55f;
                    tex.SetPixel(x, y, inside ? white : clear);
                }
            tex.Apply();
            _arrow = Sprite.Create(tex, new Rect(0, 0, s, s), new Vector2(0.5f, 0.5f));
            return _arrow;
        }
    }
}
