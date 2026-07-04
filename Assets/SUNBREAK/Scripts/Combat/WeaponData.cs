using System.Collections.Generic;
using UnityEngine;

namespace SUNBREAK.Combat
{
    // ─────────────────────────────────────────────────────────────────────────
    // Weapon catalog — a faithful C# port of the web build's combat/weapons.ts ballistics
    // fused with inventory/catalog/weapons.ts identity (name, category, magSize). Reserve ammo
    // is INFINITE this slice (per the web build's final state) but reload is kept, so only
    // magSize matters here. Damage/rpm/spread/recoil/falloff/pellets/projectile are ported 1:1.
    // ─────────────────────────────────────────────────────────────────────────

    public enum FireMode { Melee, Hitscan, Projectile }

    /// <summary>Distance damage falloff: full damage to <c>start</c>, easing to <c>minMul</c> by <c>end</c>.</summary>
    public struct Falloff
    {
        public float start, end, minMul;
        public Falloff(float s, float e, float m) { start = s; end = e; minMul = m; }
        public static Falloff Flat => new Falloff(9999f, 10000f, 1f);
        public float Eval(float dist)
        {
            if (dist <= start) return 1f;
            if (dist >= end) return minMul;
            return Mathf.Lerp(1f, minMul, Mathf.InverseLerp(start, end, dist));
        }
    }

    public struct Recoil
    {
        public float pitch, yaw, recoverDegPerSec, adsMul;
        public Recoil(float p, float y, float r, float a) { pitch = p; yaw = y; recoverDegPerSec = r; adsMul = a; }
    }

    public struct ProjectileSpec
    {
        public float speed, gravity, drag, radius, fuseMs;
        public ProjectileSpec(float s, float g, float d, float r, float f) { speed = s; gravity = g; drag = d; radius = r; fuseMs = f; }
    }

    public sealed class WeaponSpec
    {
        public string id, name, category;
        public FireMode fireMode;
        public bool auto;
        public float damage, rpm, reloadMs, spreadDeg, adsSpreadMul, rangeM, impulse;
        public int pellets, magSize, wheelSlot;
        public Falloff falloff;
        public Recoil recoil;
        public Color tracer = new Color(1f, 0.9f, 0.7f);
        public Color muzzle = new Color(1f, 0.94f, 0.75f);
        public bool hasProjectile;
        public ProjectileSpec projectile;
        public string sfx = "pistol";

        public float FireInterval => rpm > 0f ? 60f / rpm : 0f;
    }

    /// <summary>The ported arsenal, keyed by id, plus the weapon-wheel slot order.</summary>
    public static class Weapons
    {
        // Wheel order (index = slot), from inventory WHEEL_CATEGORIES.
        public static readonly string[] WheelOrder =
        {
            "pistol_9mm", "smg_vector", "shotgun_pump", "rifle_carbine",
            "sniper_bolt", "launcher_rpg", "grenade", "fists",
        };

        static Color Hex(int rgb) => new Color(((rgb >> 16) & 255) / 255f, ((rgb >> 8) & 255) / 255f, (rgb & 255) / 255f);

        public static readonly Dictionary<string, WeaponSpec> All = new()
        {
            ["fists"] = new WeaponSpec
            {
                id = "fists", name = "Fists", category = "melee", fireMode = FireMode.Melee, auto = false,
                damage = 22f, rpm = 150f, reloadMs = 0f, pellets = 1, spreadDeg = 0f, adsSpreadMul = 1f,
                rangeM = 2.8f, falloff = Falloff.Flat, impulse = 7f, recoil = new Recoil(0, 0, 0, 1), magSize = 0,
                wheelSlot = 7, sfx = "melee",
            },
            ["pistol_9mm"] = new WeaponSpec
            {
                id = "pistol_9mm", name = "9mm Pistol", category = "handgun", fireMode = FireMode.Hitscan, auto = false,
                damage = 24f, rpm = 430f, reloadMs = 1300f, pellets = 1, spreadDeg = 1.6f, adsSpreadMul = 0.28f,
                rangeM = 95f, falloff = new Falloff(26, 55, 0.55f), impulse = 8f,
                recoil = new Recoil(0.55f, 0.18f, 9f, 0.6f), magSize = 12, wheelSlot = 0,
                tracer = Hex(0xffe3b0), muzzle = Hex(0xfff1c0), sfx = "pistol",
            },
            ["smg_vector"] = new WeaponSpec
            {
                id = "smg_vector", name = "Compact SMG", category = "smg", fireMode = FireMode.Hitscan, auto = true,
                damage = 15f, rpm = 950f, reloadMs = 1700f, pellets = 1, spreadDeg = 2.8f, adsSpreadMul = 0.55f,
                rangeM = 60f, falloff = new Falloff(16, 38, 0.4f), impulse = 6f,
                recoil = new Recoil(0.3f, 0.24f, 15f, 0.7f), magSize = 30, wheelSlot = 1,
                tracer = Hex(0xffdca0), muzzle = Hex(0xfff0b0), sfx = "smg",
            },
            ["shotgun_pump"] = new WeaponSpec
            {
                id = "shotgun_pump", name = "Pump Shotgun", category = "shotgun", fireMode = FireMode.Hitscan, auto = false,
                damage = 9f, rpm = 70f, reloadMs = 2600f, pellets = 9, spreadDeg = 6.5f, adsSpreadMul = 0.78f,
                rangeM = 40f, falloff = new Falloff(8, 24, 0.15f), impulse = 26f,
                recoil = new Recoil(1.7f, 0.45f, 8f, 0.85f), magSize = 8, wheelSlot = 2,
                tracer = Hex(0xffcf8a), muzzle = Hex(0xffe0a0), sfx = "shotgun",
            },
            ["rifle_carbine"] = new WeaponSpec
            {
                id = "rifle_carbine", name = "Carbine Rifle", category = "rifle", fireMode = FireMode.Hitscan, auto = true,
                damage = 26f, rpm = 700f, reloadMs = 2100f, pellets = 1, spreadDeg = 1.9f, adsSpreadMul = 0.32f,
                rangeM = 140f, falloff = new Falloff(45, 95, 0.55f), impulse = 10f,
                recoil = new Recoil(0.42f, 0.16f, 11f, 0.55f), magSize = 30, wheelSlot = 3,
                tracer = Hex(0xfff0c8), muzzle = Hex(0xfff4d0), sfx = "rifle",
            },
            ["sniper_bolt"] = new WeaponSpec
            {
                id = "sniper_bolt", name = "Bolt Sniper", category = "sniper", fireMode = FireMode.Hitscan, auto = false,
                damage = 140f, rpm = 45f, reloadMs = 3200f, pellets = 1, spreadDeg = 0.3f, adsSpreadMul = 0.04f,
                rangeM = 450f, falloff = new Falloff(180, 360, 0.9f), impulse = 34f,
                recoil = new Recoil(2.4f, 0.2f, 5f, 0.7f), magSize = 5, wheelSlot = 4,
                tracer = Hex(0xffffff), muzzle = Hex(0xffffff), sfx = "rifle",
            },
            ["launcher_rpg"] = new WeaponSpec
            {
                id = "launcher_rpg", name = "RPG", category = "heavy", fireMode = FireMode.Projectile, auto = false,
                damage = 150f, rpm = 40f, reloadMs = 3500f, pellets = 1, spreadDeg = 0.4f, adsSpreadMul = 0.4f,
                rangeM = 220f, falloff = Falloff.Flat, impulse = 60f,
                recoil = new Recoil(1.4f, 0.2f, 6f, 0.8f), magSize = 1, wheelSlot = 5,
                muzzle = Hex(0xffa060), hasProjectile = true, projectile = new ProjectileSpec(48, -3, 0, 6, 0), sfx = "rifle",
            },
            ["grenade"] = new WeaponSpec
            {
                id = "grenade", name = "Grenade", category = "thrown", fireMode = FireMode.Projectile, auto = false,
                damage = 120f, rpm = 70f, reloadMs = 900f, pellets = 1, spreadDeg = 1.5f, adsSpreadMul = 0.8f,
                rangeM = 220f, falloff = Falloff.Flat, impulse = 40f,
                recoil = new Recoil(0.2f, 0.1f, 10f, 1f), magSize = 1, wheelSlot = 6,
                hasProjectile = true, projectile = new ProjectileSpec(18, -9.8f, 0.02f, 5, 1500), sfx = "melee",
            },
        };

        public static WeaponSpec Get(string id) =>
            id != null && All.TryGetValue(id, out var w) ? w : All["pistol_9mm"];
    }
}
