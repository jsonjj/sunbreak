using UnityEngine;

namespace SUNBREAK.Combat
{
    /// <summary>Who a body belongs to — drives wanted weighting (cop &gt; civilian) + friendly fire.</summary>
    public enum Faction { Civilian, Police, Player, Neutral }

    /// <summary>One damage application (a bullet/pellet/punch/blast landing on a target).</summary>
    public struct DamageInfo
    {
        public float amount;
        public Vector3 point;
        public Vector3 dir;    // travel direction of the shot (for knockback/ragdoll)
        public float impulse;
        public bool fromPlayer;
        public GameObject attacker;
    }

    /// <summary>Anything a shot/punch can hurt. Peds/cops use <see cref="Health"/>; the player uses PlayerState.</summary>
    public interface IDamageable
    {
        void ApplyDamage(in DamageInfo info);
        Faction Faction { get; }
        bool IsDead { get; }
    }
}
