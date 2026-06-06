import { UI } from "@/lib/ui-strings";

export function BottomBar() {
  return (
    <div className="ct-bottom-bar">
      <div className="ct-bottom-bar-inner">
        <span className="ct-bottom-label">{UI.app.name}</span>
      </div>
    </div>
  );
}
