import { onDirectiveContains } from "./common/utils.mjs";
import { actionSteps } from "../utils.mjs";
import { Finding } from "./common/finding.mjs";

class WorkflowRun {
  static id = "WORKFLOW_RUN"
  static documentation = "https://github.com/snyk/github-actions-scanner#WORKFLOW_RUN"

  static async scan(action) {
    const yamlContent = await action.parsedContent();
    let findings = [];
    if (!onDirectiveContains(yamlContent, 'workflow_run')) {
      return findings;
    }
    for (const [jobKey, job, step, stepidx] of actionSteps(yamlContent)) {
      if (
        step.uses?.includes("actions/checkout") &&
        step.with?.ref?.includes("github.event.workflow_run")
      ) {
        findings.push(new Finding(
          WorkflowRun,
          action,
          jobKey,
          step.name || stepidx,
          {
            'on': yamlContent.on,
            'if': job?.if ? job.if : '',
            'uses': step.uses,
            'with': step.with
          }
        ))
      }
    }
    return findings;
  }
}

export { WorkflowRun as default }
