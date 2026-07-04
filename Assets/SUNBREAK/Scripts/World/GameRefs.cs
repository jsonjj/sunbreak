using UnityEngine;

namespace SUNBREAK.World
{
    /// <summary>Lightweight global handles to the player so NPCs (peds/cops/traffic) don't each
    /// re-find it. Registered by PlayerState.Awake; cleared on teardown.</summary>
    public static class GameRefs
    {
        public static Transform Player;
        public static PlayerState PlayerState;
    }
}
