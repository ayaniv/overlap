import { PALETTE } from './defaultCities';
import { clampWorkEnd, clampWorkStart, isValidHexColor, MAX_WORK_END, MAX_WORK_START, MIN_WORK_END, MIN_WORK_START } from './locationForm';
import styles from './LocationColorAndHoursFields.module.css';

const FALLBACK_SWATCH_COLOR = '#000000';

export type LocationColorAndHoursFieldsProps = {
  // the committed color — drives which swatch reads as active and the native
  // color picker's value
  color: string;
  // what the hex text input currently shows; not always equal to `color` — a
  // caller that buffers incomplete typed hex (rather than applying it live)
  // passes its own draft state here instead
  hexValue: string;
  onHexInputChange: (value: string) => void;
  // swatch click or native color-picker change — always a complete, valid color
  onColorPick: (color: string) => void;
  workStart: number;
  workEnd: number;
  onChangeWorkStart: (value: number) => void;
  onChangeWorkEnd: (value: number) => void;
  // disambiguates the hex/picker aria-labels when several instances of this
  // component can be on screen at once (ManageLocationsList's per-row editors)
  ariaLabelSuffix?: string;
  // same idea as ariaLabelSuffix, but for data-testid values (kebab-case, e.g. `-${location.id}`)
  testIdSuffix?: string;
};

// color (swatches + free hex + native picker) and work-hours controls, shared by
// AddLocationForm's desktop customize step and ManageLocationsList's per-row editor.
// The two differ only in how/when a new value gets committed (AddLocationForm applies
// on submit; ManageLocationsList applies live per keystroke) — that's the caller's
// business, expressed entirely through hexValue/onHexInputChange/onColorPick.
export function LocationColorAndHoursFields({
  color,
  hexValue,
  onHexInputChange,
  onColorPick,
  workStart,
  workEnd,
  onChangeWorkStart,
  onChangeWorkEnd,
  ariaLabelSuffix = '',
  testIdSuffix = '',
}: LocationColorAndHoursFieldsProps) {
  return (
    <>
      <div className={styles.colorRow}>
        {PALETTE.map((swatch) => (
          <button
            key={swatch}
            type="button"
            className={color === swatch ? styles.swatchActive : styles.swatch}
            style={{ background: swatch }}
            aria-label={`Color ${swatch}`}
            aria-pressed={color === swatch}
            data-testid={`color-swatch-${swatch}${testIdSuffix}`}
            onClick={() => onColorPick(swatch)}
          />
        ))}
      </div>
      <div className={styles.hexRow}>
        <input
          className={styles.hexInput}
          type="text"
          value={hexValue}
          onChange={(event) => onHexInputChange(event.target.value)}
          aria-label={`Hex color${ariaLabelSuffix}`}
        />
        <input
          className={styles.colorPicker}
          type="color"
          value={isValidHexColor(color) ? color : FALLBACK_SWATCH_COLOR}
          onChange={(event) => onColorPick(event.target.value)}
          aria-label={`Pick color${ariaLabelSuffix}`}
        />
      </div>
      <div className={styles.hoursRow}>
        <label className={styles.hoursLabel}>
          Start
          <input
            className={styles.hoursInput}
            type="number"
            min={MIN_WORK_START}
            max={MAX_WORK_START}
            value={workStart}
            onChange={(event) => onChangeWorkStart(clampWorkStart(Number(event.target.value), workEnd))}
          />
        </label>
        <label className={styles.hoursLabel}>
          End
          <input
            className={styles.hoursInput}
            type="number"
            min={MIN_WORK_END}
            max={MAX_WORK_END}
            value={workEnd}
            onChange={(event) => onChangeWorkEnd(clampWorkEnd(Number(event.target.value), workStart))}
          />
        </label>
      </div>
    </>
  );
}
