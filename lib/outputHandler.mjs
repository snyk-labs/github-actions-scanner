import { writeFileSync } from 'fs';
import { logger } from './utils.mjs';

function groupBy(array, key) {
  let ret = {};
  for (const item of array) {
    if (!ret.hasOwnProperty(key(item))) ret[key(item)] = [];
    ret[key(item)].push(item);
  }
  return ret;
}

class OutputHandler {
  constructor(options) {
    this.options = options;
  }

  toFile(content) {
    try {
      writeFileSync(
        this.options.output,
        content
      )
    } catch (e) {
      logger.warn(`Failed writing to ${this.options.output}: ${e.message}`);
    }
  }

  toConsole(content) {
    console.log(content)
  }

  async reportFindingsJSON(findings) {
    let formatted = [];
    for (const finding of findings) {
      await finding.prereport();
      formatted.push(await finding.toJSON())
    }

    return JSON.stringify(formatted, null, 2);
  }

  async reportFindingsText(findings) {
    let formatted = [];
    for (const finding of findings) {
      await finding.prereport();
      formatted.push(await finding.forText())
    }

    let text = "";
    for (const [k, repo] of Object.entries(groupBy(formatted, obj => [obj.rule, obj.repo]))) {
      text += `The rule ${repo[0].rule} triggered for ${repo[0].repo}\n`
      text += `  Documentation: ${repo[0].documentation}\n`
      for (const [k, subpath] of Object.entries(groupBy(repo, obj => obj.subpath))) {
        text += `  Workflow: ${subpath[0].subpath}\n`
        for (const [k, job] of Object.entries(groupBy(subpath, obj => obj.job))) {
          text += `    Job: ${job[0].job}\n`;
          for (const [k, step] of Object.entries(groupBy(job, obj => obj.step))) {
            text += `      Step: ${step[0].step}\n`;
            for (const finding of step) {
              text += `        - Description: ${finding.description}\n`;
              text += `          Permissions: ${finding.permissions}\n`;
              text += `          Secrets: ${finding.secrets}\n`;
              text += "\n";
            }
          }
        }
      }
    }

    return text
  }

  async reportFindings(findings) {
    let formatted;
    switch (this.options.format) {
      case "json":
        formatted = await this.reportFindingsJSON(findings);
        break;
      default:
      case "text":
        formatted = await this.reportFindingsText(findings);
        break;
    }

    switch (this.options.output) {
      case undefined:
        this.toConsole(formatted);
        break;
      default:
        this.toFile(formatted);
        break;
    }
  }
}

export { OutputHandler };
