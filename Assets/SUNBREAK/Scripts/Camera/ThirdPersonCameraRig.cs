using UnityEngine;
using Unity.Cinemachine;
using SUNBREAK.Player;

namespace SUNBREAK.Cameras
{
    /// <summary>
    /// Bridges the <see cref="PlayerController"/>'s accumulated look angles into a
    /// Cinemachine <see cref="CinemachineOrbitalFollow"/>. Runs at a low execution order so
    /// the axes are written before the CinemachineBrain evaluates the rig each frame.
    /// Keeping the input math in the controller and the wiring here means the camera stays a
    /// pure follower (easy to swap for aim / first-person vcams in later slices).
    /// </summary>
    [DefaultExecutionOrder(-100)]
    public sealed class ThirdPersonCameraRig : MonoBehaviour
    {
        public PlayerController player;
        public CinemachineOrbitalFollow orbital;

        void LateUpdate()
        {
            if (player == null || orbital == null)
                return;

            orbital.HorizontalAxis.Value = player.LookYaw;
            orbital.VerticalAxis.Value = player.LookPitch;
        }
    }
}
