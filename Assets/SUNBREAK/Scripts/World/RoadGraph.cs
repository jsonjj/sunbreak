using System.Collections.Generic;
using UnityEngine;

namespace SUNBREAK.World
{
    /// <summary>
    /// A* over the runtime road grid (nodes at road intersections, edges along non-water road
    /// segments). Used to draw an optimal GPS route from the player to a waypoint.
    /// </summary>
    public static class RoadGraph
    {
        static readonly Vector2Int[] Dirs = { new(1, 0), new(-1, 0), new(0, 1), new(0, -1) };

        public static List<Vector3> FindPath(Vector3 from, Vector3 to, float spacing)
        {
            int k = Mathf.Max(1, Mathf.CeilToInt(Geography.CITY_HALF / spacing));
            Vector2Int start = Nearest(from, spacing, k);
            Vector2Int goal = Nearest(to, spacing, k);
            if (start == goal) return new List<Vector3> { from, to };

            var open = new List<Vector2Int> { start };
            var came = new Dictionary<Vector2Int, Vector2Int>();
            var g = new Dictionary<Vector2Int, float> { [start] = 0f };
            var f = new Dictionary<Vector2Int, float> { [start] = Heur(start, goal) };
            int guard = 0;

            while (open.Count > 0 && guard++ < 6000)
            {
                // Lowest f in the open set.
                int bi = 0; float bf = float.MaxValue;
                for (int i = 0; i < open.Count; i++) { float fv = f.TryGetValue(open[i], out var v) ? v : float.MaxValue; if (fv < bf) { bf = fv; bi = i; } }
                Vector2Int cur = open[bi];
                if (cur == goal) return Reconstruct(came, cur, spacing, from, to);
                open.RemoveAt(bi);

                foreach (var dir in Dirs)
                {
                    var nb = cur + dir;
                    if (Mathf.Abs(nb.x) > k || Mathf.Abs(nb.y) > k) continue;
                    if (!EdgeOpen(cur, nb, spacing)) continue;
                    float tentative = g[cur] + 1f;
                    if (!g.TryGetValue(nb, out var gn) || tentative < gn)
                    {
                        came[nb] = cur;
                        g[nb] = tentative;
                        f[nb] = tentative + Heur(nb, goal);
                        if (!open.Contains(nb)) open.Add(nb);
                    }
                }
            }
            return null; // no route
        }

        static List<Vector3> Reconstruct(Dictionary<Vector2Int, Vector2Int> came, Vector2Int cur, float spacing, Vector3 from, Vector3 to)
        {
            var nodes = new List<Vector2Int> { cur };
            while (came.TryGetValue(cur, out var prev)) { cur = prev; nodes.Add(cur); }
            nodes.Reverse();
            var pts = new List<Vector3> { from };
            foreach (var n in nodes) pts.Add(World(n, spacing));
            pts.Add(to);
            return pts;
        }

        static float Heur(Vector2Int a, Vector2Int b) => Mathf.Abs(a.x - b.x) + Mathf.Abs(a.y - b.y);

        static Vector2Int Nearest(Vector3 w, float spacing, int k)
        {
            int x = Mathf.Clamp(Mathf.RoundToInt(w.x / spacing), -k, k);
            int z = Mathf.Clamp(Mathf.RoundToInt(w.z / spacing), -k, k);
            return new Vector2Int(x, z);
        }

        static Vector3 World(Vector2Int n, float spacing) => new(n.x * spacing, 0f, n.y * spacing);

        static bool EdgeOpen(Vector2Int a, Vector2Int b, float spacing)
        {
            Vector3 wa = World(a, spacing), wb = World(b, spacing);
            Vector3 mid = (wa + wb) * 0.5f;
            // The road segment (and both ends) must be on land.
            return !Geography.IsWaterPadded(mid.x, mid.z, 3f)
                   && !Geography.IsWaterPadded(wb.x, wb.z, 3f);
        }
    }
}
