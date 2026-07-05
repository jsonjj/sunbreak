using System.Collections.Generic;
using UnityEngine;
using UnityEngine.AI;
using SUNBREAK.Combat;

namespace SUNBREAK.World
{
    /// <summary>
    /// Spawns + pools pedestrians around the player (ported density/annulus/cull from peds/config).
    /// Peds only exist near the player (spawn ring 32–68 m, cull past 122 m) for perf, with a hard
    /// cap tuned for Apple Silicon since each ped is a skinned Mixamo rig. Weighted archetype mix +
    /// an armed fraction (gangsters likely, tourists never) — armed peds fight, the rest flee.
    /// </summary>
    public sealed class PedManager : MonoBehaviour
    {
        [Header("Wiring")]
        public CrowdFactory crowd;

        [Header("Tuning")]
        public int cap = 40;            // hard cap on live peds (skinned rigs; pooled + culled)
        public float spawnMinR = 26f, spawnMaxR = 80f, cullR = 135f;
        public float spawnHz = 5f;
        public int spawnPerTick = 6;

        struct Arch { public float walk, run, health, jumpiness, weight, armMul; public bool gangster; }
        static readonly Arch[] Archetypes =
        {
            new Arch { walk = 1.35f, run = 5.0f, health = 100, jumpiness = 1.0f, weight = 0.62f, armMul = 0.5f },  // civilian
            new Arch { walk = 1.5f,  run = 4.6f, health = 100, jumpiness = 1.1f, weight = 0.18f, armMul = 0.3f },  // business
            new Arch { walk = 1.1f,  run = 4.2f, health = 90,  jumpiness = 1.25f, weight = 0.13f, armMul = 0f },   // tourist
            new Arch { walk = 1.4f,  run = 5.4f, health = 130, jumpiness = 0.55f, weight = 0.07f, armMul = 4f, gangster = true }, // gangster
        };
        public static PedManager Instance { get; private set; }

        readonly List<Ped> _pool = new();
        float _timer;
        bool _built;

        void Awake() { Instance = this; }
        void OnDestroy() { if (Instance == this) Instance = null; }

        /// <summary>Spawn a scared, fleeing pedestrian at a point (e.g. a carjacked driver bailing).</summary>
        public Ped SpawnScaredAt(Vector3 pos)
        {
            if (!_built) BuildPool();
            foreach (var p in _pool)
            {
                if (p.Active) continue;
                Vector3 dest = NavMesh.SamplePosition(pos, out var hit, 10f, NavMesh.AllAreas) ? hit.position : pos;
                var go = p.gameObject;
                go.SetActive(true);
                if (go.TryGetComponent<NavMeshAgent>(out var agent)) { if (!agent.enabled) agent.enabled = true; agent.Warp(dest); }
                else go.transform.position = dest;
                if (go.TryGetComponent<Health>(out var hp)) hp.Init(100f, Faction.Civilian, Random.Range(200000, 2000000));
                p.Activate(1.35f, 5.2f, 100f, 1.3f, false, null);
                p.Panic(GameRefs.Player != null ? GameRefs.Player.position : pos);
                return p;
            }
            return null;
        }

        void BuildPool()
        {
            if (_built || crowd == null) return;
            _built = true;
            for (int i = 0; i < cap; i++)
            {
                var go = crowd.BuildHumanoid("Ped", Faction.Civilian, 100f, CrowdFactory.RandomCivilianTint(),
                    out var agent, out var hp, out _);
                go.transform.SetParent(transform, true);
                var ped = go.AddComponent<Ped>();
                ped.Wire(agent, hp);
                ped.Deactivate();
                _pool.Add(ped);
            }
        }

        void Update()
        {
            if (!_built) BuildPool();
            _timer += Time.deltaTime;
            if (_timer < 1f / spawnHz) return;
            _timer = 0f;

            var player = GameRefs.Player;
            if (player == null || !HasNavMesh()) return;
            Vector3 pp = player.position;

            int active = 0;
            foreach (var p in _pool)
            {
                if (!p.Active) continue;
                if (p.ReadyToRecycle || (p.transform.position - pp).sqrMagnitude > cullR * cullR) { p.Deactivate(); continue; }
                active++;
            }

            int liveCap = Mathf.Max(3, Mathf.RoundToInt(cap * DayNightSystem.DensityFactor)); // sparser at night
            int budget = spawnPerTick;
            for (int i = 0; i < _pool.Count && active < liveCap && budget > 0; i++)
            {
                var p = _pool[i];
                if (p.Active) continue;
                if (TrySpawn(p, pp)) { active++; budget--; }
            }
        }

        bool TrySpawn(Ped ped, Vector3 pp)
        {
            float ang = Random.value * Mathf.PI * 2f;
            float r = Random.Range(spawnMinR, spawnMaxR);
            Vector3 want = new Vector3(pp.x + Mathf.Cos(ang) * r, pp.y, pp.z + Mathf.Sin(ang) * r);
            if (!NavMesh.SamplePosition(want, out var hit, 12f, NavMesh.AllAreas)) return false;

            var a = PickArch();
            // Civilians NEVER carry guns. Only the tough/gangster archetype fights back — with melee.
            bool fighter = a.gangster;
            string weapon = null;

            var go = ped.gameObject;
            go.SetActive(true);
            if (go.TryGetComponent<NavMeshAgent>(out var agent))
            {
                if (!agent.enabled) agent.enabled = true;
                agent.Warp(hit.position);
            }
            else go.transform.position = hit.position;

            if (go.TryGetComponent<Health>(out var hp))
                hp.Init(a.health, Faction.Civilian, Random.Range(200000, 2000000));

            ped.Activate(a.walk, a.run, a.health, a.jumpiness, fighter, weapon);
            return true;
        }

        static Arch PickArch()
        {
            float total = 0f; foreach (var a in Archetypes) total += a.weight;
            float r = Random.value * total;
            foreach (var a in Archetypes) { r -= a.weight; if (r <= 0f) return a; }
            return Archetypes[0];
        }

        static bool HasNavMesh()
        {
            var tri = NavMesh.CalculateTriangulation();
            return tri.vertices != null && tri.vertices.Length > 0;
        }
    }
}
