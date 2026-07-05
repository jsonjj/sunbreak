using System;
using UnityEngine;
using SUNBREAK.Combat;
using SUNBREAK.Player;
using SUNBREAK.UI;
using SUNBREAK.Vehicles;

namespace SUNBREAK.World
{
    /// <summary>
    /// First-run onboarding: a short guided sequence (move → sprint → drive → map → buy a weapon)
    /// surfaced through the existing HUD toast, plus a couple of just-in-time hints. Persists a
    /// done-flag in PlayerPrefs so it only ever runs once. Reuses PlayerController / VehicleInteraction
    /// / PlayerCombat / Overlay state for the completion checks — no new input plumbing.
    /// </summary>
    public sealed class Tutorial : MonoBehaviour
    {
        public const string DoneKey = "sb_tutorial_done";
        public static Tutorial Instance { get; private set; }

        PlayerController _pc;
        PlayerCombat _combat;
        VehicleInteraction _veh;
        (string text, Func<bool> done)[] _steps;
        int _step = -1;
        int _startOwned;
        float _repostAt;
        Vector3 _startPos;
        bool _moved, _mapOpened, _sprinted, _wantedHintShown;

        void Awake() { Instance = this; }
        void OnDestroy() { if (Instance == this) Instance = null; }

        void Start()
        {
            if (PlayerPrefs.GetInt(DoneKey, 0) != 0) { enabled = false; return; }
        }

        /// <summary>Mark the tutorial complete (e.g. a loaded save had already finished it).</summary>
        public void MarkDone()
        {
            PlayerPrefs.SetInt(DoneKey, 1); PlayerPrefs.Save();
            GameHUD.SetActivity(null);
            enabled = false;
        }

        void Update()
        {
            if (_pc == null)
            {
                var p = GameRefs.Player;
                if (p == null) return;
                _pc = p.GetComponent<PlayerController>();
                _combat = p.GetComponent<PlayerCombat>();
                _veh = p.GetComponent<VehicleInteraction>();
                if (_pc == null) return;
                _startPos = p.position;
                _startOwned = _combat != null ? _combat.OwnedList().Count : 2;
                BuildSteps();
                Advance();
            }

            // Track completion signals.
            if (!_moved && (GameRefs.Player.position - _startPos).sqrMagnitude > 16f) _moved = true;
            if (_pc.IsSprinting) _sprinted = true;
            if (Overlay.Current == Overlay.Kind.Map) _mapOpened = true;

            // Just-in-time hint: first wanted star.
            if (!_wantedHintShown && WantedSystem.Instance != null && WantedSystem.Instance.Stars > 0)
            {
                _wantedHintShown = true;
                GameHUD.Post("WANTED", "Cops are after you — break their line of sight or find a Verano Customs to lose them.");
            }

            if (_step < 0 || _step >= _steps.Length) return;

            if (_steps[_step].done())
            {
                GameHUD.Post("TUTORIAL", "Nice!");
                Advance();
                return;
            }
            // Keep the instruction visible (the toast fades on its own).
            if (Time.time >= _repostAt)
            {
                _repostAt = Time.time + 3.5f;
                GameHUD.Post("TUTORIAL", _steps[_step].text);
            }
        }

        void BuildSteps()
        {
            _steps = new (string, Func<bool>)[]
            {
                ("Move with W A S D", () => _moved),
                ("Hold SHIFT to sprint", () => _sprinted),
                ("Find a car and press F to drive", () => _veh != null && _veh.IsDriving),
                ("Press M to open the full map", () => _mapOpened),
                ("Buy a weapon at the gun store (walk in, press E)", () => _combat != null && _combat.OwnedList().Count > _startOwned),
            };
        }

        void Advance()
        {
            _step++;
            _repostAt = 0f;
            if (_step >= _steps.Length)
            {
                GameHUD.Post("WELCOME TO SANTA VISTA", "Tutorial complete. Follow the gold marker to start the story.");
                PlayerPrefs.SetInt(DoneKey, 1); PlayerPrefs.Save();
                enabled = false;
            }
        }
    }
}
