// src/Settings.tsx
import { React } from "@vendetta/metro/common";
import { Forms } from "@vendetta/ui/components";
import { storage } from "@vendetta/plugin";

const { FormSection, FormRow, FormSwitch } = Forms;

export default function Settings() {
  const [, forceUpdate] = React.useReducer((x) => ~x, 0);

  return (
    <FormSection title="AppleEmojis">
      <FormRow
        label="Enabled"
        subLabel="render emoji as Apple images"
        trailing={
          <FormSwitch
            value={storage.enabled}
            onValueChange={(v) => {
              storage.enabled = v;
              forceUpdate();
            }}
          />
        }
      />
    </FormSection>
  );
}
