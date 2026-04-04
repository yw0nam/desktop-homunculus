interface BasicTabProps {
  name: string;
  scale: number;
  onScaleChange: (scale: number) => void;
  posX: number;
  posY: number;
  onPosXChange: (x: number) => void;
  onPosYChange: (y: number) => void;
}

export function BasicTab({
  name,
  scale,
  onScaleChange,
  posX,
  posY,
  onPosXChange,
  onPosYChange,
}: BasicTabProps) {
  return (
    <div className="settings-section">
      <label className="settings-label">
        Name
        <input
          type="text"
          className="settings-input"
          value={name}
          readOnly
        />
      </label>

      <label className="settings-label">
        Scale
        <div className="settings-slider-row">
          <input
            type="range"
            className="settings-slider"
            min={0.1}
            max={3}
            step={0.05}
            value={scale}
            onChange={(e) => onScaleChange(parseFloat(e.target.value))}
          />
          <span className="settings-slider-value">{scale.toFixed(2)}</span>
        </div>
      </label>

      <label className="settings-label">
        Position X
        <div className="settings-slider-row">
          <input
            type="range"
            className="settings-slider"
            min={-10}
            max={10}
            step={0.1}
            value={posX}
            onChange={(e) => onPosXChange(parseFloat(e.target.value))}
          />
          <input
            type="number"
            className="settings-number-input"
            min={-10}
            max={10}
            step={0.1}
            value={posX}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!isNaN(v)) onPosXChange(v);
            }}
          />
        </div>
      </label>

      <label className="settings-label">
        Position Y
        <div className="settings-slider-row">
          <input
            type="range"
            className="settings-slider"
            min={-10}
            max={10}
            step={0.1}
            value={posY}
            onChange={(e) => onPosYChange(parseFloat(e.target.value))}
          />
          <input
            type="number"
            className="settings-number-input"
            min={-10}
            max={10}
            step={0.1}
            value={posY}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!isNaN(v)) onPosYChange(v);
            }}
          />
        </div>
      </label>
    </div>
  );
}
