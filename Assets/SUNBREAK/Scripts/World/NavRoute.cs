using System.Collections.Generic;
using UnityEngine;

namespace SUNBREAK.World
{
    /// <summary>
    /// Holds the current GPS route (A* over the road grid) from the player to the active waypoint —
    /// a map-set waypoint takes priority, else the active mission's waypoint. Recomputed as the
    /// player moves. The minimap + full map draw <see cref="Route"/>.
    /// </summary>
    public sealed class NavRoute : MonoBehaviour
    {
        public static NavRoute Instance { get; private set; }
        /// <summary>A side-activity target (taxi drop-off / next race checkpoint), routed like a waypoint.</summary>
        public static Vector3? ActivityWaypoint;
        public float spacing = 64f;

        public List<Vector3> Route { get; private set; }

        Vector3 _lastFrom, _lastTo;
        bool _has;
        float _timer;

        void Awake() { Instance = this; }
        void OnDestroy() { if (Instance == this) Instance = null; }

        void Update()
        {
            _timer -= Time.deltaTime;
            if (_timer > 0f) return;
            _timer = 0.25f;

            var player = GameRefs.Player;
            Vector3? wp = TargetWaypoint();
            if (player == null || wp == null) { Route = null; _has = false; return; }

            Vector3 from = player.position;
            if (!_has || (from - _lastFrom).sqrMagnitude > 64f || (wp.Value - _lastTo).sqrMagnitude > 1f)
            {
                _lastFrom = from; _lastTo = wp.Value; _has = true;
                Route = RoadGraph.FindPath(from, wp.Value, spacing);
            }
        }

        static Vector3? TargetWaypoint()
        {
            if (UI.MapScreen.UserWaypoint.HasValue) return UI.MapScreen.UserWaypoint.Value;
            if (ActivityWaypoint.HasValue) return ActivityWaypoint.Value;
            var ms = Missions.MissionSystem.Instance;
            if (ms != null && ms.HasWaypoint) return ms.WaypointPos;
            return null;
        }
    }
}
