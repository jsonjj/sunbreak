import { RenderCanvas } from "./render/RenderCanvas";
import { HUD } from "./ui/HUD";

export function App() {
  return (
    <div className="app-root">
      <RenderCanvas />
      <HUD />
    </div>
  );
}
