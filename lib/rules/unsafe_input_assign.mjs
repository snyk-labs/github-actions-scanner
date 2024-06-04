import { stepMatches, evaluateStepRule, actionSteps } from "../utils.mjs";
import { UNTRUSTED_INPUT } from "./common/defs.mjs";
import { Finding } from "./common/finding.mjs";

const UNTRUSTED_INPUT_RULES = UNTRUSTED_INPUT.map(input => {
  return {
    with: { "*": new RegExp(`[$]{{[^}]*?(?<src>${input.source})[^}]*}}`, "m") }
  }
})

class UnsafeInputAssign {
  static id = "UNSAFE_INPUT_ASSIGN"
  static documentation = "https://github.com/snyk/github-actions-scanner#UNSAFE_INPUT_ASSIGN"

  static async description(finding) {
    return `The identified step passes the potentially attacker controlled value ${finding.details.value}. This may result in undesirable behaviour`
  }

  static async scan(action) {
    let findings = [];
    for (const [jobKey, job, step, stepidx] of actionSteps(await action.parsedContent())) {
      stepMatches(UNTRUSTED_INPUT_RULES, step).forEach(
        rule => findings.push(new Finding(
          UnsafeInputAssign,
          action,
          jobKey,
          step.name || stepidx,
          {
            "with_item": evaluateStepRule(rule, step).with,
            "value": Object.values(evaluateStepRule(rule, step, { with: { "*": "src" } }).with)
          }
        ))
      )
    }
    return findings;
  }
}

export { UnsafeInputAssign as default }
