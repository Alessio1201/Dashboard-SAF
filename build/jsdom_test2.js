const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync('/sessions/wonderful-sweet-pascal/mnt/outputs/eSAF_Modello_Interattivo.html', 'utf8');
const errors = [];

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
  url: 'file:///tmp/test.html',
  beforeParse(window) {
    window.URL.createObjectURL = () => 'blob:mock';
    window.URL.revokeObjectURL = () => {};
    window.HTMLCanvasElement.prototype.getContext = () => null;
    window.addEventListener('error', (e) => {
      errors.push('' + (e.error && e.error.stack || e.message));
    });
  }
});

setTimeout(() => {
  const doc = dom.window.document;
  console.log('errors captured:', errors.length);
  errors.forEach(e => console.log('---\n' + e));
  console.log('\n---KPI check---');
  ['k_kerobep','k_bep','k_result','k_lcoh','k_prod','k_capex'].forEach(id => {
    console.log(id + ':', doc.getElementById(id).textContent);
  });
  console.log('\n---chart containers---');
  ['chartPrice','chartCOP','chartCF','chartSaf'].forEach(id => {
    const el = doc.getElementById(id);
    console.log(id, '-> children:', el.children.length, 'innerHTML len:', el.innerHTML.length);
  });
  console.log('\n---simulate slider change (power_mw=500)---');
  const el = doc.getElementById('power_mw');
  el.value = '500';
  el.dispatchEvent(new dom.window.Event('input'));
  console.log('k_capex after change:', doc.getElementById('k_capex').textContent);
  console.log('\n---simulate scenario click AtJ---');
  const btn = Array.from(doc.querySelectorAll('#scenario button')).find(b => b.dataset.v === 'AtJ');
  btn.click();
  console.log('badgeCOP:', doc.getElementById('badgeCOP').textContent);
  process.exit(0);
}, 3000);
