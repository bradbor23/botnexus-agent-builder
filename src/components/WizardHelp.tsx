import { useState, type ReactNode } from "react";

interface WizardHelpProps {
  summary: ReactNode;
  steps: ReactNode[];
  tip?: ReactNode;
}

/** Collapsible "How this works" panel shown at the top of the wizard. */
export function WizardHelp({ summary, steps, tip }: WizardHelpProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="wizard-help">
      <button
        type="button"
        className="wizard-help__toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">{open ? "▾" : "▸"}</span> How this works
      </button>
      {open && (
        <div className="wizard-help__body">
          <p className="wizard-help__summary">{summary}</p>
          <ol className="wizard-help__steps">
            {steps.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
          {tip && <p className="wizard-help__tip">{tip}</p>}
        </div>
      )}
    </div>
  );
}
