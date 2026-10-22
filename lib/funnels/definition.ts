import { z } from "zod";
export const standardFields = [
  "name",
  "value",
  "companyId",
  "contactId",
  "expectedClose",
  "sourceId",
  "notes",
] as const;
export const activityTypes = [
  "task",
  "call",
  "meeting",
  "email",
  "note",
] as const;
export const stageInput = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
  name: z.string().trim().min(1).max(80),
  kind: z.enum(["entry", "normal", "successful", "unsuccessful"]),
  probability: z.number().int().min(0).max(100),
  targetHours: z.number().int().min(0).max(8760),
  responsibleRole: z.enum(["administrator", "manager", "representative"]),
  entryFields: z.array(z.enum(standardFields)).max(7),
  exitFields: z.array(z.enum(standardFields)).max(7),
  entryActivities: z.array(z.enum(activityTypes)).max(5),
  exitActivities: z.array(z.enum(activityTypes)).max(5),
});
export const definitionInput = z.object({
  stages: z.array(stageInput).min(3).max(20),
  transitions: z.array(z.object({ from: z.string(), to: z.string() })).max(100),
  lossReasons: z.array(z.string().trim().min(1).max(100)).min(1).max(20),
});
export type Stage = z.infer<typeof stageInput>;
export type Definition = z.infer<typeof definitionInput>;
export const layoutInput = z.object({
  orientation: z.enum(["horizontal", "vertical"]),
});
export type Layout = z.infer<typeof layoutInput>;
export function orderedTransitions(stages: Stage[]) {
  const active = stages.filter(
    (s) => s.kind === "entry" || s.kind === "normal",
  );
  const won = stages.find((s) => s.kind === "successful");
  const lost = stages.find((s) => s.kind === "unsuccessful");
  return active.flatMap((s, i) => [
    ...(active[i + 1] || won
      ? [{ from: s.id, to: (active[i + 1] ?? won!).id }]
      : []),
    ...(lost ? [{ from: s.id, to: lost.id }] : []),
  ]);
}
export function validateDefinition(input: unknown): Definition {
  const data = definitionInput.parse(input);
  const { stages, transitions } = data;
  const ids = new Set(stages.map((s) => s.id));
  const names = new Set(stages.map((s) => s.name.toLowerCase()));
  if (ids.size !== stages.length || names.size !== stages.length)
    throw new Error("Use unique stage IDs and names.");
  if (
    stages.filter((s) => s.kind === "entry").length !== 1 ||
    stages[0].kind !== "entry" ||
    stages.filter((s) => s.kind === "successful").length !== 1 ||
    stages.filter((s) => s.kind === "unsuccessful").length !== 1
  )
    throw new Error(
      "Use one first entry stage and one terminal of each outcome.",
    );
  const firstTerminal = stages.findIndex(
    (s) => s.kind === "successful" || s.kind === "unsuccessful",
  );
  if (firstTerminal !== stages.length - 2)
    throw new Error("Terminal stages must follow the active stages.");
  if (
    stages.find((s) => s.kind === "successful")!.probability !== 100 ||
    stages.find((s) => s.kind === "unsuccessful")!.probability !== 0
  )
    throw new Error(
      "Successful probability must be 100%; unsuccessful must be 0%.",
    );
  if (
    new Set(data.lossReasons.map((r) => r.toLowerCase())).size !==
    data.lossReasons.length
  )
    throw new Error("Use unique outcome reasons.");
  for (const edge of transitions) {
    const source = stages.find((s) => s.id === edge.from);
    if (
      !source ||
      !ids.has(edge.to) ||
      source.kind === "successful" ||
      source.kind === "unsuccessful" ||
      edge.from === edge.to
    )
      throw new Error(
        "Transition references an unavailable stage or exits a terminal.",
      );
  }
  const expected = orderedTransitions(stages)
    .map((e) => `${e.from}:${e.to}`)
    .sort();
  const actual = transitions.map((e) => `${e.from}:${e.to}`).sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual))
    throw new Error(
      "MVP transitions must follow stage order with unsuccessful exits from each active stage.",
    );
  const reached = new Set([stages[0].id]);
  for (let n = 0; n < stages.length; n++)
    for (const e of transitions) if (reached.has(e.from)) reached.add(e.to);
  if (reached.size !== stages.length)
    throw new Error("Every stage must be reachable from entry.");
  return data;
}
export function standardDefinition(): Definition {
  const stages: Stage[] = [
    {
      id: "lead",
      name: "Lead",
      kind: "entry",
      probability: 10,
      targetHours: 48,
      responsibleRole: "representative",
      entryFields: [],
      exitFields: [],
      entryActivities: [],
      exitActivities: [],
    },
    {
      id: "qualified",
      name: "Qualified",
      kind: "normal",
      probability: 30,
      targetHours: 72,
      responsibleRole: "representative",
      entryFields: [],
      exitFields: [],
      entryActivities: [],
      exitActivities: [],
    },
    {
      id: "proposal",
      name: "Proposal",
      kind: "normal",
      probability: 60,
      targetHours: 120,
      responsibleRole: "manager",
      entryFields: ["expectedClose"],
      exitFields: [],
      entryActivities: [],
      exitActivities: [],
    },
    {
      id: "won",
      name: "Won",
      kind: "successful",
      probability: 100,
      targetHours: 0,
      responsibleRole: "representative",
      entryFields: [],
      exitFields: [],
      entryActivities: [],
      exitActivities: [],
    },
    {
      id: "lost",
      name: "Lost",
      kind: "unsuccessful",
      probability: 0,
      targetHours: 0,
      responsibleRole: "representative",
      entryFields: [],
      exitFields: [],
      entryActivities: [],
      exitActivities: [],
    },
  ];
  return {
    stages,
    transitions: orderedTransitions(stages),
    lossReasons: ["Budget withdrawn", "Not a fit", "No response", "Other"],
  };
}

export function stageTiming(
  enteredAt: Date | string | null,
  asOf: Date | string,
  targetHours: number,
  active: boolean,
) {
  const start = enteredAt ? new Date(enteredAt).getTime() : NaN,
    end = new Date(asOf).getTime();
  const hours =
    Number.isFinite(start) && Number.isFinite(end)
      ? Math.max(0, (end - start) / 3600000)
      : null;
  return {
    hours,
    overdue: active && hours !== null && targetHours > 0 && hours > targetHours,
  };
}
