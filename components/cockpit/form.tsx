import type {
  FormHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

/** Fusionne une classe de base avec une `className` reçue (sans doublons vides). */
function cx(base: string, extra?: string): string {
  return extra ? `${base} ${extra}` : base;
}

const FIELD_INPUT =
  "w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-400/50 focus:outline-none";

/** `<form>` cockpit : pile verticale de champs, props form natives passées telles quelles. */
export function CockpitForm({
  children,
  className,
  ...rest
}: { children: ReactNode; className?: string } & FormHTMLAttributes<HTMLFormElement>) {
  return (
    <form className={cx("flex flex-col gap-4", className)} {...rest}>
      {children}
    </form>
  );
}

/** Bloc de champ : libellé (astérisque si `required`), control (children) et hint discret optionnel. */
export function Field({
  label,
  htmlFor,
  hint,
  required,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-slate-400" htmlFor={htmlFor}>
        {label}
        {required ? " *" : null}
      </label>
      {children}
      {hint ? <span className="text-xs text-slate-500">{hint}</span> : null}
    </div>
  );
}

/** `<input>` cockpit, fusionne la `className` reçue. */
export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(FIELD_INPUT, className)} {...rest} />;
}

/** `<textarea>` cockpit, fusionne la `className` reçue. */
export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(FIELD_INPUT, className)} {...rest} />;
}

/** `<select>` cockpit qui mappe `options` en `<option>`. */
export function Select({
  options,
  className,
  ...rest
}: { options: { value: string; label: string }[] } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(FIELD_INPUT, className)} {...rest}>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

/** `TextInput` configuré pour un montant en euros (`type="number"`, `inputMode="decimal"`, `min={0}` par défaut). */
export function MoneyInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <TextInput type="number" inputMode="decimal" min={0} {...props} />;
}
