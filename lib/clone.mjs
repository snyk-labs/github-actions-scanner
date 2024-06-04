import chalk from 'chalk';
import { Octokit } from 'octokit';
import { logger, GITHUB_URL_RE } from './utils.mjs';
import { spawnSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'node:path';

class Git {
  constructor(directory) {
    this.directory = mkdtempSync(join(tmpdir(), 'gha-scanner-'));
    this.stdio = logger.level === "debug" ? "inherit" : "pipe";
  }
  clone(repo) {
    spawnSync("git", [
      "clone",
      repo,
      this.directory
    ], {
      shell: false,
      stdio: this.stdio
    })
  }

  setOrigin(origin) {
    spawnSync("git", [
      "-C",
      this.directory,
      "remote",
      "set-url",
      "origin",
      origin
    ], {
      shell: false,
      stdio: this.stdio
    })
  }

  push() {
    spawnSync("git", [
      "-C",
      this.directory,
      "push",
      "--all",
      "origin",
    ], {
      shell: false,
      stdio: this.stdio
    })
  }

  cleanup() {
    rmSync(this.directory, { recursive: true, force: true });
  }

}

class Cloner {
  constructor(repo) {
    let { groups: {
      owner: sourceowner,
      repo: sourcerepo
    } } = repo.match(GITHUB_URL_RE);
    this.sourceowner = sourceowner;
    this.sourcerepo = sourcerepo;

    if (process.env.GITHUB_TOKEN === undefined) {
      throw new Error("GITHUB_TOKEN not defined");
    }
  }

  async login() {
    this.octokit = new Octokit({ auth: process.env?.GITHUB_TOKEN });
    const {
      data: { login },
    } = await this.octokit.rest.users.getAuthenticated();
    this.username = login;
  }

  async createRepo() {
    logger.debug(`[DEBUG] Creating new repo ${chalk.green(this.username)}/${chalk.yellow(this.sourcerepo)}`);
    try {
      await this.octokit.request('POST /user/repos', {
        name: this.sourcerepo,
        description: `Clone of ${this.sourceowner}/${this.sourcerepo}`,
        homepage: 'https://github.com',
        'private': true,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      })
    } catch (err) {
      logger.error(`${err.response?.data?.message} : ${JSON.stringify(err.response?.data?.errors)}`);
      process.exit(1);
    }
  }

  cloneAndPush() {
    let G = new Git()
    logger.debug(`Cloning from ${chalk.cyan(this.sourceowner)}/${chalk.yellow(this.sourcerepo)}`);
    G.clone(`https://github.com/${this.sourceowner}/${this.sourcerepo}`)
    G.setOrigin(`https://${this.username}:${process.env.GITHUB_TOKEN}@github.com/${this.username}/${this.sourcerepo}`)
    logger.debug(`Pushing to ${chalk.green(this.username)}/${chalk.yellow(this.sourcerepo)}`);
    G.push()
    logger.debug(`Cleaning up ${G.directory}`);
    G.cleanup();
  }

  async run() {
    await this.login();
    logger.info(`Cloning ${chalk.cyan(this.sourceowner)}/${chalk.yellow(this.sourcerepo)} to ${chalk.green(this.username)}/${chalk.yellow(this.sourcerepo)}`);

    await this.createRepo();
    this.cloneAndPush();
    logger.info(`Repo cloned to https://github.com/${this.username}/${this.sourcerepo}`);
  }
}
export { Cloner, /* for testing */ Git };
