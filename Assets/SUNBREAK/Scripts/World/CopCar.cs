using UnityEngine;

namespace SUNBREAK.World
{
    /// <summary>
    /// Kinematic cop cruiser: drives toward the player, and on arrival disgorges a foot cop (the
    /// "exit the car, chase, shoot" beat), then loiters as rolling pressure. Visual only (no
    /// raycast physics) so a fleet is cheap. Recycled by WantedSystem when heat clears.
    /// </summary>
    public sealed class CopCar : MonoBehaviour
    {
        const float Speed = 17f, Arrive = 15f, WheelRadius = 0.35f;

        WantedSystem _wanted;
        Transform _player;
        Transform[] _wheels;
        bool _droppedCop;
        float _spin;

        public void Init(WantedSystem wanted, Transform player, Transform[] wheels)
        {
            _wanted = wanted; _player = player; _wheels = wheels;
        }

        void Update()
        {
            if (_player == null || _wanted == null) return;
            float dt = Time.deltaTime;
            Vector3 me = transform.position;
            Vector3 pp = _player.position;
            Vector3 to = pp - me; to.y = 0f;
            float dist = to.magnitude;

            float move = 0f;
            if (dist > Arrive)
            {
                Vector3 dir = to / Mathf.Max(0.001f, dist);
                float step = Speed * dt;
                Vector3 next = me + dir * step;
                next.y = CityGenerator.TerrainHeight(next.x, next.z) + 0.1f;
                transform.position = next;
                transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.LookRotation(dir), 1f - Mathf.Exp(-6f * dt));
                move = step;
            }
            else if (!_droppedCop)
            {
                _droppedCop = true;
                Vector3 side = transform.right * 2.4f;
                Vector3 dropPos = me + side;
                var tier = _wanted.TierFor(_wanted.Stars);
                _wanted.SpawnFootCop(dropPos, tier, _wanted.Stars);
            }

            // Spin the visual wheels with travel.
            if (_wheels != null)
            {
                _spin += (move / (2f * Mathf.PI * WheelRadius)) * 360f;
                foreach (var w in _wheels)
                    if (w != null) w.localRotation = Quaternion.Euler(_spin, w.localEulerAngles.y, 0f);
            }
        }
    }
}
