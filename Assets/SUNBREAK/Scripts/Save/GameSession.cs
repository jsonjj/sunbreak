using System.Collections;
using UnityEngine;
using SUNBREAK.Combat;
using SUNBREAK.Missions;
using SUNBREAK.Player;
using SUNBREAK.UI;
using SUNBREAK.World;

namespace SUNBREAK.Save
{
    /// <summary>
    /// In-world glue for the save loop. On scene start it consumes the menu's New Game / Load
    /// request; it can snapshot the whole run into a slot and restore one. Lives in the Island scene.
    /// </summary>
    public sealed class GameSession : MonoBehaviour
    {
        public static GameSession Instance { get; private set; }

        public PlayerState state;
        public PlayerController player;
        public PlayerCombat combat;

        MissionSystem Missions => MissionSystem.Instance;
        DayNightSystem Day => DayNightSystem.Instance;

        void Awake() { Instance = this; }
        void OnDestroy() { if (Instance == this) Instance = null; }

        IEnumerator Start()
        {
            // Let all the runtime systems (city, nav, player, missions) spin up first.
            yield return null;
            float t = 0f;
            while (GameRefs.Player == null && t < 4f) { t += Time.deltaTime; yield return null; }
            yield return null;

            if (SaveSystem.PendingLoad != null)
            {
                var d = SaveSystem.PendingLoad;
                SaveSystem.PendingLoad = null;
                Restore(d);
            }
            SaveSystem.NewGame = false;

            Overlay.Reset();
            Settings.Apply(); // volume / sensitivity / invert-Y / FOV / brightness from PlayerPrefs
        }

        public SaveData Snapshot()
        {
            var d = new SaveData();
            if (state != null) { d.cash = state.Cash; d.bank = state.Bank; d.health = state.Health; d.armor = state.Armor; }
            if (combat != null) { d.weapons = combat.OwnedList(); d.currentWeapon = combat.CurrentId; }
            if (Missions != null) d.missions = Missions.Save();
            Vector3 p = player != null ? player.transform.position : (GameRefs.Player != null ? GameRefs.Player.position : Vector3.zero);
            d.px = p.x; d.py = p.y; d.pz = p.z;
            d.yaw = player != null ? player.LookYaw : 0f;
            if (Day != null) d.gameMinutes = Day.gameMinutes;
            return d;
        }

        public void Restore(SaveData d)
        {
            if (d == null) return;
            if (state != null) { state.LoadWallet(d.cash, d.bank); state.SetHealth(d.health); state.SetArmor(d.armor); }
            combat?.LoadLoadout(d.weapons, d.currentWeapon);
            Missions?.Load(d.missions);
            if (player != null) player.Teleport(new Vector3(d.px, d.py, d.pz), d.yaw);
            Day?.SetTime(d.gameMinutes);
        }

        public void SaveToSlot(int slot) => SaveSystem.Write(slot, Snapshot());
    }
}
