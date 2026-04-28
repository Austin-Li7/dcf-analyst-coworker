import { SettingsProvider } from "@/context/SettingsContext";
import { CFPProvider } from "@/context/CFPContext";
import WizardLayout from "@/components/layout/WizardLayout";

export default function HomePage() {
  return (
    <SettingsProvider>
      <CFPProvider>
        <WizardLayout />
      </CFPProvider>
    </SettingsProvider>
  );
}
