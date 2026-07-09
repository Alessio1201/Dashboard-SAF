const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync('/sessions/wonderful-sweet-pascal/mnt/outputs/eSAF_Modello_Interattivo.html', 'utf8');

const errors = [];
const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
  url: 'file:///tmp/test.html',
  beforeParse(window) {
    window.addEventListener('error', (e) => {
      errors.push('window error: ' + e.error + ' | ' + (e.error && e.error.stack));
    });
  }
});

// give it a moment for scripts to execute
setTimeout(() => {
  const doc = dom.window.document;
  console.log('errors captured:', errors.length);
  errors.forEach(e => console.log(e));
  console.log('---KPI check---');
  console.log('k_kerobep:', doc.getElementById('k_kerobep') && doc.getElementById('k_kerobep').textContent);
  console.log('k_lcoh:', doc.getElementById('k_lcoh') && doc.getElementById('k_lcoh').textContent);
  console.log('chartCOP innerHTML length:', doc.getElementById('chartCOP') && doc.getElementById('chartCOP').innerHTML.length);
  process.exit(0);
}, 3000);
