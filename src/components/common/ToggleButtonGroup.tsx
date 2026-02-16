import type { ReactNode } from "react";

export interface ToggleButtonOption<T extends string> {
  value: T;
  label?: string;
  icon?: ReactNode;
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
}

interface ToggleButtonGroupProps<T extends string> {
  options: Array<ToggleButtonOption<T>>;
  values: Array<T>;
  onChange: (values: Array<T>) => void;
  ariaLabel?: string;
  className?: string;
}

export function ToggleButtonGroup<T extends string>({
  options,
  values,
  onChange,
  ariaLabel,
  className,
}: ToggleButtonGroupProps<T>) {
  const rootClass = className ? `toggle-button-group ${className}` : "toggle-button-group";
  const selected = new Set(values);

  return (
    <div className={rootClass} role="group" aria-label={ariaLabel}>
      {options.map((option) => {
        const active = selected.has(option.value);
        const buttonClass = active
          ? "toggle-button-group__button toggle-button-group__button--active"
          : "toggle-button-group__button";
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            aria-label={option.ariaLabel ?? option.title ?? option.label}
            title={option.title}
            className={buttonClass}
            disabled={option.disabled}
            onClick={() => {
              if (option.disabled) return;
              if (active) {
                onChange(values.filter((entry) => entry !== option.value));
              } else {
                onChange([...values, option.value]);
              }
            }}
          >
            {option.icon ?? null}
            {option.label ? option.label : null}
          </button>
        );
      })}
    </div>
  );
}
