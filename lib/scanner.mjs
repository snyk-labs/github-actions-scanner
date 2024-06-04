import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from "./utils.mjs";

export class Scanner {
  static async new(options) {
    const s = new Scanner();
    await s.loadRules(options.scanRules);
    s.scanned = 0;
    return s;
  }
  async loadRules(scanRules) {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const rulesDir = path.join(__dirname, 'rules');
    const ruleFiles = fs.readdirSync(rulesDir).filter(file => file.endsWith('.mjs'));

    const rules = await Promise.all(
      ruleFiles.map(file =>
        import(`./rules/${file}`)
      )
    );

    const scanRulesNegate = scanRules ? scanRules.every(rule => rule.startsWith("!")) : false;

    this.rules = rules
      .map(ruleModule => ruleModule.default)
      .filter(rule => rule)
      .filter(rule => {
        if (!scanRules) return true;
        if (scanRulesNegate) {
          return !scanRules.includes("!" + rule.id)
        } else {
          return scanRules.includes(rule.id);
        }
      }
      );
    logger.debug(`The following rules are enabled: ${this.rules.map(rule => rule.id).join(",")}`)
  }

  async scanAction(action) {
    this.scanned += 1;
    let findings = [];
    for (let rule of this.rules) {
      const rulefindings = await rule.scan(action)
      findings.push(...rulefindings);
      try {
      } catch (e) {
        logger.warn(`Failed to scan with ${rule.name} for ${action.repo.owner}/${action.repo.repo}/${action.subpath}@${action.repo.ref}: ${e.message}`)
      }
    }
    return findings;
  }
}
