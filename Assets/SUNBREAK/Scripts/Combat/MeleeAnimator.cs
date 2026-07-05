using UnityEngine;

namespace SUNBREAK.Combat
{
    /// <summary>
    /// Plays the player's melee animations. Prefers the real retargeted Mixamo clips in the animator
    /// (PunchL / PunchR / Kick / DropKick / BatHit states, driven here via CrossFade); if a state is
    /// missing it falls back to a synthesised bone motion so melee always reads. The combo order is
    /// chosen by <see cref="PlayerCombat"/>; this component just plays the requested move.
    /// </summary>
    public sealed class MeleeAnimator : MonoBehaviour
    {
        public enum Move { PunchL, PunchR, Kick, DropKick, Swing }

        public Animator animator;

        // Fallback (procedural) bones.
        Transform _rArm, _rFore, _lArm, _rUpLeg, _rLeg, _spine;
        Move _move;
        float _t, _dur;
        bool _playing, _procedural;

        void Start()
        {
            if (animator == null) animator = GetComponentInChildren<Animator>();
            FindBones();
        }

        static string StateName(Move m) => m switch
        {
            Move.PunchL => "PunchL",
            Move.PunchR => "PunchR",
            Move.Kick => "Kick",
            Move.DropKick => "DropKick",
            _ => "BatHit",
        };

        public void Play(Move move)
        {
            if (animator == null) return;
            _move = move;
            int hash = Animator.StringToHash(StateName(move));
            if (animator.runtimeAnimatorController != null && animator.HasState(0, hash))
            {
                animator.CrossFadeInFixedTime(hash, 0.08f, 0, 0f); // real Mixamo clip
                _procedural = false;
                _playing = false;
                return;
            }
            // Fallback: synthesise the motion in LateUpdate.
            _procedural = true;
            _dur = move == Move.Swing ? 0.5f : move == Move.Kick || move == Move.DropKick ? 0.46f : 0.4f;
            _t = 0f;
            _playing = true;
        }

        void LateUpdate()
        {
            if (!_playing || !_procedural || animator == null) return;
            _t += Time.deltaTime;
            float p = Mathf.Clamp01(_t / Mathf.Max(0.01f, _dur));
            Apply(p);
            if (_t >= _dur) _playing = false;
        }

        void Apply(float p)
        {
            Vector3 R = transform.right, U = transform.up, F = transform.forward;
            float e = Mathf.Sin(p * Mathf.PI);
            float s = Mathf.SmoothStep(0f, 1f, p);

            switch (_move)
            {
                case Move.PunchL:
                case Move.PunchR:
                    Rot(_rArm, R, -78f * e);
                    Rot(_rFore, R, -38f * e);
                    Rot(_spine, U, (_move == Move.PunchL ? -20f : 20f) * e);
                    break;
                case Move.Kick:
                case Move.DropKick:
                    Rot(_rUpLeg, R, -85f * e);
                    Rot(_rLeg, R, -28f * e);
                    Rot(_spine, R, 14f * e);
                    Rot(_rArm, R, 22f * e);
                    break;
                case Move.Swing:
                    Rot(_rArm, U, Mathf.Lerp(75f, -95f, s));
                    Rot(_rArm, R, -55f * e);
                    Rot(_rFore, R, -22f);
                    Rot(_lArm, U, Mathf.Lerp(40f, -50f, s));
                    Rot(_spine, U, Mathf.Lerp(30f, -30f, s));
                    break;
            }
        }

        static void Rot(Transform b, Vector3 worldAxis, float deg)
        {
            if (b == null) return;
            b.rotation = Quaternion.AngleAxis(deg, worldAxis) * b.rotation;
        }

        void FindBones()
        {
            if (animator == null) return;
            foreach (var t in animator.GetComponentsInChildren<Transform>())
            {
                string n = t.name.ToLowerInvariant();
                if (n.Contains("finger") || n.Contains("thumb") || n.Contains("index") ||
                    n.Contains("middle") || n.Contains("ring") || n.Contains("pinky")) continue;
                if (_rArm == null && n.EndsWith("rightarm")) _rArm = t;
                else if (_rFore == null && n.EndsWith("rightforearm")) _rFore = t;
                else if (_lArm == null && n.EndsWith("leftarm")) _lArm = t;
                else if (_rUpLeg == null && n.EndsWith("rightupleg")) _rUpLeg = t;
                else if (_rLeg == null && n.EndsWith("rightleg")) _rLeg = t;
                else if (_spine == null && (n.EndsWith("spine1") || n.EndsWith("spine2"))) _spine = t;
            }
        }
    }
}
