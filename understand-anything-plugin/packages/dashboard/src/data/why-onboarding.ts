/**
 * OnboardingOverlay "Why mode" — V23 Direction A
 *
 * Adds a 3-step progressive disclosure flow:
 *   Step 1 (How)  — "How do I use this?" — UI Learn pointers
 *   Step 2 (What) — "What does this codebase look like?" — Graph pointers
 *   Step 3 (Why)  — "Why was it built this way?" — Architect persona pointers
 *
 * Existing OnboardingOverlay (a single-step) is preserved by making the
 * overlay data-driven — the steps are now an array. This is non-breaking.
 */
export interface OnboardingStep {
  /** Step number, 1-indexed. */
  step: number;
  /** Short title, uppercase, used as the step pill. */
  title: string;
  /** One-line subtitle shown under the title. */
  subtitle: string;
  /** Body paragraph. */
  body: string;
  /** Suggested UI action the user can take on this step. */
  action: { label: string; persona: string };
}

export const WHY_ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    step: 1,
    title: "How",
    subtitle: "Learn the moving parts.",
    body:
      "Start in the Learn persona. Take the guided tour, click around the " +
      "graph, and read the plain-English summaries. This is the fastest way " +
      "to build a mental model of what lives where.",
    action: { label: "Switch to Learn", persona: "junior" },
  },
  {
    step: 2,
    title: "What",
    subtitle: "See the shape of the system.",
    body:
      "Open the Deep Dive persona and explore the structural graph. " +
      "Notice how layers group files by responsibility, and how the tour " +
      "follows dependencies. This is where you build the map of the territory.",
    action: { label: "Switch to Deep Dive", persona: "experienced" },
  },
  {
    step: 3,
    title: "Why",
    subtitle: "Discover the decisions behind the code.",
    body:
      "Switch to the Architect persona. Each decision has a context, a " +
      "choice, and a list of rejected alternatives — the tradeoffs that " +
      "shaped the system. This is the deepest layer: the reasoning.",
    action: { label: "Switch to Architect", persona: "architect" },
  },
];

/** Pick the persona a step recommends. */
export function recommendedPersona(stepIndex: number): string {
  return WHY_ONBOARDING_STEPS[stepIndex]?.action.persona ?? "junior";
}
