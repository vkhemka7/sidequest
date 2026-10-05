import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the page's real event handlers with deterministic hooks and deferred HTTP.
function harness() {
  const slots = [];
  let cursor = 0;
  const requests = [];
  let browserSelection = null;
  let uuidCounter = 1;
  const hooks = {
    useEffect() {},
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [slots[i], (value) => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }];
    },
    useRef(initial) {
      const i = cursor++;
      return slots[i] ??= { current: initial };
    },
  };
  const jsx = (type, props) => ({ type, props });
  const context = {
    exports: {}, console: { error() {} },
    require(name) {
      if (name === 'react') return hooks;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === 'react-markdown') return { default: 'Markdown' };
      throw new Error(name);
    },
    window: {
      innerWidth: 1280,
      getSelection() { return browserSelection; },
    },
    crypto: {
      randomUUID() { return `00000000-0000-4000-8000-${String(uuidCounter++).padStart(12, '0')}`; },
    },
    requestAnimationFrame(callback) { callback(); },
    fetch(url, options) {
      return new Promise((resolve) => requests.push({ url, messages: JSON.parse(options.body).messages, resolve }));
    },
  };
  const compiled = ts.transpileModule(fs.readFileSync('app/page.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: false },
  }).outputText;
  vm.runInNewContext(compiled, context);
  function nodes() {
    cursor = 0;
    const result = [];
    function visit(node) {
      if (Array.isArray(node)) return node.forEach(visit);
      if (!node || typeof node !== 'object') return;
      result.push(node);
      visit(node.props?.children);
    }
    visit(context.exports.default());
    return result;
  }
  const find = (predicate) => nodes().find(predicate);
  return {
    requests,
    type(text) { find(n => n.type === 'textarea').props.onChange({ target: { value: text } }); },
    send(branch = false) {
      return branch
        ? find(n => n.props?.['aria-label'] === 'Ask in a sidequest').props.onClick()
        : find(n => n.type === 'form').props.onSubmit({ preventDefault() {} });
    },
    click(title) { find(n => n.type === 'button' && (n.props.children === title || n.props['aria-label'] === title)).props.onClick(); },
    branchDisabled() { return find(n => n.props?.['aria-label'] === 'Ask in a sidequest').props.disabled; },
    conversationTitle() { return find(n => n.props?.id === 'conversation-heading').props.children; },
    selectAssistant(text) {
      const node = find(n => typeof n.props?.className === 'string' && n.props.className.includes('assistant-markdown'));
      const startContainer = {};
      const endContainer = {};
      browserSelection = {
        rangeCount: 1,
        toString: () => text,
        removeAllRanges() {},
        getRangeAt: () => ({
          startContainer,
          endContainer,
          getBoundingClientRect: () => ({ top: 100, left: 100, width: 200 }),
        }),
      };
      node.props.onMouseUp({ currentTarget: { contains: value => value === startContainer || value === endContainer } });
      find(n => n.type === 'button' && n.props.children === 'Ask about this').props.onClick();
    },
    visible() { return nodes().filter(n => n.type === 'article').map(n => n.props.children.props.children).flat().map(n => typeof n === 'string' ? n : n.props.children); },
    async reply(index, text, ok = true) {
      requests[index].resolve({ ok, json: async () => ok ? { text } : { error: text } });
      await new Promise(resolve => setImmediate(resolve));
    },
  };
}

test('composer branches isolate history and preserve bounded nested context across navigation', async () => {
  const h = harness();
  h.type('First question');
  assert.equal(h.branchDisabled(), true);
  h.send(true);
  assert.equal(h.requests.length, 0);
  h.send();
  await h.reply(0, 'First answer');
  h.type('  Tangent question  ');
  h.send(true);
  assert.deepEqual(h.requests[1].messages.map(m => m.content), ['First question', 'First answer', 'Tangent question']);
  assert.deepEqual(h.visible(), ['Tangent question']);
  h.click('Back to parent');
  assert.deepEqual(h.visible(), ['First question', 'First answer']);
  await h.reply(1, 'Tangent answer');
  assert.deepEqual(h.visible(), ['First question', 'First answer']);
  h.type('Later parent question'); h.send(); await h.reply(2, 'Later parent answer');
  h.click('Tangent question');
  assert.deepEqual(h.visible(), ['Tangent question', 'Tangent answer']);
  h.type('Child follow-up'); h.send(); await h.reply(3, 'Child follow-up answer');
  assert.deepEqual(h.requests[3].messages.map(m => m.content), ['First question', 'First answer', 'Tangent question', 'Tangent answer', 'Child follow-up']);
  h.type('Nested tangent'); h.send(true); await h.reply(4, 'Nested answer');
  assert.deepEqual(h.requests[4].messages.map(m => m.content), ['First question', 'First answer', 'Tangent question', 'Tangent answer', 'Child follow-up', 'Child follow-up answer', 'Nested tangent']);
  h.click('First question'); h.click('Nested tangent');
  assert.deepEqual(h.visible(), ['Nested tangent', 'Nested answer']);
});

test('empty sends are ignored, titles truncate, and failed branch requests retain the question', async () => {
  const h = harness();
  h.type('  '); h.send(); assert.equal(h.requests.length, 0);
  h.type('Parent'); h.send(); await h.reply(0, 'Answer');
  const question = 'A'.repeat(70);
  h.type(question); h.send(true);
  await h.reply(1, 'Request failed', false);
  h.click('Back to parent'); h.click('A'.repeat(48) + '...');
  assert.deepEqual(h.visible(), [question]);
  assert.equal(h.branchDisabled(), true); // Cleared composer after sending.
});

test('assistant Markdown renders required formatting without executing raw HTML', async () => {
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { default: Markdown } = await import('react-markdown');
  const html = renderToStaticMarkup(createElement(Markdown, { skipHtml: true },
    'Paragraph **bold** *italic* `inline`\n\n```js\nconst x = 1;\n```\n\n1. First\n\n- Item\n\n[Link](https://example.com)\n\n<script>alert(1)</script>'));
  for (const tag of ['<p>', '<strong>', '<em>', '<code>', '<pre>', '<ol>', '<ul>', '<a href="https://example.com">']) {
    assert.ok(html.includes(tag), tag);
  }
  assert.ok(!html.includes('<script>'));
});

test('selected assistant text anchors and contextualizes a sidequest without entering visible history', async () => {
  const h = harness();
  h.type('Explain distributed systems'); h.send();
  await h.reply(0, 'Messages can be delayed or lost.');
  h.type('Tell me about replication'); h.send();
  await h.reply(1, 'Replication keeps multiple copies.');
  h.selectAssistant('Messages can be delayed or lost');
  h.type('Why does that make retries dangerous?'); h.send(true);

  assert.deepEqual(h.visible(), ['Why does that make retries dangerous?']);
  assert.deepEqual(h.requests[2].messages.slice(0, 2).map(message => message.content), [
    'Explain distributed systems',
    'Messages can be delayed or lost.',
  ]);
  assert.equal(h.requests[2].messages.length, 3);
  assert.match(h.requests[2].messages[2].content, /referring specifically.*Messages can be delayed or lost.*Why does that make retries dangerous\?/s);

  await h.reply(2, 'Retries can repeat side effects.');
  h.type('How do idempotency keys help?'); h.send();
  assert.match(h.requests[3].messages[2].content, /referring specifically.*Messages can be delayed or lost.*Why does that make retries dangerous\?/s);
  assert.equal(h.requests[3].messages.at(-1).content, 'How do idempotency keys help?');
});

test('a selected reference contextualizes normal send but stays out of visible user text', async () => {
  const h = harness();
  h.type('Explain clocks'); h.send();
  await h.reply(0, 'There is no perfectly shared clock.');
  h.selectAssistant('no perfectly shared clock');
  h.type('Why not?'); h.send();

  assert.deepEqual(h.visible().at(-1), 'Why not?');
  assert.match(h.requests[1].messages.at(-1).content, /referring specifically.*no perfectly shared clock.*Why not\?/s);
});

test('the first root message immediately becomes its title and later messages do not rename it', async () => {
  const h = harness();
  const firstQuestion = 'What happens when a distributed system loses network connectivity for a long time?';
  const expectedTitle = firstQuestion.slice(0, 48).trim() + '...';

  assert.equal(h.conversationTitle(), 'New conversation');
  h.type(firstQuestion); h.send();
  assert.equal(h.conversationTitle(), expectedTitle);
  h.click(expectedTitle);

  await h.reply(0, 'It may become partitioned.');
  h.type('What happens next?'); h.send();
  assert.equal(h.conversationTitle(), expectedTitle);
});
