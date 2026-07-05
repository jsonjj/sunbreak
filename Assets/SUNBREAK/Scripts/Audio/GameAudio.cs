using UnityEngine;
using SUNBREAK.World;

namespace SUNBREAK.Audio
{
    /// <summary>
    /// Central audio bus (code mixer: master / sfx / music / ambient) + layered 2D beds, all
    /// generated (no assets): a wind/city bed, a dynamic TENSION layer that swells with the wanted
    /// level, distant SIRENS while wanted, CROWD murmur in dense districts, and GULLS near the coast.
    /// Master drives the AudioListener; other systems read the per-category volumes.
    /// </summary>
    public sealed class GameAudio : MonoBehaviour
    {
        public static GameAudio Instance { get; private set; }

        [Range(0f, 1f)] public float master = 0.9f;
        [Range(0f, 1f)] public float sfx = 0.9f;
        [Range(0f, 1f)] public float music = 0.75f;
        [Range(0f, 1f)] public float ambient = 0.45f;

        public float Sfx => sfx;
        public float Music => music;

        AudioSource _ambient, _tension, _siren, _crowd, _gulls;
        float _vTension, _vSiren, _vCrowd, _vGulls;

        void Awake()
        {
            Instance = this;
            AudioListener.volume = master;
            _ambient = MakeSource("AmbientBed", MakeWindLoop(), 1f);
            _tension = MakeSource("Tension", MakeTensionLoop(), 0f);
            _siren = MakeSource("Sirens", MakeSirenLoop(), 0f);
            _crowd = MakeSource("Crowd", MakeCrowdLoop(), 0f);
            _gulls = MakeSource("Gulls", MakeGullLoop(), 0f);
        }

        void OnDestroy() { if (Instance == this) Instance = null; }

        AudioSource MakeSource(string name, AudioClip clip, float vol)
        {
            var go = new GameObject(name);
            go.transform.SetParent(transform, false);
            var s = go.AddComponent<AudioSource>();
            s.clip = clip; s.loop = true; s.spatialBlend = 0f; s.playOnAwake = false; s.volume = vol;
            s.Play();
            return s;
        }

        void Update()
        {
            AudioListener.volume = master;
            float dt = Time.deltaTime;
            float nightDip = DayNightSystem.IsNight ? 0.7f : 1f;

            if (_ambient != null) _ambient.volume = ambient * nightDip;

            // Dynamic tension + sirens scale with the wanted level.
            int stars = WantedSystem.Instance != null ? WantedSystem.Instance.Stars : 0;
            float tensionTarget = stars > 0 ? Mathf.Clamp01(stars / 5f) : 0f;
            float sirenTarget = stars > 0 ? 0.35f + 0.13f * stars : 0f;

            // Crowd murmur by district density; gulls by coastal proximity.
            float crowdTarget = 0f, gullTarget = 0f;
            var p = GameRefs.Player;
            if (p != null)
            {
                var dist = Geography.DistrictAt(p.position.x, p.position.z);
                crowdTarget = dist != null ? dist.density : 0f;
                float coastness = Mathf.Clamp01(1f - Geography.CoastInset(p.position.x, p.position.z) / 70f);
                float marina = Geography.MarinaMask(p.position.x, p.position.z);
                gullTarget = Mathf.Max(coastness, marina);
            }

            _vTension = Mathf.MoveTowards(_vTension, tensionTarget, dt * 0.8f);
            _vSiren = Mathf.MoveTowards(_vSiren, sirenTarget, dt * 0.8f);
            _vCrowd = Mathf.MoveTowards(_vCrowd, crowdTarget, dt * 0.5f);
            _vGulls = Mathf.MoveTowards(_vGulls, gullTarget, dt * 0.4f);

            if (_tension != null) _tension.volume = _vTension * 0.5f * music;
            if (_siren != null) _siren.volume = _vSiren * 0.5f * ambient;
            if (_crowd != null) _crowd.volume = _vCrowd * 0.5f * ambient * nightDip;
            if (_gulls != null) _gulls.volume = _vGulls * 0.45f * ambient;
        }

        // ── Generated loops ──────────────────────────────────────────────────────
        static AudioClip MakeWindLoop()
        {
            const int rate = 44100, len = rate * 4;
            var d = new float[len]; var rng = new System.Random(3); float lp = 0f;
            for (int i = 0; i < len; i++)
            {
                float w = (float)(rng.NextDouble() * 2 - 1);
                lp = lp * 0.995f + w * 0.005f;
                float lfo = 0.6f + 0.4f * Mathf.Sin(i / (float)rate * 0.25f * Mathf.PI * 2f);
                d[i] = Mathf.Clamp(lp * 6f, -1f, 1f) * lfo * 0.5f;
            }
            EdgeFade(d, rate / 2);
            return Clip("ambient", d, rate);
        }

        static AudioClip MakeTensionLoop()
        {
            const int rate = 44100, len = rate * 4;
            var d = new float[len];
            for (int i = 0; i < len; i++)
            {
                float t = i / (float)rate;
                float trem = 0.7f + 0.3f * Mathf.Sin(t * 0.35f * Mathf.PI * 2f);
                float drone = Mathf.Sin(t * 55f * Mathf.PI * 2f) * 0.5f
                            + Mathf.Sin(t * 82.4f * Mathf.PI * 2f) * 0.35f
                            + Mathf.Sin(t * 110.3f * Mathf.PI * 2f) * 0.2f; // slight beat = unease
                d[i] = drone * trem * 0.5f;
            }
            EdgeFade(d, rate / 3);
            return Clip("tension", d, rate);
        }

        static AudioClip MakeSirenLoop()
        {
            const int rate = 44100; int len = Mathf.RoundToInt(rate * 2.4f);
            var d = new float[len];
            for (int i = 0; i < len; i++)
            {
                float t = i / (float)rate;
                float f = (Mathf.Repeat(t, 1.2f) < 0.6f) ? 660f : 880f; // two-tone wail
                float sq = Mathf.Sign(Mathf.Sin(t * f * Mathf.PI * 2f)) * 0.5f + 0.5f * Mathf.Sin(t * f * Mathf.PI * 2f);
                d[i] = sq * 0.3f;
            }
            return Clip("siren", d, rate); // seamless (integer wail periods)
        }

        static AudioClip MakeCrowdLoop()
        {
            const int rate = 44100, len = rate * 4;
            var d = new float[len]; var rng = new System.Random(11); float bp = 0f, prev = 0f;
            for (int i = 0; i < len; i++)
            {
                float w = (float)(rng.NextDouble() * 2 - 1);
                float hp = w - prev; prev = w;           // crude high-pass (remove rumble)
                bp = bp * 0.9f + hp * 0.1f;              // then low-pass → mid "babble" band
                float babble = 0.5f + 0.5f * Mathf.Sin(i / (float)rate * 3.3f * Mathf.PI * 2f);
                d[i] = Mathf.Clamp(bp * 5f, -1f, 1f) * babble * 0.4f;
            }
            EdgeFade(d, rate / 2);
            return Clip("crowd", d, rate);
        }

        static AudioClip MakeGullLoop()
        {
            const int rate = 44100, len = rate * 5;
            var d = new float[len];
            float[] at = { 0.3f, 1.8f, 3.4f, 4.2f }; // chirp onsets (s)
            foreach (float a in at)
            {
                int start = Mathf.RoundToInt(a * rate);
                int dur = Mathf.RoundToInt(0.35f * rate);
                for (int i = 0; i < dur && start + i < len; i++)
                {
                    float u = i / (float)dur;
                    float freq = Mathf.Lerp(1500f, 800f, u);        // descending "kyaa"
                    float env = Mathf.Sin(u * Mathf.PI);            // rise-fall
                    d[start + i] += Mathf.Sin(freq * (start + i) / (float)rate * Mathf.PI * 2f) * env * 0.22f;
                }
            }
            return Clip("gulls", d, rate);
        }

        static void EdgeFade(float[] d, int f)
        {
            for (int i = 0; i < f && i < d.Length; i++) { float g = i / (float)f; d[i] *= g; d[d.Length - 1 - i] *= g; }
        }

        static AudioClip Clip(string name, float[] data, int rate)
        {
            var c = AudioClip.Create(name, data.Length, 1, rate, false);
            c.SetData(data, 0);
            return c;
        }
    }
}
