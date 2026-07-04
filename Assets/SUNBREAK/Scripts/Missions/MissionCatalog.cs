using System.Collections.Generic;
using UnityEngine;

namespace SUNBREAK.Missions
{
    /// <summary>
    /// The canon Santa Vista story chain (First Score → Airfield Getaway), ported 1:1 from the web
    /// mission JSON (m01–m05) — start triggers, stage objectives, dialogue, spawns, setWanted and
    /// rewards. Presented through the two leads: Cami (downtown throughline) and Mac (Costa Dorada).
    /// </summary>
    public static class MissionCatalog
    {
        public static List<MissionDef> Build()
        {
            var list = new List<MissionDef>();

            // ── m01 First Score (Cami) ──────────────────────────────────────────
            var m1 = new MissionDef
            {
                id = "m01_first_score", title = "First Score", giver = "Cami",
                description = "A no-questions courier run: meet a contact, grab a car, make the drop.",
                startPos = V(8, 2), rewardCash = 500, rewardRep = 40, next = "m02_boardwalk_shakedown",
            };
            var s = Stage("Meet your contact");
            s.onEnter.Add(MissionFx.Say("Cami", "Over here. Keep it quiet and we both get paid."));
            s.objective = new MissionObjective { kind = ObjectiveKind.Interact, label = "Meet the contact", pos = V(8, -6), radius = 2.5f };
            s.onComplete.Add(MissionFx.Say("Cami", "My car's parked out back. Take it."));
            m1.stages.Add(s);
            s = Stage("Grab the getaway car");
            s.onEnter.Add(MissionFx.Car("getaway", "sedan", V(-10, -6), 0f));
            s.objective = new MissionObjective { kind = ObjectiveKind.EnterVehicle, label = "Get in the getaway car", reference = "getaway" };
            m1.stages.Add(s);
            s = Stage("Make the drop");
            s.objective = new MissionObjective { kind = ObjectiveKind.Goto, label = "Drive to the drop-off", pos = V(-28, -28), radius = 6f };
            s.onComplete.Add(MissionFx.Say("Cami", "Clean work. Here's your cut."));
            m1.stages.Add(s);
            list.Add(m1);

            // ── m02 Boardwalk Shakedown (Cami) ──────────────────────────────────
            var m2 = new MissionDef
            {
                id = "m02_boardwalk_shakedown", title = "Boardwalk Shakedown", giver = "Cami",
                description = "A pickup on the boardwalk turns into an ambush. Survive it, then grab the cash.",
                startPos = V(26, 10), rewardCash = 1500, rewardRep = 120, rewardWeapon = "smg_vector", next = "m03_sunset_run",
            };
            s = Stage("Get to the boardwalk");
            s.onEnter.Add(MissionFx.Say("Cami", "Meet's on the boardwalk. Don't be late."));
            s.objective = new MissionObjective { kind = ObjectiveKind.Goto, label = "Head to the meet", pos = V(30, 20), radius = 5f };
            m2.stages.Add(s);
            s = Stage("Deal gone wrong");
            s.onEnter.Add(MissionFx.Say("Cami", "It's a setup — light 'em up!"));
            s.onEnter.Add(MissionFx.Wanted(2));
            s.onEnter.Add(MissionFx.Enemies("goons", V(34, 26), 4, 6f, "pistol_9mm"));
            s.objective = new MissionObjective { kind = ObjectiveKind.Eliminate, label = "Take out the ambush crew", reference = "goons" };
            m2.stages.Add(s);
            s = Stage("Grab the cash");
            s.onEnter.Add(MissionFx.Prop("loot", V(33, 24)));
            s.onEnter.Add(MissionFx.Prop("loot", V(36, 28)));
            s.onEnter.Add(MissionFx.Prop("loot", V(31, 29)));
            s.objective = new MissionObjective { kind = ObjectiveKind.Collect, label = "Collect the dropped cash", reference = "loot", count = 3, radius = 2.5f };
            s.onComplete.Add(MissionFx.Wanted(0));
            s.onComplete.Add(MissionFx.Say("Cami", "Good. Now vanish."));
            m2.stages.Add(s);
            list.Add(m2);

            // ── m03 Sunset Run (Cami) ───────────────────────────────────────────
            var m3 = new MissionDef
            {
                id = "m03_sunset_run", title = "Sunset Run", giver = "Cami",
                description = "Steal a fast car, shake the heat, and reach the safehouse before dark.",
                startPos = V(-18, -8), rewardCash = 2500, rewardRep = 200, next = "m04_costa_collection",
            };
            s = Stage("Steal a fast car");
            s.onEnter.Add(MissionFx.Say("Cami", "There's a sports car idling on the corner. Grab it."));
            s.onEnter.Add(MissionFx.Car("runner", "sports", V(-22, -10), 90f));
            s.objective = new MissionObjective { kind = ObjectiveKind.EnterVehicle, label = "Steal the sports car", reference = "runner" };
            m3.stages.Add(s);
            s = Stage("Lose the tail");
            s.onEnter.Add(MissionFx.Say("Cami", "Cops everywhere — keep moving and shake 'em!"));
            s.onEnter.Add(MissionFx.Wanted(3));
            s.objective = new MissionObjective { kind = ObjectiveKind.Survive, label = "Evade the police", seconds = 20f, waypoint = false };
            m3.stages.Add(s);
            s = Stage("Reach the safehouse");
            s.objective = new MissionObjective { kind = ObjectiveKind.Goto, label = "Get to the safehouse", pos = V(-55, -52), radius = 7f };
            s.onComplete.Add(MissionFx.Wanted(0));
            s.onComplete.Add(MissionFx.Say("Cami", "You're clear. Ditch the car and lay low."));
            m3.stages.Add(s);
            list.Add(m3);

            // ── m04 Costa Dorada Collection (Mac) ───────────────────────────────
            var m4 = new MissionDef
            {
                id = "m04_costa_collection", title = "Costa Dorada Collection", giver = "Mac",
                description = "Mac needs a debt collected on the Neon Mile. Lean on the crew, then grab the cash.",
                startPos = V(230, 30), rewardCash = 3000, rewardRep = 150, rewardWeapon = "shotgun_pump", next = "m05_airfield_getaway",
            };
            s = Stage("Roll up on the Neon Mile");
            s.onEnter.Add(MissionFx.Say("Mac", "The mark's crew is holed up on the Mile. Convince them to pay."));
            s.objective = new MissionObjective { kind = ObjectiveKind.Goto, label = "Get to the Neon Mile", pos = V(300, 60), radius = 6f };
            m4.stages.Add(s);
            s = Stage("Lean on the crew");
            s.onEnter.Add(MissionFx.Say("Mac", "They want to do this the hard way. Fine."));
            s.onEnter.Add(MissionFx.Wanted(2));
            s.onEnter.Add(MissionFx.Enemies("crew", V(308, 70), 4, 6f, "pistol_9mm"));
            s.objective = new MissionObjective { kind = ObjectiveKind.Eliminate, label = "Take out the crew", reference = "crew" };
            m4.stages.Add(s);
            s = Stage("Collect the debt");
            s.onEnter.Add(MissionFx.Prop("debt", V(304, 66)));
            s.onEnter.Add(MissionFx.Prop("debt", V(312, 74)));
            s.onEnter.Add(MissionFx.Prop("debt", V(300, 78)));
            s.objective = new MissionObjective { kind = ObjectiveKind.Collect, label = "Collect the cash", reference = "debt", count = 3, radius = 2.5f };
            s.onComplete.Add(MissionFx.Wanted(0));
            s.onComplete.Add(MissionFx.Say("Mac", "That's how Costa Dorada does business. Nice."));
            m4.stages.Add(s);
            list.Add(m4);

            // ── m05 Airfield Getaway (Cami) ─────────────────────────────────────
            var m5 = new MissionDef
            {
                id = "m05_airfield_getaway", title = "Airfield Getaway", giver = "Cami",
                description = "Grab a fast car at the airfield, shake the heat, and reach the safehouse.",
                startPos = V(330, 260), rewardCash = 5000, rewardRep = 250, next = null,
            };
            s = Stage("Grab a fast car");
            s.onEnter.Add(MissionFx.Say("Cami", "There's a GT gassed up on the apron. Take it and go."));
            s.onEnter.Add(MissionFx.Car("runner", "sports", V(336, 266), 180f));
            s.objective = new MissionObjective { kind = ObjectiveKind.EnterVehicle, label = "Get in the GT", reference = "runner" };
            m5.stages.Add(s);
            s = Stage("Shake the heat");
            s.onEnter.Add(MissionFx.Say("Cami", "They clocked us — floor it and lose them!"));
            s.onEnter.Add(MissionFx.Wanted(3));
            s.objective = new MissionObjective { kind = ObjectiveKind.Survive, label = "Lose the police", seconds = 25f, waypoint = false };
            m5.stages.Add(s);
            s = Stage("Reach the safehouse");
            s.objective = new MissionObjective { kind = ObjectiveKind.Goto, label = "Get to the safehouse", pos = V(-300, -250), radius = 8f };
            s.onComplete.Add(MissionFx.Wanted(0));
            s.onComplete.Add(MissionFx.Say("Cami", "Clean getaway. Verano's ours tonight."));
            m5.stages.Add(s);
            list.Add(m5);

            return list;
        }

        static MissionStage Stage(string title) => new() { title = title };
        static Vector3 V(float x, float z) => new(x, 1f, z);
    }
}
