// The task the agent is given: which task, which scenario, and how much it
// may do without asking. Editable before the run, a plain record during it.
import { useId } from "react";
import { ChoiceGroup, NumberField, Panel } from "@ghostjima/stoa-react";
import { AUTONOMIES, TASK, type Autonomy } from "@ariadne/runner";
import type { Text } from "../text";

export type TaskPanelProps = {
  x: Text;
  seed: number;
  autonomy: Autonomy;
  editable: boolean;
  onSeed: (seed: number) => void;
  onAutonomy: (autonomy: Autonomy) => void;
};

export function TaskPanel({ x, seed, autonomy, editable, onSeed, onAutonomy }: TaskPanelProps) {
  const { t, f } = x;
  const helpId = useId();
  const requests = f.int(TASK.requests);
  if (!editable) {
    return (
      <Panel title={t.task.panel} className="task" level={4}>
        <dl className="facts">
          <div>
            <dt>{t.task.task}</dt>
            <dd>{t.taskName[TASK.code](requests)}</dd>
          </div>
          <div>
            <dt>{t.task.scenario}</dt>
            <dd>{f.id(seed)}</dd>
          </div>
          <div>
            <dt>{t.task.autonomy}</dt>
            <dd>{t.autonomy[autonomy]}</dd>
          </div>
        </dl>
      </Panel>
    );
  }
  return (
    <Panel title={t.task.panel} className="task" level={4}>
      {/* The task is the case's; there is one, so it is said, not chosen. */}
      <p>{t.taskName[TASK.code](requests)}</p>
      <div className="task__fields">
        <NumberField label={t.task.scenario} value={seed} minValue={1} maxValue={9999} step={1} onChange={onSeed} aria-describedby={helpId} />
        <p id={helpId} className="muted task__help">
          {t.task.scenarioHelp}
        </p>
      </div>
      <div className="task__autonomy">
        <ChoiceGroup<Autonomy>
          label={t.task.autonomy}
          description={t.autonomyHelp[autonomy]}
          value={autonomy}
          onChange={onAutonomy}
          choices={AUTONOMIES.map((level) => ({ id: level, label: t.autonomy[level] }))}
        />
      </div>
    </Panel>
  );
}
