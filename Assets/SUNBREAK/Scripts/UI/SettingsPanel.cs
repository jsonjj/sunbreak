using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace SUNBREAK.UI
{
    /// <summary>
    /// A reusable options panel (audio / look / camera) shared by the pause menu and the main menu.
    /// Rows are label + [-] value [+] buttons that write to <see cref="Settings"/> and re-apply live.
    /// Build it into a canvas transform; toggle the returned root's active state to show/hide.
    /// </summary>
    public sealed class SettingsPanel : MonoBehaviour
    {
        Font _font;
        Action _onBack;
        readonly List<(Func<string> read, Text value)> _rows = new();

        public static SettingsPanel Create(Transform parent, Font font, Action onBack)
        {
            var go = new GameObject("SettingsPanel");
            go.transform.SetParent(parent, false);
            var panel = go.AddComponent<SettingsPanel>();
            panel._font = font;
            panel._onBack = onBack;
            panel.Build();
            return panel;
        }

        void Build()
        {
            var bg = Image(transform, new Color(0.03f, 0.04f, 0.06f, 0.96f));
            var rt = bg.rectTransform;
            rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0.5f);
            rt.sizeDelta = new Vector2(820, 660); rt.anchoredPosition = Vector2.zero;

            Label(bg.transform, "SETTINGS", 34, TextAnchor.UpperCenter, new Vector2(0, -22), new Vector2(760, 44),
                new Color(1f, 0.85f, 0.4f), FontStyle.Bold);

            float y = -96f, step = 62f;
            Row(bg.transform, ref y, step, "Master Volume", () => Pct(Settings.Master),
                () => { Settings.Master = Clamp01(Settings.Master - 0.1f); }, () => { Settings.Master = Clamp01(Settings.Master + 0.1f); });
            Row(bg.transform, ref y, step, "Music Volume", () => Pct(Settings.Music),
                () => { Settings.Music = Clamp01(Settings.Music - 0.1f); }, () => { Settings.Music = Clamp01(Settings.Music + 0.1f); });
            Row(bg.transform, ref y, step, "SFX Volume", () => Pct(Settings.Sfx),
                () => { Settings.Sfx = Clamp01(Settings.Sfx - 0.1f); }, () => { Settings.Sfx = Clamp01(Settings.Sfx + 0.1f); });
            Row(bg.transform, ref y, step, "Mouse Sensitivity", () => Mathf.RoundToInt(Mathf.InverseLerp(Settings.SensMin, Settings.SensMax, Settings.Sensitivity) * 100f) + "%",
                () => { Settings.Sensitivity = Mathf.Clamp(Settings.Sensitivity - 0.02f, Settings.SensMin, Settings.SensMax); },
                () => { Settings.Sensitivity = Mathf.Clamp(Settings.Sensitivity + 0.02f, Settings.SensMin, Settings.SensMax); });
            Row(bg.transform, ref y, step, "Invert Look Y", () => Settings.InvertY ? "ON" : "OFF",
                () => { Settings.InvertY = !Settings.InvertY; }, () => { Settings.InvertY = !Settings.InvertY; });
            Row(bg.transform, ref y, step, "Field of View", () => Mathf.RoundToInt(Settings.Fov) + "\u00B0",
                () => { Settings.Fov = Mathf.Clamp(Settings.Fov - 5f, Settings.FovMin, Settings.FovMax); },
                () => { Settings.Fov = Mathf.Clamp(Settings.Fov + 5f, Settings.FovMin, Settings.FovMax); });
            Row(bg.transform, ref y, step, "Brightness", () => Mathf.RoundToInt(Settings.Brightness * 100f) + "%",
                () => { Settings.Brightness = Mathf.Clamp(Settings.Brightness - 0.1f, Settings.BrightMin, Settings.BrightMax); },
                () => { Settings.Brightness = Mathf.Clamp(Settings.Brightness + 0.1f, Settings.BrightMin, Settings.BrightMax); });

            var back = Button(bg.transform, "BACK", new Vector2(0, y - 14), new Vector2(300, 54), () => _onBack?.Invoke());
            back.GetComponentInChildren<Text>().fontStyle = FontStyle.Bold;

            Refresh();
        }

        public void Refresh() { foreach (var (read, value) in _rows) value.text = read(); }

        void Row(Transform parent, ref float y, float step, string name, Func<string> read, Action dec, Action inc)
        {
            Label(parent, name, 22, TextAnchor.MiddleLeft, new Vector2(-330, y), new Vector2(360, 44), Color.white, FontStyle.Normal)
                .rectTransform.pivot = new Vector2(0f, 0.5f);
            var value = Label(parent, read(), 22, TextAnchor.MiddleCenter, new Vector2(150, y), new Vector2(150, 44),
                new Color(0.8f, 0.9f, 1f), FontStyle.Bold);
            _rows.Add((read, value));

            Button(parent, "\u25C4", new Vector2(60, y), new Vector2(52, 44), () => { dec(); Settings.Apply(); Refresh(); });
            Button(parent, "\u25BA", new Vector2(250, y), new Vector2(52, 44), () => { inc(); Settings.Apply(); Refresh(); });
            y -= step;
        }

        static string Pct(float v) => Mathf.RoundToInt(Mathf.Clamp01(v) * 100f) + "%";
        static float Clamp01(float v) => Mathf.Clamp01(v);

        // ── widgets ──
        static Image Image(Transform parent, Color c)
        {
            var go = new GameObject("Panel", typeof(Image));
            go.transform.SetParent(parent, false);
            var img = go.GetComponent<Image>(); img.color = c;
            return img;
        }

        Text Label(Transform parent, string text, int size, TextAnchor anchor, Vector2 pos, Vector2 sd, Color color, FontStyle style)
        {
            var go = new GameObject("Label", typeof(Text));
            go.transform.SetParent(parent, false);
            var t = go.GetComponent<Text>();
            t.text = text; t.font = _font; t.fontSize = size; t.alignment = anchor; t.color = color; t.fontStyle = style;
            t.horizontalOverflow = HorizontalWrapMode.Overflow;
            var rt = t.rectTransform;
            rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0.5f); rt.pivot = new Vector2(0.5f, 0.5f);
            rt.sizeDelta = sd; rt.anchoredPosition = pos;
            return t;
        }

        Button Button(Transform parent, string label, Vector2 pos, Vector2 size, UnityEngine.Events.UnityAction onClick)
        {
            var go = new GameObject("Btn " + label, typeof(Image), typeof(Button));
            go.transform.SetParent(parent, false);
            var img = go.GetComponent<Image>(); img.color = new Color(1f, 1f, 1f, 0.08f);
            var rt = img.rectTransform;
            rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0.5f); rt.sizeDelta = size; rt.anchoredPosition = pos;
            var btn = go.GetComponent<Button>();
            var colors = btn.colors;
            colors.highlightedColor = new Color(1f, 0.55f, 0.25f, 0.35f);
            colors.pressedColor = new Color(1f, 0.55f, 0.25f, 0.5f);
            btn.colors = colors;
            btn.onClick.AddListener(onClick);
            Label(go.transform, label, 22, TextAnchor.MiddleCenter, Vector2.zero, size, Color.white, FontStyle.Normal);
            return btn;
        }
    }
}
