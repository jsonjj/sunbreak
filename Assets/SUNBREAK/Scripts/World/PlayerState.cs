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
        [SerializeField] int bank = 0;

        public event Action Changed;
        /// <summary>Raised the frame the player's health hits 0 (WorldBounds respawns + clears wanted).</summary>
        public event Action Died;

        void Awake() { GameRefs.Player = transform; GameRefs.PlayerState = this; }
        void OnDestroy() { if (GameRefs.PlayerState == this) { GameRefs.Player = null; GameRefs.PlayerState = null; } }

        public float MaxHealth => maxHealth;
        public float Health => health;
        public float Health01 => maxHealth > 0f ? Mathf.Clamp01(health / maxHealth) : 0f;
        public int Cash => cash;
        public bool IsDead { get; private set; }

        public void Damage(float amount)
        {
            if (IsDead) return;
            health = Mathf.Clamp(health - amount, 0f, maxHealth);
            Changed?.Invoke();
            if (health <= 0f) { IsDead = true; Died?.Invoke(); }
        }

        public void Heal(float amount)
        {
            health = Mathf.Clamp(health + amount, 0f, maxHealth);
            Changed?.Invoke();
        }

        /// <summary>Refill + revive (called on respawn).</summary>
        public void Revive()
        {
            IsDead = false;
            health = maxHealth;
            Changed?.Invoke();
        }

        public int Bank => bank;

        public void AddCash(int amount)
        {
            cash = Mathf.Max(0, cash + amount);
            Changed?.Invoke();
        }

        /// <summary>Spend clean cash if affordable. Returns false if you can't afford it.</summary>
        public bool Spend(int amount)
        {
            if (amount <= 0 || cash < amount) return false;
            cash -= amount;
            Changed?.Invoke();
            return true;
        }

        public void Deposit(int amount)
        {
            amount = Mathf.Min(amount, cash);
            if (amount <= 0) return;
            cash -= amount; bank += amount; Changed?.Invoke();
        }

        public void Withdraw(int amount)
        {
            amount = Mathf.Min(amount, bank);
            if (amount <= 0) return;
            bank -= amount; cash += amount; Changed?.Invoke();
        }

        /// <summary>Restore wallet from a save.</summary>
        public void LoadWallet(int c, int b) { cash = Mathf.Max(0, c); bank = Mathf.Max(0, b); Changed?.Invoke(); }

        /// <summary>Restore health from a save.</summary>
        public void SetHealth(float h) { health = Mathf.Clamp(h, 0f, maxHealth); IsDead = health <= 0f; Changed?.Invoke(); }
    }
}
