using UnityEngine;
using SUNBREAK.Vehicles;
using SUNBREAK.World;

namespace SUNBREAK.Audio
{
    /// <summary>Looping engine tone whose pitch/volume track speed. Paused when far from the player
    /// so a full street of traffic doesn't run dozens of live voices.</summary>
    public sealed class EngineAudio : MonoBehaviour
    {
        AudioSource _src;
        ArcadeCarController _car;
        float _timer;

        void Start()
        {
            _car = GetComponent<ArcadeCarController>();
            _src = gameObject.AddComponent<AudioSource>();
            _src.clip = MakeEngine(); _src.loop = true; _src.playOnAwake = false;
            _src.spatialBlend = 1f; _src.rolloffMode = AudioRolloffMode.Linear;
            _src.minDistance = 5f; _src.maxDistance = 60f; _src.volume = 0f; _src.pitch = 0.7f;
            _src.Play();
        }

        void Update()
        {
            _timer -= Time.deltaTime;
            if (_timer > 0f) return;
            _timer = 0.12f;

            bool near = GameRefs.Player == null ||
                        (transform.position - GameRefs.Player.position).sqrMagnitude < 60f * 60f;
            if (!near) { if (_src.isPlaying) _src.Pause(); return; }
            if (!_src.isPlaying) _src.UnPause();

            float speed = _car != null ? Mathf.Abs(_car.SpeedKmh) / 3.6f : 7f;
            float baseVol = GameAudio.Instance != null ? GameAudio.Instance.Sfx : 0.8f;
            _src.volume = Mathf.Lerp(0.10f, 0.32f, Mathf.InverseLerp(0f, 26f, speed)) * baseVol;
            _src.pitch = Mathf.Lerp(0.7f, 1.9f, Mathf.InverseLerp(0f, 30f, speed));
        }

        // A cheap two-saw rumble; exactly 60 cycles/sec over 1 s → loops seamlessly.
        static AudioClip MakeEngine()
        {
            const int rate = 44100, len = rate;
            var d = new float[len];
            const float hz = 60f;
            for (int i = 0; i < len; i++)
            {
                float t = i / (float)rate;
                float p1 = t * hz; float saw1 = 2f * (p1 - Mathf.Floor(p1 + 0.5f));
                float p2 = t * hz * 2f; float saw2 = 2f * (p2 - Mathf.Floor(p2 + 0.5f));
                d[i] = (saw1 * 0.5f + saw2 * 0.22f) * 0.32f;
            }
            var c = AudioClip.Create("engine", len, 1, rate, false);
            c.SetData(d, 0);
            return c;
        }
    }
}
