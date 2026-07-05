using UnityEngine;
using UnityEngine.AI;
using SUNBREAK.Combat;

namespace SUNBREAK.World
{
    /// <summary>
    /// On-foot cop (port of the web build's footCops): chases the player through the streets on a
    /// NavMeshAgent, holds a standoff, and shoots to kill via the shared NPC-fire path. Killable
    /// (Health) — hitting/killing one feeds the wanted formula as an OFFICER. Weapon/accuracy/health
    /// come from the per-star escalation table.
    /// </summary>
    public sealed class Cop : MonoBehaviour
    {
        const float Standoff = 9f, ChaseSpeed = 5.6f, FireInterval = 0.9f, RetreatR = 150f, CorpseLingerS = 3f;

        NavMeshAgent _agent;
        Health _health;
        CapsuleCollider _capsule;
        string _weapon;
        float _accuracy;
        float _fireT, _deadAt;
        bool _dead;

        Animator _animator;
        GameObject _weaponModel;
        int _weaponType;
        bool _weaponShown = true;

        public bool Removed { get; private set; }
        public bool HasLos { get; private set; }
        public float LastSeen { get; private set; }

        public void Init(NavMeshAgent agent, Health health, string weapon, float accuracy, int star,
            GameObject weaponModel = null, Animator animator = null, int weaponType = 0)
        {
            _agent = agent; _health = health; _weapon = weapon; _accuracy = accuracy;
            _weaponModel = weaponModel; _animator = animator; _weaponType = weaponType;
            _capsule = GetComponent<CapsuleCollider>();
            if (_agent != null) { _agent.speed = ChaseSpeed; _agent.stoppingDistance = Standoff * 0.9f; }
            _fireT = 0.4f + Random.value * 0.6f;
            _health.OnDied += OnDied;
        }

        void Update()
        {
            if (Removed) return;
            float dt = Time.deltaTime;

            if (_dead)
            {
                if (Time.time - _deadAt > CorpseLingerS) Despawn();
                return;
            }

            var ws = WantedSystem.Instance;
            Transform player = ws != null ? ws.player : null;
            var state = ws != null ? ws.playerState : null;
            if (player == null || ws.Stars == 0) { Despawn(); return; }

            Vector3 pp = player.position;
            Vector3 me = transform.position;
            float dist = Vector3.Distance(me, pp);
            if (dist > RetreatR) { Despawn(); return; }

            // Line of sight (for the wanted cooldown contest).
            Vector3 eye = me + Vector3.up * 1.5f;
            Vector3 target = pp + Vector3.up * 1.0f;
            HasLos = !Physics.Linecast(eye, target, out var block, ~0, QueryTriggerInteraction.Ignore)
                     || block.collider.transform == player || block.collider.transform.IsChildOf(player)
                     || block.collider.CompareTag("Player");
            if (HasLos) LastSeen = Time.time;

            // Posture: at low heat (and while the player complies) cops APPREHEND — no guns drawn,
            // walk right up and cuff. They only draw + fire once force is authorised (2★+ / resisting).
            bool mayShoot = ws.CopsMayShoot;
            ShowWeapon(mayShoot);

            Vector3 face = pp - me; face.y = 0f;
            if (face.sqrMagnitude > 0.01f) transform.rotation = Quaternion.Slerp(transform.rotation,
                Quaternion.LookRotation(face), 1f - Mathf.Exp(-8f * dt));

            if (!mayShoot)
            {
                // Approach to cuffing range and BUST on contact — no firefight.
                if (_agent != null && _agent.isOnNavMesh)
                {
                    _agent.stoppingDistance = 1.1f;
                    _agent.isStopped = false;
                    _agent.SetDestination(HasLos ? pp : (ws.Searching ? ws.Lkp : pp));
                }
                if (dist < 2.3f && HasLos && !state.IsDead) { WastedBusted.Instance?.Bust(); }
                return;
            }

            // Chase to the standoff; when sight is lost, SEARCH the last-known position instead of
            // magically tracking the player (GTA-style search before de-escalation).
            Vector3 dest = HasLos ? pp : (ws.Searching ? ws.Lkp : pp);
            if (_agent != null && _agent.isOnNavMesh)
            {
                _agent.stoppingDistance = Standoff * 0.9f;
                _agent.isStopped = HasLos && dist <= Standoff;
                _agent.SetDestination(dest);
            }

            // Arrest: right on top of an unarmed or nearly-downed player → BUSTED, not a firefight.
            if (dist < 2.6f && CanArrest(state)) { WastedBusted.Instance?.Bust(); return; }

            // Shoot to kill.
            _fireT -= dt;
            if (_fireT <= 0f && HasLos && dist < 60f)
            {
                bool fired = NpcGun.FireAt(gameObject, player, state, _weapon, _accuracy);
                _fireT = fired ? FireInterval : 0.35f;
            }
        }

        /// <summary>Holster (hide) or draw (show) the visible sidearm + sync the armed hold pose.</summary>
        void ShowWeapon(bool shown)
        {
            if (_weaponShown == shown) return;
            _weaponShown = shown;
            if (_weaponModel != null) _weaponModel.SetActive(shown);
            if (_animator != null)
            {
                _animator.SetInteger("WeaponType", shown ? _weaponType : 0);
                _animator.SetBool("Armed", shown && _weaponType != 0);
            }
        }

        static bool CanArrest(PlayerState st)
        {
            if (st == null || st.IsDead) return false;
            var pc = GameRefs.Player != null ? GameRefs.Player.GetComponent<PlayerCombat>() : null;
            bool unarmed = pc != null && pc.CurrentId == "fists";
            bool downed = st.Health01 < 0.18f;
            return unarmed || downed;
        }

        void OnDied(DamageInfo info)
        {
            if (_dead) return;
            _dead = true; _deadAt = Time.time;
            HasLos = false;
            _health.HideBar();
            Ragdoll.Topple(gameObject, _capsule, info.dir, 8f);
        }

        public void Despawn()
        {
            if (Removed) return;
            Removed = true;
            if (_health != null) _health.OnDied -= OnDied;
            Destroy(gameObject);
        }
    }
}
