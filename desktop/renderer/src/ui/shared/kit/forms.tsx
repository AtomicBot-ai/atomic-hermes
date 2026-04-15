import React from "react";
import { MagnifierIcon } from "./icons";

export function TextInput(props: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "password";
  disabled?: boolean;
  autoCapitalize?: string;
  isError?: string;
  autoCorrect?: string;
  spellCheck?: boolean;
  className?: string;
  error?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
  label?: string;
  isSearch?: boolean;
}) {
  const className = `UiInput${props.error ? " UiInput--error" : ""}${props.className ? ` ${props.className}` : ""}${props.isSearch ? ` UiInput--search` : ""}`;
  return (
    <div>
      {props.label && <label className={"UiInputLabel"}>{props.label}</label>}
      <div className={`UiInputWrap ${props.isError ? "UiInputWrapError" : ""}`}>
        {props.isSearch && <MagnifierIcon className="UiInputIcon" />}
        <input
          ref={props.inputRef}
          className={className}
          type={props.type ?? "text"}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          placeholder={props.placeholder}
          disabled={props.disabled}
          autoCapitalize={props.autoCapitalize}
          autoCorrect={props.autoCorrect}
          spellCheck={props.spellCheck}
          aria-invalid={props.error ? true : undefined}
        />
      </div>
      {!props.isSearch && (
        <div className="InputErrorMessageContainer">
          {props.isError && <div className="InputErrorMessage">{props.isError}</div>}
        </div>
      )}
    </div>
  );
}

export function CheckboxRow(props: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
  className?: string;
  error?: boolean;
  disabled?: boolean;
}) {
  const className = `UiCheckRow${props.error ? " UiCheckRow--error" : ""}${props.className ? ` ${props.className}` : ""}`;
  return (
    <label className={className}>
      <input
        type="checkbox"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      <span>{props.children}</span>
    </label>
  );
}

type UiCheckboxProps = {
  checked: boolean;
  label: string;
  onChange: (next: boolean) => void;
};

export function SelectDropdown<T extends string>(props: {
  value: T | null;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string; icon?: string }>;
  placeholder?: string;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div>
      {props.label && <label className="UiInputLabel">{props.label}</label>}
      <div className="UiInputWrap">
        <select
          className="UiInput"
          value={props.value ?? ""}
          onChange={(e) => {
            if (e.target.value) {
              props.onChange(e.target.value as T);
            }
          }}
          disabled={props.disabled}
        >
          {props.placeholder && (
            <option value="" disabled>
              {props.placeholder}
            </option>
          )}
          {props.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function UiCheckbox({ checked, label, onChange }: UiCheckboxProps) {
  return (
    <label className="UiCheckbox">
      <input
        type="checkbox"
        className="UiCheckbox__input"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        className={"UiCheckbox__box" + (checked ? " UiCheckbox__box--checked" : "")}
        aria-hidden
      >
        <svg className="UiCheckbox__check" viewBox="0 0 16 16" focusable="false">
          <path d="M6.6 11.2 3.7 8.3l-1 1 3.9 3.9L13.4 6.4l-1-1z" />
        </svg>
      </span>
      <span className="UiCheckbox__label">{label}</span>
    </label>
  );
}
