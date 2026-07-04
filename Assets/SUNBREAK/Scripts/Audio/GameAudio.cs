using UnityEngine;
using SUNBREAK.World;

namespace SUNBREAK.Audio
{
    /// <summary>
    /// Central audio bus (a code mixer: master / sfx / music / ambient volumes) plus a 2D ambient
    /// bed. Master drives the AudioListener; other systems (footsteps, engine, radio, combat) read
    /// the per-category volumes. Ambient dips a touch at night. All clips are generated — no assets.
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

        AudioSource _ambient;

        void Awake()
        {
            Instance = this;
            AudioListener.volume = master;
            var go = new GameObject("AmbientBed");
            go.transform.SetParent(transform, false);
            _ambient = go.AddComponent<AudioSource>();
            _ambient.clip = MakeAmbientLoop();
            _ambient.loop = true; _ambient.spatialBlend = 0f; _ambient.playOnAwake = false;
            _ambient.volume = ambient;
            _ambient.Play();
        }

        void OnDestroy() { if (Instance == this) Instance = null; }

        void Update()
        {
            AudioListener.volume = master;
            if (_ambient != null) _ambient.volume = ambient * (DayNightSystem.IsNight ? 0.7f : 1f);
        }

        // A soft, slowly-undulating city/wind bed (filtered noise), edge-faded to loop seamlessly.
        static AudioClip MakeAmbientLoop()
        {
            const int rate = 44100, len = rate * 4;
            var d = new float[len];
            var rng = new System.Random(3);
            float lp = 0f;
            for (int i = 0; i < len; i++)
            {
                float w = (float)(rng.NextDouble() * 2 - 1);
                lp = lp * 0.995f + w * 0.005f; // heavy low-pass → wind rumble
                float lfo = 0.6f + 0.4f * Mathf.Sin(i / (float)rate * 0.25f * Mathf.PI * 2f);
                d[i] = Mathf.Clamp(lp * 6f, -1f, 1f) * lfo * 0.5f;
            }
            int f = rate / 2;
            for (int i = 0; i < f; i++) { float g = i / (float)f; d[i] *= g; d[len - 1 - i] *= g; }
            var c = AudioClip.Create("ambient", len, 1, rate, false);
            c.SetData(d, 0);
            return c;
        }
    }
}
