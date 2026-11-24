const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../miniprogram');

test('registered routes and included templates use the same dictionary dropdown', () => {
  const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json')));
  const visited = new Set();
  function inspect(file) {
    if (visited.has(file)) return;
    visited.add(file);
    const template = fs.readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
    for (const [tag] of template.matchAll(/<picker\b[^>]*>/g)) {
      assert.match(tag, /\bmode="(?:date|time|region)"/, file + ' uses a native dictionary picker');
    }
    for (const [, src] of template.matchAll(/<(?:import|include)\s+src="([^"]+)"/g))
      inspect(path.resolve(path.dirname(file), src));
  }
  for (const route of app.pages) inspect(path.join(root, route + '.wxml'));
});

test('dictionary fields keep the original index, including first option after a placeholder', () => {
  let definition;
  vm.runInNewContext(fs.readFileSync(path.join(root, 'components/dict-select/index.js'), 'utf8'),
    { Component: value => { definition = value; } });
  const data = {}, emitted = [];
  const component = { data, setData: patch => Object.assign(data, patch),
    triggerEvent: (name, detail) => emitted.push([name, detail.value]) };
  const choices = [{ name: '类别一', enabled: true }, { name: '停用类别', enabled: false }];
  const sync = definition.observers['range,rangeKey,value,title,display'].bind(component);
  sync(choices, 'name', 0, '道具类别', '请选择');
  assert.equal(data.selection.index, -1);
  assert.equal(data.groups[0].options[1].disabled, true);
  sync(choices, 'name', 1, '道具类别', '停用类别');
  assert.equal(data.groups[0].options[1].disabled, true);
  sync(choices, 'name', 0, '道具类别', '请选择');
  definition.methods.select.call(component, { detail: { value: 0 } });
  assert.deepEqual(emitted, [['change', 0]]);
  sync(choices, 'name', 0, '道具类别', '类别一');
  assert.equal(data.selection.index, 0);
});

test('return refresh keeps visible pages, trims a shrinking result and discards stale reads', async () => {
  const readWindow = require('../miniprogram/services/read-list-window');
  const pages = [[{ id: 'A' }, { id: 'B' }], [{ id: 'B' }, { id: 'C' }]];
  const read = n => ({ items: pages[n - 1], total: '3' });
  const result = await readWindow(1, 4, read, () => true);
  assert.deepEqual(result.items.map(r => r.id), ['A', 'B', 'C']);
  assert.equal(result.page, 2);
  assert.equal(result.exhausted, true);
  assert.equal(await readWindow(1, 1, read, () => false), null);
});

test('dictionary menu fits the viewport and a late measurement cannot reopen a dismissed menu', () => {
  let component, deliver;
  vm.runInNewContext(fs.readFileSync(path.join(root, 'components/list-filters/index.js'), 'utf8'), {
    Component: value => { component = value; }, wx: {getWindowInfo: () => ({windowHeight: 600})},
  });
  const page = {
    ...component.methods,
    data: {...component.data, filters: [{options: Array(12).fill({})}]},
    setData(patch) { Object.assign(this.data, patch); },
    createSelectorQuery() {
      return { select() { return this; }, boundingClientRect(callback) { deliver = callback; return this; }, exec() {} };
    },
  };
  const tap = {currentTarget: {dataset: {index: 0}}};
  page.toggle(tap);
  deliver({top: 510, bottom: 554});
  assert.equal(page.data.above, true);
  assert.equal(page.data.panelHeight, 252);
  page.close();
  page.toggle(tap);
  deliver({top: 24, bottom: 68});
  assert.equal(page.data.above, false);
  page.close();
  page.toggle(tap);
  page.close();
  deliver({top: 24, bottom: 68});
  assert.equal(page.data.open, -1);
});

test('success feedback requires a receipt and the original active page', async () => {
  const labels = [];
  const deps = {
    './form-error': require('../miniprogram/services/form-error'),
    './success-toast': label => labels.push(label),
    './trading': { message: error => error.message },
    '../session/storage': { capture: () => ({}), isCurrent: () => true },
    './planning-page': {},
  };
  const sandbox = { module: { exports: {} }, require: name => deps[name] };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'services/trading-page.js'), 'utf8'), sandbox);
  const ui = sandbox.module.exports;
  const page = { data: {}, setData(patch) { Object.assign(this.data, patch); } };
  await ui.run(page, async () => null, '取消');
  await ui.run(page, async () => { throw Error('服务器拒绝'); }, '失败');
  assert.equal(page.data.message, '服务器拒绝');
  await ui.run(page, async () => ({ id: 'receipt' }), '已提交');
  let finish;
  const pending = ui.run(page, () => new Promise(resolve => { finish = resolve; }), '已离页');
  ui.hide(page);
  finish({ id: 'late' });
  await pending;
  assert.deepEqual(labels, ['已提交']);
});

test('photo removal waits for one confirmation and checks the current image and session', async () => {
  let definition, finish, modalCount = 0, removed = 0, signedIn = true;
  vm.runInNewContext(fs.readFileSync(path.join(root, 'components/photo-remove/index.js'), 'utf8'), {
    Component: value => { definition = value; },
    require: name => name.includes('session')
      ? { capture: () => 1, isCurrent: () => signedIn }
      : { confirm: () => { modalCount++; return new Promise(resolve => { finish = resolve; }); } },
  });
  const component = { data: { identity: 'one' }, ...definition.methods, triggerEvent: () => removed++ };
  const cancel = component.ask();
  await component.ask();
  assert.equal(modalCount, 1);
  finish(false);
  await cancel;
  assert.equal(removed, 0);
  const replaced = component.ask();
  component.data.identity = 'two';
  finish(true);
  await replaced;
  assert.equal(removed, 0);
  const accepted = component.ask();
  finish(true);
  await accepted;
  assert.equal(removed, 1);
  const expired = component.ask();
  signedIn = false;
  finish(true);
  await expired;
  assert.equal(removed, 1);
});

test('listing uses native keyboard defaults and the remaining forms keep their keyboard settings', () => {
  let count = 0;
  function inspect(dir) {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) inspect(file);
      else if (file.endsWith('.wxml')) {
        const source = fs.readFileSync(file, 'utf8');
        assert.doesNotMatch(source, /formKeyboardInset|bindkeyboardheightchange="fieldKeyboard"/, file);
        for (const [tag] of source.matchAll(/<(?:input|textarea)\b[^>]*>/g)) {
          if (file === path.join(root, 'pages/props/form.wxml'))
            assert.doesNotMatch(tag, /adjust-position|always-embed|cursor-spacing|bindkeyboardheightchange/, file);
          else
            assert.match(tag, /adjust-position="{{false}}"/, file);
          count++;
        }
      }
    }
  }
  inspect(root);
  assert.ok(count > 90);
});
