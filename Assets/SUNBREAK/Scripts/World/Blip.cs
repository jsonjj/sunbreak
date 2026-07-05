using System.Collections.Generic;
using UnityEngine;

namespace SUNBREAK.World
{
    public enum BlipKind { Shop, Mission, Activity, Cash, Waypoint }

    /// <summary>A world marker the minimap / map draws. Shops, mission givers, activities and the
    /// active objective register one. <see cref="icon"/> is a short glyph (e.g. "+", "$", "★") drawn
    /// on the dot so the player can tell POI types apart at a glance.</summary>
    public sealed class Blip : MonoBehaviour
    {
        public static readonly List<Blip> All = new();
        public BlipKind kind = BlipKind.Shop;
        public Color color = Color.yellow;
        public string label = "";
        public string icon = ""; // glyph shown on the minimap/map dot (empty = plain dot)

        void OnEnable() { if (!All.Contains(this)) All.Add(this); }
        void OnDisable() { All.Remove(this); }

        public static Blip Attach(GameObject go, BlipKind kind, Color color, string label = "", string icon = "")
        {
            var b = go.AddComponent<Blip>();
            b.kind = kind; b.color = color; b.label = label; b.icon = icon;
            return b;
        }
    }
}
