import { GITHUB_URL_RE } from '../utils.mjs';

test("Validate GITHUB_URL_RE", () => {
  const url = "https://github.com/snyk/github-actions-scanner";
  const matched = url.match(GITHUB_URL_RE);

  expect(matched).not.toBe(undefined);
  expect(matched).not.toBe(null);

  expect(matched.groups?.owner).toBe("snyk");
  expect(matched.groups?.repo).toBe("github-actions-scanner");
})

test("Validate GITHUB_URL_RE with ref", () => {
  const url = "https://github.com/snyk/github-actions-scanner/commit/da9d1b0a1dc97dc89cd12569a01636c21900a102";
  const matched = url.match(GITHUB_URL_RE);

  expect(matched).not.toBe(undefined);
  expect(matched).not.toBe(null);

  expect(matched.groups?.owner).toBe("snyk");
  expect(matched.groups?.repo).toBe("github-actions-scanner");
  expect(matched.groups?.ref).toBe("da9d1b0a1dc97dc89cd12569a01636c21900a102");
})
