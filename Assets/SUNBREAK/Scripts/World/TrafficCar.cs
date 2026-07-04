using UnityEngine;

namespace SUNBREAK.World
{
    /// <summary>
    /// Kinematic traffic car: drives along the road grid, turns at intersections, and brakes for
    /// obstacles ahead (other cars / the player / buildings) via a forward raycast. Visual only
    /// (no raycast physics) so a fleet is cheap. Ported spirit of the web traffic sim, simplified
    /// to the runtime road grid.
    /// </summary>
    public sealed class TrafficCar : MonoBehaviour
    {
        const float Cruise = 11f, LaneOffset = 2.1f, WheelRadius = 0.35f, LookAhead = 8f, StopDist = 4.5f;

        float _spacing = 64f;
        int _axis;     // 0 = along X, 1 = along Z
        int _sign;     // +1 / -1
        float _line;   // perpendicular road-line coordinate this car rides
        float _speed;
        float _spin;
        float _turnCooldown;
        Transform[] _wheels;

        public void Init(Transform[] wheels, float spacing)
        {
            _wheels = wheels; _spacing = spacing;
        }

        /// <summary>Place the car on a random road-grid lane near a start point.</summary>
        public void PlaceOnGrid(Vector3 near)
        {
            _axis = Random.value < 0.5f ? 0 : 1;
            _sign = Random.value < 0.5f ? 1 : -1;
            float half = Geography.CITY_HALF;
            if (_axis == 0)
            {
                _line = Mathf.Round(near.z / _spacing) * _spacing;
                float x = Mathf.Clamp(near.x, -half, half);
                SetPos(x, _line);
            }
            else
            {
                _line = Mathf.Round(near.x / _spacing) * _spacing;
                float z = Mathf.Clamp(near.z, -half, half);
                SetPos(_line, z);
            }
            _speed = Cruise;
        }

        void SetPos(float x, float z)
        {
            Vector3 off = RightOffset();
            Vector3 p = new Vector3(x + off.x, 0f, z + off.z);
            p.y = CityGenerator.TerrainHeight(p.x, p.z) + 0.1f;
            transform.position = p;
            transform.rotation = Quaternion.LookRotation(Heading());
        }

        Vector3 Heading() => _axis == 0 ? new Vector3(_sign, 0, 0) : new Vector3(0, 0, _sign);
        Vector3 RightOffset()
        {
            // Perpendicular-right lane offset for the current heading.
            Vector3 h = Heading();
            Vector3 right = Vector3.Cross(Vector3.up, h);
            return right * LaneOffset;
        }

        void Update()
        {
            float dt = Time.deltaTime;
            _turnCooldown -= dt;

            // Brake for obstacles ahead.
            Vector3 fwd = Heading();
            Vector3 eye = transform.position + Vector3.up * 0.6f + fwd * 1.5f;
            float target = Cruise;
            if (Physics.Raycast(eye, fwd, out var hit, LookAhead, ~0, QueryTriggerInteraction.Ignore))
                if (hit.distance < StopDist) target = 0f;
                else target = Mathf.Lerp(0f, Cruise, Mathf.InverseLerp(StopDist, LookAhead, hit.distance));
            _speed = Mathf.MoveTowards(_speed, target, 12f * dt);

            // Advance along the grid.
            float moving = _axis == 0 ? transform.position.x : transform.position.z;
            moving += _sign * _speed * dt;

            // Turn decision at an intersection node.
            float node = Mathf.Round(moving / _spacing) * _spacing;
            if (_turnCooldown <= 0f && Mathf.Abs(moving - node) < 0.6f && Random.value < 0.35f)
            {
                float perpLine = node;      // the crossing road line
                float keep = _line;         // becomes the new moving line's fixed coord
                _turnCooldown = 2.5f;
                _axis = 1 - _axis;
                _sign = Random.value < 0.5f ? 1 : -1;
                _line = keep;
                if (_axis == 0) SetPos(perpLine, _line); else SetPos(_line, perpLine);
                moving = _axis == 0 ? transform.position.x : transform.position.z;
            }

            if (_axis == 0) SetPos(moving, _line); else SetPos(_line, moving);

            // Spin wheels.
            _spin += (_speed * dt / (2f * Mathf.PI * WheelRadius)) * 360f;
            if (_wheels != null)
                foreach (var w in _wheels) if (w != null) w.localRotation = Quaternion.Euler(_spin, w.localEulerAngles.y, 0f);
        }
    }
}
