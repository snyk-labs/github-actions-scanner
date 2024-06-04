import { Finding } from "./common/finding.mjs";
import { get } from "https";

function get_statuscode(url) {
  return new Promise((resolve) =>
    get(url, res => resolve(res.statusCode))
  )
}

class Repojackable {
  static id = "REPOJACKABLE"
  static documentation = "https://github.com/snyk/github-actions-scanner#REPOJACKABLE"

  static async description(finding) {
    return `The identified used action may be repojackable due to ${finding.details.reason}`
  }

  static async scan(_action) {
    const findings = [];
    let org;
    let repo;
    if (_action.repo === undefined) {
      org = _action.norepo?.org;
      repo = _action.norepo?.action;
    } else {
      org = _action.repo.owner;
      repo = _action.repo.repo;
    }
    const repostatus = await get_statuscode(`https://github.com/${org}/${repo}`);
    if (repostatus >= 300 && repostatus < 400) {
      findings.push(new Finding(
        Repojackable,
        _action,
        undefined,
        undefined,
        {
          "reason": "repository redirect"
        }
      ))
    } else {
      const orgstatus = await get_statuscode(`https://github.com/${org}`);
      if (orgstatus == 404) {
        findings.push(new Finding(
          Repojackable,
          _action,
          undefined,
          undefined,
          {
            "reason": "organisation not found"
          }
        ))

      }
    }

    return findings;
  }
}

export { Repojackable as default }
