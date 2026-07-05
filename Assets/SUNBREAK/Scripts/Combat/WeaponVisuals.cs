using UnityEngine;

namespace SUNBREAK.Combat
{
    /// <summary>
    /// Shows the player's currently-equipped weapon model in the right hand, swaps it when the weapon
    /// changes, hides it for fists, and keeps the animator's Armed/WeaponType params in sync so the
    /// hold/aim pose matches. Exposes the barrel muzzle + a fire hook (flash + Fire trigger).
    /// </summary>
    public sealed class WeaponVisuals : MonoBehaviour
    {
        public PlayerCombat combat;
        public Animator animator;

        static readonly int ArmedHash = Animator.StringToHash("Armed");
        static readonly int WeaponTypeHash = Animator.StringToHash("WeaponType");
        static readonly int MeleeTypeHash = Animator.StringToHash("MeleeType");
        static readonly int FireHash = Animator.StringToHash("Fire");
        static readonly int ReloadHash = Animator.StringToHash("Reload");

        string _currentId = "__none";
        GameObject _model;
        Transform _muzzle, _hand;

        public Vector3 MuzzlePosition =>
            _muzzle != null ? _muzzle.position : transform.position + Vector3.up * 1.15f + transform.forward * 0.45f;

        void Start()
        {
            if (combat == null) combat = GetComponent<PlayerCombat>();
            if (animator == null) animator = GetComponentInChildren<Animator>();
        }

        void Update()
        {
            if (combat == null) return;
            string id = combat.CurrentId;
            if (id != _currentId) Swap(id);
            if (animator != null && animator.isActiveAndEnabled)
            {
                int wt = WeaponModelLibrary.Instance != null ? WeaponModelLibrary.Instance.WeaponTypeFor(id) : 0;
                animator.SetInteger(WeaponTypeHash, wt);
                animator.SetBool(ArmedHash, wt != 0);
                // Melee weapons (bat/knife/machete) report WeaponType 0 but drive the bat idle stance.
                bool meleeArmed = id != "fists" && Weapons.Get(id).category == "melee";
                animator.SetInteger(MeleeTypeHash, meleeArmed ? 1 : 0);
            }
        }

        void Swap(string id)
        {
            _currentId = id;
            if (_model != null) Destroy(_model);
            _model = null; _muzzle = null;
            var lib = WeaponModelLibrary.Instance;
            if (lib == null) return;
            if (_hand == null && animator != null)
                _hand = WeaponModelLibrary.FindRightHand(animator);
            if (_hand == null) return;
            _model = lib.Attach(_hand, id, out _muzzle);
        }

        /// <summary>Muzzle flash + fire animation trigger.</summary>
        public void OnFire()
        {
            CombatFx.Instance?.Muzzle(MuzzlePosition, new Color(1f, 0.85f, 0.5f));
            if (animator != null && animator.isActiveAndEnabled) animator.SetTrigger(FireHash);
        }

        /// <summary>Reload animation trigger.</summary>
        public void OnReload()
        {
            if (animator != null && animator.isActiveAndEnabled) animator.SetTrigger(ReloadHash);
        }
    }
}
