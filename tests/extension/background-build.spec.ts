import {test,expect} from './fixture';

test('built worker registers the opt-in window action and loads reader assets without a dev server',async({app})=>{
  expect(await app.worker.evaluate(()=>chrome.runtime.onMessage.hasListeners())).toBe(true);
  const result=await app.worker.evaluate(async()=>{
    const manifest=chrome.runtime.getManifest();
    const loader=await (await fetch(chrome.runtime.getURL(manifest.background!.service_worker!))).text();
    const html=await (await fetch(chrome.runtime.getURL('src/entrypoints/popup/index.html'))).text();
    return {loader,html,popup:manifest.action?.default_popup};
  });
  expect(result.popup).toBe("src/entrypoints/popup/index.html");
  expect(result.loader).not.toMatch(/localhost|127\.0\.0\.1|@vite/);
  expect(result.html).not.toContain('@vite');
  await expect(app.reader.getByRole('button',{name:'Scan',exact:true})).toBeVisible();
});

test.describe('native toolbar popup', () => {
  test.use({ headed: false });
  test('toolbar popup opens on the source tab and scans through its real UI', async ({ app }, testInfo) => {
    test.setTimeout(30000);
    await app.source.bringToFront();
    // Chrome action popups are CDP targets but Playwright does not expose them
    // as context pages. Attach only to this disposable test profile's popup.
    const cdp = await app.context.newCDPSession(app.source);
    await app.worker.evaluate(() => chrome.action.openPopup());
    const targets = await cdp.send('Target.getTargets');
    const target = targets.targetInfos.find(t => t.url === app.origin + '/src/entrypoints/popup/index.html');
    expect(target).toBeDefined();
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target!.targetId, flatten: false });
    let nextId = 0;
    async function command(method: string, params: Record<string, unknown> = {}): Promise<any> {
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { cdp.off('Target.receivedMessageFromTarget', receive); reject(new Error(method + ' timed out')); }, 5000);
        function receive(event: { sessionId: string; message: string }) {
          const message = JSON.parse(event.message);
          if (event.sessionId !== sessionId || message.id !== id) return;
          clearTimeout(timeout);
          cdp.off('Target.receivedMessageFromTarget', receive);
          if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
        }
        cdp.on('Target.receivedMessageFromTarget', receive);
        cdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) }).catch(reject);
      });
    }
    async function read(expression: string) {
      const response = await command('Runtime.evaluate', { expression, returnByValue: true });
      if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
      return response.result.value;
    }
    async function click(selector: string) {
      const point = await read(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x:r.x+r.width/2, y:r.y+r.height/2 }; })()`);
      await command('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
      await command('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
    }
    await expect.poll(() => read('document.querySelector("footer p")?.textContent')).toMatch(/Ready|Restored/);
    const layout = await read(`(() => {
      const header = document.querySelector('header').getBoundingClientRect();
      const footer = document.querySelector('footer').getBoundingClientRect();
      const content = document.querySelector('.tab-content').getBoundingClientRect();
      return { width:innerWidth, height:innerHeight, scrollWidth:document.body.scrollWidth, headerTop:header.top, footerBottom:footer.bottom, contentHeight:content.height };
    })()`);
    expect(layout.width).toBeGreaterThanOrEqual(360);
    expect(layout.width).toBeLessThanOrEqual(420);
    expect(layout.height).toBeLessThanOrEqual(600);
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.width);
    expect(layout.headerTop).toBeGreaterThanOrEqual(0);
    expect(layout.footerBottom).toBeLessThanOrEqual(layout.height);
    expect(layout.contentHeight).toBeGreaterThanOrEqual(250);
    await click('.btn-scan');
    await expect.poll(() => read('document.querySelector("footer p").textContent')).toContain('Scan complete');
    await click('[role="tab"]:nth-child(2)');
    await expect.poll(() => read('document.querySelectorAll(".segment-card").length')).toBe(1);
    expect(await read('document.querySelector(".segment-card").textContent')).toContain('AI researchers');
    const screenshot = await command('Page.captureScreenshot');
    await testInfo.attach('native-toolbar-popup', { body: Buffer.from(screenshot.data, 'base64'), contentType:'image/png' });
    await testInfo.attach('popup-layout', { body: JSON.stringify(layout, null, 2), contentType:'application/json' });
  });
});
