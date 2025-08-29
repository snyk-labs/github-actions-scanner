import { clearTimeout, setTimeout } from 'node:timers';
import { get } from 'node:https';
import { extract } from 'tar-stream';
import gunzip from 'gunzip-maybe';
import { inspect } from 'util';
import chalk from 'chalk';
import { join } from 'node:path';
import winston from 'winston';

export const GITHUB_URL_RE = new RegExp("https://github.com/(?<owner>[^/]+)/(?<repo>[^/]+)(/commit/(?<ref>[0-9a-z-.]+))?")
export const ACTION_NAME_REGEX = new RegExp("^(?<org>[^/]*)/(?<action>[^@/]*)(/(?<subPath>[^@]*))?(@(?<ref>.*))?")

const GITHUB_ACTIONS_FILE_MATCH = ['**/action.(yml|yaml)', '.github/actions/**/action.(yml|yaml)', '.github/workflows/*.(yml|yaml)']
const GITHUB_ACTIONS_FILE_REGEX = new RegExp(`^(.github/(actions/.*/action[.]ya?ml|workflows/.*[.]ya?ml)|(.*/)?action[.]ya?ml)$`)

const loggerformat = winston.format.printf(({ level, message, label, timestamp }) => {
  return `${timestamp} ${level}: ${message}`;
});
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.colorize(),
    loggerformat
  ),
  transports: [
    new winston.transports.Console(),
  ]
});

export async function getFilesFromArchive(tgzUrl, maxSize = 5 * 1024 * 1024) {
  const timer = setTimeout(() => {
    logger.warn(chalk.grey('getFilesFromArchive STUCK', tgzUrl, filesToExtract));
  }, 30000);
  timer.unref();

  let chunksSize = 0;
  const result = {
    filesExtracted: {},
    files: [],
    finished: false,
  };

  return new Promise((resolve, reject) => {
    const streamExtractor = extract();

    streamExtractor.on('entry', (header, stream, next) => {
      if (header.type === 'file') {
        const relname = header.name.slice(header.name.indexOf("/") + 1)
        if (relname.match(GITHUB_ACTIONS_FILE_REGEX)) {
          result.filesExtracted[relname] = ""
          stream.on('data', (chunk) => {
            result.filesExtracted[relname] += chunk.toString();
          });
        }
      }

      stream.on('end', () => {
        next();
      });

      stream.resume();
    });

    const request = get(tgzUrl, (response) => {
      if (response.statusCode !== 200) {
        return reject(new Error(`Non 200 response: ${response.statusCode}`));
      }

      response.on('data', (chunk) => {
        chunksSize += chunk.length;

        if (chunksSize >= maxSize) {
          response.destroy();
          request.destroy();
        }
      });

      response.on('end', () => {
        result.finished = true;
      });

      response.pipe(gunzip()).pipe(streamExtractor);
    });

    let error = null;

    request.on('error', (e) => {
      error = e;
    });

    streamExtractor.on('error', (e) => {
      error = e;
    });

    request.on('close', () => {
      if (result.finished) {
        streamExtractor.on('finish', () => {
          error ? reject(error) : resolve(result.filesExtracted);
          clearTimeout(timer);
        });
      } else {
        error ? reject(error) : resolve(result.filesExtracted);
        clearTimeout(timer);
      }
    });
  });
}

export function prettyPrint(data) {
  console.log(inspect(data, { colors: true, depth: null }));
}

export function* actionSteps(yamlContent) {
  if (yamlContent?.jobs) {
    for (const jobKey of Object.keys(yamlContent.jobs)) {
      const job = yamlContent.jobs[jobKey];
      if (job.hasOwnProperty('steps') && Array.isArray(job.steps)) {
        for (const [stepidx, step] of job.steps.entries()) {
          if (step) yield [jobKey, job, step, stepidx]
        }
      }
    }
  }

  if (yamlContent?.runs) {
    if (Array.isArray(yamlContent.runs?.steps)) {
      const steps = yamlContent.runs.steps
      for (const [stepidx, step] of steps.entries()) {
        if (step) yield [yamlContent.name, step, step, stepidx]
      }
    }
  }
}

function recursiveMatcher(rule, input) {
  if (rule instanceof RegExp) {
    rule.lastIndex = 0;
    return rule.exec(input) === null ? false : true;
  } else if (rule instanceof Object) {
    let result = [];
    for (const [key, value] of Object.entries(rule)) {
      if (key == "*") {
        result.push(Object.values(input).some(
          inputvalue => recursiveMatcher(value, inputvalue)
        ))
      } else if (input.hasOwnProperty(key)) {
        result.push(recursiveMatcher(value, input[key]));
      } else if (value === undefined && !input.hasOwnProperty(key)) {
        result.push(true)
      } else {
        result.push(false)
      }
    }
    return result.every(bool => bool)
  } else {
    return rule === input
  }
}

export function stepMatches(rules, step) {
  return rules.filter(
    rule => recursiveMatcher(rule, step)
  )
}

function recursiveEvaluate(rule, step, regexpgroup) {
  if (rule instanceof RegExp) {
    if (regexpgroup === undefined) return step;
    rule.lastIndex = 0;
    let output = [];
    let match;

    // many matches or just one?
    if (rule.flags.includes("g")) {
      while (match = rule.exec(step)) {
        output.push(match.groups?.[regexpgroup] || match[0])
      }
      return output;
    } else {
      match = rule.exec(step);
      return match.groups?.[regexpgroup] || match[0]
    }

  } else if (rule instanceof Object) {
    let result = {};
    for (const [key, value] of Object.entries(rule)) {
      if (key === "*") {
        Object.entries(step).forEach(([k, v]) => {
          if (recursiveMatcher(value, v)) {
            result[k] = recursiveEvaluate(value, v, regexpgroup?.[k] || regexpgroup?.["*"]);
          }
        })
      } else if (step.hasOwnProperty(key)) {
        result[key] = recursiveEvaluate(value, step[key], regexpgroup?.[key] || regexpgroup?.["*"])
      } else {
        result[key] = value;
      }
    }
    return result;
  } else {
    // string or number or something
    return step;
  }
}

export function evaluateStepRule(rule, step, regexpgroup = false) {
  return recursiveEvaluate(rule, step, regexpgroup);
}

//Helper function to find action file with either .yml or .yaml extension
//This function returns the preferred path
export function getActionFilePath(basePath = "") {
  //Prefer .yml over .yaml (Gihubs convention)
  return join(basePath, "action.yml");
}

//Helper function to check if action file exists (fallback -> action.yaml)
export async function findActionFile(repo, basePath = "") {
  await repo.getActions();
  const ymlPath = join(basePath, "action.yml");
  const yamlPath = join(basePath, "action.yaml");

  //Check if action.yml exists in the repository files
  if(repo._actionfiles && repo._actionfiles[ymlPath]) {
    return ymlPath;
  }

  //Check if action.yaml exists in the repository files
  if(repo._actionfiles && repo._actionfiles[yamlPath]) {
    return yamlPath;
  }

  //If neither exists return null
  return null;
}