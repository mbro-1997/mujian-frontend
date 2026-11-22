const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "../miniprogram");

function sheetFixture() {
  let definition,
    currentPage,
    resolveRules,
    unsubscribed = false;
  const first = {
    data: { hidden: false },
    setData(v) {
      Object.assign(this.data, v);
    },
  };
  const second = {
    data: { hidden: false },
    setData(v) {
      Object.assign(this.data, v);
    },
  };
  currentPage = { getTabBar: () => first };
  vm.runInNewContext(
    fs.readFileSync(path.join(root, "components/login-sheet/index.js"), "utf8"),
    {
      Component: (o) => {
        definition = o;
      },
      getCurrentPages: () => [currentPage],
      require: (name) => {
        if (name.endsWith("/storage"))
          return {
            capture: () => 1,
            isCurrent: () => true,
            subscribe: () => () => {
              unsubscribed = true;
            },
          };
        if (name.endsWith("/registration"))
          return {
            rules: () =>
              new Promise((r) => {
                resolveRules = r;
              }),
          };
        return {};
      },
    },
  );
  const component = {
    ...definition.methods,
    properties: { visible: false },
    data: { ...definition.data },
    events: [],
    setData(v) {
      Object.assign(this.data, v);
    },
    triggerEvent(name) {
      this.events.push(name);
    },
  };
  definition.lifetimes.attached.call(component);
  return {
    component,
    first,
    second,
    definition,
    visible(value) {
      component.properties.visible = value;
      definition.properties.visible.observer.call(component, value);
    },
    changePage() {
      currentPage = { getTabBar: () => second };
    },
    resolveRules(value) {
      resolveRules(value);
    },
    unsubscribed: () => unsubscribed,
  };
}

for (const name of ["plan", "checklist", "mine"]) {
  test(
    name + " guest entry binds a Boolean and closes without navigation",
    () => {
      const { page, nav: navigations, session } =
        require("./support/planning-fixture.cjs").fixture(name + "/index");
      session.clear();
      const template = fs.readFileSync(
        path.join(root, "pages", name, "index.wxml"),
        "utf8",
      );
      const binding = template.match(
        /<login-sheet\b[^>]*\bvisible="([^"]+)"/,
      )[1];
      // Literal nonempty strings become true for a Boolean component property in WXML.
      const rendered = () =>
        /^\{\{\s*loginVisible\s*\}\}$/.test(binding)
          ? page.data.loginVisible
          : Boolean(binding);
      assert.equal(rendered(), false);
      page.goAccount();
      assert.equal(rendered(), true);
      page.closeLogin();
      assert.equal(rendered(), false);
      assert.equal(navigations.length, 0);
    },
  );
}

test("sheet hides its owner tab bar, restores it on navigation, and never mutates another tab", () => {
  const f = sheetFixture();
  assert.equal(f.first.data.hidden, false);
  f.visible(true);
  assert.equal(f.first.data.hidden, true);
  f.changePage();
  f.definition.pageLifetimes.hide.call(f.component);
  assert.equal(f.first.data.hidden, false);
  f.definition.pageLifetimes.show.call(f.component);
  assert.equal(f.first.data.hidden, true);
  assert.equal(f.second.data.hidden, false);
  f.component.close();
  assert.deepEqual(f.component.events, ["close"]);
  f.visible(false);
  assert.equal(f.first.data.hidden, false);
  f.visible(true);
  f.definition.lifetimes.detached.call(f.component);
  assert.equal(f.first.data.hidden, false);
  assert.equal(f.unsubscribed(), true);
});

test("late rules cannot refill a closed login sheet", async () => {
  const f = sheetFixture();
  f.visible(true);
  f.component.close();
  f.visible(false);
  f.resolveRules({ rules: [1, 2, 3, 4, 5] });
  await new Promise((r) => setImmediate(r));
  assert.equal(f.component.data.rules.length, 0);
  assert.equal(f.component.data.agreed, false);
  assert.equal(f.first.data.hidden, false);
});
