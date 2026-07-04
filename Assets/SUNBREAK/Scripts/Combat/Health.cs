using System;
using UnityEngine;
using SUNBREAK.World;

namespace SUNBREAK.Combat
{
    /// <summary>
    /// Health for peds + cops. Implements <see cref="IDamageable"/>: a shot/punch reduces health,
    /// and when the PLAYER hits/kills a PERSON (civilian/police) it reports a CONTACT crime to the
    /// wanted system (the only thing that raises wanted — exactly as the web build's crime bus does).
    /// Raises OnDamaged/OnDied so the ped/cop AI can flee/fight/ragdoll. Shows a world-space
    /// health-bar billboard once damaged.
    /// </summary>
    public sealed class Health : MonoBehaviour, IDamageable
    {
        public float max = 100f;
        [SerializeField] float current = 100f;
        public Faction faction = Faction.Civilian;
        /// <summary>Stable id used by the wanted spree to count DISTINCT victims.</summary>
        public int netId;

        public event Action<DamageInfo> OnDamaged;
        public event Action<DamageInfo> OnDied;

        public bool IsDead { get; private set; }
        Faction IDamageable.Faction => faction;
        public float Current => current;
        public float Max => max;
        public float Fraction => max > 0f ? Mathf.Clamp01(current / max) : 0f;

        HealthBar _bar;

        public void Init(float maxHp, Faction f, int id)
        {
            max = maxHp; current = maxHp; faction = f; netId = id; IsDead = false;
            if (_bar != null) _bar.Hide();
        }

        public void ApplyDamage(in DamageInfo info)
        {
            if (IsDead) return;
            current = Mathf.Max(0f, current - info.amount);
            bool lethal = current <= 0f;

            // Contact-driven wanted: only PLAYER hits/kills on PEOPLE raise heat.
            if (info.fromPlayer && (faction == Faction.Civilian || faction == Faction.Police))
                WantedSystem.Instance?.ReportPlayerContact(netId, faction, lethal, info.point);

            OnDamaged?.Invoke(info);
            ShowBar();

            if (lethal)
            {
                IsDead = true;
                OnDied?.Invoke(info);
            }
        }

        void ShowBar()
        {
            if (IsDead) return;
            if (_bar == null) _bar = HealthBar.Create(transform);
            _bar.Set(Fraction);
        }

        public void HideBar() { if (_bar != null) _bar.Hide(); }

        void OnDisable() { if (_bar != null) _bar.Hide(); }
    }
}
