using UnityEngine;
using UnityEngine.AI;
using SUNBREAK.Combat;
using SUNBREAK.World;

namespace SUNBREAK.Missions
{
    /// <summary>A scripted hostile (mission ambush crew): chases + shoots the player, dies to
    /// ragdoll. Civilian faction so kills feed wanted like any street kill.</summary>
    public sealed class MissionEnemy : MonoBehaviour
    {
        const float ChaseSpeed = 3.4f, EngageRange = 26f, FireInterval = 0.95f;

        NavMeshAgent _agent;
        Health _health;
        CapsuleCollider _capsule;
        string _weapon;
        float _accuracy = 0.4f, _nextFire;
        bool _dead;

        public bool Dead => _dead || _health == null || _health.IsDead;

        public static MissionEnemy Spawn(Vector3 pos, string weapon)
        {
            var crowd = CrowdFactory.Instance;
            if (crowd == null) return null;
            var go = crowd.BuildHumanoid("MissionEnemy", Faction.Civilian, 90f, new Color(0.55f, 0.2f, 0.22f),
                out var agent, out var hp, out var animator);
            if (!CrowdFactory.Place(go, agent, pos)) { Object.Destroy(go); return null; }
            CrowdFactory.EquipWeapon(animator, weapon); // visible gun + armed hold pose
            var e = go.AddComponent<MissionEnemy>();
            e.Init(agent, hp, weapon);
            return e;
        }

        void Init(NavMeshAgent agent, Health hp, string weapon)
        {
            _agent = agent; _health = hp; _weapon = weapon;
            _capsule = GetComponent<CapsuleCollider>();
            if (_agent != null) _agent.speed = ChaseSpeed;
            _health.OnDied += OnDied;
        }

        void Update()
        {
            if (Dead) return;
            var p = GameRefs.Player;
            var st = GameRefs.PlayerState;
            if (p == null) return;

            if (_agent != null && _agent.enabled && _agent.isOnNavMesh)
            {
                _agent.stoppingDistance = 6f;
                _agent.SetDestination(p.position);
            }
            Vector3 to = p.position - transform.position; to.y = 0f;
            if (to.sqrMagnitude > 0.01f)
                transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.LookRotation(to), Time.deltaTime * 6f);
            if (to.magnitude <= EngageRange && Time.time >= _nextFire)
            {
                _nextFire = Time.time + FireInterval;
                NpcGun.FireAt(gameObject, p, st, _weapon, _accuracy);
            }
        }

        void OnDied(DamageInfo info)
        {
            _dead = true;
            if (_agent != null) _agent.enabled = false;
            Ragdoll.Topple(gameObject, _capsule, info.dir, 4f);
            Object.Destroy(gameObject, 8f);
        }
    }
}
