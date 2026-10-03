"use client";
import { Printer } from "lucide-react";

/** Opens the browser's print dialog, where "Save as PDF" gives the school a file to keep. */
export function PrintButton({ label = "Print or save as PDF" }: { label?: string }) {
  return (
    <button type="button" className="secondary-button print-button" onClick={() => window.print()}>
      <Printer size={18} aria-hidden="true" /> {label}
    </button>
  );
}
