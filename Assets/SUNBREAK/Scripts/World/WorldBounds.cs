using UnityEngine;
using SUNBREAK.Player;
using SUNBREAK.Vehicles;

namespace SUNBREAK.World
{
    /// <summary>
    /// No invisible walls (mirrors the web build's final approach): if the active avatar
    /// (player on foot, or the car being driven) falls below a Y floor or wanders past the
    /// playable extent, it is respawned at the canonical spawn point. Runs on a light timer.
    /// </summary>
    public sealed class WorldBounds : MonoBehaviour
    {
        public PlayerController player;
        public VehicleInteraction vehicle;
        public PlayerState state;
        public WantedSystem wanted;

        public float fallY = -15f;
        public float extentMargin = 40f;
        public float checkInterval = 0.4f;

        float _timer;

        // Death now routes through WastedBusted (WASTED/BUSTED card + hospital respawn + fee).
        // WorldBounds only recovers the avatar if it falls out of the world / past the extent.

        void Update()
        {
            _timer += Time.deltaTime;
            if (_timer < checkInterval) return;
            _timer = 0f;

            if (EnterableShop.PlayerInside) return; // player is in an off-map interior on purpose

            Transform avatar = vehicle != null ? vehicle.ActiveAvatar : (player != null ? player.transform : null);
            if (avatar == null) return;

            Vector3 p = avatar.position;
            float lim = Geography.PLAYABLE_HALF + extentMargin;
            bool oob = p.y < fallY || Mathf.Abs(p.x) > lim || Mathf.Abs(p.z) > lim;
            if (oob) Respawn();
        }

        void Respawn()
        {
            Vector3 spawn = Geography.PLAYER_SPAWN.position + Vector3.up * 1.5f;
            float yaw = Geography.PLAYER_SPAWN.yaw;

            if (vehicle != null && vehicle.CurrentCar != null)
            {
                var car = vehicle.CurrentCar.transform;
                car.SetPositionAndRotation(spawn + Vector3.up * 0.5f, Quaternion.Euler(0f, yaw, 0f));
                if (car.TryGetComponent(out Rigidbody rb))
                {
                    rb.linearVelocity = Vector3.zero;
                    rb.angularVelocity = Vector3.zero;
                }
                return;
            }

            RespawnPlayerOnFoot();
        }

        void RespawnPlayerOnFoot()
        {
            Vector3 spawn = Geography.PLAYER_SPAWN.position + Vector3.up * 1.5f;
            float yaw = Geography.PLAYER_SPAWN.yaw;
            if (player != null && player.TryGetComponent(out CharacterController cc))
            {
                cc.enabled = false;
                player.transform.SetPositionAndRotation(spawn, Quaternion.Euler(0f, yaw, 0f));
                cc.enabled = true;
            }
        }
    }
}
