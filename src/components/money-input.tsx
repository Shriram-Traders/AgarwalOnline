/**
 * A rupee amount: a ₹ prefix and the decimal keypad on phones. Plain text rather
 * than type="number", which a stray scroll wheel or arrow key can change.
 */
export function MoneyInput({
  name,
  defaultValue,
  required = true,
}: {
  name: string;
  defaultValue?: number;
  required?: boolean;
}) {
  return (
    <span className="phone-input money-input">
      <span aria-hidden="true">₹</span>
      <input
        name={name}
        inputMode="decimal"
        pattern="[0-9]+(\.[0-9]{1,2})?"
        title="An amount in rupees, like 499 or 499.50"
        autoComplete="off"
        spellCheck={false}
        defaultValue={defaultValue}
        required={required}
      />
    </span>
  );
}
