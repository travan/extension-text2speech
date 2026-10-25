import { expect, it } from 'vitest';
import { readerWindowBounds } from '../../../src/services/readerWindow';
for (const area of [
  {left:0,top:25,width:1512,height:900},
  {left:-1920,top:0,width:1920,height:1080},
  {left:1512,top:-700,width:1024,height:700},
  {left:0,top:0,width:360,height:480},
]) it('keeps reader inside display '+JSON.stringify(area),()=>{
  for (const source of [area,{left:99999,top:99999,width:2000,height:1200},{left:-9999,top:-9999,width:900,height:800}]) {
    const b=readerWindowBounds(source,area);
    expect(b.left).toBeGreaterThanOrEqual(area.left);
    expect(b.top).toBeGreaterThanOrEqual(area.top);
    expect(b.left+b.width).toBeLessThanOrEqual(area.left+area.width);
    expect(b.top+b.height).toBeLessThanOrEqual(area.top+area.height);
  }
});
