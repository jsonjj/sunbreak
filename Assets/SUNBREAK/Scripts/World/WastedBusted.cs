using System.Collections;
using UnityEngine;
using UnityEngine.UI;
using SUNBREAK.Player;

namespace SUNBREAK.World
{
    /// <summary>
    /// GTA-style death + arrest consequences. On death → a "WASTED" fade card, then respawn at the
    /// nearest hospital minus a capped cash fee (5%, max $5,000), KEEPING weapons and clearing wanted.
    /// Cops trigger "BUSTED" when they corner an unarmed/downed player — arrested, wanted cleared,
    /// armor lost. Replaces the old silent teleport-home-and-full-heal.
    /// </summary>
    public sealed class WastedBusted : MonoBehaviour
    {
        public static WastedBusted Instance { get; private set; }

        public PlayerController player;
        public PlayerState state;
        public WantedSystem wanted;

        Canvas _canvas;
        Image _fade;
        Text _label, _sub;
        bool _busy;

        void Awake() { Instance = this; }
        void OnDestroy() { if (Instance == this) Instance = null; }

        void OnEnable() { if (state != null) state.Died += OnDied; }
        void OnDisable() { if (state != null) state.Died -= OnDied; }

        void OnDied() { if (!_busy) StartCoroutine(Sequence(false)); }

        /// <summary>Called by police when they corner the player (arrest).</summary>
        public void Bust()
        {
            if (_busy || state == null || state.IsDead) return;
            StartCoroutine(Sequence(true));
        }

        IEnumerator Sequence(bool busted)
        {
            _busy = true;
            if (_canvas == null) Build();
            _canvas.gameObject.SetActive(true);
            _label.text = busted ? "BUSTED" : "WASTED";
            _label.color = busted ? new Color(0.6f, 0.8f, 1f, 0f) : new Color(1f, 0.3f, 0.25f, 0f);
            _sub.text = "";
            if (player != null) player.movementEnabled = false;

            // Fade to black + reveal the card.
            float t = 0f;
            while (t < 1.3f)
            {
                t += Time.unscaledDeltaTime;
                float a = Mathf.Clamp01(t / 1.1f);
                _fade.color = new Color(0f, 0f, 0f, a * 0.96f);
                var lc = _label.color; lc.a = a; _label.color = lc;
                yield return null;
            }

            int fee = ApplyConsequences(busted);
            _sub.text = fee > 0 ? $"Hospital fee   -${fee:n0}" : (busted ? "Weapons confiscated? Not this time." : "");
            var sc = _sub.color; sc.a = 1f; _sub.color = sc;
            RespawnAtHospital();

            yield return new WaitForSecondsRealtime(1.3f);

            // Fade back in.
            t = 0f;
            while (t < 0.9f)
            {
                t += Time.unscaledDeltaTime;
                float k = 1f - Mathf.Clamp01(t / 0.8f);
                _fade.color = new Color(0f, 0f, 0f, k * 0.96f);
                var lc = _label.color; lc.a = k; _label.color = lc;
                var s2 = _sub.color; s2.a = k; _sub.color = s2;
                yield return null;
            }

            _canvas.gameObject.SetActive(false);
            if (player != null) player.movementEnabled = true;
            _busy = false;
        }

        int ApplyConsequences(bool busted)
        {
            int cash = state != null ? state.Cash : 0;
            int fee = Mathf.Min(5000, Mathf.RoundToInt(cash * 0.05f));
            if (fee > 0) state.Spend(fee);
            wanted?.Clear();
            state?.SetArmor(0f);  // armor is lost on death/arrest
            state?.Revive();      // full health, no longer dead — weapons are KEPT
            return fee;
        }

        void RespawnAtHospital()
        {
            Vector3 from = player != null ? player.transform.position : (GameRefs.Player != null ? GameRefs.Player.position : Vector3.zero);
            Vector3 hosp = ServiceBuilding.NearestHospital(from);
            // Step out to the street in front of the hospital, snapped to the ground.
            Vector3 spawn = hosp + new Vector3(3f, 0f, -3f);
            if (Physics.Raycast(spawn + Vector3.up * 60f, Vector3.down, out var hit, 120f, ~0, QueryTriggerInteraction.Ignore))
                spawn.y = hit.point.y + 1.2f;
            else spawn.y = hosp.y + 1.2f;
            if (player != null) player.Teleport(spawn, player.LookYaw);
            else if (GameRefs.Player != null) GameRefs.Player.position = spawn;
        }

        void Build()
        {
            var go = new GameObject("Wasted Canvas");
            go.transform.SetParent(transform, false);
            _canvas = go.AddComponent<Canvas>();
            _canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            _canvas.sortingOrder = 120; // above everything
            var scaler = go.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920, 1080);

            var fadeGo = new GameObject("Fade", typeof(Image));
            fadeGo.transform.SetParent(go.transform, false);
            _fade = fadeGo.GetComponent<Image>();
            _fade.color = new Color(0f, 0f, 0f, 0f); _fade.raycastTarget = false;
            var rt = _fade.rectTransform; rt.anchorMin = Vector2.zero; rt.anchorMax = Vector2.one; rt.offsetMin = Vector2.zero; rt.offsetMax = Vector2.zero;

            var font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            _label = Text(go.transform, font, "", 130, FontStyle.Bold, new Vector2(0, 40));
            _sub = Text(go.transform, font, "", 34, FontStyle.Normal, new Vector2(0, -80));
            _sub.color = new Color(1f, 1f, 1f, 0f);

            _canvas.gameObject.SetActive(false);
        }

        static Text Text(Transform parent, Font font, string text, int size, FontStyle style, Vector2 pos)
        {
            var go = new GameObject("Label", typeof(Text));
            go.transform.SetParent(parent, false);
            var t = go.GetComponent<Text>();
            t.text = text; t.font = font; t.fontSize = size; t.fontStyle = style;
            t.alignment = TextAnchor.MiddleCenter; t.color = Color.white; t.horizontalOverflow = HorizontalWrapMode.Overflow;
            var rt = t.rectTransform; rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0.5f); rt.sizeDelta = new Vector2(1600, 220); rt.anchoredPosition = pos;
            return t;
        }
    }
}
