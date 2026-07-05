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
        [SerializeField] float maxArmor = 100f;
        [SerializeField] float armor = 0f;
        [SerializeField] int cash = 500;
        [SerializeField] int bank = 0;

        [Header("Out-of-combat regen (GTA-style)")]
        [SerializeField] float regenTo = 0.45f;      // regen health up to this fraction
        [SerializeField] float regenRate = 8f;       // hp per second
        [SerializeField] float regenDelay = 5f;      // seconds out of combat before regen starts

        float _lastDamageT = -999f;

        public event Action Changed;
        /// <summary>Raised the frame the player's health hits 0 (WastedBusted handles the death flow).</summary>
        public event Action Died;
        /// <summary>Raised when the player takes damage (post-armor amount) — drives hit feedback.</summary>
        public event Action<float> Damaged;

        void Awake() { GameRefs.Player = transform; GameRefs.PlayerState = this; }
        void OnDestroy() { if (GameRefs.PlayerState == this) { GameRefs.Player = null; GameRefs.PlayerState = null; } }

        public float MaxHealth => maxHealth;
        public float Health => health;
        public float Health01 => maxHealth > 0f ? Mathf.Clamp01(health / maxHealth) : 0f;
        public float MaxArmor => maxArmor;
        public float Armor => armor;
        public float Armor01 => maxArmor > 0f ? Mathf.Clamp01(armor / maxArmor) : 0f;
        public int Cash => cash;
        public bool IsDead { get; private set; }
        public bool InCombat => Time.time - _lastDamageT < regenDelay;

        void Update()
        {
            if (IsDead) return;
            // Regenerate health to a threshold once out of combat (so encounters aren't a death spiral).
            if (Time.time - _lastDamageT >= regenDelay && health < maxHealth * regenTo)
            {
                health = Mathf.Min(maxHealth * regenTo, health + regenRate * Time.deltaTime);
                Changed?.Invoke();
            }
        }

        /// <summary>Capture/verification only — ignore incoming damage (used by BuildShot chase shot).</summary>
        public bool Invulnerable { get; set; }

        public void Damage(float amount)
        {
            if (IsDead || amount <= 0f || Invulnerable) return;
            _lastDamageT = Time.time;
            // Armor absorbs first (75% of the hit while it lasts), then health takes the rest.
            if (armor > 0f)
            {
                float toArmor = Mathf.Min(armor, amount * 0.75f);
                armor -= toArmor;
                amount -= toArmor;
            }
            health = Mathf.Clamp(health - amount, 0f, maxHealth);
            Changed?.Invoke();
            if (amount > 0f) Damaged?.Invoke(amount);
            if (health <= 0f) { IsDead = true; Died?.Invoke(); }
        }

        public void Heal(float amount)
        {
            if (amount <= 0f) return;
            health = Mathf.Clamp(health + amount, 0f, maxHealth);
            Changed?.Invoke();
        }

        public void AddArmor(float amount)
        {
            if (amount <= 0f) return;
            armor = Mathf.Clamp(armor + amount, 0f, maxArmor);
            Changed?.Invoke();
        }

        /// <summary>Refill health to full (hospital / medkit / respawn).</summary>
        public void FullHeal()
        {
            health = maxHealth;
            Changed?.Invoke();
        }

        /// <summary>Refill + revive (called on respawn).</summary>
        public void Revive()
        {
            IsDead = false;
            health = maxHealth;
            _lastDamageT = -999f;
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

        /// <summary>Restore armor from a save.</summary>
        public void SetArmor(float a) { armor = Mathf.Clamp(a, 0f, maxArmor); Changed?.Invoke(); }

        float _repHealthBonus;
        /// <summary>Rep perk: raise max health by a rep-tier bonus (and grant the new headroom).</summary>
        public void SetRepHealthBonus(float bonus)
        {
            float delta = bonus - _repHealthBonus;
            if (Mathf.Approximately(delta, 0f)) return;
            _repHealthBonus = bonus;
            maxHealth = Mathf.Max(1f, maxHealth + delta);
            if (delta > 0f) health = Mathf.Min(maxHealth, health + delta);
            else health = Mathf.Min(health, maxHealth);
            Changed?.Invoke();
        }
    }
}
