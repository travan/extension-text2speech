import { test, expect, scan } from './fixture';

// Authored structural fixtures, not snapshots of anyone's private feed.
const shells = [
  { name: 'Threads-style div feed', open: '<div role="main"><div>', close: '</div></div>' },
  { name: 'X-style article and tweetText', open: '<main><article data-testid="tweet"><div data-testid="tweetText">', close: '</div></article></main>' },
  { name: 'news article', open: '<main><article>', close: '</article></main>' },
  { name: 'Reddit-style post', open: '<main><shreddit-post><div slot="text-body">', close: '</div></shreddit-post></main>' },
  { name: 'Medium-style article', open: '<main><article><section>', close: '</section></article></main>' },
  { name: 'Vietnamese newspaper', open: '<main><div class="fck_detail">', close: '</div></main>' },
  { name: 'blog prose', open: '<main><div class="prose">', close: '</div></main>' },
];
for (const shell of shells) test(`current view follows scroll: ${shell.name}`, async ({ app }) => {
  await app.source.setContent(`<style>body{margin:0}p{margin:0;padding:20px;height:160px}aside,footer{position:fixed;bottom:0} .spacer{height:1200px}</style>
    <nav>NAV_NOISE</nav>${shell.open}<p>BEFORE_SCROLL should disappear from results after scrolling.</p>
    <div class="spacer"></div><p id="target">TARGET_VISIBLE bài đang xem về công việc mới.</p>
    <div class="spacer"></div><p>AFTER_SCROLL remains outside the current viewport.</p>${shell.close}
    <aside>FOLLOW_SUGGESTIONS</aside><footer>TERMS_AND_PRIVACY</footer>`);
  await app.reader.getByLabel('Topics').fill('');
  await expect(app.reader.getByLabel('Scan scope')).toHaveValue('viewport');
  await scan(app.reader);
  await expect(app.reader.locator('.segments-list')).toContainText('BEFORE_SCROLL');
  await expect(app.reader.locator('.segments-list')).not.toContainText('TARGET_VISIBLE');
  await app.source.locator('#target').scrollIntoViewIfNeeded();
  await scan(app.reader);
  await expect(app.reader.locator('.segments-list')).toContainText('TARGET_VISIBLE');
  for (const excluded of ['BEFORE_SCROLL', 'AFTER_SCROLL', 'TERMS_AND_PRIVACY', 'FOLLOW_SUGGESTIONS', 'NAV_NOISE']) {
    await expect(app.reader.locator('.segments-list')).not.toContainText(excluded);
  }
  await app.reader.getByLabel('Scan scope').selectOption('page');
  await scan(app.reader);
  for (const included of ['BEFORE_SCROLL', 'TARGET_VISIBLE', 'AFTER_SCROLL']) await expect(app.reader.locator('.segments-list')).toContainText(included);
});

test('nested scroll container clips offscreen messages and updates after inner scroll', async ({ app }) => {
  await app.source.setContent('<div id="chat" style="height:180px;overflow:auto"><p>INNER_FIRST</p><div style="height:800px"></div><p id="last">INNER_LAST</p></div><div style="height:900px"></div><p>OUTER_OFFSCREEN</p>');
  await app.reader.getByLabel('Topics').fill('');
  await scan(app.reader);
  await expect(app.reader.locator('.segments-list')).toContainText('INNER_FIRST');
  await expect(app.reader.locator('.segments-list')).not.toContainText('INNER_LAST');
  await app.source.locator('#last').scrollIntoViewIfNeeded();
  await scan(app.reader);
  await expect(app.reader.locator('.segments-list')).toContainText('INNER_LAST');
  await expect(app.reader.locator('.segments-list')).not.toContainText('INNER_FIRST');
  await expect(app.reader.locator('.segments-list')).not.toContainText('OUTER_OFFSCREEN');
});

test('virtualized X-style feed reuses a DOM node without returning the previous post', async ({ app }) => {
  await app.source.setContent('<main><article data-testid="tweet"><div data-testid="tweetText">OLD_POST about science.</div></article></main>');
  await app.reader.getByLabel('Topics').fill('');
  await scan(app.reader);
  await app.source.locator('[data-testid="tweetText"]').evaluate(el => { el.textContent='NEW_POST about language.'; });
  await scan(app.reader);
  await expect(app.reader.locator('.segment-text')).toHaveText('NEW_POST about language.');
});

test('viewport scan in Detail keeps the scope and the keyword filter', async ({ app }) => {
  await scan(app.reader);
  await app.reader.getByRole('button', { name: 'Detail →' }).click();
  await app.reader.getByRole('button', { name:'Scan', exact:true }).click();
  await expect(app.reader.locator('footer p')).toContainText('1/2');
  await expect(app.reader.locator('footer p')).toContainText('Current view');
});

test('visible slotted text survives clipping and hidden slot fallback is excluded', async ({ app }) => {
  await app.source.setContent('<div id="host"><p slot="message">VISIBLE_SLOTTED</p></div>');
  await app.source.locator('#host').evaluate(el => {
    el.attachShadow({mode:'open'}).innerHTML='<div style="height:80px;overflow:hidden"><slot name="message">HIDDEN_FALLBACK</slot><p style="margin-top:500px">SHADOW_OFFSCREEN</p></div>';
  });
  await app.reader.getByLabel('Topics').fill('');
  await scan(app.reader);
  await expect(app.reader.locator('.segments-list')).toContainText('VISIBLE_SLOTTED');
  await expect(app.reader.locator('.segments-list')).not.toContainText('HIDDEN_FALLBACK');
  await expect(app.reader.locator('.segments-list')).not.toContainText('SHADOW_OFFSCREEN');
});

 test('missing visible text can be recovered without changing scope or saved topics', async ({ app }) => {
  await scan(app.reader);
  await expect(app.reader.locator('.segments-list')).not.toContainText('Fresh mangoes');
  await app.reader.getByRole('button', { name: 'Scan this area without topic filter' }).click();
  await expect(app.reader.locator('footer p')).toContainText('No topic filter');
  await expect(app.reader.locator('.segments-list')).toContainText('Fresh mangoes');
  await expect(app.reader.getByLabel('Scan scope')).toHaveValue('viewport');
  await app.reader.getByRole('tab', { name: 'Settings', exact: true }).click();
  await expect(app.reader.getByLabel('Topics')).toHaveValue('AI');
});

test('root overflow does not clip the viewport after document scroll', async ({ app }) => {
  await app.source.setContent('<style>html{overflow-x:hidden}body{margin:0}</style><p>TOP</p><div style="height:1600px"></div><p id="target">ROOT_SCROLL_TARGET</p>');
  await app.source.locator('#target').scrollIntoViewIfNeeded();
  await app.reader.getByLabel('Topics').fill('');
  await scan(app.reader);
  await expect(app.reader.locator('.segments-list')).toContainText('ROOT_SCROLL_TARGET');
  await expect(app.reader.locator('.segment-text')).not.toContainText('TOP');
});
