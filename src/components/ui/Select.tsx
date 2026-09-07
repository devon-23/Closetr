import { cn } from "@/lib/cn";

type SelectProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  /** Text for the empty/"any" option. Omit to require a selection. */
  placeholder?: string;
  className?: string;
};

/**
 * A native <select> with an inset bevel. Native is both the most
 * accessible option and the most period-correct — the OS dropdown is
 * exactly what an old web form gave you.
 */
export function Select({
  label,
  value,
  onChange,
  options,
  placeholder,
  className,
}: SelectProps) {
  const active = value !== "";
  return (
    <label className={cn("inline-flex flex-col gap-0.5", className)}>
      <span className="label">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "field cursor-pointer py-1 text-[11px] font-bold tracking-wider uppercase",
          active && "text-[#7d2f55]",
        )}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
