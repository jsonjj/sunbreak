using UnityEngine;

namespace SUNBREAK.Player
{
    /// <summary>
    /// Feeds locomotion parameters into an <see cref="Animator"/> so a humanoid blend
    /// tree (Idle → Walk → Run) plays from the player's actual movement. Slice 1 wires
    /// this onto the greybox capsule with an empty blend-tree controller; when a Mixamo
    /// Humanoid model is dropped in, the same component drives the real character with
    /// zero code changes. Safe to run with no Animator/clips assigned (it no-ops).
    /// </summary>
    [RequireComponent(typeof(CharacterController))]
    public sealed class PlayerLocomotionAnimator : MonoBehaviour
    {
        static readonly int SpeedHash = Animator.StringToHash("Speed");
        static readonly int MotionHash = Animator.StringToHash("MotionSpeed");
        static readonly int GroundedHash = Animator.StringToHash("Grounded");

        [Tooltip("Animator to drive; auto-found on this object or children if null.")]
        public Animator animator;

        [Tooltip("Damping (s) applied to the Speed parameter for smooth blends.")]
        public float speedDamp = 0.12f;

        CharacterController _cc;
        float _speed;

        void Awake()
        {
            _cc = GetComponent<CharacterController>();
            if (animator == null) animator = GetComponentInChildren<Animator>();
        }

        void Update()
        {
            if (animator == null || animator.runtimeAnimatorController == null) return;

            Vector3 planar = _cc.velocity;
            planar.y = 0f;
            float target = planar.magnitude;
            _speed = Mathf.Lerp(_speed, target, 1f - Mathf.Exp(-Time.deltaTime / Mathf.Max(0.0001f, speedDamp)));

            animator.SetFloat(SpeedHash, _speed);
            animator.SetFloat(MotionHash, 1f);
            animator.SetBool(GroundedHash, _cc.isGrounded);
        }
    }
}
