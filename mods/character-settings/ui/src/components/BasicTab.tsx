import { useState, useEffect } from "react";

const POS_MIN = -10;
const POS_MAX = 10;
const POS_STEP = 0.1;

interface PositionRowProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
}

function PositionRow({ label, value, onChange }: PositionRowProps) {
  const [inputStr, setInputStr] = useState(String(value));

  useEffect(() => {
    setInputStr(String(value));
  }, [value]);

  function commitValue() {
    const v = parseFloat(inputStr);
    if (!isNaN(v)) {
      onChange(v);
    } else {
      setInputStr(String(value));
    }
  }

  return (
    <label className="settings-label">
      {label}
      <div className="settings-slider-row">
        <input
          type="range"
          className="settings-slider"
          min={POS_MIN}
          max={POS_MAX}
          step={POS_STEP}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
        />
        <input
          type="number"
          className="settings-number-input"
          min={POS_MIN}
          max={POS_MAX}
          step={POS_STEP}
          value={inputStr}
          onChange={(e) => setInputStr(e.target.value)}
          onBlur={commitValue}
          onKeyDown={(e) => { if (e.key === "Enter") commitValue(); }}
        />
      </div>
    </label>
  );
}

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

      <PositionRow label="Position X" value={posX} onChange={onPosXChange} />
      <PositionRow label="Position Y" value={posY} onChange={onPosYChange} />
    </div>
  );
}
