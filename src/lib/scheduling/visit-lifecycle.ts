export const visitStatuses = [
  "unscheduled",
  "tentative",
  "scheduled",
  "confirmed",
  "dispatched",
  "en_route",
  "arrived",
  "in_progress",
  "paused",
  "completed",
  "no_show",
  "canceled"
] as const;

export type VisitStatus = (typeof visitStatuses)[number];

const allowedTransitions: Record<VisitStatus, readonly VisitStatus[]> = {
  unscheduled: ["tentative", "scheduled", "canceled"],
  tentative: ["unscheduled", "scheduled", "confirmed", "canceled"],
  scheduled: ["unscheduled", "tentative", "confirmed", "dispatched", "no_show", "canceled"],
  confirmed: ["scheduled", "dispatched", "no_show", "canceled"],
  dispatched: ["en_route", "arrived", "in_progress", "no_show", "canceled"],
  en_route: ["arrived", "in_progress", "canceled"],
  arrived: ["in_progress", "no_show", "canceled"],
  in_progress: ["paused", "completed", "canceled"],
  paused: ["in_progress", "completed", "canceled"],
  completed: [],
  no_show: ["scheduled", "canceled"],
  canceled: []
};

export function canTransitionVisitStatus(current: VisitStatus, next: VisitStatus) {
  return current === next || allowedTransitions[current].includes(next);
}

export function nextVisitStatuses(current: VisitStatus) {
  return [current, ...allowedTransitions[current]];
}
