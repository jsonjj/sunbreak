using UnityEngine;
using SUNBREAK.Vehicles;

namespace SUNBREAK.World
{
    /// <summary>
    /// Spawns and maintains the player's OWNED car near the spawn point. It is visually distinct,
    /// free to enter and drive (never a crime — unlike carjacking a traffic car), and carries a
    /// "Your Car" blip that follows it. If the car is destroyed, a fresh one is re-spawned here; if
    /// the player simply drives it away it is left where they parked it.
    /// </summary>
    public sealed class PersonalCar : MonoBehaviour
    {
        public float yaw;

        static readonly Color Paint = new Color(0.86f, 0.16f, 0.2f);      // bright red — pops vs traffic
        static readonly Color BlipColor = new Color(0.2f, 0.95f, 0.95f);  // teal blip

        ArcadeCarController _car;
        float _respawnTimer;

        void Start() => Spawn();

        void Update()
        {
            if (_car != null) return;              // alive (maybe parked elsewhere) — leave it
            _respawnTimer -= Time.deltaTime;
            if (_respawnTimer <= 0f) { Spawn(); _respawnTimer = 4f; }
        }

        void Spawn()
        {
            var city = FindFirstObjectByType<CityGenerator>();
            if (city == null) return;
            Vector3 p = transform.position;
            Vector3 gp = new Vector3(p.x, 0f, p.z);
            if (Physics.Raycast(new Vector3(p.x, 80f, p.z), Vector3.down, out var hit, 160f, ~0, QueryTriggerInteraction.Ignore))
                gp.y = hit.point.y;

            _car = city.SpawnCar(gp, yaw, null);
            if (_car == null) return;
            _car.Owned = true;                     // entering it is never a crime
            _car.name = "YourCar";
            Tint(_car.gameObject, Paint);
            Blip.Attach(_car.gameObject, BlipKind.Shop, BlipColor, "Your Car", "\u25C6"); // ◆
            Debug.Log($"SUNBREAK_OWNEDCAR: spawned owned={_car.Owned} at {gp}");
        }

        static readonly int BaseColorId = Shader.PropertyToID("_BaseColor");
        static readonly int ColorId = Shader.PropertyToID("_Color");
        static void Tint(GameObject go, Color c)
        {
            var mpb = new MaterialPropertyBlock();
            foreach (var r in go.GetComponentsInChildren<MeshRenderer>())
            {
                r.GetPropertyBlock(mpb);
                mpb.SetColor(BaseColorId, c);
                mpb.SetColor(ColorId, c);
                r.SetPropertyBlock(mpb);
            }
        }
    }
}
