// Maps harness IDs to user-facing agent names.
// Used throughout the UI to show the active agent's name instead of
// hardcoded "Anton". Import `getAgentLabel(settings)` wherever you
// need the display name for the currently selected harness.

const HARNESS_LABELS = {
  anton: 'Anton',
  hermes: 'Hermes',
};

/** Return the display name for the active harness. */
export function getAgentLabel(settings) {
  const harness = settings?.harness || 'anton';
  return HARNESS_LABELS[harness] || harness.charAt(0).toUpperCase() + harness.slice(1);
}
