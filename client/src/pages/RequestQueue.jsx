import Placeholder from './Placeholder.jsx';

export default function RequestQueue() {
  return (
    <Placeholder
      title="Request Queue"
      blurb="Every open enhancement request, escalation, and BI/reporting ask in one list, scored by distinct accounts requesting it, combined ARR, contract tier, age, and deal-blocking status. Currently a hand-run Google Sheet in #bi-priority."
      status="blocked"
      note="Blocked on Jira/Atlassian access — this needs HubSpot tickets AND Jira ESC/enhancement items merged into one score. A HubSpot-only version would exclude the Jira ESC tickets TC escalates most, which is worse than shipping nothing. Connect the Atlassian MCP connector (via `claude mcp` or /mcp in an interactive session), then this is the next thing to build."
    />
  );
}
