import { Org, Repo, Action } from '../actions.mjs';


test("Validate Repo fromUrl", async () => {
  {
    const R = await Repo.fromUrl("https://github.com/snyk/cli")
    expect(R.owner).toBe("snyk")
    expect(R.repo).toBe("cli")
    expect(R.subpath).toBe(undefined)
    expect(R.ref).toBe("main")
  }
  {
    const R = await Repo.fromUrl("https://github.com/snyk/cli/commit/aaaa")
    expect(R.owner).toBe("snyk")
    expect(R.repo).toBe("cli")
    expect(R.subpath).toBe(undefined)
    expect(R.ref).toBe("aaaa")
  }

})

test("Validate Action.fromUses parsing", async () => {
  const R = await Repo.fromUrl("https://github.com/snyk/cli")

  const A1 = await Action.fromUses(R, "./")
  expect(A1.subpath).toBe("action.yml")

  const A2 = await Action.fromUses(R, "./.github/actions/hello-world-action")
  expect(A2.subpath).toBe(".github/actions/hello-world-action/action.yml")

  const A3 = await Action.fromUses(R, "actions/checkout@v4")
  expect(A3.repo.owner).toBe("actions")
  expect(A3.repo.repo).toBe("checkout")
  expect(A3.repo.ref).toBe("v4")
  expect(A3.subpath).toBe("action.yml")
})

test("Validate Action findOrCreate", async () => {
  const R = await Repo.fromUrl("https://github.com/snyk/cli")

  {
    const A = await Action.fromUses(R, "actions/checkout@v4")
    expect(A.repo.owner).toBe("actions")
    expect(A.repo.repo).toBe("checkout")
    expect(A.repo.ref).toBe("v4")
  }

  const R2 = await Repo.fromUrl("https://github.com/actions/checkout/commit/v4")
  {
    const A = await Action.fromUses(R, "actions/checkout@v4")
    expect(A.repo).toEqual(R2)
  }
})

test("Validate Action.fromUrl", async () => {
  const A = await Action.fromUrl("https://github.com/snyk/cli")
  expect(A.repo.owner).toBe("snyk")
  expect(A.repo.repo).toBe("cli")
  expect(A.repo.ref).toBe("main")
  expect(A.subpath).toBe("action.yml")
});
