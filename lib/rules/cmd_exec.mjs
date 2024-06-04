import { UNTRUSTED_INPUT } from './common/defs.mjs';
import { Finding } from "./common/finding.mjs";
import { actionSteps, stepMatches, evaluateStepRule } from '../utils.mjs';

const UNTRUSTED_INPUT_RULES = UNTRUSTED_INPUT.map(input => {
  return {
    run: new RegExp(`^(?<line>.*[$]{{[^}]*?(?<src>${input.source}).*?}}.*)$`, "mg")
  }
})

class CmdExec {
  static id = "CMD_EXEC"
  static documentation = "https://github.com/snyk/github-actions-scanner#CMD_EXEC"

  static async description(finding) {
    return `Run line ${finding.details.run_lineno} in the identified step unsafely interpolates ${finding.details.value} into a 'run' directive, which may result in arbitrary command execution`
  }

  static async prereport(finding) {
    if (finding.details.value.startsWith("inputs.")) {
      const key = finding.details.value.slice("inputs.".length);
      const set_by = finding.action.usedby.filter(step => step.with?.[key]).map(step => {
        return {
          ...step,
          with: { [key]: step.with[key] }
        }
      })
      if (set_by.length) {
        finding.details.set_in = set_by
      }
    }
  }

  static async scan(action) {
    const yamlContent = await action.parsedContent();
    let findings = [];
    for (const [jobKey, job, step, stepidx] of actionSteps(yamlContent)) {
      stepMatches(UNTRUSTED_INPUT_RULES, step).forEach(
        rule => {
          const lines = evaluateStepRule(rule, step, { run: "line" });
          const { run: srcs } = evaluateStepRule(rule, step, { run: "src" });
          for (const [idx, line] of lines.run.entries()) {
            findings.push(new Finding(
              CmdExec,
              action,
              jobKey,
              step.name || stepidx,
              {
                "run_lineno": step.run.split("\n").indexOf(line),
                "line": line,
                "value": srcs[idx]
              }
            ))

          }
        }
      )

    }
    return findings;
  }
}
export { CmdExec as default }
