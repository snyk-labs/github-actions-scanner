import { Finding } from "./common/finding.mjs";

class TestRule {
  static id = "TEST_RULE"
  static documentation = "https://github.com/snyk/github-actions-scanner#TEST_RULE"

  static async description(finding) {
    return `This is a test rule`
  }

  static async scan(action) {
    const yamlContent = await action.parsedContent();
    const findings = [];
    if (yamlContent?.on?.TEST) {
      findings.push(new Finding(
        TestRule,
        action,
        undefined,
        undefined
      ))
    }

    return findings;
  }
}

export { TestRule as default }
