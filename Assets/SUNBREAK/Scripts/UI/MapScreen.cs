using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UI;
using SUNBREAK.World;

namespace SUNBREAK.UI
{
    /// <summary>
    /// Full-screen map (M): a top-down ortho render of the island with all blips, pan (WASD/arrows),
    /// zoom (scroll), and click-to-set-waypoint. Pauses time while open.
    /// </summary>
    public sealed class MapScreen : MonoBehaviour
    {
        public static MapScreen Instance { get; private set; }
        public static Vector3? UserWaypoint { get; private set; }

        Camera _cam;
        RenderTexture _rt;
        Canvas _canvas;
        RawImage _img;
        RectTransform _imgRt, _blipLayer;
        Image _playerDot;
        Image[] _dots;
        Image[] _routeSegs;
        Text[] _labels;
        Font _font;
        InputAction _toggle, _click, _pan;
        bool _open;
        float _ortho = 300f;
        Vector3 _center;
        GameObject _beam;

        void Awake()
        {
            Instance = this;
            _toggle = new InputAction("Map", InputActionType.Button, "<Keyboard>/m");
            _click = new InputAction("MapClick", InputActionType.Button, "<Mouse>/leftButton");
            _pan = new InputAction("MapPan", InputActionType.Value);
            _pan.AddCompositeBinding("2DVector")
                .With("Up", "<Keyboard>/w").With("Down", "<Keyboard>/s")
                .With("Left", "<Keyboard>/a").With("Right", "<Keyboard>/d");
            _pan.AddCompositeBinding("2DVector")
                .With("Up", "<Keyboard>/upArrow").With("Down", "<Keyboard>/downArrow")
                .With("Left", "<Keyboard>/leftArrow").With("Right", "<Keyboard>/rightArrow");
        }
        void OnEnable() { _toggle.Enable(); }
        void OnDisable() { _toggle.Disable(); _click.Disable(); _pan.Disable(); }
        void OnDestroy() { if (Instance == this) Instance = null; }

        void Update()
        {
            if (_toggle.WasPressedThisFrame()) Toggle();
            if (!_open) return;

            float dt = Time.unscaledDeltaTime;
            Vector2 pan = _pan.ReadValue<Vector2>();
            _center += new Vector3(pan.x, 0f, pan.y) * _ortho * 1.2f * dt;
            float sc = Mouse.current != null ? Mouse.current.scroll.ReadValue().y : 0f;
            if (Mathf.Abs(sc) > 0.5f) _ortho = Mathf.Clamp(_ortho * (sc > 0f ? 0.9f : 1.1f), 60f, 600f);
            _center.x = Mathf.Clamp(_center.x, -600f, 600f);
            _center.z = Mathf.Clamp(_center.z, -600f, 600f);

            PositionCamera();
            if (_click.WasPressedThisFrame()) SetWaypointFromClick();
            DrawRoute();
            DrawBlips();
        }

        void DrawRoute()
        {
            if (_routeSegs == null) return;
            var route = NavRoute.Instance != null ? NavRoute.Instance.Route : null;
            int used = 0;
            if (route != null && route.Count >= 2)
            {
                float aspect = (float)Screen.width / Screen.height;
                float wHalf = _ortho * aspect, hHalf = _ortho;
                Vector2 size = _blipLayer.rect.size;
                Vector2 prev = Vector2.zero; bool havePrev = false;
                for (int i = 0; i < route.Count && used < _routeSegs.Length; i++)
                {
                    float u = (route[i].x - _center.x) / (2f * wHalf) + 0.5f;
                    float v = (route[i].z - _center.z) / (2f * hHalf) + 0.5f;
                    Vector2 p = new Vector2((u - 0.5f) * size.x, (v - 0.5f) * size.y);
                    if (havePrev) GameHUD.SetSeg(_routeSegs[used++], prev, p);
                    prev = p; havePrev = true;
                }
            }
            for (int i = used; i < _routeSegs.Length; i++) _routeSegs[i].enabled = false;
        }

        void Toggle()
        {
            if (_canvas == null) Build();
            if (_open) { Close(); return; }
            if (!Overlay.TryOpen(Overlay.Kind.Map, Close)) return; // another overlay owns the screen
            _open = true;
            _canvas.gameObject.SetActive(true);
            _cam.enabled = true;
            Time.timeScale = 0f;
            Cursor.lockState = CursorLockMode.None; Cursor.visible = true;
            _click.Enable(); _pan.Enable();
            _center = GameRefs.Player != null ? GameRefs.Player.position : Vector3.zero;
            PositionCamera();
        }

        /// <summary>Close the map (also the Esc-priority closer registered with <see cref="Overlay"/>).</summary>
        public void Close()
        {
            Overlay.MarkClosed(Overlay.Kind.Map);
            _open = false;
            if (_canvas != null) _canvas.gameObject.SetActive(false);
            if (_cam != null) _cam.enabled = false;
            Time.timeScale = 1f;
            Cursor.lockState = CursorLockMode.Locked; Cursor.visible = false;
            _click.Disable(); _pan.Disable();
        }

        void PositionCamera()
        {
            _cam.orthographicSize = _ortho;
            _cam.transform.SetPositionAndRotation(new Vector3(_center.x, 400f, _center.z), Quaternion.Euler(90f, 0f, 0f));
        }

        void SetWaypointFromClick()
        {
            var m = Mouse.current;
            if (m == null) return;
            Vector2 mp = m.position.ReadValue();
            // Screen → the map image's normalized rect → world XZ.
            if (!RectTransformUtility.ScreenPointToLocalPointInRectangle(_imgRt, mp, null, out Vector2 local)) return;
            Rect r = _imgRt.rect;
            float u = Mathf.InverseLerp(r.xMin, r.xMax, local.x);
            float v = Mathf.InverseLerp(r.yMin, r.yMax, local.y);
            if (u < 0f || u > 1f || v < 0f || v > 1f) return;
            float aspect = (float)Screen.width / Screen.height;
            float wx = _center.x + (u - 0.5f) * _ortho * 2f * aspect;
            float wz = _center.z + (v - 0.5f) * _ortho * 2f;
            SetUserWaypoint(new Vector3(wx, 0f, wz));
        }

        void SetUserWaypoint(Vector3 world)
        {
            if (Physics.Raycast(new Vector3(world.x, 300f, world.z), Vector3.down, out var hit, 600f))
                world.y = hit.point.y;
            UserWaypoint = world;
            if (_beam == null)
            {
                _beam = new GameObject("UserWaypoint");
                var beam = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                Object.Destroy(beam.GetComponent<Collider>());
                beam.transform.SetParent(_beam.transform, false);
                beam.transform.localScale = new Vector3(1.1f, 42f, 1.1f);
                beam.transform.localPosition = new Vector3(0f, 42f, 0f);
                var mat = new Material(Shader.Find("Universal Render Pipeline/Unlit")) { color = new Color(1f, 0.25f, 0.9f) };
                var mr = beam.GetComponent<MeshRenderer>();
                mr.sharedMaterial = mat; mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                Blip.Attach(_beam, BlipKind.Waypoint, new Color(1f, 0.25f, 0.9f), "Waypoint");
            }
            _beam.transform.position = world;
        }

        void DrawBlips()
        {
            float aspect = (float)Screen.width / Screen.height;
            float wHalf = _ortho * aspect, hHalf = _ortho;
            Vector2 size = _blipLayer.rect.size;
            var all = Blip.All;
            int used = 0, lbl = 0;
            float pulse = 0.55f + 0.45f * Mathf.Abs(Mathf.Sin(Time.time * 4f));
            for (int i = 0; i < all.Count && used < _dots.Length; i++)
            {
                var b = all[i];
                if (b == null) continue;
                float u = (b.transform.position.x - _center.x) / (2f * wHalf) + 0.5f;
                float v = (b.transform.position.z - _center.z) / (2f * hHalf) + 0.5f;
                if (u < 0f || u > 1f || v < 0f || v > 1f) continue;
                bool mission = b.kind == BlipKind.Mission || b.kind == BlipKind.Waypoint;
                var dot = _dots[used++];
                var pos = new Vector2((u - 0.5f) * size.x, (v - 0.5f) * size.y);
                dot.enabled = true;
                dot.color = mission ? new Color(b.color.r, b.color.g, b.color.b, pulse) : b.color;
                dot.rectTransform.sizeDelta = mission ? new Vector2(20, 20) : new Vector2(12, 12);
                dot.rectTransform.anchoredPosition = pos;
                // Label named points of interest + missions.
                if (!string.IsNullOrEmpty(b.label) && (b.kind == BlipKind.Shop || b.kind == BlipKind.Mission) && lbl < _labels.Length)
                {
                    var t = _labels[lbl++];
                    t.enabled = true;
                    t.text = b.label;
                    t.color = mission ? new Color(1f, 0.9f, 0.5f) : new Color(1f, 1f, 1f, 0.85f);
                    t.rectTransform.anchoredPosition = pos + new Vector2(11f, 0f);
                }
            }
            for (int i = used; i < _dots.Length; i++) _dots[i].enabled = false;
            for (int i = lbl; i < _labels.Length; i++) _labels[i].enabled = false;

            if (GameRefs.Player != null)
            {
                float u = (GameRefs.Player.position.x - _center.x) / (2f * wHalf) + 0.5f;
                float v = (GameRefs.Player.position.z - _center.z) / (2f * hHalf) + 0.5f;
                _playerDot.enabled = u >= 0f && u <= 1f && v >= 0f && v <= 1f;
                _playerDot.rectTransform.anchoredPosition = new Vector2((u - 0.5f) * size.x, (v - 0.5f) * size.y);
                _playerDot.rectTransform.localRotation = Quaternion.Euler(0, 0, -GameRefs.Player.eulerAngles.y);
            }
        }

        // ── Build ─────────────────────────────────────────────────────────────────
        void Build()
        {
            _font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            _rt = new RenderTexture(1024, 1024, 16) { name = "MapRT" };

            var camGo = new GameObject("MapCamera");
            camGo.transform.SetParent(transform, false);
            _cam = camGo.AddComponent<Camera>();
            _cam.orthographic = true; _cam.orthographicSize = _ortho;
            _cam.clearFlags = CameraClearFlags.SolidColor;
            _cam.backgroundColor = new Color(0.03f, 0.05f, 0.08f);
            _cam.cullingMask = ~(1 << CityGenerator.CarLayer); // skip cars for a clean map
            _cam.targetTexture = _rt; _cam.enabled = false; _cam.farClipPlane = 800f;

            var go = new GameObject("Map Canvas");
            go.transform.SetParent(transform, false);
            _canvas = go.AddComponent<Canvas>();
            _canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            _canvas.sortingOrder = 70;
            var scaler = go.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920, 1080);
            go.AddComponent<GraphicRaycaster>();

            var dim = NewImage(go.transform, new Color(0f, 0f, 0f, 0.9f));
            Stretch(dim.rectTransform, 0f);

            var imgGo = new GameObject("MapImage", typeof(RawImage));
            imgGo.transform.SetParent(go.transform, false);
            _img = imgGo.GetComponent<RawImage>();
            _img.texture = _rt;
            _imgRt = _img.rectTransform;
            _imgRt.anchorMin = new Vector2(0.5f, 0.5f); _imgRt.anchorMax = new Vector2(0.5f, 0.5f);
            _imgRt.sizeDelta = new Vector2(1000, 1000);

            var blipGo = new GameObject("Blips", typeof(RectTransform));
            blipGo.transform.SetParent(_imgRt, false);
            _blipLayer = (RectTransform)blipGo.transform;
            Stretch(_blipLayer, 0f);

            _routeSegs = new Image[80];
            for (int i = 0; i < _routeSegs.Length; i++)
            {
                var sg = new GameObject("route", typeof(Image));
                sg.transform.SetParent(_blipLayer, false);
                var im = sg.GetComponent<Image>();
                im.color = new Color(0.3f, 0.85f, 1f, 0.9f); im.enabled = false;
                var rt = im.rectTransform; rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0.5f); rt.pivot = new Vector2(0.5f, 0.5f);
                _routeSegs[i] = im;
            }

            _dots = new Image[80];
            for (int i = 0; i < _dots.Length; i++)
            {
                var d = new GameObject("dot", typeof(Image));
                d.transform.SetParent(_blipLayer, false);
                var im = d.GetComponent<Image>(); im.enabled = false;
                var rt = im.rectTransform; rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0.5f); rt.sizeDelta = new Vector2(12, 12);
                _dots[i] = im;
            }
            _labels = new Text[48];
            for (int i = 0; i < _labels.Length; i++)
            {
                var lg = new GameObject("lbl", typeof(Text));
                lg.transform.SetParent(_blipLayer, false);
                var t = lg.GetComponent<Text>();
                t.font = _font; t.fontSize = 15; t.alignment = TextAnchor.MiddleLeft; t.color = Color.white;
                t.horizontalOverflow = HorizontalWrapMode.Overflow; t.verticalOverflow = VerticalWrapMode.Overflow;
                t.enabled = false;
                var rt = t.rectTransform; rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0.5f); rt.pivot = new Vector2(0f, 0.5f); rt.sizeDelta = new Vector2(200, 20);
                _labels[i] = t;
            }
            _playerDot = new GameObject("player", typeof(Image)).GetComponent<Image>();
            _playerDot.transform.SetParent(_blipLayer, false);
            _playerDot.color = new Color(0.4f, 0.8f, 1f);
            var prt = _playerDot.rectTransform; prt.anchorMin = prt.anchorMax = new Vector2(0.5f, 0.5f); prt.sizeDelta = new Vector2(18, 18);

            Label(go.transform, "MAP", 34, TextAnchor.UpperCenter, new Vector2(0, -20), new Vector2(400, 44)).color = new Color(1f, 0.85f, 0.4f);
            Label(go.transform, "WASD/Arrows pan · Scroll zoom · Click set waypoint · M close", 18,
                TextAnchor.LowerCenter, new Vector2(0, 22), new Vector2(1200, 26)).color = new Color(1f, 1f, 1f, 0.7f);

            _canvas.gameObject.SetActive(false);
        }

        Image NewImage(Transform p, Color c)
        {
            var go = new GameObject("Img", typeof(Image));
            go.transform.SetParent(p, false);
            var im = go.GetComponent<Image>(); im.color = c; return im;
        }
        static void Stretch(RectTransform rt, float pad)
        {
            rt.anchorMin = Vector2.zero; rt.anchorMax = Vector2.one;
            rt.offsetMin = new Vector2(pad, pad); rt.offsetMax = new Vector2(-pad, -pad);
        }
        Text Label(Transform p, string text, int size, TextAnchor a, Vector2 pos, Vector2 sd)
        {
            var go = new GameObject("Label", typeof(Text));
            go.transform.SetParent(p, false);
            var t = go.GetComponent<Text>();
            t.text = text; t.font = _font; t.fontSize = size; t.alignment = a; t.color = Color.white;
            t.horizontalOverflow = HorizontalWrapMode.Overflow;
            var rt = t.rectTransform;
            rt.anchorMin = new Vector2(0.5f, a == TextAnchor.LowerCenter ? 0f : 1f);
            rt.anchorMax = rt.anchorMin; rt.pivot = rt.anchorMin;
            rt.sizeDelta = sd; rt.anchoredPosition = pos;
            return t;
        }
    }
}
