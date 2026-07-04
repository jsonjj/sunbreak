using UnityEngine;
using SUNBREAK.World;

namespace SUNBREAK.Missions
{
    /// <summary>The "press E" marker for the next available mission. The <see cref="MissionSystem"/>
    /// owns the beacon/blip and repositions this to the current lead's start point.</summary>
    public sealed class MissionGiver : Interactable
    {
        public MissionSystem system;

        public override string Prompt =>
            system != null && system.AvailableMission != null
                ? $"Press E — {system.AvailableMission.giver}: {system.AvailableMission.title}"
                : "";

        public override bool Available =>
            isActiveAndEnabled && system != null && system.AvailableMission != null && !system.HasActive;

        public override void Interact(GameObject player) => system?.StartAvailable();
    }
}
