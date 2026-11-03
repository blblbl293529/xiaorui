const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('care.js', 'utf8');
async function scenario(mode) {
  let handler, locate, sends = 0, fixes = 0;
  const nodes = {};
  for (const id of ['care-send','care-status','care-mail','care-address']) nodes[id] = {
    value:'工位', hidden:true, addEventListener:(_,h)=>handler=h,
    removeAttribute(k){delete this[k]}, hasAttribute(k){return Object.hasOwn(this,k)}
  };
  vm.runInNewContext(source, {document:{getElementById:id=>nodes[id]},window:{addEventListener(){}},
    navigator:{geolocation:{getCurrentPosition(ok,no){fixes++; locate=()=>mode==='denied'?no({code:1}):ok({coords:{latitude:30.5,longitude:110.6}})}}},
    setTimeout,clearTimeout,AbortController,fetch:async(url,req)=>{
      sends++; assert.equal(url,'https://formsubmit.co/ajax/1311926106@qq.com');
      const msg=JSON.parse(req.body).message;
      assert.match(msg,/对方关爱了你一下/);assert.match(msg,/30.50000/);assert.match(msg,/110.60000/);
      if(mode==='offline') throw Error('offline');
      return {ok:true,json:async()=>({success:'true'})};
    }});
  assert.equal(fixes,0);const first=handler();await handler();locate();await first;
  assert.equal(fixes,1);assert.equal(sends,mode==='denied'?0:1);
  assert.equal(nodes['care-mail'].hidden,mode!=='offline');
  assert.match(nodes['care-status'].textContent,mode==='denied'?/没有发送/:mode==='offline'?/未能确认/:/已提交/);
}
(async()=>{for(const s of ['denied','offline','accepted']) await scenario(s);console.log('care scenarios passed')})().catch(e=>{console.error(e);process.exitCode=1});
