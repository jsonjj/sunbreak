using UnityEngine;
using UnityEngine.AI;

namespace SUNBREAK.World
{
    /// <summary>Feeds an NPC's speed into the shared locomotion blend tree (Idle→Walk→Run).</summary>
    public sealed class CharacterAnimDriver : MonoBehaviour
    {
        static readonly int SpeedHash = Animator.StringToHash("Speed");
        public NavMeshAgent agent;
        public Animator animator;
        /// <summary>Set by AI when moving without the agent (e.g. cop kinematic chase).</summary>
        public float externalSpeed = -1f;

        float _speed;

        void Update()
        {
            if (animator == null || animator.runtimeAnimatorController == null) return;
            float target = externalSpeed >= 0f
                ? externalSpeed
                : (agent != null && agent.isOnNavMesh ? agent.velocity.magnitude : 0f);
            _speed = Mathf.Lerp(_speed, target, 1f - Mathf.Exp(-10f * Time.deltaTime));
            animator.SetFloat(SpeedHash, _speed);
        }
    }
}
