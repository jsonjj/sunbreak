using UnityEngine;
using SUNBREAK.Player;

namespace SUNBREAK.Audio
{
    /// <summary>Footstep ticks while the player is moving on the ground; cadence scales with speed.</summary>
    public sealed class FootstepAudio : MonoBehaviour
    {
        public PlayerController controller;
        AudioSource _src;
        float _next;

        void Start()
        {
            if (controller == null) controller = GetComponent<PlayerController>();
            _src = gameObject.AddComponent<AudioSource>();
            _src.clip = MakeStep(); _src.spatialBlend = 0f; _src.playOnAwake = false;
        }

        void Update()
        {
            if (controller == null || !controller.IsGrounded) return;
            float sp = controller.PlanarSpeed;
            if (sp < 0.6f || Time.time < _next) return;
            _next = Time.time + Mathf.Lerp(0.55f, 0.26f, Mathf.InverseLerp(1f, 6f, sp));
            _src.volume = (GameAudio.Instance != null ? GameAudio.Instance.Sfx : 0.8f) * 0.35f;
            _src.pitch = Random.Range(0.9f, 1.1f);
            _src.Play();
        }

        static AudioClip MakeStep()
        {
            const int rate = 44100, len = rate / 12;
            var d = new float[len];
            var rng = new System.Random(5);
            for (int i = 0; i < len; i++)
            {
                float env = Mathf.Exp(-i / (len * 0.1f));
                d[i] = (float)(rng.NextDouble() * 2 - 1) * env * 0.5f;
            }
            var c = AudioClip.Create("step", len, 1, rate, false);
            c.SetData(d, 0);
            return c;
        }
    }
}
