### ❗ **IMPORTANT NOTICE** ❗ ###

This tool was released as part of a research project on Github Actions by the Security Labs team and isn't supported by Snyk products.
For more details, please follow the Area41 [talk](https://www.youtube.com/watch?v=pUa5P7THc3c&amp;index=4) and Snyk [blog](https://snyk.io/blog/exploring-vulnerabilities-github-actions/).

# Github Actions Scanner

Scans your Github Actions for security issues.

## Usage

Run: `npm run start -- [OPTIONS]`.

```
Github Actions Scanner

Options:
  -e, --env <path>                    .env file path. (default: ".env")
  -r, --recurse                       Recurse into referenced actions
  -m, --max-depth <depth>             Max Recursion Depth (default: 5)
  -s, --scan-rules <rule1,rule2,...>  Comma separated list of rules to use, by ID (default: "")
  --output <path>                     Output file path.
  -f, --format <format>               Output format (choices: "json", "text", default: "text")
  -h, --help                          display help for command

Commands:
  list-rules                          List all available rules
  scan-repo [options]                 Scan a single repo
  scan-org [options]                  Scan all repos in an org
  scan-actions [options]              Scan a list of standalone actions from a file
  clone [options]                     Pseudo-fork a repo for testing
  ldpreload-poc [options]             Create a PoC to exploit subsequent steps after command injection with LD_PRELOAD
  help [command]                      display help for command
```

### `list-rules`

```
List all available rules

Options:
  -h, --help  display help for command
```

### `scan-repo`

```
Scan a single repo

Options:
  -u, --url <string>  Github repository URL.
  -h, --help          display help for command
```

### `scan-org`

```
Scan all repos in an org

Options:
  -o, --org <name>  Github org name.
  -h, --help        display help for command
```

### `scan-actions`

```
Scan a list of standalone actions from a file

Options:
  -a, --actions-yaml [actions-yaml-path]  Analyze actions from yaml. (default: "./github-action-repos.yml")
  -h, --help                              display help for command
```


### `clone`

```
Pseudo-fork a repo for testing

Options:
  -u, --url <string>  Github repository URL.
  -h, --help          display help for command
```

### `ldpreload-poc`

```
Create a PoC to exploit subsequent steps after command injection with LD_PRELOAD

Options:
  -c, --command <command>  Command to run from the LD_PRELOAD
  -b, --base64             Encode the code for injection
  -h, --help               display help for command
```

Please provide a `GITHUB_TOKEN` either via `.env` file or env var.

## Rules
### `CMD_EXEC`
**Description:** Dynamic values inserted into a [`run`](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#jobsjob_idstepsrun) (or similar) item using `${{ }}` are not escaped and, if controlled by an attacker, may result in command execution inside the step.

**Mitigation:** 

- Pass the expressions to an action as an argument in the [`with`](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#jobsjob_idstepswith) clause
- Pass the expressions to a [`run`](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#jobsjob_idstepsrun) directive using an intermediate [environmental variable](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#jobsjob_idstepsenv). For more details, please check [Good practices for mitigating script injection attacks](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions#good-practices-for-mitigating-script-injection-attacks).

### `CODE_INJECT`
**Description:** Similar to `CMD_EXEC`, when using the `actions/github-script` action, values inserted using `${{ }}` are not escaped and, if controlled by an attacker, may result in command execution inside the step.

**Mitigation:** Pass the expressions to the action as an argument in the [`with`](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#jobsjob_idstepswith) clause.

### `PWN_REQUEST`
**Description:** An action triggered by `pull_request_target` which additionally performs a checkout of the pull request branch may lead to compromise of specific steps or secrets. `pull_request_target` can be triggered by untrusted external attackers.

**Mitigation:** If accepting actions triggered by unknown third parties, ensure that the pull request branch is not checked out and acted on unsafely (e.g via the use of tooling which acts on the repository, such as `npm install`). If it is necessary to check out the third party code, be very careful to ensure that no steps treat the repository as trusted.

### `UNSAFE_INPUT_ASSIGN`
**Description:** Potentially attacker controlled input is passed by value to a step using `with`. Depending on the contents of the step involved, if these values are not handled with care this may result in further compromise (such as command or code execution in the step).

**Mitigation:** Ensure that all values which may be attacker control are handled with care to ensure that they do not result in further compromise.

### `WORKFLOW_RUN`
**Description:** The identified action is triggered by another action, and performs a checkout of the branch which triggered the original action. This branch may be attacker controlled and therefore this action chain should be reviewed.

**Mitigation:** Ensure that subsequently triggered actions treat untrusted data sources as untrusted, especially when the origin is masked by indirection of the original action.

### `REPOJACKABLE`
**Description:** The identified referenced action may be repojackable. Either the organisation has been renamed or does not exist at all.

**Mitigation:** Ensure that all `uses` items reference present and up-to-date repositories to ensure that they cannot be repojacked if renamed or deleted.

### `UNPINNED_ACTION`
**Description:** The identified action is used (i.e via `uses:`) with a branch or tag reference, rather than a fixed commit. Should the target action repository be compromised this action may therefore be at risk.

**Mitigation:** Ensure that all actions are referenced by a fixed and validated commit hash.

## Writing new rules

To write your own rules, create a new `.mjs` file in the `rules` directory. This file should be written in Javascript and implement a single rule. Inside this file, implement and export a class which includes the following methods and attributes:

```javascript
class MyRule {
    static id = "MY_RULE";
    static documentation = "https://github.com/snyk/github-actions-scanner/blob/main/README.md#MY_RULE"
    
    static async description(finding) {
      // takes a single Finding instance, as defined in finding.mjs. Will always be from those returned by `scan`
      // allows for full context creation of a single line to provide a description for a single finding instance
      return "";
    }
    
    static async prereport(finding) {
      // Optional
      // Perform final modification to a finding of this type once all scans have been completed
      // Useful for looking at other actions in the same repository
    }
    
    static async scan(action) {
      // Takes a single Action instance (defined in actions.mjs) and returns an array of Finding instances (defined in finding.mjs)
      return [
        new Finding(MyRule, action, job_name, step_name_or_id, {"optional": "data"});
      ]
    }
}

export { MyRule as default }
```

### Matching Engine
The `stepMatches` and `evaluteStepRule` functions are provided to assist with creating rules.

`stepMatches` takes an array of individual 'rules' and an action step and returns an array of those rules which match. The rules are objects which can define either full match key:values, match based on regex on the value for a key, and keys not present. Examples to show this in action are as follows:

The following example shows a match for the inclusion of any (denoted by the wildcard '*') secrets in the `env` object for the provided step. The resulting `matches` array wil contain the single matching rule.

```javascript
const RULES = [
  { env: { "*": new RegExp("\\${{\\s*secrets[.]") } }
]

const step = {
  name: 'Secrets test',
  uses: 'nick-invision/retry@943e742917ac94714d2f408a0e8320f2d1fcafcd',
  env: {
    GITHUB_AUTH_TOKEN: '${{ secrets.GITHUB_TOKEN }}',
    GITLAB_AUTH_TOKEN: '${{ secrets.GITLAB_TOKEN }}'
  },
  with: {
    command: 'omitted'
  }
}

const matches = stepMatches(RULES, step);
```

The following rule attempts to ensure that the `env.DOESNTMATCH` key is _not_ present. In this case the resulting `matches` array will be empty.

```javascript
const RULES = [
  { env: { "DOESNTMATCH": undefined } },
]

const step = {
  name: 'DOESNTMATCH test',
  uses: 'nick-invision/retry@943e742917ac94714d2f408a0e8320f2d1fcafcd',
  env: {
    DOESNTMATCH: "true"
  },
  with: {
    command: 'omitted'
  }
}

const matches = stepMatches(RULES, step);
```

The additional function `evaluateStepRule` aids in the further processing of such a match. This function takes a single rule and a single step, and returns the step object only where the rule is specified.

For example, the following rule will attempt to find environmental variables which match the `.INDME` regex. The resultant evaluation will only contain those elements that match the rule, in the same format as the rule itself.

```javascript
const RULE = { env: { "*": new RegExp(".INDME") } };

const step = {
foo: "bar",
env: {
  "abc": "FINDME",
  "def": "notme",
  "ghi": "FINDME"
}
}

const evaluated = evaluateStepRule(RULE, step)

expect(evaluated).toEqual({
"env": {
  "abc": "FINDME",
  "ghi": "FINDME",
}
})
```

A third, optional, parameter can be passed to evaluateStepRule. This parameter is an object which is a subset of the rule object, and can be used to specify the regex match groups to extract in place of the full field. The example below shows extracting the suffix in place of the full environmental variable value. If no value is provided for a specific regex in the object, the full value will be returned. This is useful for displaying the specific line where an injection occurs, or extracting the interpolated variable inside a `${{ }}` item.

```javascript
const RULE = { env: { "*": new RegExp("FINDME(?<suffix>...)") } };

const step = {
    foo: "bar",
    env: {
        "abc": "FINDMEabc",
        "def": "notme",
        "ghi": "FINDMEdef"
    }
}

const evaluated = evaluateStepRule(RULE, step, { env: { "*": "suffix" } })

expect(evaluated).toEqual({
    "env": {
        "abc": "abc",
        "ghi": "def",
    }
})
```
