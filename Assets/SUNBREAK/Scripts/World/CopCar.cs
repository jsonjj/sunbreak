using UnityEngine;
using SUNBREAK.Combat;

namespace SUNBREAK.World
{
    /// <summary>
    /// GTA-style cop cruiser: actively pursues the player, aims to CUT OFF (steers toward a point
    /// ahead of the player's motion), RAMS at close range, and its occupant FIRES from the car. Drops
    /// a foot cop as rolling pressure. When the player breaks line of sight the whole force SEARCHES
    /// the last-known position (WantedSystem.Searching/Lkp) before de-escalating. Kinematic + cheap.
    /// </summary>
    public sealed class CopCar : MonoBehaviour
    {
        const float Cruise = 18f, RamSpeed = 27f, WheelRadius = 0.35f;
        const float FireInterval = 1.2f, FireRange = 46f, RamRange = 3.2f, RamDamage = 14f, RamCooldown = 1.5f;
        const float ArriveDist = 17f;

        WantedSystem _wanted;
        Transform _player;
        PlayerState _state;
        Transform[] _wheels;
        bool _deployed;
        float _spin, _fireT, _ramT;
        Vector3 _lastPlayerPos, _playerVel;

        public void Init(WantedSystem wanted, Transform player, Transform[] wheels)
        {
            _wanted = wanted; _player = player; _wheels = wheels;
            _state = wanted != null ? wanted.playerState : null;
            _lastPlayerPos = player != null ? player.position : Vector3.zero;
            _fireT = 1.2f;
        }

        void Update()
        {
            if (_player == null || _wanted == null) return;
            float dt = Time.deltaTime;

            // Once the crew has bailed out, the car is just a parked (destructible) prop.
            if (_deployed) return;

            _playerVel = Vector3.Lerp(_playerVel, (_player.position - _lastPlayerPos) / Mathf.Max(dt, 1e-4f), 0.2f);
            _lastPlayerPos = _player.position;

            Vector3 me = transform.position;
            bool searching = _wanted.Searching;
            float pdist = Vector3.Distance(me, _player.position);

            // Arrived at the player → STOP, disgorge the crew on foot so the shootout is winnable.
            if (pdist < ArriveDist && !searching)
            {
                DeployCrew(me);
                return;
            }

            // Cut off ahead of the player; when searching, sweep the last-known position.
            Vector3 goal = searching ? _wanted.Lkp : _player.position + _playerVel * 0.9f;
            Vector3 to = goal - me; to.y = 0f;
            float dist = to.magnitude;

            float speed = (pdist < 10f ? RamSpeed : Cruise) * (1f + 0.06f * _wanted.Stars);
            float move = 0f;
            if (dist > 2.5f)
            {
                Vector3 dir = to / Mathf.Max(0.001f, dist);
                float step = speed * dt;
                Vector3 next = me + dir * step;
                next.y = CityGenerator.TerrainHeight(next.x, next.z) + 0.4f;
                transform.position = next;
                transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.LookRotation(dir), 1f - Mathf.Exp(-6f * dt));
                move = step;
            }

            _ramT -= dt;
            if (pdist < RamRange && _ramT <= 0f && _state != null)
            {
                _state.Damage(RamDamage);
                _ramT = RamCooldown;
            }

            // Suppressing fire from the car while closing in.
            _fireT -= dt;
            if (_fireT <= 0f && pdist < FireRange)
            {
                var tier = _wanted.TierFor(_wanted.Stars);
                _fireT = NpcGun.FireAt(gameObject, _player, _state, tier.weapon, 0.3f) ? FireInterval : 0.4f;
            }

            if (_wheels != null)
            {
                _spin += (move / (2f * Mathf.PI * WheelRadius)) * 360f;
                foreach (var w in _wheels)
                    if (w != null) w.localRotation = Quaternion.Euler(_spin, w.localEulerAngles.y, 0f);
            }
        }

        void DeployCrew(Vector3 me)
        {
            _deployed = true;
            var tier = _wanted.TierFor(_wanted.Stars);
            int crew = Mathf.Clamp(1 + _wanted.Stars / 2, 1, 3); // 1–3 officers per car by heat
            for (int i = 0; i < crew; i++)
            {
                Vector3 side = transform.right * (i % 2 == 0 ? 2.6f : -2.6f) + transform.forward * (i * 0.6f);
                _wanted.SpawnFootCop(me + side, tier, _wanted.Stars);
            }
        }
    }
}
