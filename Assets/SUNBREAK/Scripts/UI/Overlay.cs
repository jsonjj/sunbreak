using System;
using System.Collections.Generic;

namespace SUNBREAK.UI
{
    /// <summary>
    /// Central coordinator so only ONE full overlay is up at a time — the Tab weapon wheel, the M
    /// map, a shop counter, and the Esc pause are mutually exclusive. <see cref="PauseMenu"/> is the
    /// single Esc authority: Esc closes whatever overlay is current (priority), so the player can
    /// always back out and reach pause/quit. Each overlay registers a closer so Esc can shut it.
    /// </summary>
    public static class Overlay
    {
        public enum Kind { None, Wheel, Map, Shop, Pause }

        static Kind _current = Kind.None;
        static readonly Dictionary<Kind, Action> _closers = new();

        public static Kind Current => _current;
        public static bool IsOpen => _current != Kind.None;

        /// <summary>Claim the overlay slot. Returns false if a DIFFERENT overlay already owns it.</summary>
        public static bool TryOpen(Kind k, Action closer)
        {
            if (_current != Kind.None && _current != k) return false;
            _current = k;
            if (closer != null) _closers[k] = closer;
            return true;
        }

        /// <summary>An overlay's own Close() calls this so the slot frees up.</summary>
        public static void MarkClosed(Kind k)
        {
            _closers.Remove(k);
            if (_current == k) _current = Kind.None;
        }

        /// <summary>Esc priority: close whatever is open. Returns true if something was closed.</summary>
        public static bool CloseCurrent()
        {
            if (_current == Kind.None) return false;
            var k = _current;
            _closers.TryGetValue(k, out var closer);
            _closers.Remove(k);
            _current = Kind.None;
            closer?.Invoke();
            return true;
        }

        /// <summary>Drop all state (scene change).</summary>
        public static void Reset() { _current = Kind.None; _closers.Clear(); }
    }
}
