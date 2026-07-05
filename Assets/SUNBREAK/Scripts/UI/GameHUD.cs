using UnityEngine;
using UnityEngine.UI;
using SUNBREAK.Audio;
using SUNBREAK.Cameras;
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
        Image _healthFill, _armorFill, _armorBg;
        Text _cashText, _speedText, _hintText, _starsText, _weaponText, _reticle;
        Text _clockText, _promptText, _radioText;
        Image _missionPanel;
        Text _missionTitle, _missionObjective;
        Text _activityText;
        static string _activityMsg;
        /// <summary>Set the on-screen side-activity status line (taxi timer, race checkpoints). Null hides it.</summary>
        public static void SetActivity(string s) { _activityMsg = s; }
        Text _alertText;
        static string _alertMsg;
        /// <summary>Set the on-screen alert line (police arrest / surrender prompt). Null hides it.</summary>
        public static void SetAlert(string s) { _alertMsg = s; }
        Text _toastTitle, _toastSub;
        float _toastUntil;
        RawImage _vignette;
        float _vignetteAmt;
        Text _hitmarker;
        float _hitUntil;
        bool _dmgHooked;
        static Texture2D _vigTex;
        RectTransform _blip, _blipBack, _wheelRoot;
        Text[] _wheelSlots;
        Text _wheelName;
        Transform _mapRoot;
        Image[] _blipDots;
        Image[] _routeSegs;

        /// <summary>Post a mission dialogue / reward toast (title + subtitle).</summary>
        public static void Post(string title, string sub) => Instance?.ShowToast(title, sub);
        /// <summary>Flash an on-screen hitmarker (player landed a hit on an enemy).</summary>
        public static void Hitmarker() { if (Instance != null) Instance._hitUntil = Time.time + 0.13f; }

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
            if (state != null) { state.Changed += Refresh; state.Damaged += OnPlayerDamaged; Refresh(); }
        }

        void OnDestroy()
        {
            if (state != null) { state.Changed -= Refresh; state.Damaged -= OnPlayerDamaged; }
            if (Instance == this) Instance = null;
        }

        void OnPlayerDamaged(float amount)
        {
            _vignetteAmt = Mathf.Clamp01(_vignetteAmt + 0.3f + amount / 60f);
            CameraShake.Add(0.15f + Mathf.Clamp01(amount / 70f) * 0.35f);
        }

        void Update()
        {
            if (_blip != null && player != null)
            {
                var rot = Quaternion.Euler(0f, 0f, -player.eulerAngles.y);
                _blip.localRotation = rot;
                if (_blipBack != null) _blipBack.localRotation = rot;
            }

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

            // Mission panel (top-left): title + current objective + distance.
            if (_missionPanel != null)
            {
                bool active = missions != null && missions.HasActive;
                _missionPanel.enabled = active;
                _missionTitle.enabled = active;
                _missionObjective.enabled = active;
                if (active)
                {
                    _missionTitle.text = "\u25B8 " + missions.ActiveTitle.ToUpperInvariant();
                    _missionObjective.text = missions.ObjectiveText +
                        (missions.HasWaypoint ? $"   ·   {Distance(missions.WaypointPos)} m" : "");
                }
            }

            // Side-activity status line (taxi timer / race checkpoints).
            if (_activityText != null)
            {
                bool on = !string.IsNullOrEmpty(_activityMsg);
                if (_activityText.enabled != on) _activityText.enabled = on;
                if (on) _activityText.text = _activityMsg;
            }

            // Interaction prompt (center-low).
            if (_promptText != null)
                _promptText.text = interactor != null ? (interactor.Prompt ?? "") : "";

            // Police alert / surrender prompt (center, pulsing).
            if (_alertText != null)
            {
                bool on = !string.IsNullOrEmpty(_alertMsg);
                if (_alertText.enabled != on) _alertText.enabled = on;
                if (on)
                {
                    _alertText.text = _alertMsg;
                    float a = 0.65f + 0.35f * Mathf.Abs(Mathf.Sin(Time.unscaledTime * 3.5f));
                    _alertText.color = new Color(1f, 0.4f, 0.35f, a);
                }
            }

            // Mission dialogue / reward toast (center-upper, fades out).
            if (_toastTitle != null)
            {
                float remain = _toastUntil - Time.time;
                float a = Mathf.Clamp01(Mathf.Min(remain, 1f));
                _toastTitle.color = new Color(1f, 0.85f, 0.4f, a);
                _toastSub.color = new Color(1f, 1f, 1f, a * 0.95f);
            }

            // Hit feedback: damage vignette + hitmarker fades (unscaled so they show even at low timescale).
            float udt = Time.unscaledDeltaTime;
            if (_vignette != null)
            {
                _vignetteAmt = Mathf.Max(0f, _vignetteAmt - udt * 1.6f);
                _vignette.color = new Color(0.7f, 0.05f, 0.05f, _vignetteAmt * 0.6f);
            }
            if (_hitmarker != null)
            {
                float ha = Mathf.Clamp01((_hitUntil - Time.time) / 0.13f);
                _hitmarker.color = new Color(1f, 0.95f, 0.7f, ha);
            }

            // Radio now-playing (while driving).
            if (_radioText != null)
            {
                bool show = radio != null && radio.Driving;
                _radioText.enabled = show;
                if (show) _radioText.text = radio.On ? $"\u266A {radio.NowPlaying}   (H off · N skip)" : "RADIO OFF   (H on)";
            }

            DrawRoute();
            UpdateBlips();
            UpdateWheel();
        }

        void DrawRoute()
        {
            if (_routeSegs == null || minimap == null || player == null) return;
            var route = NavRoute.Instance != null ? NavRoute.Instance.Route : null;
            int used = 0;
            if (route != null && route.Count >= 2)
            {
                float range = minimap.orthoSize;
                Vector3 pp = player.position;
                Vector2 prev = Vector2.zero; bool havePrev = false;
                for (int i = 0; i < route.Count && used < _routeSegs.Length; i++)
                {
                    float dx = Mathf.Clamp((route[i].x - pp.x) / range, -1f, 1f);
                    float dz = Mathf.Clamp((route[i].z - pp.z) / range, -1f, 1f);
                    Vector2 p = new Vector2(dx * 100f, dz * 100f);
                    if (havePrev) SetSeg(_routeSegs[used++], prev, p);
                    prev = p; havePrev = true;
                }
            }
            for (int i = used; i < _routeSegs.Length; i++) _routeSegs[i].enabled = false;
        }

        public static void SetSeg(Image seg, Vector2 a, Vector2 b)
        {
            seg.enabled = true;
            Vector2 d = b - a;
            seg.rectTransform.sizeDelta = new Vector2(Mathf.Max(1f, d.magnitude), 3f);
            seg.rectTransform.anchoredPosition = (a + b) * 0.5f;
            seg.rectTransform.localRotation = Quaternion.Euler(0f, 0f, Mathf.Atan2(d.y, d.x) * Mathf.Rad2Deg);
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
            float pulse = 0.6f + 0.4f * Mathf.Abs(Mathf.Sin(Time.time * 4f));
            // Missions + waypoints first so they draw on top + never get culled by the pool cap.
            for (int pass = 0; pass < 2; pass++)
            {
                for (int i = 0; i < all.Count && used < _blipDots.Length; i++)
                {
                    var b = all[i];
                    if (b == null) continue;
                    bool priority = b.kind == BlipKind.Mission || b.kind == BlipKind.Waypoint;
                    if (priority != (pass == 0)) continue;
                    Vector3 d = b.transform.position - pp;
                    float dx = d.x / range, dz = d.z / range;
                    if (Mathf.Abs(dx) > 1.15f || Mathf.Abs(dz) > 1.15f) continue;
                    dx = Mathf.Clamp(dx, -1f, 1f); dz = Mathf.Clamp(dz, -1f, 1f);
                    var dot = _blipDots[used++];
                    dot.enabled = true;
                    dot.color = priority ? new Color(b.color.r, b.color.g, b.color.b, pulse) : b.color;
                    float sz = priority ? 17f : 11f;
                    dot.rectTransform.sizeDelta = new Vector2(sz, sz);
                    dot.rectTransform.anchoredPosition = new Vector2(dx * 100f, dz * 100f);
                }
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
            if (_wheelName != null)
            {
                string id = Weapons.WheelOrder[Mathf.Clamp(combat.WheelSelection, 0, Weapons.WheelOrder.Length - 1)];
                _wheelName.text = Weapons.Get(id).name + (combat.Owns(id) ? "" : "\n<locked>");
            }
        }

        void Refresh()
        {
            if (_healthFill != null) _healthFill.fillAmount = state.Health01;
            if (_armorBg != null)
            {
                bool armored = state.Armor > 0.5f;
                if (_armorBg.gameObject.activeSelf != armored) _armorBg.gameObject.SetActive(armored);
                if (armored && _armorFill != null) _armorFill.fillAmount = state.Armor01;
            }
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

            // Armor bar (just above health; shown only when armored)
            _armorBg = Panel(root, new Vector2(0, 0), new Vector2(0, 0), new Vector2(30, 64),
                new Vector2(320, 22), new Color(0f, 0f, 0f, 0.5f));
            _armorFill = Panel(_armorBg.transform, new Vector2(0, 0.5f), new Vector2(0, 0.5f), new Vector2(3, 0),
                new Vector2(314, 16), new Color(0.4f, 0.6f, 1f, 0.95f));
            _armorFill.type = Image.Type.Filled;
            _armorFill.fillMethod = Image.FillMethod.Horizontal;
            _armorFill.fillOrigin = 0;
            _armorFill.rectTransform.pivot = new Vector2(0f, 0.5f);
            _armorFill.rectTransform.anchoredPosition = new Vector2(3, 0);
            Label(_armorBg.transform, "ARMOR", 12, TextAnchor.MiddleLeft, new Vector2(0, 0.5f), new Vector2(8, 0), new Vector2(120, 22));
            _armorBg.gameObject.SetActive(false);

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

            // GPS route line (drawn under the blips).
            _mapRoot = mmGo.transform;
            _routeSegs = new Image[28];
            for (int i = 0; i < _routeSegs.Length; i++)
            {
                var sg = new GameObject("route", typeof(Image));
                sg.transform.SetParent(_mapRoot, false);
                var im = sg.GetComponent<Image>();
                im.color = new Color(0.3f, 0.85f, 1f, 0.85f); im.enabled = false;
                var rt = im.rectTransform; rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0.5f); rt.pivot = new Vector2(0.5f, 0.5f);
                _routeSegs[i] = im;
            }

            // Map blip dots (shops / missions / cash / objective) drawn over the minimap.
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

            // Player arrow — a dark backing arrow + a bright white arrow on top so it reads clearly
            // against the map and never blends with the coloured blips (GTA-style player marker).
            var blipBackGo = new GameObject("BlipOutline", typeof(Image));
            blipBackGo.transform.SetParent(mmGo.transform, false);
            var blipBack = blipBackGo.GetComponent<Image>();
            blipBack.sprite = ArrowSprite();
            blipBack.color = new Color(0f, 0f, 0f, 0.85f);
            var backRt = blipBack.rectTransform;
            backRt.anchorMin = backRt.anchorMax = new Vector2(0.5f, 0.5f);
            backRt.sizeDelta = new Vector2(26, 30);
            backRt.anchoredPosition = Vector2.zero;

            var blipGo = new GameObject("Blip", typeof(Image));
            blipGo.transform.SetParent(mmGo.transform, false);
            var blip = blipGo.GetComponent<Image>();
            blip.sprite = ArrowSprite();
            blip.color = Color.white;
            _blip = blip.rectTransform;
            _blip.anchorMin = _blip.anchorMax = new Vector2(0.5f, 0.5f);
            _blip.sizeDelta = new Vector2(20, 24);
            _blip.anchoredPosition = Vector2.zero;
            _blipBack = backRt;
            Label(mmFrame.transform, "SANTA VISTA", 12, TextAnchor.UpperCenter, new Vector2(0.5f, 1f), new Vector2(0, -2), new Vector2(200, 18));

            // Controls hint (top-center)
            _hintText = Label(root, Controls.OneLine,
                13, TextAnchor.UpperCenter, new Vector2(0.5f, 1f), new Vector2(0, -14), new Vector2(1800, 24));
            _hintText.color = new Color(1f, 1f, 1f, 0.65f);

            // Wanted stars (top-right)
            _starsText = Label(root, "\u2606\u2606\u2606\u2606\u2606", 34, TextAnchor.UpperRight, new Vector2(1, 1),
                new Vector2(-30, -24), new Vector2(320, 44));
            _starsText.color = new Color(1f, 0.85f, 0.2f, 0.25f);

            // Clock (top-right, below the stars)
            _clockText = Label(root, "\u2600 08:00", 24, TextAnchor.UpperRight, new Vector2(1, 1),
                new Vector2(-30, -74), new Vector2(320, 32));
            _clockText.color = new Color(0.9f, 0.92f, 1f);

            // Mission panel (top-left corner) — GTA-style active mission + objective.
            _missionPanel = Panel(root, new Vector2(0, 1), new Vector2(0, 1), new Vector2(28, -28), new Vector2(450, 84), new Color(0f, 0f, 0f, 0.52f));
            var accent = Panel(_missionPanel.transform, new Vector2(0, 0), new Vector2(0, 1), new Vector2(0, 0), new Vector2(5, 0), new Color(1f, 0.82f, 0.28f, 0.95f));
            accent.rectTransform.pivot = new Vector2(0f, 0.5f);
            accent.rectTransform.anchoredPosition = Vector2.zero;
            _missionTitle = Label(_missionPanel.transform, "", 20, TextAnchor.UpperLeft, new Vector2(0, 1), new Vector2(18, -10), new Vector2(420, 28));
            _missionTitle.color = new Color(1f, 0.85f, 0.4f); _missionTitle.fontStyle = FontStyle.Bold;
            _missionObjective = Label(_missionPanel.transform, "", 17, TextAnchor.UpperLeft, new Vector2(0, 1), new Vector2(18, -44), new Vector2(420, 34));
            _missionObjective.color = new Color(0.9f, 0.95f, 1f);
            _missionPanel.enabled = false; _missionTitle.enabled = false; _missionObjective.enabled = false;

            // Side-activity status line (top-left, below the mission panel).
            _activityText = Label(root, "", 20, TextAnchor.UpperLeft, new Vector2(0, 1), new Vector2(30, -122), new Vector2(520, 30));
            _activityText.color = new Color(0.6f, 1f, 0.8f); _activityText.fontStyle = FontStyle.Bold;
            _activityText.enabled = false;

            // Interaction prompt (bottom-center, above the health bar)
            _promptText = Label(root, "", 24, TextAnchor.LowerCenter, new Vector2(0.5f, 0),
                new Vector2(0, 180), new Vector2(1000, 40));
            _promptText.color = new Color(1f, 0.92f, 0.7f);

            // Police alert / surrender prompt (center, above the reticle)
            _alertText = Label(root, "", 26, TextAnchor.MiddleCenter, new Vector2(0.5f, 0.5f),
                new Vector2(0, 120), new Vector2(1200, 40));
            _alertText.fontStyle = FontStyle.Bold;
            _alertText.color = new Color(1f, 0.4f, 0.35f, 0f);
            _alertText.enabled = false;

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

            // Damage vignette (full-screen red edge flash on taking damage)
            var vg = new GameObject("Vignette", typeof(RawImage));
            vg.transform.SetParent(root, false);
            _vignette = vg.GetComponent<RawImage>();
            _vignette.texture = VignetteTex(); _vignette.raycastTarget = false;
            _vignette.color = new Color(0.7f, 0.05f, 0.05f, 0f);
            var vrt = _vignette.rectTransform; vrt.anchorMin = Vector2.zero; vrt.anchorMax = Vector2.one; vrt.offsetMin = Vector2.zero; vrt.offsetMax = Vector2.zero;

            // Reticle (centre)
            _reticle = Label(root, "+", 30, TextAnchor.MiddleCenter, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(40, 40));
            _reticle.color = new Color(1f, 1f, 1f, 0.75f);

            // Hitmarker (brief X at centre when you damage an enemy)
            _hitmarker = Label(root, "\u2715", 30, TextAnchor.MiddleCenter, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(60, 60));
            _hitmarker.color = new Color(1f, 0.95f, 0.7f, 0f); _hitmarker.fontStyle = FontStyle.Bold;

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
            _wheelName = Label(_wheelRoot, "", 22, TextAnchor.MiddleCenter, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(280, 60));
            _wheelName.fontStyle = FontStyle.Bold;
            _wheelName.color = new Color(1f, 0.85f, 0.35f);
            Label(_wheelRoot, "hold Tab · move mouse / scroll · release to equip", 15,
                TextAnchor.LowerCenter, new Vector2(0.5f, 0f), new Vector2(0, -18), new Vector2(520, 24))
                .color = new Color(1f, 1f, 1f, 0.6f);
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

        static Texture2D VignetteTex()
        {
            if (_vigTex != null) return _vigTex;
            const int n = 64;
            var tex = new Texture2D(n, n, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
            Vector2 c = new Vector2((n - 1) * 0.5f, (n - 1) * 0.5f);
            float maxD = c.magnitude;
            for (int y = 0; y < n; y++)
                for (int x = 0; x < n; x++)
                {
                    float d = (new Vector2(x, y) - c).magnitude / maxD; // 0 centre → 1 corner
                    float a = Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(0.5f, 1f, d));
                    tex.SetPixel(x, y, new Color(1f, 1f, 1f, a));
                }
            tex.Apply();
            _vigTex = tex;
            return tex;
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
