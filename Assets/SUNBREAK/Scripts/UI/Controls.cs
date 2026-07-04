namespace SUNBREAK.UI
{
    /// <summary>Single source of truth for the keybinding list shown on the pause menu + main menu.</summary>
    public static class Controls
    {
        public const string Full =
            "Move — WASD / Arrows\n" +
            "Sprint — Left Shift        Crouch — C / Left Ctrl        Jump — Space\n" +
            "Enter / Exit vehicle — F        Interact / Shop / Pickup — E\n" +
            "Fire — Left Mouse        Aim — Right Mouse        Reload — R\n" +
            "Weapon wheel — hold Tab (move mouse / scroll, release to equip)\n" +
            "Direct weapon — 1-8        Cycle weapon — Mouse Scroll\n" +
            "First-person toggle — V        Map — M\n" +
            "Car radio — H (toggle) · N (next)        Reset car — R\n" +
            "Pause — Esc";

        public const string OneLine =
            "WASD move · Shift sprint · Space jump · F vehicle · E interact · LMB fire · RMB aim · R reload · Tab weapons · 1-8 swap · M map · Esc pause";
    }
}
