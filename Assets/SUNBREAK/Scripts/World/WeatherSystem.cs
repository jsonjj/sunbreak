using System.Collections.Generic;
using UnityEngine;

namespace SUNBREAK.World
{
    /// <summary>
    /// Dynamic weather (clear ↔ overcast ↔ rain ↔ storm) layered ON TOP of the day-night lighting.
    /// Drives fog (shorter + greyer haze = less visibility), a player-following rain particle field,
    /// ambient dimming under cloud, occasional storm lightning, and a wet-look on the ground. Gameplay:
    /// exposes <see cref="GripMultiplier"/> (roads get slick when wet) read by the car controller.
    /// Runs after DayNightSystem so its fog/ambient edits win each frame.
    /// </summary>
    [DefaultExecutionOrder(-150)]
    public sealed class WeatherSystem : MonoBehaviour
    {
        public static WeatherSystem Instance { get; private set; }
        /// <summary>1 = full dry grip, ~0.72 when roads are soaked. Read by ArcadeCarController.</summary>
        public static float GripMultiplier = 1f;

        public enum Weather { Clear, Overcast, Rain, Storm }
        public Weather Current { get; private set; } = Weather.Clear;
        public float Wetness => _wet;

        float _wet, _targetWet, _cloud, _targetCloud, _rainRate, _targetRain;
        float _stateUntil, _nextLightning;
        ParticleSystem _rain;
        Light _flash;
        float _flashUntil;
        Transform _player;
        readonly List<(Renderer r, Color baseCol, float baseSmooth)> _ground = new();
        bool _groundCached;
        static readonly int Smooth = Shader.PropertyToID("_Smoothness");
        static readonly int BaseColor = Shader.PropertyToID("_BaseColor");

        void Awake()
        {
            Instance = this;
            BuildRain();
            BuildFlash();
            Enter(Weather.Clear, instant: true);
        }
        void OnDestroy() { if (Instance == this) { Instance = null; GripMultiplier = 1f; } }

        void Update()
        {
            float dt = Time.deltaTime;
            if (Time.time >= _stateUntil) NextState();

            _wet = Mathf.MoveTowards(_wet, _targetWet, dt * 0.12f);
            _cloud = Mathf.MoveTowards(_cloud, _targetCloud, dt * 0.25f);
            _rainRate = Mathf.MoveTowards(_rainRate, _targetRain, dt * 900f);

            GripMultiplier = Mathf.Lerp(1f, 0.72f, _wet);

            // Fog: pull the haze in + grey it under cloud/rain (visibility falls).
            float haze = Mathf.Clamp01(_cloud * 0.6f + _wet * 0.6f);
            RenderSettings.fogEndDistance = Mathf.Lerp(420f, 130f, haze);
            RenderSettings.fogStartDistance = Mathf.Lerp(45f, 15f, haze);
            RenderSettings.fogColor = Color.Lerp(RenderSettings.fogColor, new Color(0.62f, 0.64f, 0.68f), haze * 0.7f);
            RenderSettings.ambientIntensity *= Mathf.Lerp(1f, 0.65f, _cloud);

            // Rain field follows the player.
            if (_player == null) _player = GameRefs.Player;
            if (_rain != null && _player != null)
            {
                _rain.transform.position = _player.position + Vector3.up * 22f;
                var em = _rain.emission;
                em.rateOverTime = _rainRate;
                bool play = _rainRate > 1f;
                if (play && !_rain.isPlaying) _rain.Play();
                else if (!play && _rain.isPlaying) _rain.Stop();
            }

            // Storm lightning: a brief bright flash + ambient pop.
            if (Current == Weather.Storm && Time.time >= _nextLightning)
            {
                _nextLightning = Time.time + Random.Range(4f, 11f);
                _flashUntil = Time.time + 0.14f;
            }
            if (_flash != null)
            {
                bool on = Time.time < _flashUntil;
                _flash.enabled = on;
                if (on) _flash.intensity = Random.Range(3f, 6f);
            }

            ApplyWetGround(_wet);
        }

        /// <summary>Force a weather state (verification / scripting).</summary>
        public void Force(Weather w) => Enter(w, instant: true);

        /// <summary>Current state as an int (save) + restore.</summary>
        public int StateIndex => (int)Current;
        public void SetState(int i) => Enter((Weather)Mathf.Clamp(i, 0, 3), instant: true);

        void NextState()
        {
            // Weighted so clear/overcast dominate; storms are rare.
            float r = Random.value;
            Weather next = r < 0.42f ? Weather.Clear : r < 0.72f ? Weather.Overcast : r < 0.92f ? Weather.Rain : Weather.Storm;
            if (next == Current) next = Current == Weather.Clear ? Weather.Overcast : Weather.Clear;
            Enter(next, instant: false);
        }

        void Enter(Weather w, bool instant)
        {
            Current = w;
            _stateUntil = Time.time + Random.Range(45f, 95f);
            switch (w)
            {
                case Weather.Clear: _targetWet = 0f; _targetCloud = 0f; _targetRain = 0f; break;
                case Weather.Overcast: _targetWet = 0.15f; _targetCloud = 0.6f; _targetRain = 0f; break;
                case Weather.Rain: _targetWet = 0.85f; _targetCloud = 0.7f; _targetRain = 700f; break;
                case Weather.Storm: _targetWet = 1f; _targetCloud = 0.92f; _targetRain = 1500f; _stateUntil = Time.time + Random.Range(30f, 55f); break;
            }
            if (instant) { _wet = _targetWet; _cloud = _targetCloud; _rainRate = _targetRain; }
        }

        void ApplyWetGround(float wet)
        {
            if (!_groundCached) CacheGround();
            for (int i = 0; i < _ground.Count; i++)
            {
                var g = _ground[i];
                if (g.r == null) continue;
                var m = g.r.material; // instance (safe at runtime; never touches the asset)
                if (m.HasProperty(Smooth)) m.SetFloat(Smooth, Mathf.Lerp(g.baseSmooth, 0.7f, wet));
                if (m.HasProperty(BaseColor)) m.SetColor(BaseColor, Color.Lerp(g.baseCol, g.baseCol * 0.72f, wet));
            }
        }

        void CacheGround()
        {
            _groundCached = true;
            foreach (var r in FindObjectsByType<MeshRenderer>(FindObjectsSortMode.None))
            {
                string n = r.gameObject.name;
                if (n != "Terrain" && n != "Roads") continue;
                var m = r.sharedMaterial;
                float s = m != null && m.HasProperty(Smooth) ? m.GetFloat(Smooth) : 0.05f;
                Color c = m != null && m.HasProperty(BaseColor) ? m.GetColor(BaseColor) : Color.white;
                _ground.Add((r, c, s));
            }
        }

        void BuildRain()
        {
            var go = new GameObject("Rain");
            go.transform.SetParent(transform, false);
            _rain = go.AddComponent<ParticleSystem>();
            _rain.Stop();
            var main = _rain.main;
            main.startLifetime = 1.1f; main.startSpeed = 26f; main.startSize = 0.06f;
            main.maxParticles = 3000; main.simulationSpace = ParticleSystemSimulationSpace.World;
            main.startColor = new Color(0.7f, 0.78f, 0.9f, 0.55f);
            main.gravityModifier = 1.2f;
            var sh = _rain.shape; sh.shapeType = ParticleSystemShapeType.Box; sh.scale = new Vector3(90f, 1f, 90f);
            var em = _rain.emission; em.rateOverTime = 0f;
            var vel = _rain.velocityOverLifetime; vel.enabled = true; vel.space = ParticleSystemSimulationSpace.World;
            vel.y = new ParticleSystem.MinMaxCurve(-24f);
            var r = _rain.GetComponent<ParticleSystemRenderer>();
            r.renderMode = ParticleSystemRenderMode.Stretch;
            r.velocityScale = 0.12f; r.lengthScale = 3.5f;
            r.material = RainMat();
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        }

        void BuildFlash()
        {
            var go = new GameObject("Lightning");
            go.transform.SetParent(transform, false);
            _flash = go.AddComponent<Light>();
            _flash.type = LightType.Directional;
            _flash.color = new Color(0.85f, 0.9f, 1f);
            _flash.intensity = 0f; _flash.enabled = false; _flash.shadows = LightShadows.None;
            go.transform.rotation = Quaternion.Euler(60f, 30f, 0f);
        }

        static Material _rainMat;
        static Material RainMat()
        {
            if (_rainMat != null) return _rainMat;
            var m = new Material(Shader.Find("Universal Render Pipeline/Unlit"));
            m.SetFloat("_Surface", 1f);
            m.SetFloat("_SrcBlend", (float)UnityEngine.Rendering.BlendMode.SrcAlpha);
            m.SetFloat("_DstBlend", (float)UnityEngine.Rendering.BlendMode.One);
            m.SetFloat("_ZWrite", 0f);
            m.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
            m.renderQueue = 3000;
            m.SetColor("_BaseColor", new Color(0.75f, 0.82f, 0.95f, 0.5f));
            _rainMat = m;
            return m;
        }
    }
}
