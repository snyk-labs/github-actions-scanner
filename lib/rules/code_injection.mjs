import { UNTRUSTED_INPUT } from './common/defs.mjs';
import { Finding } from "./common/finding.mjs";
import { actionSteps, stepMatches, evaluateStepRule } from '../utils.mjs';

const CODE_INJECT_RULE = UNTRUSTED_INPUT.map(input => {
  return {
    uses: new RegExp("actions/github-script"),
    with: { script: new RegExp(`^(?<line>.*[$]{{[^}]*?(?<src>${input.source}).*?}}.*)$`, "mg") }
  }
});

class CodeInject {
  static id = "CODE_INJECT"
  static documentation = "https://github.com/snyk/github-actions-scanner#CODE_INJECT"

  static async description(finding) {
    return `Run line ${finding.details.run_lineno} in the identified step unsafely interpolates ${finding.details.value} into actions/github-script 'script' directive, which may result in arbitrary code execution`
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
      stepMatches(CODE_INJECT_RULE, step).forEach(
        rule => {
          const { with: { script: lines } } = evaluateStepRule(rule, step, { with: { script: "line" } });
          const { with: { script: srcs } } = evaluateStepRule(rule, step, { with: { script: "src" } });
          console.log(step);
          for (const [idx, line] of lines.entries()) {
            findings.push(new Finding(
              CodeInject,
              action,
              jobKey,
              step.name || stepidx,
              {
                "run_lineno": step.with.script.split("\n").indexOf(line),
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
export { CodeInject as default }
