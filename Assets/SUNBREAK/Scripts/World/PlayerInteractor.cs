using UnityEngine;
using UnityEngine.InputSystem;

namespace SUNBREAK.World
{
    /// <summary>Finds the nearest usable <see cref="Interactable"/> and triggers it on E; the HUD
    /// reads <see cref="Prompt"/> to show the "Press E" hint.</summary>
    public sealed class PlayerInteractor : MonoBehaviour
    {
        InputAction _use;
        public Interactable Current { get; private set; }
        public string Prompt => Current != null ? Current.Prompt : null;

        void Awake()
        {
            _use = new InputAction("Use", InputActionType.Button, "<Keyboard>/e");
            _use.AddBinding("<Gamepad>/buttonNorth");
        }
        void OnEnable() => _use.Enable();
        void OnDisable() => _use.Disable();

        void Update()
        {
            if (Time.timeScale == 0f) { Current = null; return; } // frozen by a shop / pause menu
            Current = FindNearest();
            if (Current != null && _use.WasPressedThisFrame()) Current.Interact(gameObject);
        }

        Interactable FindNearest()
        {
            Interactable best = null;
            float bestSq = float.MaxValue;
            Vector3 p = transform.position;
            var all = Interactable.All;
            for (int i = 0; i < all.Count; i++)
            {
                var it = all[i];
                if (it == null || !it.Available) continue;
                float sq = (it.transform.position - p).sqrMagnitude;
                if (sq <= it.range * it.range && sq < bestSq) { bestSq = sq; best = it; }
            }
            return best;
        }
    }
}
