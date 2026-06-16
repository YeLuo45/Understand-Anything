/**
 * Step template system — V3 of Direction C
 *
 * 5 built-in step templates with helpers to validate the `command`
 * field per kind and to provide a sensible default `estimatedSeconds`.
 */
import type { Step, StepKind } from "./recipe-schema.js";

/** Default estimated duration per kind. */
export const DEFAULT_DURATION: Record<StepKind, number> = {
  "file-edit": 5,
  shell: 10,
  git: 3,
  test: 60,
  lint: 30,
};

/** V3 — Validate a step's `command` field against the expected shape. */
export function validateStepCommand(step: Step): string[] {
  const errors: string[] = [];
  switch (step.kind) {
    case "file-edit": {
      // command should reference a variable id (FILE_*) or contain a literal path
      if (!step.command.includes("/") && !step.command.startsWith("FILE_")) {
        errors.push("file-edit step must reference a file path or FILE_* variable");
      }
      break;
    }
    case "shell": {
      // any non-empty string is OK
      break;
    }
    case "git": {
      if (!/^(add|commit|push|pull|checkout|merge|rebase|reset|status|diff|log|fetch|clone)\b/.test(step.command.trim())) {
        errors.push("git step must start with a valid git subcommand");
      }
      break;
    }
    case "test": {
      if (step.command.trim().length < 3) {
        errors.push("test step command is too short");
      }
      break;
    }
    case "lint": {
      if (step.command.trim().length < 3) {
        errors.push("lint step command is too short");
      }
      break;
    }
  }
  return errors;
}

/** V3 — Apply the default estimatedSeconds when not provided. */
export function withDefaultDuration(step: Step): Step {
  if (typeof step.estimatedSeconds === "number") return step;
  return { ...step, estimatedSeconds: DEFAULT_DURATION[step.kind] };
}

/** V3 — Built-in step templates (for the library UI). */
export const STEP_TEMPLATES: ReadonlyArray<Step> = [
  {
    id: "template-shell-echo",
    kind: "shell",
    title: "Print a message",
    command: "echo 'hello'",
  },
  {
    id: "template-test-vitest",
    kind: "test",
    title: "Run vitest",
    command: "pnpm vitest run --reporter=basic",
  },
  {
    id: "template-lint-eslint",
    kind: "lint",
    title: "Run eslint",
    command: "pnpm exec eslint .",
  },
  {
    id: "template-git-commit",
    kind: "git",
    title: "Commit changes",
    command: `commit -m "$MSG"`,
  },
  {
    id: "template-file-edit-insert",
    kind: "file-edit",
    title: "Insert ADR header",
    command: "FILE_PATH",
  },
];