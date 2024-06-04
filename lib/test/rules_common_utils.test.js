import { stepMatches, evaluateStepRule } from "../utils.mjs";

test("Test recursive rule match", () => {
	const RULES = [
		{ uses: new RegExp("nick-invision/retry"), with: { command: new RegExp("make") } }
	]

	const step = {
		name: 'Run PAT E2E',
		uses: 'nick-invision/retry@943e742917ac94714d2f408a0e8320f2d1fcafcd',
		env: { GITHUB_AUTH_TOKEN: '${{ secrets.GH_AUTH_TOKEN }}' },
		with: {
			max_attempts: 3,
			retry_on: 'error',
			timeout_minutes: 30,
			command: 'make e2e-pat'
		}
	}

	const matches = stepMatches(RULES, step);

	expect(matches.length).toBe(1);
})

test("Test recursive rule match with wildcard", () => {
	const RULES = [
		{ env: { "*": new RegExp("\\${{\\s*secrets[.]") } }
	]

	const step = {
		name: 'Run GITHUB_TOKEN E2E',
		uses: 'nick-invision/retry@943e742917ac94714d2f408a0e8320f2d1fcafcd',
		env: {
			GITHUB_AUTH_TOKEN: '${{ secrets.GITHUB_TOKEN }}',
			GITLAB_AUTH_TOKEN: '${{ secrets.GITLAB_TOKEN }}'
		},
		with: {
			max_attempts: 3,
			retry_on: 'error',
			timeout_minutes: 30,
			command: 'make e2e-gh-token'
		}
	}

	const matches = stepMatches(RULES, step);

	expect(matches.length).toBe(1);
})

test("Test recursive rule match with two rules", () => {
	const RULES = [
		{ env: { "*": new RegExp("\\${{\\s*secrets[.]") } },
		{ with: { DOESNTMATCH: true } }
	]

	const step = {
		name: 'Run GITHUB_TOKEN E2E',
		uses: 'nick-invision/retry@943e742917ac94714d2f408a0e8320f2d1fcafcd',
		env: {
			GITHUB_AUTH_TOKEN: '${{ secrets.GITHUB_TOKEN }}',
			GITLAB_AUTH_TOKEN: '${{ secrets.GITLAB_TOKEN }}'
		},
		with: {
			max_attempts: 3,
			retry_on: 'error',
			timeout_minutes: 30,
			command: 'make e2e-gh-token'
		}
	}

	const matches = stepMatches(RULES, step);

	expect(matches.length).toBe(1);
})

test("Test recursive rule match with nonmatching rule", () => {
	const RULES = [
		{ with: { DOESNTMATCH: true } }
	]

	const step = {
		name: 'Run GITHUB_TOKEN E2E',
		uses: 'nick-invision/retry@943e742917ac94714d2f408a0e8320f2d1fcafcd',
		env: {
			GITHUB_AUTH_TOKEN: '${{ secrets.GITHUB_TOKEN }}',
			GITLAB_AUTH_TOKEN: '${{ secrets.GITLAB_TOKEN }}'
		},
		with: {
			max_attempts: 3,
			retry_on: 'error',
			timeout_minutes: 30,
			command: 'make e2e-gh-token'
		}
	}

	const matches = stepMatches(RULES, step);

	expect(matches.length).toBe(0);
})

test("Test recursive rule match with close but nonmatching rule", () => {
	const RULES = [
		{ env: { "DOESNTMATCH": new RegExp("\\${{\\s*secrets[.]") } },
	]

	const step = {
		name: 'Run GITHUB_TOKEN E2E',
		uses: 'nick-invision/retry@943e742917ac94714d2f408a0e8320f2d1fcafcd',
		env: {
			GITHUB_AUTH_TOKEN: '${{ secrets.GITHUB_TOKEN }}',
			GITLAB_AUTH_TOKEN: '${{ secrets.GITLAB_TOKEN }}'
		},
		with: {
			max_attempts: 3,
			retry_on: 'error',
			timeout_minutes: 30,
			command: 'make e2e-gh-token'
		}
	}

	const matches = stepMatches(RULES, step);

	expect(matches.length).toBe(0);
})

test("Test recursive rule match with not present key", () => {
	const RULES = [
		{ env: { "DOESNTMATCH": undefined } },
	]

	const step = {
		name: 'Run GITHUB_TOKEN E2E',
		uses: 'nick-invision/retry@943e742917ac94714d2f408a0e8320f2d1fcafcd',
		env: {
			GITHUB_AUTH_TOKEN: '${{ secrets.GITHUB_TOKEN }}',
			GITLAB_AUTH_TOKEN: '${{ secrets.GITLAB_TOKEN }}'
		},
		with: {
			max_attempts: 3,
			retry_on: 'error',
			timeout_minutes: 30,
			command: 'make e2e-gh-token'
		}
	}

	const matches = stepMatches(RULES, step);

	expect(matches.length).toBe(1);
})

test("Test recursive rule negative match with not present key", () => {
	const RULES = [
		{ env: { "DOESNTMATCH": undefined } },
	]

	const step = {
		name: 'Run GITHUB_TOKEN E2E',
		uses: 'nick-invision/retry@943e742917ac94714d2f408a0e8320f2d1fcafcd',
		env: {
			GITHUB_AUTH_TOKEN: '${{ secrets.GITHUB_TOKEN }}',
			GITLAB_AUTH_TOKEN: '${{ secrets.GITLAB_TOKEN }}',
			DOESNTMATCH: "true"
		},
		with: {
			max_attempts: 3,
			retry_on: 'error',
			timeout_minutes: 30,
			command: 'make e2e-gh-token'
		}
	}

	const matches = stepMatches(RULES, step);

	expect(matches.length).toBe(0);
})

test("Test rule evalator", () => {
	const RULE = { env: { "*": "FINDME" } };

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
})

test("Test rule evalator with regex", () => {
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
})

test("Test rule evalator with regex groups", () => {
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
})
