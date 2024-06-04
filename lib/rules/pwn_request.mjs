import { onDirectiveContains } from "./common/utils.mjs";
import { evaluateStepRule, stepMatches, actionSteps } from "../utils.mjs";
import { Finding } from "./common/finding.mjs";
import { CWD_COMPROMISABLE_RULES } from "./common/defs.mjs";

class PwnRequest {
  static id = "PWN_REQUEST"
  static documentation = "https://github.com/snyk/github-actions-scanner#PWN_REQUEST"

  static async description(finding) {
    return `The identified job performs a checkout of ${finding.details.ref} which, when triggered by pull_request_target, may be attacker controlled and may result in compromise of the job with higher privileges`
  }

  static async scan(action) {
    const yamlContent = await action.parsedContent();
    let findings = [];
    if (!onDirectiveContains(yamlContent, 'pull_request_target')) {
      return findings
    }

    const PWN_REQUEST_RULES = [
      {
        uses: new RegExp("actions/checkout"),
        with: {
          ref: new RegExp("(?<ref>github.event.pull_request.head[a-zA-Z0-9.-_]*)"),
        }
      },
      {
        uses: new RegExp("actions/checkout"),
        with: {
          ref: new RegExp("(?<ref>refs/pull/.*/merge)"),
        }
      }
    ];
    for (const [jobKey, job, step, stepidx] of actionSteps(yamlContent)) {
      await Promise.all(stepMatches(PWN_REQUEST_RULES, step).map(async rule => {
        const { with: { ref } } = evaluateStepRule(rule, step, { with: { ref: "ref" } });
        const stepid = step.name || stepidx;

        let potentially_compromisable_steps = [];
        const [stepoffset, subsequentsteps] = await action.stepsAfter(jobKey, stepid);
        for (const [subsequentstepidx, subsequentstep] of subsequentsteps.entries()) {
          const matches = stepMatches(CWD_COMPROMISABLE_RULES, subsequentstep);
          if (matches.length > 0) {
            potentially_compromisable_steps.push({
              "step": subsequentstep.name || stepoffset + subsequentstepidx,
              "why": matches.map(rule => evaluateStepRule(rule, subsequentstep, { run: "line" }))
            })
          }

          const localuses = stepMatches([{ uses: new RegExp("^./") }], subsequentstep);
          if (localuses.length > 0) {
            potentially_compromisable_steps.push({
              "step": subsequentstep.name || stepoffset + subsequentstepidx,
              "why": `uses: ${subsequentstep.uses}`
            })
          }
        }

        findings.push(new Finding(
          PwnRequest,
          action,
          jobKey,
          stepid,
          {
            ref,
            potentially_compromisable_steps
          }
        ))

      }))
    }


    return findings;

  }

}

export { PwnRequest as default }
