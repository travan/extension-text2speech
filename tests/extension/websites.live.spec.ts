import {test,expect,scan} from './fixture';

// Public pages only; no personal browser profile or authenticated chat data.
for (const site of [
  {url:'https://developer.mozilla.org/en-US/docs/Web/JavaScript',heading:'JavaScript',keyword:'JavaScript'},
  {url:'https://en.wikipedia.org/wiki/Artificial_intelligence',heading:'Artificial intelligence',keyword:'artificial intelligence'},
  {url:'https://vi.wikipedia.org/wiki/Trí_tuệ_nhân_tạo',heading:'Trí tuệ nhân tạo',keyword:'tri tue nhan tao'},
  {url:'https://cham.love/',heading:'',keyword:'Chạm'},
  {url:'https://web.dev/articles/streams',heading:'',keyword:'streams'},
  {url:'https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Accessibility/What_is_accessibility',heading:'',keyword:'accessibility'},
  {url:'https://www.paulgraham.com/greatwork.html',heading:'',keyword:'work'},
  {url:'https://developer.chrome.com/blog/anchor-positioning-api',heading:'',keyword:'anchor'},
  {url:'https://www.smashingmagazine.com/2025/04/fostering-accessibility-culture/',heading:'Fostering An Accessibility Culture',keyword:'accessibility'},
]) test('live scan and keyword: '+site.url,async({app},testInfo)=>{
  const response=await app.source.goto(site.url,{waitUntil:'domcontentloaded',timeout:45000});
  expect(response?.ok()).toBe(true);
  if(site.heading) await expect(app.source.getByRole('heading',{name:site.heading,exact:true}).first()).toBeVisible({timeout:15000});
  else await expect(app.source.locator('body')).toContainText(site.keyword, {ignoreCase:true});
  // Independent reference: rendered page paragraphs/headings, before scanning.
  const samples=await app.source.locator('p,h1,h2,font').evaluateAll(nodes=>nodes.filter(n=>{
    const r=n.getBoundingClientRect();const s=getComputedStyle(n);
    return r.width>1&&r.height>1&&s.visibility!=='hidden'&&!n.closest('[hidden],[aria-hidden="true"]');
  }).map(n=>(n as HTMLElement).innerText.replace(/\s+/g,' ').trim()).filter(t=>t.length>30).slice(0,12));
  expect(samples.length).toBeGreaterThan(0);
  await app.reader.getByLabel('Scan scope').selectOption('page');
  await app.reader.getByLabel('Topics').fill('');
  await scan(app.reader);
  const texts=await app.reader.locator('.segment-text').allTextContents();
  const all=texts.join(' ').replace(/\s+/g,' ');
  const missing=samples.filter(s=>!all.includes(s));
  await testInfo.attach('public-site-coverage',{body:JSON.stringify({url:site.url,paragraphsChecked:samples.length,missing,total:texts.length},null,2),contentType:'application/json'});
  expect(missing).toEqual([]);
  await app.reader.getByRole('tab',{name:'Settings',exact:true}).click();
  await app.reader.getByLabel('Topics').fill(site.keyword);
  await scan(app.reader);
  expect(await app.reader.locator('.segment-card').count()).toBeGreaterThan(0);
  // A second scenario checks a specific paragraph after scrolling mid-page.
  const candidates=app.source.locator('p,font').filter({visible:true}).filter({hasText:/\S/});
  const count=await candidates.count();
  const target=candidates.nth(Math.floor(count/2));
  await target.evaluate(node => node.scrollIntoView({behavior:'instant',block:'center'}));
  await expect.poll(() => target.evaluate(node => { const r=node.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; })).toBe(true);
  const targetText=(await target.innerText()).replace(/\s+/g,' ').trim();
  expect(targetText.length).toBeGreaterThan(0);
  await app.reader.getByRole('tab',{name:'Settings',exact:true}).click();
  await app.reader.getByLabel('Topics').fill('');
  await app.reader.getByLabel('Scan scope').selectOption('viewport');
  await scan(app.reader);
  const viewportText=(await app.reader.locator('.segment-text').allTextContents()).join(' ').replace(/\s+/g,' ');
  expect(viewportText).toContain(targetText);
  await testInfo.attach('scrolled-paragraph-coverage',{body:JSON.stringify({url:site.url,charactersChecked:targetText.length,scope:'viewport'},null,2),contentType:'application/json'});
});


test('live X public profile: verify post text or record access blocker', async ({app}, testInfo) => {
  const navigationError = await app.source.goto('https://x.com/NASA', {waitUntil:'domcontentloaded',timeout:45000}).then(() => '', error => String(error));
  if (navigationError) {
    await testInfo.attach('x-access-blocker', {body:JSON.stringify({url:'https://x.com/NASA',reason:navigationError}),contentType:'application/json'});
    test.skip(true, 'X public page could not be loaded; live scan remains unverified.');
    return;
  }
  const posts=app.source.locator('[data-testid="tweetText"]');
  const hasPost=await posts.first().waitFor({state:'visible',timeout:15000}).then(()=>true,()=>false);
  if (!hasPost) {
    await testInfo.attach('x-access-blocker', {body:JSON.stringify({url:app.source.url(),title:await app.source.title(),reason:'No visible public post in isolated signed-out browser; this is NOT a verified X scan.'}),contentType:'application/json'});
    await testInfo.attach('x-blocker-screen',{body:await app.source.screenshot(),contentType:'image/png'});
    test.skip(true, 'X did not expose a public post; authenticated X verification remains pending.');
    return;
  }
  const target=posts.first();
  await target.evaluate(node => node.scrollIntoView({behavior:'instant',block:'center'}));
  await expect.poll(() => target.evaluate(node => { const r=node.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; })).toBe(true);
  const expected=(await target.innerText()).replace(/\s+/g,' ').trim();
  await app.reader.getByLabel('Topics').fill('');
  await scan(app.reader);
  expect((await app.reader.locator('.segment-text').allTextContents()).join(' ').replace(/\s+/g,' ')).toContain(expected);
});
