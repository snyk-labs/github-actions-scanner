export class Finding {
  constructor(rule, action, job, step, details) {
    this.action = action;
    this.rule = rule;
    this.job = job;
    this.step = step;
    this.details = details;
  }
  async prereport() {
    this.rule.prereport?.(this)
  }
  async forText() {
    const description = await this.rule.description?.(this);
    const permissions = Object.entries(await this.action.permissionsForJob(this.job)).map(([k, v]) => `${k}:${v}`).join(",");
    const secrets = (await this.action.secretsAfter(this.job, this.step)).flatMap(step => Object.values(step.with_secrets || []) + Object.values(step.env_secrets || []));

    return {
      rule: this.rule.id,
      repo: this.action.url,
      subpath: this.action.subpath,
      job: this.job || "none",
      step: this.step || "none",
      description: description,
      permissions: permissions || "none",
      secrets: secrets.length > 0 ? secrets.join(", ") : "none",
      documentation: this.rule.documentation
    }
  }
  async toJSON() {
    return {
      "rule": {
        "id": this.rule.id,
        "documentation": this.rule.documentation,
      },
      "description": await this.rule.description?.(this),
      "details": this.details,
      "source_uri": this.action.url,
      "location": {
        "workflow": this.action.subpath,
        "repo": this.action.repo?.url,
        "job": this.job,
        "step": this.step,
      },
      "context": {
        "permissions": await this.action.permissionsForJob(this.job),
        "conditionals": await this.action.conditionsForJobStep(this.job, this.step),
        "subsequent_secrets": await this.action.secretsAfter(this.job, this.step),
        "triggered_workflows": (await this.action.triggeredWorkflows()).map(action => action.url),
        "used_by": this.action.usedby,
        "triggered_on": await this.action.on(),
        "runs-on": await this.action.runs_on(this.job)
      },
    }
  }
}
