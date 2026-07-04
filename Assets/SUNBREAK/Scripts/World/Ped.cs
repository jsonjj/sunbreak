using UnityEngine;
using UnityEngine.AI;
using SUNBREAK.Combat;

namespace SUNBREAK.World
{
    /// <summary>
    /// Pedestrian AI — a faithful port of the web build's ped behaviour FSM: wander the NavMesh,
    /// build fear from nearby threats (gunfire/melee/contagion) or being hit, then FLEE (unarmed)
    /// or FIGHT (armed peds + gangsters — approach to a standoff and shoot, or brawl). Death →
    /// ragdoll + linger. Health-bar billboard shows when damaged. Pooled by PedManager.
    /// </summary>
    [RequireComponent(typeof(NavMeshAgent))]
    public sealed class Ped : MonoBehaviour
    {
        // Ported thresholds/dynamics (peds/config.ts).
        const float FleeThreshold = 0.42f, PanicThreshold = 0.82f, CalmThreshold = 0.08f;
        const float FearDecay = 0.55f, CalmCooldown = 2.5f, FleeRadius = 45f, ArriveR = 1.6f;
        const float EngageR = 34f, DisengageR = 48f, Standoff = 12f, FireInterval = 1.1f, Accuracy = 0.4f;
        const float MeleeReach = 2.3f, MeleeDamage = 9f, MeleeInterval = 1.0f, RagdollLingerS = 8f;

        enum PState { Wander, Idle, Flee, Fight, Dead }

        NavMeshAgent _agent;
        Health _health;
        CapsuleCollider _capsule;

        float _walk, _run, _jumpiness;
        bool _fighter;
        string _weapon;

        PState _state;
        float _fear, _stateT, _fireT, _deadAt;
        Vector3 _threat;

        public bool Active { get; private set; }
        public bool ReadyToRecycle => _state == PState.Dead && Time.time - _deadAt > RagdollLingerS;

        public void Wire(NavMeshAgent agent, Health health)
        {
            _agent = agent; _health = health;
            _capsule = GetComponent<CapsuleCollider>();
            _health.OnDamaged += OnDamaged;
            _health.OnDied += OnDied;
        }

        public void Activate(float walk, float run, float health, float jumpiness, bool fighter, string weapon)
        {
            _walk = walk; _run = run; _jumpiness = jumpiness; _fighter = fighter; _weapon = weapon;
            _fear = 0f; _state = PState.Wander; _stateT = 0f; _fireT = 0f;
            Active = true;
            gameObject.SetActive(true);
            Ragdoll.Reset(gameObject);
            if (_agent != null && _agent.isOnNavMesh) { _agent.isStopped = false; _agent.speed = walk; }
            _health.HideBar();
        }

        public void Deactivate()
        {
            Active = false;
            if (_agent != null && _agent.isActiveAndEnabled && _agent.isOnNavMesh) _agent.ResetPath();
            gameObject.SetActive(false);
        }

        void Update()
        {
            if (!Active) return;
            float dt = Time.deltaTime;

            if (_state == PState.Dead) return; // PedManager recycles after linger

            // Fear from world threats + decay.
            float t = ThreatBus.Sample(transform.position, out var epi);
            if (t > 0f) { _fear = Mathf.Min(1f, _fear + t * _jumpiness * dt * 4f); _threat = epi; }
            _fear = Mathf.Max(0f, _fear - FearDecay * dt);

            // Transition into flee/fight.
            if (_fear >= FleeThreshold && _state != PState.Flee && _state != PState.Fight)
            {
                _state = _fighter ? PState.Fight : PState.Flee;
                _stateT = 0f;
                if (_state == PState.Flee) FleeStep();
            }

            switch (_state)
            {
                case PState.Wander: TickWander(); break;
                case PState.Idle:
                    _stateT -= dt; if (_stateT <= 0f) BeginWander(); break;
                case PState.Flee: TickFlee(dt); break;
                case PState.Fight: TickFight(dt); break;
            }
        }

        void BeginWander()
        {
            _state = PState.Wander; _stateT = 0f;
            if (_agent != null) _agent.speed = _walk;
            NewWanderTarget();
        }

        void TickWander()
        {
            if (_agent == null || !_agent.isOnNavMesh) return;
            if (!_agent.pathPending && _agent.remainingDistance <= ArriveR)
            {
                if (Random.value < 0.22f) { _state = PState.Idle; _stateT = Random.Range(1f, 4f); _agent.isStopped = true; }
                else NewWanderTarget();
            }
        }

        void NewWanderTarget()
        {
            if (_agent == null || !_agent.isOnNavMesh) return;
            _agent.isStopped = false;
            if (RandomPoint(transform.position, 16f, out var p)) _agent.SetDestination(p);
        }

        void TickFlee(float dt)
        {
            if (_agent == null || !_agent.isOnNavMesh) return;
            _agent.speed = _run;
            _stateT += dt;
            if (_fear < CalmThreshold && _stateT > CalmCooldown) { BeginWander(); return; }
            if (!_agent.pathPending && _agent.remainingDistance <= ArriveR) FleeStep();
        }

        void FleeStep()
        {
            Vector3 away = (transform.position - _threat); away.y = 0f;
            if (away.sqrMagnitude < 0.1f) away = Random.insideUnitSphere;
            Vector3 dest = transform.position + away.normalized * FleeRadius;
            if (_agent != null && _agent.isOnNavMesh && RandomPoint(dest, 10f, out var p)) _agent.SetDestination(p);
        }

        void TickFight(float dt)
        {
            var player = GameRefs.Player;
            var state = GameRefs.PlayerState;
            if (player == null || (state != null && state.IsDead)) { BeginWander(); return; }

            Vector3 to = player.position - transform.position; to.y = 0f;
            float dist = to.magnitude;
            if (dist > DisengageR) { BeginWander(); return; }

            float standoff = _weapon != null ? Standoff : 1.8f;
            if (_agent != null && _agent.isOnNavMesh)
            {
                _agent.speed = _run;
                if (dist > standoff + 0.5f) { _agent.isStopped = false; _agent.SetDestination(player.position); }
                else _agent.isStopped = true;
            }
            if (to.sqrMagnitude > 0.01f)
                transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.LookRotation(to), 1f - Mathf.Exp(-8f * dt));

            _fireT -= dt;
            if (_fireT > 0f) return;
            if (_weapon != null)
            {
                bool fired = NpcGun.FireAt(gameObject, player, state, _weapon, Accuracy);
                _fireT = fired ? FireInterval : 0.3f;
            }
            else if (NpcGun.Melee(gameObject, player, state, MeleeDamage, MeleeReach)) _fireT = MeleeInterval;
            else _fireT = 0.3f;
        }

        void OnDamaged(DamageInfo info)
        {
            _fear = 1f;
            _threat = info.attacker != null ? info.attacker.transform.position : transform.position - info.dir;
        }

        void OnDied(DamageInfo info)
        {
            if (_state == PState.Dead) return;
            _state = PState.Dead; _deadAt = Time.time;
            _health.HideBar();
            Ragdoll.Topple(gameObject, _capsule, info.dir, info.impulse);
        }

        static bool RandomPoint(Vector3 center, float radius, out Vector3 result)
        {
            for (int i = 0; i < 6; i++)
            {
                Vector3 rand = center + new Vector3(Random.Range(-radius, radius), 0f, Random.Range(-radius, radius));
                if (NavMesh.SamplePosition(rand, out var hit, 6f, NavMesh.AllAreas)) { result = hit.position; return true; }
            }
            result = center;
            return false;
        }
    }
}
