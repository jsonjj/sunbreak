using UnityEngine;

namespace SUNBREAK.World
{
    /// <summary>
    /// Global threat pulses (gunfire, explosions, melee, panic contagion) that peds sample to build
    /// fear — a compact port of the web build's ped perception/threat bus. A tiny ring buffer of
    /// recent pulses; peds add fear from any pulse whose radius still covers them.
    /// </summary>
    public static class ThreatBus
    {
        struct Pulse { public Vector3 pos; public float radius; public float intensity; public float expire; }
        const int Cap = 32;
        static readonly Pulse[] _pulses = new Pulse[Cap];
        static int _head;

        public static void Report(Vector3 pos, float radius, float intensity, float linger = 0.5f)
        {
            _pulses[_head] = new Pulse { pos = pos, radius = radius, intensity = intensity, expire = Time.time + linger };
            _head = (_head + 1) % Cap;
        }

        public static void Gunshot(Vector3 pos) => Report(pos, 34f, 1.0f);
        public static void Explosion(Vector3 pos) => Report(pos, 55f, 1.6f, 0.8f);
        public static void Melee(Vector3 pos) => Report(pos, 6f, 0.6f);

        /// <summary>Peak fear contribution at a point this frame + the nearest threat's position.</summary>
        public static float Sample(Vector3 at, out Vector3 epicenter)
        {
            float t = Time.time, best = 0f;
            epicenter = at;
            for (int i = 0; i < Cap; i++)
            {
                var p = _pulses[i];
                if (p.expire < t || p.intensity <= 0f) continue;
                float d = Vector3.Distance(at, p.pos);
                if (d > p.radius) continue;
                float f = p.intensity * (1f - d / p.radius);
                if (f > best) { best = f; epicenter = p.pos; }
            }
            return best;
        }
    }
}
