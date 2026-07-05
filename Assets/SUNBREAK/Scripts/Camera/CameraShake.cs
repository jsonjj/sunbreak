using UnityEngine;

namespace SUNBREAK.Cameras
{
    /// <summary>
    /// Trauma-based screen shake applied to the main camera AFTER Cinemachine has positioned it
    /// (high execution order), so hits/explosions have weight. Decays quickly. Call
    /// <see cref="Add"/> from combat (player hit, explosion, heavy fire).
    /// </summary>
    [DefaultExecutionOrder(1000)]
    public sealed class CameraShake : MonoBehaviour
    {
        public static CameraShake Instance { get; private set; }

        float _trauma;
        float _seed;

        void Awake() { Instance = this; _seed = Random.value * 100f; }
        void OnDestroy() { if (Instance == this) Instance = null; }

        /// <summary>Add trauma (0..1). Bigger = stronger shake.</summary>
        public static void Add(float amount)
        {
            if (Instance != null) Instance._trauma = Mathf.Clamp01(Instance._trauma + amount);
        }

        void LateUpdate()
        {
            if (_trauma <= 0f) return;
            float s = _trauma * _trauma;                 // quadratic falloff feels punchier
            float ti = Time.unscaledTime * 26f + _seed;
            float x = (Mathf.PerlinNoise(ti, 0f) - 0.5f);
            float y = (Mathf.PerlinNoise(0f, ti) - 0.5f);
            float r = (Mathf.PerlinNoise(ti, ti) - 0.5f);
            transform.position += transform.right * (x * s * 0.5f) + transform.up * (y * s * 0.5f);
            transform.rotation *= Quaternion.Euler(0f, 0f, r * s * 4f);
            _trauma = Mathf.Max(0f, _trauma - Time.unscaledDeltaTime * 1.8f);
        }
    }
}
