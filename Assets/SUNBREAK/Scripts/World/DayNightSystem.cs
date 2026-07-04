using UnityEngine;

namespace SUNBREAK.World
{
    /// <summary>
    /// Time-of-day cycle (ported from the web daynight/time + director): advances a game clock,
    /// swings the sun, and drives sky/fog/ambient by time of day. At NIGHT it flips the "GTA"
    /// look — dims the sky, warms the streetlights + building windows (emissive), and cars turn on
    /// headlights (via <see cref="IsNight"/>). Day length is compressed for playability.
    /// </summary>
    [DefaultExecutionOrder(-200)]
    public sealed class DayNightSystem : MonoBehaviour
    {
        public static DayNightSystem Instance { get; private set; }
        public static bool IsNight { get; private set; }

        const float GameMinutesPerDay = 1440f;

        [Header("Wiring (set by IslandSceneBuilder)")]
        public Light sun;
        public Material cityMat;   // buildings — window glow at night
        public Material propMat;   // streetlight lamps — glow at night

        [Header("Tuning")]
        public float dayLengthRealSec = 540f;   // full cycle in ~9 real minutes (canon is 1440)
        [Range(0, 1440)] public float gameMinutes = 8 * 60f; // start 08:00

        Material _skybox;
        float _lampPoolTimer;
        Light[] _lampPool;
        static readonly int EmissionColor = Shader.PropertyToID("_EmissionColor");

        public float Tod01 => Mathf.Repeat(gameMinutes, GameMinutesPerDay) / GameMinutesPerDay;
        public int Hour => Mathf.FloorToInt(Mathf.Repeat(gameMinutes, GameMinutesPerDay) / 60f) % 24;
        public string Clock => $"{Hour:00}:{Mathf.FloorToInt(Mathf.Repeat(gameMinutes, 60f)):00}";

        void Awake()
        {
            Instance = this;
            // Clone the skybox so we can dim it at night without mutating the shared asset.
            if (RenderSettings.skybox != null)
            {
                _skybox = new Material(RenderSettings.skybox);
                RenderSettings.skybox = _skybox;
            }
            _lampPool = new Light[8];
            for (int i = 0; i < _lampPool.Length; i++)
            {
                var go = new GameObject("NightLamp" + i);
                go.transform.SetParent(transform, false);
                var l = go.AddComponent<Light>();
                l.type = LightType.Point; l.range = 20f; l.color = new Color(1f, 0.85f, 0.6f);
                l.intensity = 0f; l.shadows = LightShadows.None;
                _lampPool[i] = l;
            }
        }

        void OnDestroy() { if (Instance == this) Instance = null; }

        void Update()
        {
            float dt = Mathf.Min(Time.deltaTime, 1f / 15f);
            float scale = GameMinutesPerDay / Mathf.Max(1f, dayLengthRealSec); // game-min per real-sec
            gameMinutes = Mathf.Repeat(gameMinutes + dt * scale, GameMinutesPerDay);

            float t = Tod01;
            // Sun direction: sunrise ~0.25 (east low), noon 0.5 (high), sunset ~0.75 (west low).
            float theta = (t - 0.25f) * Mathf.PI * 2f;
            Vector3 sunDir = new Vector3(Mathf.Cos(theta), Mathf.Sin(theta), -0.35f).normalized;
            bool night = sunDir.y < -0.04f;
            IsNight = night;

            if (sun != null)
            {
                sun.transform.rotation = Quaternion.LookRotation(-sunDir, Vector3.up);
                float dayF = Mathf.Clamp01(sunDir.y * 3f + 0.2f); // 0 at/after dusk, 1 high day
                sun.intensity = Mathf.Lerp(0.05f, 1.5f, dayF);
                sun.color = Color.Lerp(new Color(0.5f, 0.55f, 0.7f), new Color(1f, 0.9f, 0.72f), dayF);
                // warm the light near sunrise/sunset
                if (dayF > 0f && dayF < 0.45f) sun.color = Color.Lerp(new Color(1f, 0.6f, 0.4f), sun.color, dayF / 0.45f);
            }

            // Sky + ambient + fog by time of day.
            float dayLight = Mathf.Clamp01(sunDir.y * 2.2f + 0.15f);
            if (_skybox != null && _skybox.HasProperty("_Exposure"))
                _skybox.SetFloat("_Exposure", Mathf.Lerp(0.08f, 1.0f, dayLight));
            RenderSettings.ambientIntensity = Mathf.Lerp(0.15f, 0.9f, dayLight);
            RenderSettings.fogColor = Color.Lerp(new Color(0.05f, 0.06f, 0.1f), new Color(0.8f, 0.72f, 0.62f), dayLight);

            ApplyNightLights(night);
        }

        void ApplyNightLights(bool night)
        {
            // Building windows + streetlamp glow (one shared material each = cheap city-wide).
            Color buildingEmit = night ? new Color(0.35f, 0.32f, 0.2f) : Color.black;
            SetEmission(cityMat, buildingEmit);
            SetEmission(propMat, night ? new Color(1f, 0.85f, 0.55f) * 1.2f : Color.black);

            // A pool of warm point lights snapped to the nearest streetlights around the player.
            var player = GameRefs.Player;
            _lampPoolTimer -= Time.deltaTime;
            if (player != null && _lampPoolTimer <= 0f)
            {
                _lampPoolTimer = 0.5f;
                Vector3 pp = player.position;
                float spacing = 64f;
                for (int i = 0; i < _lampPool.Length; i++)
                {
                    if (!night) { _lampPool[i].intensity = 0f; continue; }
                    float ang = i / (float)_lampPool.Length * Mathf.PI * 2f;
                    float gx = Mathf.Round((pp.x + Mathf.Cos(ang) * 22f) / spacing) * spacing;
                    float gz = Mathf.Round((pp.z + Mathf.Sin(ang) * 22f) / spacing) * spacing;
                    _lampPool[i].transform.position = new Vector3(gx + 5f, 6.5f, gz + 5f);
                    _lampPool[i].intensity = 6f;
                }
            }
            else if (!night)
                foreach (var l in _lampPool) l.intensity = 0f;
        }

        static void SetEmission(Material m, Color c)
        {
            if (m == null) return;
            if (c.maxColorComponent > 0.001f) m.EnableKeyword("_EMISSION");
            m.SetColor(EmissionColor, c);
        }

        /// <summary>Jump the clock (used by the capture tool to force a night shot).</summary>
        public void SetTime(float minutes) { gameMinutes = Mathf.Repeat(minutes, GameMinutesPerDay); }
    }
}
