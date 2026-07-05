using UnityEngine;
using SUNBREAK.Save;
using SUNBREAK.UI;

namespace SUNBREAK.World
{
    /// <summary>Interior save desk for the safehouse — press E to save the game to Slot 1.</summary>
    public sealed class SafehouseDesk : Interactable
    {
        public override string Prompt => "Press E \u2014 Save game (Slot 1)";

        public override void Interact(GameObject player)
        {
            GameSession.Instance?.SaveToSlot(1);
            GameHUD.Post("SAFEHOUSE", "Progress saved to Slot 1.");
        }
    }
}
