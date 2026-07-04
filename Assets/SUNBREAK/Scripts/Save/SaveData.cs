using System;
using System.Collections.Generic;
using SUNBREAK.Missions;

namespace SUNBREAK.Save
{
    /// <summary>The full run snapshot written to a slot: wallet, vitals, inventory, mission
    /// progress, world position/heading and time of day. Mirrors the web save orchestrator's slices.</summary>
    [Serializable]
    public sealed class SaveData
    {
        public int version = 1;
        public long savedAt;

        public int cash = 500;
        public int bank = 0;
        public float health = 100f;

        public List<string> weapons = new();
        public string currentWeapon = "pistol_9mm";

        public MissionSave missions = new();

        public float px, py, pz, yaw;
        public float gameMinutes = 8 * 60f;
    }
}
