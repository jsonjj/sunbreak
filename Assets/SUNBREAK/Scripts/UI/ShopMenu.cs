using System.Collections.Generic;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UI;
using SUNBREAK.Combat;
using SUNBREAK.World;

namespace SUNBREAK.UI
{
    public enum ShopKind { GunStore, CarDealer, Bank, Hospital, Convenience }

    /// <summary>
    /// A code-built shop panel (gun store / car dealership / bank). Opening pauses time; number
    /// keys buy a row, Esc closes. Gun store grants USABLE weapons via the combat catalog; the
    /// dealership spawns a drivable car; the bank deposits/withdraws. Ported spirit of the web
    /// economy shops.
    /// </summary>
    public sealed class ShopMenu : MonoBehaviour
    {
        public static ShopMenu Instance { get; private set; }
        public bool IsOpen { get; private set; }

        /// <summary>When set (e.g. buying inside a dealership interior), a purchased car is delivered
        /// here (the dealership's street door) instead of at the player's off-map interior position.</summary>
        public static Vector3? CarDeliveryPoint;

        struct Row { public string id; public string label; public int price; }

        Font _font;
        Canvas _canvas;
        Text _title;
        Text[] _rows;
        readonly List<Row> _items = new();
        ShopKind _kind;
        InputAction[] _keys;

        void Awake()
        {
            Instance = this;
            _keys = new InputAction[9];
            for (int i = 0; i < 9; i++) _keys[i] = new InputAction("Buy" + i, InputActionType.Button, "<Keyboard>/" + (i + 1));
        }
        void OnDestroy() { if (Instance == this) Instance = null; }

        public void Open(ShopKind kind)
        {
            if (!Overlay.TryOpen(Overlay.Kind.Shop, Close)) return; // another overlay owns the screen
            _kind = kind;
            BuildItems();
            if (_canvas == null) BuildUI();
            _canvas.gameObject.SetActive(true);
            foreach (var k in _keys) k.Enable();
            Time.timeScale = 0f;
            IsOpen = true;
            Refresh();
        }

        public void Close()
        {
            Overlay.MarkClosed(Overlay.Kind.Shop); // Esc authority = PauseMenu; this frees the slot
            if (_canvas != null) _canvas.gameObject.SetActive(false);
            foreach (var k in _keys) k.Disable();
            Time.timeScale = 1f;
            IsOpen = false;
        }

        void Update()
        {
            if (!IsOpen) return;
            for (int i = 0; i < _items.Count && i < 9; i++)
                if (_keys[i].WasPressedThisFrame()) { Buy(i); Refresh(); }
        }

        void BuildItems()
        {
            _items.Clear();
            switch (_kind)
            {
                case ShopKind.GunStore:
                    Add("bat", "Baseball Bat", 300);
                    Add("machete", "Machete", 650);
                    Add("pistol_9mm", "9mm Pistol", 900);
                    Add("smg_vector", "Compact SMG", 3200);
                    Add("shotgun_pump", "Pump Shotgun", 4800);
                    Add("rifle_carbine", "Carbine Rifle", 9500);
                    Add("sniper_bolt", "Bolt Sniper", 22000);
                    Add("launcher_rpg", "RPG", 45000);
                    Add("grenade", "Grenade", 800);
                    break;
                case ShopKind.CarDealer:
                    Add("veh_sedan", "Verano Sedan", 6500);
                    Add("veh_suv", "Dune SUV", 14000);
                    Add("veh_coupe", "Boulevard Coupe", 28000);
                    Add("veh_sports", "Riptide GT", 72000);
                    break;
                case ShopKind.Bank:
                    Add("deposit", "Deposit all cash", 0);
                    Add("withdraw", "Withdraw all savings", 0);
                    break;
                case ShopKind.Hospital:
                    Add("heal_full", "Full Health", 250);
                    Add("medkit", "Medkit  (+50 HP)", 120);
                    Add("armor_full", "Body Armor  (100)", 500);
                    break;
                case ShopKind.Convenience:
                    Add("snack", "Snack  (+25 HP)", 40);
                    Add("soda", "Energy Drink  (+40 HP)", 70);
                    Add("armor_small", "Light Vest  (+50 Armor)", 260);
                    break;
            }
        }

        void Add(string id, string label, int price) => _items.Add(new Row { id = id, label = label, price = price });

        void Buy(int i)
        {
            var state = GameRefs.PlayerState;
            if (state == null) return;
            var row = _items[i];
            if (_kind == ShopKind.Bank)
            {
                if (row.id == "deposit") state.Deposit(state.Cash);
                else state.Withdraw(state.Bank);
                return;
            }
            if (_kind == ShopKind.Hospital || _kind == ShopKind.Convenience)
            {
                bool healItem = row.id != "armor_full" && row.id != "armor_small";
                if (healItem && state.Health >= state.MaxHealth) return;      // already full
                if (!healItem && state.Armor >= state.MaxArmor) return;       // already full
                if (!state.Spend(row.price)) return;                          // can't afford
                switch (row.id)
                {
                    case "heal_full": state.FullHeal(); break;
                    case "medkit": state.Heal(50f); break;
                    case "snack": state.Heal(25f); break;
                    case "soda": state.Heal(40f); break;
                    case "armor_full": state.AddArmor(100f); break;
                    case "armor_small": state.AddArmor(50f); break;
                }
                return;
            }
            if (!state.Spend(row.price)) return; // can't afford
            if (_kind == ShopKind.GunStore)
            {
                var combat = GameRefs.Player != null ? GameRefs.Player.GetComponent<PlayerCombat>() : null;
                combat?.Pickup(row.id);
            }
            else if (_kind == ShopKind.CarDealer)
            {
                var city = FindFirstObjectByType<CityGenerator>();
                if (city != null && GameRefs.Player != null)
                {
                    Vector3 p = CarDeliveryPoint ?? (GameRefs.Player.position + GameRefs.Player.forward * 5f);
                    float yaw = GameRefs.Player.eulerAngles.y;
                    city.SpawnCar(new Vector3(p.x, 0f, p.z), yaw, null);
                    if (CarDeliveryPoint.HasValue) GameHUD.Post("VERANO MOTORS", "Your car is waiting out front.");
                }
            }
        }

        // ── UI ──────────────────────────────────────────────────────────────────
        void BuildUI()
        {
            _font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            var go = new GameObject("Shop Canvas");
            go.transform.SetParent(transform, false);
            _canvas = go.AddComponent<Canvas>();
            _canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            _canvas.sortingOrder = 50;
            var scaler = go.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920, 1080);
            go.AddComponent<GraphicRaycaster>();

            var bg = NewImage(go.transform, new Color(0f, 0f, 0f, 0.82f));
            var rt = bg.rectTransform;
            rt.anchorMin = new Vector2(0.5f, 0.5f); rt.anchorMax = new Vector2(0.5f, 0.5f);
            rt.sizeDelta = new Vector2(760, 640); rt.anchoredPosition = Vector2.zero;

            _title = Label(bg.transform, "SHOP", 34, TextAnchor.UpperCenter, new Vector2(0, -20), new Vector2(700, 44));
            _title.color = new Color(1f, 0.85f, 0.4f);

            _rows = new Text[9];
            for (int i = 0; i < 9; i++)
                _rows[i] = Label(bg.transform, "", 24, TextAnchor.UpperLeft, new Vector2(40, -90 - i * 52), new Vector2(680, 44));

            Label(bg.transform, "Press the number to buy · Esc to leave", 18, TextAnchor.LowerCenter,
                new Vector2(0, 18), new Vector2(700, 30)).color = new Color(1f, 1f, 1f, 0.7f);
        }

        void Refresh()
        {
            var state = GameRefs.PlayerState;
            _title.text = _kind switch
            {
                ShopKind.GunStore => $"PALMETTO ARMS   ·   Cash ${state?.Cash:n0}",
                ShopKind.CarDealer => $"VERANO MOTORS   ·   Cash ${state?.Cash:n0}",
                ShopKind.Hospital => $"VISTA GENERAL   ·   Cash ${state?.Cash:n0}   ·   HP {Mathf.RoundToInt(state?.Health ?? 0)}/{Mathf.RoundToInt(state?.MaxHealth ?? 0)}",
                ShopKind.Convenience => $"FUEL & GO   ·   Cash ${state?.Cash:n0}   ·   Armor {Mathf.RoundToInt(state?.Armor ?? 0)}",
                _ => $"BANK   ·   Cash ${state?.Cash:n0}   Savings ${state?.Bank:n0}",
            };
            for (int i = 0; i < _rows.Length; i++)
            {
                if (i >= _items.Count) { _rows[i].text = ""; continue; }
                var r = _items[i];
                if (_kind == ShopKind.Bank) _rows[i].text = $"{i + 1}.  {r.label}";
                else
                {
                    bool afford = state != null && state.Cash >= r.price;
                    _rows[i].text = $"{i + 1}.  {r.label}   —   ${r.price:n0}";
                    _rows[i].color = afford ? Color.white : new Color(1f, 0.5f, 0.5f, 0.7f);
                }
            }
        }

        Image NewImage(Transform parent, Color c)
        {
            var go = new GameObject("Panel", typeof(Image));
            go.transform.SetParent(parent, false);
            var img = go.GetComponent<Image>(); img.color = c;
            return img;
        }

        Text Label(Transform parent, string text, int size, TextAnchor anchor, Vector2 pos, Vector2 sizeDelta)
        {
            var go = new GameObject("Label", typeof(Text));
            go.transform.SetParent(parent, false);
            var t = go.GetComponent<Text>();
            t.text = text; t.font = _font; t.fontSize = size; t.alignment = anchor; t.color = Color.white;
            t.horizontalOverflow = HorizontalWrapMode.Overflow;
            var rt = t.rectTransform;
            rt.anchorMin = new Vector2(0.5f, 1f); rt.anchorMax = new Vector2(0.5f, 1f); rt.pivot = new Vector2(0.5f, 1f);
            rt.sizeDelta = sizeDelta; rt.anchoredPosition = pos;
            return t;
        }
    }
}
