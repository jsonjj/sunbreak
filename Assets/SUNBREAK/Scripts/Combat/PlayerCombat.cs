using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.InputSystem;
using SUNBREAK.Cameras;
using SUNBREAK.Player;
using SUNBREAK.UI;
using SUNBREAK.World;

namespace SUNBREAK.Combat
{
    /// <summary>
    /// Player weapons — a faithful port of the web build's combat: fire (semi/auto), aim (RMB
    /// tightens spread), reload (R, infinite reserve), per-shot recoil kick, hitscan + pellets +
    /// projectile + melee (fists). Fists AND guns damage peds/cops through the shared IDamageable
    /// path (which feeds the contact-driven wanted formula). Weapon wheel on hold-Tab + number-key
    /// swap. Firing raises a ped-fear threat (gunfire) but NOT wanted — wanted is contact-only.
    /// </summary>
    public sealed class PlayerCombat : MonoBehaviour
    {
        public Camera aimCamera;
        public PlayerController controller;
        public PlayerCameraController cameraController;

        readonly HashSet<string> _owned = new() { "fists", "pistol_9mm" };
        readonly Dictionary<string, int> _mag = new();
        string _current = "pistol_9mm";
        float _nextFire, _reloadDone, _bloom;
        float _lastFireCrimeT, _lastAimCrimeT;
        bool _reloading, _wasAiming;

        InputAction _fire, _reload, _wheel, _scroll;
        InputAction[] _slots;
        Vector2 _wheelAim;
        WeaponVisuals _visuals;
        MeleeAnimator _melee;
        int _comboStep;     // unarmed combo: 0 punchL → 1 punchR → 2 kick → 3 dropkick → reset
        float _lastMelee;   // combo resets after a pause

        public bool WheelOpen { get; private set; }
        public int WheelSelection { get; private set; }
        public string CurrentId => _current;
        public string CurrentName => Weapons.Get(_current).name;
        public int MagAmmo => _mag.TryGetValue(_current, out var a) ? a : 0;
        public int MagSize => Weapons.Get(_current).magSize;
        public bool IsReloading => _reloading;
        public bool Owns(string id) => _owned.Contains(id);

        void Awake()
        {
            if (controller == null) controller = GetComponent<PlayerController>();
            _visuals = GetComponent<WeaponVisuals>();
            _melee = GetComponent<MeleeAnimator>();
            foreach (var id in _owned) _mag[id] = Weapons.Get(id).magSize;

            _fire = new InputAction("Fire", InputActionType.Value, "<Mouse>/leftButton");
            _fire.AddBinding("<Gamepad>/rightTrigger");
            _reload = new InputAction("Reload", InputActionType.Button, "<Keyboard>/r");
            _reload.AddBinding("<Gamepad>/buttonWest");
            _wheel = new InputAction("Wheel", InputActionType.Button, "<Keyboard>/tab");
            _scroll = new InputAction("Scroll", InputActionType.Value, "<Mouse>/scroll/y");

            _slots = new InputAction[8];
            for (int i = 0; i < 8; i++)
                _slots[i] = new InputAction("Slot" + i, InputActionType.Button, "<Keyboard>/" + (i + 1));
        }

        void OnEnable() { _fire.Enable(); _reload.Enable(); _wheel.Enable(); _scroll.Enable(); foreach (var s in _slots) s.Enable(); }
        void OnDisable() { _fire.Disable(); _reload.Disable(); _wheel.Disable(); _scroll.Disable(); foreach (var s in _slots) s.Disable(); }

        void Update()
        {
            if (aimCamera == null) aimCamera = Camera.main;
            if (Time.timeScale == 0f) return; // frozen by a shop / pause menu
            float dt = Time.unscaledDeltaTime;
            _bloom = Mathf.Max(0f, _bloom - 2.5f * dt);

            // Drawing a gun near people scares them; if witnessed it's a (minor) crime.
            bool aimingNow = _current != "fists" && cameraController != null && cameraController.Aiming;
            if (aimingNow && !_wasAiming)
            {
                ThreatBus.Brandish(transform.position);
                if (Time.time - _lastAimCrimeT > 2f) { ThreatBus.Crime(transform.position, 0.6f); _lastAimCrimeT = Time.time; }
            }
            _wasAiming = aimingNow;

            HandleWheel();
            if (WheelOpen) return; // time is slowed; no firing while choosing
            HandleSlotKeys();

            // Mouse scroll cycles owned weapons (up = next, down = previous).
            float scroll = _scroll.ReadValue<float>();
            if (scroll > 0.5f) CycleOwned(1);
            else if (scroll < -0.5f) CycleOwned(-1);

            if (_reloading && Time.time >= _reloadDone) FinishReload();
            if (_reload.WasPressedThisFrame()) BeginReload();

            var w = Weapons.Get(_current);
            bool wantFire = w.auto ? _fire.IsPressed() : _fire.WasPressedThisFrame();
            if (wantFire && Time.time >= _nextFire && !_reloading) Fire(w);
        }

        // ── Firing ────────────────────────────────────────────────────────────
        void Fire(WeaponSpec w)
        {
            _nextFire = Time.time + Mathf.Max(0.02f, w.FireInterval);

            if (w.fireMode == FireMode.Melee) { Melee(w); return; }

            // Ammo gate for guns.
            if (w.magSize > 0)
            {
                if (MagAmmo <= 0) { BeginReload(); return; }
                _mag[_current] = MagAmmo - 1;
            }

            bool aiming = cameraController != null && cameraController.Aiming;
            Vector3 muzzle = _visuals != null ? _visuals.MuzzlePosition : transform.position + Vector3.up * 1.15f + transform.forward * 0.4f;
            if (_visuals != null) _visuals.OnFire(); else CombatFx.Instance?.Muzzle(muzzle, w.muzzle);
            CombatFx.Instance?.Sfx(w.sfx, muzzle);
            ThreatBus.Gunshot(transform.position); // ped fear
            // Firing in the open is a witnessable crime (debounced so auto-fire is one event).
            if (Time.time - _lastFireCrimeT > 1.3f) { ThreatBus.Crime(transform.position, 1.2f); _lastFireCrimeT = Time.time; }

            // Firing a gun is treated as resisting arrest — police draw + return fire.
            WantedSystem.Instance?.ReportResist();

            if (w.fireMode == FireMode.Projectile) { FireProjectile(w, muzzle); ApplyRecoil(w, aiming); return; }

            // Hitscan (+ pellets).
            Vector3 aimTarget = CrosshairPoint(w.rangeM);
            if (aiming && Settings.AimAssist) aimTarget = AimAssistPoint(aimTarget, w.rangeM);
            float moveMul = controller != null && controller.PlanarSpeed > 0.6f ? 1.5f : 1f;
            float spread = w.spreadDeg * (aiming ? w.adsSpreadMul : 1f) * moveMul + _bloom * 4.5f;
            for (int p = 0; p < Mathf.Max(1, w.pellets); p++)
            {
                Vector3 dir = (aimTarget - muzzle).normalized;
                dir = Cone(dir, spread);
                ShootRay(muzzle, dir, w);
            }
            _bloom = Mathf.Min(1f, _bloom + 0.06f);
            ApplyRecoil(w, aiming);
        }

        void ShootRay(Vector3 origin, Vector3 dir, WeaponSpec w)
        {
            Vector3 end = origin + dir * w.rangeM;
            var hits = Physics.RaycastAll(origin, dir, w.rangeM, ~0, QueryTriggerInteraction.Ignore);
            System.Array.Sort(hits, (a, b) => a.distance.CompareTo(b.distance));
            foreach (var h in hits)
            {
                if (h.transform == transform || h.transform.IsChildOf(transform)) continue; // skip self
                end = h.point;
                float dmg = w.damage * w.falloff.Eval(h.distance);
                var dmgable = h.collider.GetComponentInParent<IDamageable>();
                if (dmgable != null && !dmgable.IsDead)
                {
                    dmgable.ApplyDamage(new DamageInfo
                    {
                        amount = dmg, point = h.point, dir = dir, impulse = w.impulse, fromPlayer = true, attacker = gameObject,
                    });
                    GameHUD.Hitmarker();
                }
                CombatFx.Instance?.Impact(h.point, h.normal);
                break;
            }
            CombatFx.Instance?.Tracer(origin, end, w.tracer);
        }

        void Melee(WeaponSpec w)
        {
            CombatFx.Instance?.Sfx("melee", transform.position + Vector3.up * 1.0f);
            ThreatBus.Melee(transform.position);
            ThreatBus.Crime(transform.position, 1.2f); // swinging at people in the open is witnessable

            // Play the fitting animation (real clip if present); the hit lands at the swing apex.
            var (move, dmgMul, delay) = MeleeChoreo(w.id);
            _melee?.Play(move);
            StartCoroutine(MeleeStrike(w, dmgMul, delay));
        }

        /// <summary>Pick the animation + damage scaling + strike delay for this swing. Bat AND machete
        /// share the bat swing; fists chain a combo punchL → punchR → kick → dropkick (finisher), which
        /// resets after a short pause.</summary>
        (MeleeAnimator.Move move, float dmgMul, float delay) MeleeChoreo(string id)
        {
            if (id == "bat" || id == "knife" || id == "machete")
                return (MeleeAnimator.Move.Swing, 1f, 0.16f);

            if (Time.time - _lastMelee > 1.2f) _comboStep = 0; // paused → restart the combo
            _lastMelee = Time.time;
            int step = _comboStep;
            _comboStep = (_comboStep + 1) % 4;
            return step switch
            {
                0 => (MeleeAnimator.Move.PunchL, 1.0f, 0.14f),
                1 => (MeleeAnimator.Move.PunchR, 1.0f, 0.14f),
                2 => (MeleeAnimator.Move.Kick, 1.35f, 0.20f),
                _ => (MeleeAnimator.Move.DropKick, 1.9f, 0.30f), // finisher
            };
        }

        IEnumerator MeleeStrike(WeaponSpec w, float dmgMul, float delay)
        {
            yield return new WaitForSecondsRealtime(delay); // land on the visible strike, not the wind-up
            Vector3 origin = transform.position + Vector3.up * 1.0f;
            Vector3 dir = transform.forward; dir.y = 0f;
            if (dir.sqrMagnitude < 0.001f) dir = Vector3.forward; else dir.Normalize();

            // Hit the nearest target inside a forward arc (cone), not a bare sphere.
            var cols = Physics.OverlapSphere(origin + dir * (w.rangeM * 0.5f), w.rangeM * 0.65f, ~0, QueryTriggerInteraction.Ignore);
            IDamageable best = null; float bestSq = float.MaxValue; Vector3 bestPt = origin;
            foreach (var c in cols)
            {
                if (c.transform == transform || c.transform.IsChildOf(transform)) continue;
                var d = c.GetComponentInParent<IDamageable>();
                if (d == null || d.IsDead || (d.Faction != Faction.Civilian && d.Faction != Faction.Police)) continue;
                Vector3 pt = c.ClosestPoint(origin);
                Vector3 to = pt - origin; to.y = 0f;
                if (to.sqrMagnitude > 0.01f && Vector3.Dot(dir, to.normalized) < 0.35f) continue; // ~110° arc
                float sq = to.sqrMagnitude;
                if (sq < bestSq) { bestSq = sq; best = d; bestPt = pt; }
            }
            if (best != null)
            {
                best.ApplyDamage(new DamageInfo
                {
                    amount = w.damage * dmgMul, point = bestPt, dir = dir, impulse = w.impulse * dmgMul, fromPlayer = true, attacker = gameObject,
                });
                GameHUD.Hitmarker();
                CameraShake.Add(0.12f + 0.08f * dmgMul);
            }
        }

        void FireProjectile(WeaponSpec w, Vector3 muzzle)
        {
            if (w.magSize > 0) { } // already decremented
            Vector3 target = CrosshairPoint(w.rangeM);
            Vector3 dir = (target - muzzle).normalized;
            Projectile.Spawn(muzzle, dir, w, gameObject);
        }

        Vector3 CrosshairPoint(float range)
        {
            if (aimCamera == null) return transform.position + transform.forward * range;
            Ray r = aimCamera.ViewportPointToRay(new Vector3(0.5f, 0.5f, 0f));
            if (Physics.Raycast(r, out var hit, range, ~0, QueryTriggerInteraction.Ignore)
                && hit.transform != transform && !hit.transform.IsChildOf(transform))
                return hit.point;
            return r.origin + r.direction * range;
        }

        static Vector3 Cone(Vector3 dir, float degrees)
        {
            if (degrees <= 0.001f) return dir;
            Quaternion rot = Quaternion.AngleAxis(Random.Range(0f, degrees), Vector3.Cross(dir, Vector3.up).normalized);
            rot = Quaternion.AngleAxis(Random.Range(0f, 360f), dir) * rot;
            return rot * dir;
        }

        void ApplyRecoil(WeaponSpec w, bool aiming)
        {
            if (controller == null) return;
            float mul = aiming ? w.recoil.adsMul : 1f;
            controller.AddLook(-w.recoil.pitch * mul, Random.Range(-w.recoil.yaw, w.recoil.yaw) * mul);
            CameraShake.Add(0.02f + w.recoil.pitch * 0.02f); // subtle firing kick
        }

        /// <summary>Soft-lock: while aiming, bias the shot toward the nearest target near the crosshair.</summary>
        Vector3 AimAssistPoint(Vector3 fallback, float range)
        {
            if (aimCamera == null) return fallback;
            Ray r = aimCamera.ViewportPointToRay(new Vector3(0.5f, 0.5f, 0f));
            var hits = Physics.SphereCastAll(r, 1.3f, range, ~0, QueryTriggerInteraction.Ignore);
            System.Array.Sort(hits, (a, b) => a.distance.CompareTo(b.distance));
            foreach (var h in hits)
            {
                if (h.transform == transform || h.transform.IsChildOf(transform)) continue;
                var d = h.collider.GetComponentInParent<IDamageable>();
                if (d != null && !d.IsDead && (d.Faction == Faction.Civilian || d.Faction == Faction.Police))
                    return h.collider.bounds.center;
            }
            return fallback;
        }

        // ── Reload ──────────────────────────────────────────────────────────────
        void BeginReload()
        {
            var w = Weapons.Get(_current);
            if (w.magSize <= 0 || _reloading || MagAmmo >= w.magSize) return;
            _reloading = true;
            _reloadDone = Time.time + w.reloadMs / 1000f;
            _visuals?.OnReload();
        }

        void FinishReload()
        {
            _reloading = false;
            _mag[_current] = Weapons.Get(_current).magSize; // infinite reserve
        }

        // ── Weapon switching + wheel ─────────────────────────────────────────────
        void HandleSlotKeys()
        {
            for (int i = 0; i < 8; i++)
                if (_slots[i].WasPressedThisFrame()) EquipSlot(i);
        }

        void HandleWheel()
        {
            if (_wheel.WasPressedThisFrame())
            {
                if (!Overlay.TryOpen(Overlay.Kind.Wheel, CancelWheel)) return; // another overlay owns the screen
                WheelOpen = true; Time.timeScale = 0.15f;
                int cur = Mathf.Max(0, System.Array.IndexOf(Weapons.WheelOrder, _current));
                WheelSelection = cur;
                float a0 = cur * 45f * Mathf.Deg2Rad;
                _wheelAim = new Vector2(Mathf.Sin(a0), Mathf.Cos(a0)) * 100f;
            }
            if (!WheelOpen) return;

            // The cursor is locked during play, so absolute mouse position is frozen — drive the
            // selector from accumulated mouse DELTA (GTA-style). Scroll nudges it a segment at a time.
            var m = Mouse.current;
            if (m != null) _wheelAim += m.delta.ReadValue() * 0.7f;
            if (_wheelAim.magnitude > 150f) _wheelAim = _wheelAim.normalized * 150f;
            WheelSelection = SlotFromAim();
            float sc = _scroll.ReadValue<float>();
            if (sc > 0.5f || sc < -0.5f)
            {
                WheelSelection = ((WheelSelection + (sc > 0f ? -1 : 1)) % 8 + 8) % 8;
                float a = WheelSelection * 45f * Mathf.Deg2Rad;
                _wheelAim = new Vector2(Mathf.Sin(a), Mathf.Cos(a)) * 100f;
            }

            if (!_wheel.IsPressed())
            {
                WheelOpen = false; Time.timeScale = 1f;
                Overlay.MarkClosed(Overlay.Kind.Wheel);
                EquipSlot(WheelSelection);
            }
        }

        /// <summary>Esc-priority closer: drop the wheel without committing a selection.</summary>
        void CancelWheel()
        {
            Overlay.MarkClosed(Overlay.Kind.Wheel);
            WheelOpen = false;
            if (Time.timeScale < 1f) Time.timeScale = 1f;
        }

        int SlotFromAim()
        {
            if (_wheelAim.sqrMagnitude < 600f) return WheelSelection; // deadzone → keep highlight
            float ang = Mathf.Atan2(_wheelAim.x, _wheelAim.y) * Mathf.Rad2Deg; // 0 = up, clockwise
            if (ang < 0) ang += 360f;
            return Mathf.RoundToInt(ang / 45f) % 8;
        }

        /// <summary>Jump to the next/previous OWNED weapon in wheel order (mouse scroll).</summary>
        void CycleOwned(int dir)
        {
            int start = Mathf.Max(0, System.Array.IndexOf(Weapons.WheelOrder, _current));
            for (int step = 1; step <= Weapons.WheelOrder.Length; step++)
            {
                int idx = ((start + dir * step) % Weapons.WheelOrder.Length + Weapons.WheelOrder.Length) % Weapons.WheelOrder.Length;
                if (_owned.Contains(Weapons.WheelOrder[idx])) { EquipSlot(idx); return; }
            }
        }

        void EquipSlot(int slot)
        {
            slot = Mathf.Clamp(slot, 0, Weapons.WheelOrder.Length - 1);
            string id = Weapons.WheelOrder[slot];
            // The melee slot upgrades to the best owned melee weapon (machete > knife > bat > fists).
            if (id == "fists")
            {
                if (_owned.Contains("machete")) id = "machete";
                else if (_owned.Contains("knife")) id = "knife";
                else if (_owned.Contains("bat")) id = "bat";
            }
            if (!_owned.Contains(id)) return;
            _current = id;
            _reloading = false;
            if (!_mag.ContainsKey(id)) _mag[id] = Weapons.Get(id).magSize;
        }

        /// <summary>Grant a weapon (world pickup / shop) + auto-equip it.</summary>
        public void Pickup(string id)
        {
            if (!Weapons.All.ContainsKey(id)) return;
            _owned.Add(id);
            _mag[id] = Weapons.Get(id).magSize;
            _current = id;
        }

        // ── Save / restore ────────────────────────────────────────────────────────
        public List<string> OwnedList() => new(_owned);

        public void LoadLoadout(List<string> owned, string current)
        {
            _owned.Clear();
            _owned.Add("fists");
            if (owned != null)
                foreach (var id in owned)
                    if (Weapons.All.ContainsKey(id)) { _owned.Add(id); _mag[id] = Weapons.Get(id).magSize; }
            _current = !string.IsNullOrEmpty(current) && _owned.Contains(current) ? current : "pistol_9mm";
            if (!_owned.Contains(_current)) _current = "fists";
            _reloading = false;
        }
    }
}
