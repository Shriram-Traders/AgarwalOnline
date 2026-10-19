import { ActionForm } from "@/components/action-form";
import { MoneyInput } from "@/components/money-input";
import { customizeAction } from "@/lib/settings/actions";
import { DURATIONS, SECTIONS, durationLabel, type FieldSpec, type SectionKey } from "@/lib/settings/shop";

type Field = [name: string, spec: FieldSpec];

/** The fields in the order they are described, split into blocks wherever one names a group. */
function groupsOf(section: SectionKey) {
  const groups: { title?: string; fields: Field[] }[] = [];
  for (const field of Object.entries(SECTIONS[section].fields as Record<string, FieldSpec>)) {
    if (field[1].group || !groups.length) groups.push({ title: field[1].group, fields: [] });
    groups[groups.length - 1].fields.push(field);
  }
  return groups;
}

const Hint = ({ spec }: { spec: FieldSpec }) => (spec.hint ? <small>{spec.hint}</small> : null);

function Input({ name, spec, value }: { name: string; spec: FieldSpec; value: unknown }) {
  switch (spec.kind) {
    case "check":
      return (
        <label className="checkbox-label">
          <input type="checkbox" name={name} defaultChecked={Boolean(value)} />
          {spec.label}
          <Hint spec={spec} />
        </label>
      );
    case "both": {
      const both = value as { en: string; mr: string };
      const Box = spec.long ? "textarea" : "input";
      return (
        <fieldset className="customize-both">
          <legend>
            {spec.label} <Hint spec={spec} />
          </legend>
          <label>
            English
            <Box name={`${name}En`} defaultValue={both.en} placeholder={spec.own?.en} maxLength={spec.max} />
          </label>
          <label>
            मराठी
            <Box name={`${name}Mr`} defaultValue={both.mr} placeholder={spec.own?.mr} maxLength={spec.max} lang="mr" />
          </label>
        </fieldset>
      );
    }
    case "choice":
      return (
        <label>
          {spec.label} <Hint spec={spec} />
          <select name={name} defaultValue={String(value)}>
            {spec.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      );
    case "duration":
      return (
        <label>
          {spec.label} <Hint spec={spec} />
          <select name={name} defaultValue={Number(value)}>
            {DURATIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                Late after {durationLabel(minutes)}
              </option>
            ))}
          </select>
        </label>
      );
    case "number":
      return (
        <label>
          {spec.label} <Hint spec={spec} />
          <input name={name} defaultValue={Number(value)} inputMode="numeric" pattern="[0-9]+" required />
        </label>
      );
    case "money":
      return (
        <label>
          {spec.label} <Hint spec={spec} />
          <MoneyInput name={`${name}Rupees`} defaultValue={Number(value) / 100} />
        </label>
      );
    case "colour":
      return (
        <label className="customize-colour">
          {spec.label} <Hint spec={spec} />
          <input type="color" name={name} defaultValue={String(value)} />
        </label>
      );
    case "text": {
      const Box = spec.long ? "textarea" : "input";
      return (
        <label>
          {spec.label} <Hint spec={spec} />
          <Box
            name={name}
            defaultValue={String(value)}
            placeholder={spec.placeholder}
            maxLength={spec.max}
            required={Boolean(spec.min)}
            autoCapitalize={spec.upper ? "characters" : undefined}
            spellCheck={spec.pattern ? false : undefined}
          />
        </label>
      );
    }
  }
}

/** One Customize section's form, built from its description in lib/settings/shop.ts. */
export function CustomizeForm({
  section,
  values,
  submit,
}: {
  section: SectionKey;
  values: Record<string, unknown>;
  submit: string;
}) {
  return (
    <ActionForm action={customizeAction} submit={submit}>
      <input type="hidden" name="section" value={section} />
      {groupsOf(section).map((group, index) => (
        <fieldset className="form-section" key={group.title ?? index}>
          {group.title && <legend>{group.title}</legend>}
          {group.fields.map(([name, spec]) => (
            <Input key={name} name={name} spec={spec} value={values[name]} />
          ))}
        </fieldset>
      ))}
    </ActionForm>
  );
}
