using UnityEngine;

namespace SUNBREAK.World
{
    /// <summary>Headlights that switch on at night (distance-gated near the player for perf).</summary>
    public sealed class CarLights : MonoBehaviour
    {
        Light _l, _r;
        float _timer;

        void Start()
        {
            _l = MakeLight(new Vector3(-0.7f, 0.6f, 2.0f));
            _r = MakeLight(new Vector3(0.7f, 0.6f, 2.0f));
        }

        Light MakeLight(Vector3 local)
        {
            var go = new GameObject("headlight");
            go.transform.SetParent(transform, false);
            go.transform.localPosition = local;
            go.transform.localRotation = Quaternion.Euler(8f, 0f, 0f);
            var l = go.AddComponent<Light>();
            l.type = LightType.Spot; l.spotAngle = 55f; l.range = 32f;
            l.color = new Color(1f, 0.96f, 0.85f); l.intensity = 0f; l.shadows = LightShadows.None;
            return l;
        }

        void Update()
        {
            _timer -= Time.deltaTime;
            if (_timer > 0f) return;
            _timer = 0.4f;
            bool on = DayNightSystem.IsNight;
            if (on && GameRefs.Player != null)
                on = (transform.position - GameRefs.Player.position).sqrMagnitude < 70f * 70f;
            float i = on ? 3.5f : 0f;
            if (_l != null) _l.intensity = i;
            if (_r != null) _r.intensity = i;
        }
    }
}
