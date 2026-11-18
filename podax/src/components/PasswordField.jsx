export default function PasswordField({
  id,
  value,
  onChange,
  revealed,
  onToggleReveal,
  autoComplete,
  minLength,
}) {
  return (
    <div className="password-row">
      <input
        id={id}
        name="password"
        type={revealed ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        required
        minLength={minLength}
        maxLength={4096}
        spellCheck="false"
      />
      <button
        className="secondary-button reveal-button"
        type="button"
        onClick={onToggleReveal}
        aria-pressed={revealed}
      >
        {revealed ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}
