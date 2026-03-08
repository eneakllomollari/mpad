import './TitleBar.css';

export function TitleBar() {
  return (
    <div data-tauri-drag-region className="titlebar">
      {/* The traffic lights will be overlaid by macOS on the left side */}
    </div>
  );
}
