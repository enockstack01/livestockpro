/* Small business-logic rules that the web app currently re-derives inline on
   every page that needs them (Dashboard.jsx/Tasks.jsx/Layout.jsx for overdue
   tasks; Dashboard.jsx/Production.jsx/Finance.jsx/Reports.jsx for "this
   month"). Centralized here so mobile doesn't duplicate the copy-paste, and
   so a future change to either rule only has to happen in one place. */

export function isOverdueTask(task) {
  return Boolean(task && task.due_date && task.status !== 'Completed' && task.due_date < todayIso());
}

export function isThisMonth(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
