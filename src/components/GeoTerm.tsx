import { Tooltip } from "./ui/Tooltip";

/** The one place "GEO" gets defined for readers seeing the term for the first time. */
export function GeoTerm() {
  return (
    <Tooltip label="Generative Engine Optimization: making sure AI assistants like ChatGPT and Claude describe your business accurately.">
      <span className="font-medium">GEO</span>
    </Tooltip>
  );
}
