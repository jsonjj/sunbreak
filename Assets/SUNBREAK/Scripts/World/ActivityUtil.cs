using UnityEngine;

namespace SUNBREAK.World
{
    /// <summary>Shared helpers for the free-roam activities (taxi / races): a routed waypoint beam +
    /// road-grid point picking, so they reuse the GPS/waypoint look the missions use.</summary>
    public static class ActivityUtil
    {
        /// <summary>Spawn a tall coloured waypoint beam + minimap blip at a point.</summary>
        public static GameObject Beam(Vector3 pos, Color c, string label)
        {
            var go = new GameObject("ActivityWaypoint");
            go.transform.position = pos;
            var beam = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            Object.Destroy(beam.GetComponent<Collider>());
            beam.transform.SetParent(go.transform, false);
            beam.transform.localScale = new Vector3(1.2f, 40f, 1.2f);
            beam.transform.localPosition = new Vector3(0f, 40f, 0f);
            var mr = beam.GetComponent<MeshRenderer>();
            mr.sharedMaterial = new Material(Shader.Find("Universal Render Pipeline/Unlit")) { color = c };
            mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            Blip.Attach(go, BlipKind.Waypoint, c, label);
            return go;
        }

        /// <summary>A ring of posts on the ground (a race checkpoint gate) parented under a beam.</summary>
        public static void Ring(GameObject beam, Color c)
        {
            var mat = new Material(Shader.Find("Universal Render Pipeline/Unlit")) { color = c };
            for (int i = 0; i < 12; i++)
            {
                float a = i / 12f * Mathf.PI * 2f;
                var post = GameObject.CreatePrimitive(PrimitiveType.Cube);
                Object.Destroy(post.GetComponent<Collider>());
                post.name = "post";
                post.transform.SetParent(beam.transform, false);
                post.transform.localPosition = new Vector3(Mathf.Cos(a) * 4.5f, 1f, Mathf.Sin(a) * 4.5f);
                post.transform.localScale = new Vector3(0.25f, 2f, 0.25f);
                post.GetComponent<MeshRenderer>().sharedMaterial = mat;
            }
        }

        /// <summary>Pick a point sitting on the road grid a rough distance from <paramref name="from"/>.</summary>
        public static Vector3 RoadPoint(Vector3 from, float dist)
        {
            const float spacing = 64f;
            for (int i = 0; i < 24; i++)
            {
                float a = Random.value * Mathf.PI * 2f;
                Vector3 p = from + new Vector3(Mathf.Cos(a), 0f, Mathf.Sin(a)) * dist;
                if (Random.value < 0.5f) p.x = Mathf.Round(p.x / spacing) * spacing;
                else p.z = Mathf.Round(p.z / spacing) * spacing;
                if (Mathf.Abs(p.x) > Geography.CITY_HALF || Mathf.Abs(p.z) > Geography.CITY_HALF) continue;
                if (Geography.IsWaterPadded(p.x, p.z, 8f) || Geography.DistrictAt(p.x, p.z) == null) continue;
                return new Vector3(p.x, CityGenerator.GroundY(p.x, p.z) + 0.1f, p.z);
            }
            return from;
        }

        public static bool NearFlat(Vector3 a, Vector3 b, float r)
        {
            a.y = 0f; b.y = 0f;
            return (a - b).sqrMagnitude <= r * r;
        }
    }
}
