using UnityEngine;
using UnityEngine.UI;
using SUNBREAK.Audio;
using SUNBREAK.Combat;
using SUNBREAK.Missions;
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
        public WantedSystem wanted;
        public PlayerCombat combat;
        public PlayerInteractor interactor;
        public MissionSystem missions;
        public DayNightSystem dayNight;
        public CarRadio radio;

        public static GameHUD Instance { get; private set; }

        Font _font;
        Image _healthFill;
        Text _cashText, _speedText, _hintText, _starsText, _weaponText, _reticle;
        Text _clockText, _objectiveText, _promptText, _radioText;
        Text _toastTitle, _toastSub;
        float _toastUntil;
        RectTransform _blip, _wheelRoot;
        Text[] _wheelSlots;
        Transform _mapRoot;
        Image[] _blipDots;

        /// <summary>Post a mission dialogue / reward toast (title + subtitle).</summary>
        public static void Post(string title, string sub) => Instance?.ShowToast(title, sub);

        void ShowToast(string title, string sub)
        {
            if (_toastTitle == null) return;
            _toastTitle.text = title ?? "";
            _toastSub.text = sub ?? "";
            _toastUntil = Time.time + 4.5f;
        }

        void Awake() { Instance = this; }

        void Start()
        {
            _font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            BuildUI();
            if (state != null) { state.Changed += Refresh; Refresh(); }
        }

        void OnDestroy()
        {
            if (state != null) state.Changed -= Refresh;
            if (Instance == this) Instance = null;
        }

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

            // Wanted stars (blink white while "searching" cooldown).
            if (_starsText != null && wanted != null)
            {
                int s = wanted.Stars;
                _starsText.text = new string('\u2605', s) + new string('\u2606', 5 - s);
                float a = wanted.Searching ? 0.4f + 0.6f * Mathf.Abs(Mathf.Sin(Time.time * 4f)) : 1f;
                _starsText.color = new Color(1f, 0.85f, 0.2f, s > 0 ? a : 0.25f);
            }

            // Weapon + ammo.
            if (_weaponText != null && combat != null)
            {
                if (combat.MagSize > 0)
                    _weaponText.text = combat.IsReloading ? $"{combat.CurrentName}\n<reloading>"
                        : $"{combat.CurrentName}\n{combat.MagAmmo}/{combat.MagSize}  \u221e";
                else _weaponText.text = combat.CurrentName;
            }

            // Reticle hidden while driving.
            if (_reticle != null) _reticle.enabled = vehicle == null || vehicle.CurrentCar == null;

            // Clock (top-right).
            if (_clockText != null && dayNight != null)
                _clockText.text = (DayNightSystem.IsNight ? "\u263D " : "\u2600 ") + dayNight.Clock;

            // Objective tracker.
            if (_objectiveText != null)
            {
                if (missions != null && missions.HasActive)
                    _objectiveText.text = $"<b>{missions.ActiveTitle}</b>\n{missions.ObjectiveText}" +
                        (missions.HasWaypoint ? $"\n{Distance(missions.WaypointPos)} m" : "");
                else _objectiveText.text = "";
            }

            // Interaction prompt (center-low).
            if (_promptText != null)
                _promptText.text = interactor != null ? (interactor.Prompt ?? "") : "";

            // Mission dialogue / reward toast (center-upper, fades out).
            if (_toastTitle != null)
            {
                float remain = _toastUntil - Time.time;
                float a = Mathf.Clamp01(Mathf.Min(remain, 1f));
                _toastTitle.color = new Color(1f, 0.85f, 0.4f, a);
                _toastSub.color = new Color(1f, 1f, 1f, a * 0.95f);
            }

            // Radio now-playing (while driving).
            if (_radioText != null)
            {
                bool show = radio != null && radio.Driving;
                _radioText.enabled = show;
                if (show) _radioText.text = radio.On ? $"\u266A {radio.NowPlaying}   (H off · N skip)" : "RADIO OFF   (H on)";
            }

            UpdateBlips();
            UpdateWheel();
        }

        int Distance(Vector3 world)
        {
            if (player == null) return 0;
            Vector3 d = world - player.position; d.y = 0f;
            return Mathf.RoundToInt(d.magnitude);
        }

        void UpdateBlips()
        {
            if (_blipDots == null || minimap == null || player == null) return;
            float range = minimap.orthoSize;
            var all = Blip.All;
            int used = 0;
            Vector3 pp = player.position;
            for (int i = 0; i < all.Count && used < _blipDots.Length; i++)
            {
                var b = all[i];
                if (b == null) continue;
                Vector3 d = b.transform.position - pp;
                float dx = d.x / range, dz = d.z / range; // -1..1 across the map
                if (Mathf.Abs(dx) > 1.15f || Mathf.Abs(dz) > 1.15f) continue;
                dx = Mathf.Clamp(dx, -1f, 1f); dz = Mathf.Clamp(dz, -1f, 1f);
                var dot = _blipDots[used++];
                dot.enabled = true;
                dot.color = b.color;
                dot.rectTransform.anchoredPosition = new Vector2(dx * 100f, dz * 100f);
            }
            for (int i = used; i < _blipDots.Length; i++) _blipDots[i].enabled = false;
        }

        void UpdateWheel()
        {
            if (_wheelRoot == null || combat == null) return;
            bool open = combat.WheelOpen;
            _wheelRoot.gameObject.SetActive(open);
            if (!open) return;
            for (int i = 0; i < _wheelSlots.Length; i++)
            {
                bool owned = combat.Owns(Weapons.WheelOrder[i]);
                bool sel = i == combat.WheelSelection;
                _wheelSlots[i].color = sel ? new Color(1f, 0.85f, 0.3f) : (owned ? Color.white : new Color(1f, 1f, 1f, 0.3f));
                _wheelSlots[i].fontStyle = sel ? FontStyle.Bold : FontStyle.Normal;
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

            // Radio now-playing (bottom-center, below speed)
            _radioText = Label(root, "", 18, TextAnchor.LowerCenter, new Vector2(0.5f, 0),
                new Vector2(0, 62), new Vector2(700, 26));
            _radioText.color = new Color(1f, 0.75f, 0.5f, 0.9f);
            _radioText.enabled = false;

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

            // Map blip dots (shops / missions / cash / objective) drawn over the minimap.
            _mapRoot = mmGo.transform;
            _blipDots = new Image[16];
            for (int i = 0; i < _blipDots.Length; i++)
            {
                var dg = new GameObject("BlipDot", typeof(Image));
                dg.transform.SetParent(_mapRoot, false);
                var im = dg.GetComponent<Image>();
                im.sprite = WhiteSprite(); im.enabled = false;
                var drt = im.rectTransform;
                drt.anchorMin = drt.anchorMax = new Vector2(0.5f, 0.5f);
                drt.sizeDelta = new Vector2(11, 11);
                _blipDots[i] = im;
            }

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
            _hintText = Label(root, "WASD move · Shift sprint · C crouch · Space jump · F car · RMB aim · V 1st-person · LMB fire · R reload · Tab wheel · 1-8 weapons",
                13, TextAnchor.UpperCenter, new Vector2(0.5f, 1f), new Vector2(0, -14), new Vector2(1700, 24));
            _hintText.color = new Color(1f, 1f, 1f, 0.65f);

            // Wanted stars (top-right)
            _starsText = Label(root, "\u2606\u2606\u2606\u2606\u2606", 34, TextAnchor.UpperRight, new Vector2(1, 1),
                new Vector2(-30, -24), new Vector2(320, 44));
            _starsText.color = new Color(1f, 0.85f, 0.2f, 0.25f);

            // Clock (top-right, below the stars)
            _clockText = Label(root, "\u2600 08:00", 24, TextAnchor.UpperRight, new Vector2(1, 1),
                new Vector2(-30, -74), new Vector2(320, 32));
            _clockText.color = new Color(0.9f, 0.92f, 1f);

            // Objective tracker (top-right, below the clock)
            _objectiveText = Label(root, "", 20, TextAnchor.UpperRight, new Vector2(1, 1),
                new Vector2(-30, -116), new Vector2(520, 140));
            _objectiveText.color = new Color(0.55f, 0.85f, 1f);

            // Interaction prompt (bottom-center, above the health bar)
            _promptText = Label(root, "", 24, TextAnchor.LowerCenter, new Vector2(0.5f, 0),
                new Vector2(0, 180), new Vector2(1000, 40));
            _promptText.color = new Color(1f, 0.92f, 0.7f);

            // Mission dialogue / reward toast (center-upper)
            _toastTitle = Label(root, "", 28, TextAnchor.UpperCenter, new Vector2(0.5f, 1f),
                new Vector2(0, -150), new Vector2(1200, 40));
            _toastTitle.fontStyle = FontStyle.Bold;
            _toastTitle.color = new Color(1f, 0.85f, 0.4f, 0f);
            _toastSub = Label(root, "", 22, TextAnchor.UpperCenter, new Vector2(0.5f, 1f),
                new Vector2(0, -190), new Vector2(1300, 40));
            _toastSub.color = new Color(1f, 1f, 1f, 0f);

            // Weapon + ammo (bottom-right, above the minimap)
            _weaponText = Label(root, "", 22, TextAnchor.LowerRight, new Vector2(1, 0), new Vector2(-30, 260), new Vector2(420, 60));
            _weaponText.color = new Color(0.95f, 0.95f, 0.95f);

            // Reticle (centre)
            _reticle = Label(root, "+", 30, TextAnchor.MiddleCenter, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(40, 40));
            _reticle.color = new Color(1f, 1f, 1f, 0.75f);

            // Weapon wheel overlay (hidden until hold-Tab)
            var wheelGo = new GameObject("Wheel", typeof(RectTransform));
            wheelGo.transform.SetParent(root, false);
            _wheelRoot = wheelGo.GetComponent<RectTransform>();
            _wheelRoot.anchorMin = _wheelRoot.anchorMax = new Vector2(0.5f, 0.5f);
            _wheelRoot.sizeDelta = new Vector2(520, 520);
            var wbg = wheelGo.AddComponent<Image>(); wbg.sprite = WhiteSprite(); wbg.color = new Color(0f, 0f, 0f, 0.4f);
            string[] names = { "Pistol", "SMG", "Shotgun", "Rifle", "Sniper", "RPG", "Grenade", "Fists" };
            _wheelSlots = new Text[8];
            for (int i = 0; i < 8; i++)
            {
                float a = i * 45f * Mathf.Deg2Rad; // slot 0 top, clockwise
                Vector2 pos = new Vector2(Mathf.Sin(a), Mathf.Cos(a)) * 195f;
                _wheelSlots[i] = Label(_wheelRoot, names[i], 20, TextAnchor.MiddleCenter, new Vector2(0.5f, 0.5f), pos, new Vector2(140, 40));
            }
            _wheelRoot.gameObject.SetActive(false);
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
