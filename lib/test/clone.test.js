import { Git } from '../clone.mjs';
import { statSync } from 'fs';

test("Ensure Git tidies up", () => {
  const G = new Git();

  let stat = statSync(G.directory, {
    throwIfNoEntry: false
  });
  expect(stat).not.toBe(undefined);
  expect(stat.isDirectory()).toBe(true);

  G.cleanup();
  stat = statSync(G.directory, {
    throwIfNoEntry: false
  });
  expect(stat).toBe(undefined);
})

test("Ensure Git can successfully clone", () => {
  const G = new Git();

  let stat = statSync(`${G.directory}/README.md`, {
    throwIfNoEntry: false
  });
  expect(stat).toBe(undefined);

  G.clone("https://github.com/snyk/cli")

  stat = statSync(`${G.directory}/README.md`, {
    throwIfNoEntry: false
  });
  expect(stat).not.toBe(undefined);
  expect(stat.isFile()).toBe(true);

  G.cleanup();
})
