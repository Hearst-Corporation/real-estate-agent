import type {
  FormHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

/** Fusionne une classe `ct-*` de base avec une `className` reçue (sans doublons vides). */
function cx(base: string, extra?: string): string {
  return extra ? `${base} ${extra}` : base;
}

/** `<form>` cockpit : pile verticale de champs (classe `ct-form`), props form natives passées telles quelles. */
export function CockpitForm({
  children,
  className,
  ...rest
}: { children: ReactNode; className?: string } & FormHTMLAttributes<HTMLFormElement>) {
  return (
    <form className={cx("ct-form", className)} {...rest}>
      {children}
    </form>
  );
}

/** Bloc de champ `ct-field` : libellé (astérisque si `required`), control (children) et hint discret optionnel. */
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
    <div className="ct-field">
      <label className="ct-field-label" htmlFor={htmlFor}>
        {label}
        {required ? " *" : null}
      </label>
      {children}
      {hint ? <span className="ct-field-label">{hint}</span> : null}
    </div>
  );
}

/** `<input>` cockpit (classe `ct-field-input`), fusionne la `className` reçue. */
export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx("ct-field-input", className)} {...rest} />;
}

/** `<textarea>` cockpit (classe `ct-field-input`), fusionne la `className` reçue. */
export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx("ct-field-input", className)} {...rest} />;
}

/** `<select>` cockpit (classe `ct-field-input`) qui mappe `options` en `<option>`. */
export function Select({
  options,
  className,
  ...rest
}: { options: { value: string; label: string }[] } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx("ct-field-input", className)} {...rest}>
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
