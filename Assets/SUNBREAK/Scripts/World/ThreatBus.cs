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
        /// <summary>Drawing/aiming a gun near people — a smaller scare than a shot.</summary>
        public static void Brandish(Vector3 pos) => Report(pos, 22f, 0.7f);
        /// <summary>A vehicle driven fast/at people — makes pedestrians scatter.</summary>
        public static void VehicleThreat(Vector3 pos) => Report(pos, 16f, 0.9f);

        // ── Witnessable crimes ───────────────────────────────────────────────
        // A crime the player commits in the open. Peds with line-of-sight become witnesses and
        // (if they survive + the player doesn't escape) report it to raise wanted. Separate from the
        // fear pulses above so we can gate reporting on LOS + one report per distinct crime.
        struct CrimePulse { public Vector3 pos; public float severity; public float radius; public float expire; public int stamp; }
        static readonly CrimePulse[] _crimes = new CrimePulse[8];
        static int _chead, _crimeStamp;

        public static void Crime(Vector3 pos, float severity, float radius = 44f, float linger = 6f)
        {
            _crimeStamp++;
            _crimes[_chead] = new CrimePulse { pos = pos, severity = severity, radius = radius, expire = Time.time + linger, stamp = _crimeStamp };
            _chead = (_chead + 1) % _crimes.Length;
            Report(pos, radius * 0.8f, Mathf.Clamp01(0.6f + severity * 0.2f)); // also scatter nearby peds
        }

        /// <summary>The most recent still-active crime whose radius covers <paramref name="at"/>.
        /// Returns its stamp so a witness only reports each distinct crime once.</summary>
        public static bool LatestCrime(Vector3 at, out Vector3 pos, out float severity, out int stamp)
        {
            float t = Time.time; int best = 0; pos = at; severity = 0f;
            for (int i = 0; i < _crimes.Length; i++)
            {
                var c = _crimes[i];
                if (c.expire < t || c.stamp <= best) continue;
                if (Vector3.SqrMagnitude(at - c.pos) > c.radius * c.radius) continue;
                best = c.stamp; pos = c.pos; severity = c.severity;
            }
            stamp = best; return best != 0;
        }

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
