using System;
using System.IO;
using UnityEngine;

namespace SUNBREAK.Save
{
    /// <summary>JSON save slots in <see cref="Application.persistentDataPath"/>. The main menu sets
    /// <see cref="PendingLoad"/> / <see cref="NewGame"/> before loading the world scene, which the
    /// in-world <c>GameSession</c> consumes on start.</summary>
    public static class SaveSystem
    {
        public const int Slots = 3;

        /// <summary>Set by the menu right before loading the world scene.</summary>
        public static SaveData PendingLoad;
        public static bool NewGame;

        static string PathFor(int slot) =>
            Path.Combine(Application.persistentDataPath, $"sunbreak_slot{slot}.json");

        public static bool Has(int slot) => File.Exists(PathFor(slot));

        public static void Write(int slot, SaveData data)
        {
            try
            {
                data.savedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                File.WriteAllText(PathFor(slot), JsonUtility.ToJson(data));
                Debug.Log($"[save] wrote slot {slot} → {PathFor(slot)}");
            }
            catch (Exception e) { Debug.LogWarning($"[save] write slot {slot} failed: {e.Message}"); }
        }

        public static SaveData Read(int slot)
        {
            try
            {
                if (!Has(slot)) return null;
                return JsonUtility.FromJson<SaveData>(File.ReadAllText(PathFor(slot)));
            }
            catch (Exception e) { Debug.LogWarning($"[save] read slot {slot} failed: {e.Message}"); return null; }
        }

        public static string SlotLabel(int slot)
        {
            var d = Read(slot);
            if (d == null) return "Empty";
            var when = DateTimeOffset.FromUnixTimeSeconds(d.savedAt).LocalDateTime;
            return $"${d.cash:n0}  ·  {when:MMM d, HH:mm}";
        }
    }
}
