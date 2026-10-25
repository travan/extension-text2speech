import {afterEach,expect,it,vi} from 'vitest';
import {sendTabMessage} from '../../../src/chrome/messaging';
afterEach(()=>{ vi.unstubAllGlobals(); vi.useRealTimers(); });
it('reinjects the configured content bundle and retries without reloading the page',async()=>{
  const sendMessage=vi.fn().mockRejectedValueOnce(new Error('Receiving end does not exist')).mockResolvedValue({ok:true});
  const executeScript=vi.fn().mockResolvedValue([]);
  vi.stubGlobal('chrome',{tabs:{sendMessage},runtime:{getManifest:()=>({content_scripts:[{js:['loader.js']}]})},scripting:{executeScript}});
  expect(await sendTabMessage(7,{type:'EXTRACT_SEGMENTS'})).toEqual({ok:true});
  expect(executeScript).toHaveBeenCalledWith({target:{tabId:7},files:['loader.js']});
});
it('reports restricted pages instead of silently returning empty segments',async()=>{
  vi.stubGlobal('chrome',{tabs:{sendMessage:vi.fn().mockRejectedValue(new Error('Receiving end does not exist'))},runtime:{getManifest:()=>({content_scripts:[{js:['loader.js']}]})},scripting:{executeScript:vi.fn().mockRejectedValue(new Error('Cannot access page'))}});
  await expect(sendTabMessage(8,{})).rejects.toThrow('does not allow extension scanning');
});

it('times out an unresponsive receiver instead of leaving Scan busy indefinitely', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('chrome', { tabs: { sendMessage: vi.fn(() => new Promise(() => {})) } });
  const result = expect(sendTabMessage(9, { type: 'EXTRACT_SEGMENTS' })).rejects.toThrow('did not respond within 15 seconds');
  await vi.advanceTimersByTimeAsync(15000);
  await result;
  expect(vi.getTimerCount()).toBe(0);
});
