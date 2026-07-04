using System.Collections.Generic;
using UnityEngine;

namespace SUNBREAK.World
{
    /// <summary>
    /// Pools traffic cars around the player (spawn ring 55–130 m, despawn past 210 m) driving the
    /// road grid. Kinematic + pooled for perf. Ported spirit of the web traffic lifecycle.
    /// </summary>
    public sealed class TrafficManager : MonoBehaviour
    {
        [Header("Wiring")]
        public CityGenerator city;

        [Header("Tuning")]
        public int cap = 14;
        public float spawnInner = 55f, spawnOuter = 130f, despawn = 210f, spawnHz = 3f;

        static readonly Color[] Palette =
        {
            new Color(0.87f, 0.89f, 0.92f), new Color(0.17f, 0.18f, 0.21f), new Color(0.55f, 0.58f, 0.65f),
            new Color(0.61f, 0.17f, 0.17f), new Color(0.12f, 0.30f, 0.47f), new Color(0.23f, 0.42f, 0.32f),
        };

        readonly List<TrafficCar> _pool = new();
        readonly List<bool> _active = new();
        float _timer;
        bool _built;

        void BuildPool()
        {
            if (_built || city == null || city.carBody == null) return;
            _built = true;
            for (int i = 0; i < cap; i++)
            {
                var go = city.BuildCarVisual(Vector3.zero, 0f, Palette[i % Palette.Length], out var wheels, out _);
                if (go == null) { _built = false; return; }
                go.transform.SetParent(transform, true);
                var car = go.AddComponent<TrafficCar>();
                car.Init(wheels, city.roadSpacing);
                go.SetActive(false);
                _pool.Add(car);
                _active.Add(false);
            }
        }

        void Update()
        {
            if (!_built) { BuildPool(); return; }
            _timer += Time.deltaTime;
            if (_timer < 1f / spawnHz) return;
            _timer = 0f;

            var player = GameRefs.Player;
            if (player == null) return;
            Vector3 pp = player.position;

            int live = 0;
            for (int i = 0; i < _pool.Count; i++)
            {
                if (!_active[i]) continue;
                if ((_pool[i].transform.position - pp).sqrMagnitude > despawn * despawn)
                { _pool[i].gameObject.SetActive(false); _active[i] = false; continue; }
                live++;
            }

            for (int i = 0; i < _pool.Count && live < cap; i++)
            {
                if (_active[i]) continue;
                float ang = Random.value * Mathf.PI * 2f;
                float r = Random.Range(spawnInner, spawnOuter);
                Vector3 near = new Vector3(pp.x + Mathf.Cos(ang) * r, 0f, pp.z + Mathf.Sin(ang) * r);
                if (Mathf.Abs(near.x) > Geography.CITY_HALF || Mathf.Abs(near.z) > Geography.CITY_HALF) continue;
                if (Geography.IsWaterPadded(near.x, near.z, 8f) || Geography.DistrictAt(near.x, near.z) == null) continue;
                _pool[i].gameObject.SetActive(true);
                _pool[i].PlaceOnGrid(near);
                _active[i] = true;
                live++;
            }
        }
    }
}
