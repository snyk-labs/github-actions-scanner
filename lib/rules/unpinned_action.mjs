import { Finding } from "./common/finding.mjs";
import { ACTION_NAME_REGEX } from '../utils.mjs';

const COMMIT_REGEX = new RegExp("[a-z0-9]{32}")

class UnpinnedAction {
  static id = "UNPINNED_ACTION"
  static documentation = "https://github.com/snyk/github-actions-scanner#UNPINNED_ACTION"

  static async description(finding) {
    return `The action ${finding.details.uses} is used with branch/tag ${finding.details.ref} rather than a pinned commit.`
  }

  static async scan(action) {
    const findings = [];

    for (const [step, usedby] of await action.getAllUses()) {
      if (step.uses.startsWith(".")) continue; // repo-local action
      let { groups: { ref } } = step.uses.match(ACTION_NAME_REGEX)
      if (!ref.match(COMMIT_REGEX)) {
        findings.push(new Finding(
          UnpinnedAction,
          action,
          usedby.job,
          usedby.step,
          {
            uses: step.uses,
            ref
          }
        ))
      }
    }

    return findings;
  }
}

export { UnpinnedAction as default }
