import { join } from 'node:path';
import { Octokit } from 'octokit';
import chalk from 'chalk';
import { logger, GITHUB_URL_RE, ACTION_NAME_REGEX, getFilesFromArchive, actionSteps, stepMatches, evaluateStepRule } from './utils.mjs';
import { SECRET_RULES } from "./rules/common/defs.mjs";
import YAML from 'yaml';

class Org {
  constructor(name) {
    this.name = name
  }
  async getRepos() {
    if (this._repos !== undefined) return this._repos
    const octokit = new Octokit({ auth: process.env?.GITHUB_TOKEN });
    this._repos = [];
    try {
      for await (const response of octokit.paginate.iterator(
        octokit.rest.repos.listForOrg,
        {
          org: this.name,
          type: "public",
          per_page: 100,
        },
      )) {
        for (const repoData of response.data) {
          if (repoData.archived || repoData.fork) continue;
          const repo = await Repo.fromUrl(repoData.html_url);
          if (repo) this._repos.push(repo)
        }
      };
    } catch (e) {
      logger.warn(`Failed to list repos for org - ${this.name}: ${e.message}`);
      return;
    }

    return this._repos;
  }

  async scan(options, scanner) {
    const repos = await this.getRepos();
    if (repos !== undefined) {
      logger.info(`Got ${chalk.green(repos.length)} repos in ${chalk.cyan(this.name)} to analyze.`)
    }
    let findings = [];
    for (const repo of await this.getRepos()) {
      findings.push(...await repo.scan(options, scanner));
    }
    return findings;
  }
}

class RepoCache {
  static repos = []
  static register(repo) {
    RepoCache.repos.push(repo)
  }
  static find(owner, repo, ref) {
    for (const _repo of RepoCache.repos) {
      if (
        _repo.owner == owner &&
        _repo.repo == repo &&
        _repo.ref == ref
      ) {
        logger.debug(`RepoCache HIT ${_repo.owner}/${_repo.repo}@${_repo.ref}`)
        return _repo
      }
    }
  }
  static async create(owner, repo, ref) {
    ref = ref === undefined ? "" : `/commit/${ref}`
    return await Repo.fromUrl(`https://github.com/${owner}/${repo}${ref}`)
  }
  static async findOrCreate(owner, repo, ref) {
    const found = RepoCache.find(owner, repo, ref)
    if (found !== undefined) return found;
    return await RepoCache.create(owner, repo, ref);
  }
}

class Repo {
  constructor(url, owner, repo, ref, defaultBranch, skip = false) {
    this.url = url;
    this.owner = owner;
    this.repo = repo;
    this.ref = ref || defaultBranch;
    this.skip = skip;

    RepoCache.register(this);
  }

  static async fromUrl(url) {
    let { groups: { owner, repo, ref } } = url.match(GITHUB_URL_RE);
    const octokit = new Octokit({ auth: process.env?.GITHUB_TOKEN });

    let ret;
    try {
      ret = await octokit.rest.repos.get({
        owner: owner,
        repo: repo
      });
    } catch (e) {
      logger.warn(`Failed to get repo details for ${url}: ${e.message}`)
      return;
    }
    const { data: { default_branch: defaultBranch, size: repoSize, stargazers_count: stars } } = ret;
    let skip = repoSize > 1e6;
    if (repoSize > 1e6) {
      logger.info(`${chalk.cyan(url)} size = ${chalk.green(repoSize / 1000)} > 1GB, skipping.`);
    }

    return new Repo(url, owner, repo, ref, defaultBranch, skip);
  }

  async getActions() {
    if (this._actions !== undefined) return this._actions
    this._actions = [];
    const octokit = new Octokit({ auth: process.env?.GITHUB_TOKEN });
    let ret;
    try {
      ret = await octokit.rest.repos.downloadTarballArchive({ owner: this.owner, repo: this.repo, ref: this.ref });
    } catch (e) {
      logger.warn(`Failed to get tarball for ${this.owner}/${this.repo}: ${e.message}`)
      return this._actions;
    }
    const { url: redirectUrl } = ret;
    this._actionfiles = await getFilesFromArchive(redirectUrl);
    for (const filename of Object.keys(this._actionfiles)) {
      this._actions.push(await Action.fromRepoFile(this, filename));
    }
    return this._actions;
  }

  async getFile(path) {
    if (this._actionfiles === undefined) await this.getActions();
    let content = this._actionfiles?.[path];
    return content;
  }

  async scan(options, scanner) {
    const actions = await this.getActions();
    if (actions.length > 0) logger.info(`Got ${actions.length} actions for ${this.owner}/${this.repo}...`)
    let findings = [];
    for (const action of actions) {
      findings.push(...await action.scan(options, scanner));
    }
    return findings;
  }

  // USED FOR REPORTING
  async triggeredBy(actionname) {
    let triggered = [];
    for (const action of await this.getActions()) {
      if ((await action.on())?.workflow_run?.workflows?.includes(actionname)) {
        triggered.push(action);
      }
    }
    return triggered;
  }
  // USED FOR REPORTING END
}

class ActionCache {
  static actions = []
  static register(actions) {
    ActionCache.actions.push(actions)
  }
  static async findOrCreate(repo, path) {
    const found = ActionCache.find(repo, path)
    if (found !== undefined) return found;
    return await ActionCache.create(repo, path);
  }

  static find(repo, path) {
    for (const _action of ActionCache.actions) {
      if (
        _action.repo !== undefined &&
        _action.repo === repo &&
        _action.subpath === path
      ) {
        logger.debug(`ActionCache HIT ${repo.owner}/${repo.repo}/${path}@${repo.ref}`)
        return _action
      }
    }
  }
  static async create(repo, path) {
    return new Action(repo, path);
  }
}

const DEFAULT_ACTION_PERMISSIONS = {
  "restricted": {
    "contents": "read",
    "packages": "read",
    "metadata": "read",
  }
}

class Action {
  constructor(repo, subpath) {
    this.repo = repo; // type Repo
    this.subpath = subpath;
    this.scanned = false;
    this.usedby = [];

    ActionCache.register(this);
  }

  // USED FOR REPORTING
  get url() {
    if (this.repo !== undefined) {
      return `https://github.com/${this.repo.owner}/${this.repo.repo}/blob/${this.repo.ref}/${this.subpath}`
    } else {
      return `https://github.com/${this.norepo.org}/${this.norepo.action}/blob/${this.norepo.ref}/${this.subpath}`
    }
  }

  async permissionsForJob(job) {
    const config = await this.parsedContent();
    if (!config) return [];

    let extras = {};
    if (config.on?.hasOwnProperty("pull_request_target")) {
      extras["repository"] = "write";
    }

    const joblevel = config.jobs?.[job]?.permissions;
    if (joblevel) return { ...joblevel, ...extras };

    const toplevel = config.permissions;
    if (toplevel) return { ...toplevel, ...extras };

    return DEFAULT_ACTION_PERMISSIONS.restricted;
  }

  async conditionsForJobStep(jobname, stepid) {
    const config = await this.parsedContent();
    if (!config) return [];

    const job = config.jobs?.[jobname];
    const action = config?.runs;
    if (!job && !action) return {};
    const steps = job || action;
    const step = typeof stepid === "number" ? steps.steps[stepid] : steps.steps.filter(_step => _step.name == stepid)[0];

    let conditionals = {
      "job": {
        "if": job?.if,
        "needs": job?.needs
      },
      "step": {
        "if": step?.if
      }
    }

    return conditionals;
  }

  async stepsAfter(jobName, stepid) {
    const config = await this.parsedContent();
    if (!config) return [0, []];

    const steps = config.jobs?.[jobName]?.steps || config.runs?.steps;
    if (!steps) return [0, []];

    let aftersteps = [];
    if (typeof stepid === "number") {
      aftersteps = steps.slice(stepid)
    } else {
      let add = false;
      for (const step of steps) {
        if (step.name == stepid) add = true;
        if (add) aftersteps.push(step);
      }
    }
    return [steps.length - aftersteps.length, aftersteps];
  }

  async secretsAfter(jobName, stepid) {
    const config = await this.parsedContent();
    if (!config) return [];

    let secrets = [];
    stepMatches(SECRET_RULES, config).forEach(rule => {
      secrets.push({
        "src": "workflow",
        "with_secrets": evaluateStepRule(rule, config, { "with": { "*": "secret" } }).with,
        "env_secrets": evaluateStepRule(rule, config, { "with": { "*": "secret" } }).env
      })
    })

    for (const [secretkey, secretvalue] of Object.entries(config.jobs?.[jobName]?.secrets || {})) {
      secrets.push({
        "src": "job",
        "key": secretkey,
        "value": secretvalue
      })
    }

    const [stepoffset, subsequentsteps] = await this.stepsAfter(jobName, stepid);
    for (const [stepidx, step] of subsequentsteps.entries()) {
      const id = step.name || stepoffset + stepidx
      stepMatches(SECRET_RULES, step).forEach(rule => {
        secrets.push({
          "src": "step",
          "step": id,
          "with_secrets": evaluateStepRule(rule, step, { "with": { "*": "secret" } }).with,
          "env_secrets": evaluateStepRule(rule, step, { "env": { "*": "secret" } }).env
        })
      })
    }

    return secrets;
  }

  async triggeredWorkflows() {
    const config = await this.parsedContent();
    if (config === undefined) return;

    return this.repo?.triggeredBy(config.name) || []
  }
  async on() {
    const config = await this.parsedContent();

    return config?.on;
  }
  async runs_on(jobname) {
    const config = await this.parsedContent();

    return config?.jobs?.[jobname]?.["runs-on"];

  }
  // USED FOR REPORTING END

  static async fromUrl(url) {
    let { groups: { owner, repo, ref } } = url.match(GITHUB_URL_RE);
    const foundrepo = await RepoCache.findOrCreate(owner, repo, ref);
    if (!foundrepo) return;
    const action = await ActionCache.findOrCreate(foundrepo, "action.yml");
    return action;
  }

  static async fromRepoFile(repo, file) {
    return await ActionCache.findOrCreate(repo, file);
  }

  static async fromUses(repo, uses) {
    if (uses.startsWith('.')) {
      // uses: ./
      // relative to root of repo
      const path = join(uses, "action.yml");
      return await ActionCache.findOrCreate(repo, path);
    } else if (uses.startsWith("docker://")) {
      // docker hub
      logger.warn("uses: docker:// detected but not supported")
    } else {
      // uses: actions/checkout@v4
      let { groups: { org, action, subPath, ref } } = uses.match(ACTION_NAME_REGEX)
      if (subPath === undefined) subPath = "";
      if (ref === undefined) ref = "";
      const repo = await RepoCache.findOrCreate(org, action, ref);
      const newaction = await ActionCache.findOrCreate(repo, join(subPath, "action.yml"));
      if (newaction.repo === undefined) {
        newaction.norepo = {
          uses,
          org,
          action,
          subPath,
          ref
        }
      }
      return newaction;
    }
  }

  get name() {
    if (this.repo === undefined) {
      return this.norepo?.uses;
    } else {
      return `${this.repo.owner}/${this.repo.repo}/${this.subpath}@${this.repo.ref}`;
    }
  }

  async getFileContent() {
    if (this._contents !== undefined) return this._contents
    this._contents = this.repo?.getFile(this.subpath) || "";
    return this._contents;
  }

  async parsedContent() {
    if (this._actionContent !== undefined) return this._actionContent;
    this._actionContent = {};
    try {
      this._actionContent = YAML.parse(await this.getFileContent());
    } catch (error) {
      logger.error(`parsedContent: Error parsing YAML content for ${this.name}: ${error.message}`);
    }
    return this._actionContent;
  }

  async getAllRecursiveActions() {
    if (this._uses !== undefined) return this._uses;

    this._uses = [];
    const uses = await this.getAllUses();
    for (const [step, usedby] of uses) {
      const action = await Action.fromUses(this.repo, step.uses)
      action.usedby.push(usedby)
      this._uses.push(action)
    }
    return this._uses;
  }

  async getAllUses() {
    const contents = await this.getFileContent();
    if (contents === undefined) return [];
    let yamlContent;
    try {
      yamlContent = YAML.parse(contents);
    } catch (error) {
      logger.error(`getAllUses: Error parsing YAML content for ${this.name}: ${error.message}`);
      return this._uses;
    }

    let subactions = [];
    for (const [jobKey, job, step, stepidx] of actionSteps(yamlContent)) {
      if (step?.uses !== undefined) {
        subactions.push([step, {
          url: this.url,
          job: jobKey,
          step: step.name || stepidx,
          with: step.with
        }])
      }
    }

    return subactions;
  }

  async scan(options, scanner, maxDepth = undefined) {
    if (this.skip) {
      logger.debug(`Skipping ${this.repo.owner}/${this.repo.repo}/${this.subpath}@${this.repo.ref}`)
      return [];
    }
    if (this.scanned) {
      logger.debug(`Already scanned ${this.repo.owner}/${this.repo.repo}/${this.subpath}@${this.repo.ref}. Skipping`)
      return [];
    };
    this.scanned = true;

    logger.info(`Scanning ${this.name}...`)

    let findings = [];
    findings.push(...await scanner.scanAction(this));

    if (options.recurse) {
      maxDepth = maxDepth === undefined ? options.maxDepth : maxDepth - 1;
      const subactions = await this.getAllRecursiveActions();
      for (const action of subactions) {
        findings.push(...await action.scan(options, scanner, maxDepth));
      }
    }
    return findings;
  }
}

export { Org, Repo, Action };
