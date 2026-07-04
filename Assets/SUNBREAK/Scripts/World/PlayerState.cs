using System;
using UnityEngine;

namespace SUNBREAK.World
{
    /// <summary>
    /// Minimal player game state for the HUD — health + cash — with a change event so the UI
    /// can refresh without polling. Ported placeholder for the web build's economy/health;
    /// later slices layer damage, wanted level, and shops on top.
    /// </summary>
    public sealed class PlayerState : MonoBehaviour
    {
        [SerializeField] float maxHealth = 100f;
        [SerializeField] float health = 100f;
        [SerializeField] int cash = 500;

        public event Action Changed;

        public float MaxHealth => maxHealth;
        public float Health => health;
        public float Health01 => maxHealth > 0f ? Mathf.Clamp01(health / maxHealth) : 0f;
        public int Cash => cash;

        public void Damage(float amount)
        {
            health = Mathf.Clamp(health - amount, 0f, maxHealth);
            Changed?.Invoke();
        }

        public void Heal(float amount) => Damage(-amount);

        public void AddCash(int amount)
        {
            cash = Mathf.Max(0, cash + amount);
            Changed?.Invoke();
        }
    }
}
