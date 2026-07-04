using UnityEngine;

namespace SUNBREAK.World
{
    /// <summary>
    /// Slice 0 sanity stub for the ported <see cref="Geography"/> blueprint. Does no scene
    /// generation yet — it just proves the world data compiles and is queryable at runtime by
    /// logging a few facts (district under the origin, water tests, boundary, landmark count).
    /// Later slices replace this with the real Editor world generator.
    /// </summary>
    public sealed class WorldProbe : MonoBehaviour
    {
        [Tooltip("Log a geography summary on Start.")]
        public bool logOnStart = true;

        void Start()
        {
            if (logOnStart)
                Debug.Log(Summarize());
        }

        [ContextMenu("Log Geography Summary")]
        public void LogSummary() => Debug.Log(Summarize());

        public static string Summarize()
        {
            DistrictRegion here = Geography.DistrictAt(0f, 0f);
            var landmarks = Geography.BuildLandmarks();
            string district = here != null ? $"{here.name} ({here.keyId})" : "open space";
            return $"[SUNBREAK/World] Santa Vista blueprint loaded — " +
                   $"districts={Geography.DISTRICTS.Count}, landmarks={landmarks.Count}, " +
                   $"signs={Geography.ACQUISITION_SIGNS.Count}; origin is in {district}; " +
                   $"isWater(0,0)={Geography.IsWater(0f, 0f)}; " +
                   $"playableHalf={Geography.PLAYABLE_HALF}m; " +
                   $"spawn={Geography.PLAYER_SPAWN.position}.";
        }
    }
}
