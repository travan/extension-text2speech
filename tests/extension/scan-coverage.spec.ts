import { test, expect, scan } from './fixture';

const cases = [
  {name:'mixed article and div chat', html:'<article><p>AI article contains enough text for the old extractor to accept it.</p></article><div>CHAT_OUTSIDE_ARTICLE</div><h2>Tiêu đề ngắn</h2>', expected:['AI article','CHAT_OUTSIDE_ARTICLE','Tiêu đề ngắn']},
  {name:'long chat bubble with short origin label', html:'<h1>Chat</h1><div role="log"><section><div class="bubble"><p>Nhịp 1/5</p><div class="reading-text">'+('Nội dung hội thoại dài cần được giữ nguyên. '.repeat(100))+'CHAT_FINAL_SENTENCE</div></div></section></div>',expected:['Nhịp 1/5','CHAT_FINAL_SENTENCE']},
  {name:'div-only app and short text',html:'<div><div>Xin chào</div><div>AI</div><div>2026</div><div>Công việc mới</div></div>',expected:['Xin chào','AI','2026','Công việc mới']},
  {name:'translation prose must not be discarded',html:'<p>Bài viết mô tả cách translate văn bản và xem bản dịch tiếng Việt.</p>',expected:['translate','xem bản dịch']},
];
for (const fixture of cases) test('scan coverage: '+fixture.name,async({app})=>{
  await app.source.setContent(fixture.html);
  const result=await app.worker.evaluate(async(tabId)=>chrome.tabs.sendMessage(tabId,{type:'EXTRACT_SEGMENTS',scope:'page',exhaustive:true}),app.tabId);
  expect(result.ok).toBe(true);
  const text=result.segments.map((s:any)=>s.text).join('\n');
  for(const snippet of fixture.expected) expect(text).toContain(snippet);
});
test('scan coverage: exact Vietnamese keyword in a div chat reaches the UI',async({app})=>{
  await app.source.setContent('<div>Công việc mới</div><div>Mua trái cây</div>');
  await app.reader.getByLabel('Topics').fill('cong viec');
  await scan(app.reader);
  await expect(app.reader.locator('.segment-card')).toHaveCount(1);
  await expect(app.reader.locator('.segment-card')).toContainText('Công việc mới');
  await expect(app.reader.locator('.segment-card')).not.toContainText('Mua trái cây');
});

test('scan coverage: open shadow DOM, inline formatting, hidden mirrors and scroll containers',async({app})=>{
  await app.source.setContent('<div style="height:40px;overflow:auto"><p>Đầu khung</p><p style="margin-top:100px">Cuối khung cuộn</p></div><p>Học <strong>trí tuệ</strong> nhân tạo.</p><div hidden>HIDDEN_SECRET</div><p style="opacity:0">TRANSPARENT_SECRET</p><div style="position:absolute;width:1px;height:1px;overflow:hidden">MIRROR_SECRET</div><div id="host"></div>');
  await app.source.evaluate(()=>document.querySelector('#host')!.attachShadow({mode:'open'}).innerHTML='<p>SHADOW_TEXT</p>');
  const result=await app.worker.evaluate(async(tabId)=>chrome.tabs.sendMessage(tabId,{type:'EXTRACT_SEGMENTS',scope:'page'}),app.tabId);
  const text=result.segments.map((s:any)=>s.text).join('\n');
  for(const expected of ['Đầu khung','Cuối khung cuộn','Học trí tuệ nhân tạo.','SHADOW_TEXT']) expect(text).toContain(expected);
  for(const hidden of ['HIDDEN_SECRET','TRANSPARENT_SECRET','MIRROR_SECRET']) expect(text).not.toContain(hidden);
  const shadow=result.segments.find((s:any)=>s.text==='SHADOW_TEXT');
  const full=await app.worker.evaluate(async({tabId,xpath})=>chrome.tabs.sendMessage(tabId,{type:'GET_FULL_SEGMENT_TEXT',xpath}),{tabId:app.tabId,xpath:shadow.xpath});
  expect(full.text).toBe('SHADOW_TEXT');
});

test('scan coverage: different short sibling blocks are not merged and every article paragraph survives',async({app})=>{
  await app.source.setContent('<article><div>FIRST_PARAGRAPH</div><div><p>SECOND_PARAGRAPH</p><p>THIRD_PARAGRAPH</p></div></article><p>ONE</p><p>TWO</p>');
  const result=await app.worker.evaluate(async(tabId)=>chrome.tabs.sendMessage(tabId,{type:'EXTRACT_SEGMENTS',scope:'page'}),app.tabId);
  expect(result.segments.map((s:any)=>s.text)).toEqual(['FIRST_PARAGRAPH SECOND_PARAGRAPH THIRD_PARAGRAPH','ONE','TWO']);
});

test.describe('manual receiver recovery',()=>{
  test.use({manualInjection:true});
  test('scan injects the real bundle into a regular page with no receiver',async({app})=>{
    await app.source.setContent('<p>AI RECOVERED_RECEIVER is visible on this already-open document.</p>');
    await expect(app.worker.evaluate(async(tabId)=>chrome.tabs.sendMessage(tabId,{type:'EXTRACT_SEGMENTS',scope:'page'}),app.tabId)).rejects.toThrow();
    await scan(app.reader);
    await expect(app.reader.locator('.segment-card')).toContainText('RECOVERED_RECEIVER');
  });
});
