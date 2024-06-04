import { actionSteps } from "../../utils.mjs";

export function onDirectiveContains(yamlContent, value) {
  if (yamlContent?.on) {
    switch (typeof (yamlContent.on)) {
      case 'string':
      case 'array':
        if (yamlContent.on.includes(value)) {
          return true;
        }
        break;
      case 'object':
        if (Object.keys(yamlContent.on).includes(value)) {
          return true;
        }
        break;
      default:
        errMSg = `Unsupported yaml on: type ${typeof (yamlContent.on)}`;
        console.error(errMSg);
        throw errMSg;
    }
  }

  return false;
}

export function extractRunDirectives(yamlContent) {
  const runDirectives = [];

  // if (onDirectiveContains(yamlContent, 'pull_request')) {
  //   return runDirectives;
  // }

  for (const [jobKey, job, step, stepid] of actionSteps(yamlContent)) {
    if (step.run) runDirectives.push([jobKey, job, step, stepid, step.run])
  }

  return runDirectives;
}

