using UnityEngine;

namespace SUNBREAK.World
{
    /// <summary>Spawns one parked, drivable car on the dealership lot at runtime (so it sits on the
    /// generated terrain and reuses the car model), then removes itself.</summary>
    public sealed class ShowcaseCarSpawner : MonoBehaviour
    {
        public float yaw;

        void Start()
        {
            var city = FindFirstObjectByType<CityGenerator>();
            if (city != null)
                city.SpawnCar(new Vector3(transform.position.x, 0f, transform.position.z), yaw, null);
            Destroy(gameObject);
        }
    }
}
