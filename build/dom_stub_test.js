// Minimal DOM/Plotly stub to sanity-check the extracted UI script for runtime errors,
// and specifically to isolate slider->label id mismatches (the root cause of the WACC bug).
const elements = {};
function makeEl(id) {
  if (!elements[id]) {
    elements[id] = {
      id, value: '', textContent: '', className: '', disabled: false, style: {},
      dataset: {}, classList: { add(){}, remove(){}, toggle(){}, contains(){return false;} },
      _listeners: {},
      addEventListener(evt, fn) { this._listeners[evt] = this._listeners[evt] || []; this._listeners[evt].push(fn); },
      dispatch(evt) { (this._listeners[evt]||[]).forEach(fn=>fn({target:this})); }
    };
  }
  return elements[id];
}

// Pre-seed every input element referenced by SLIDER + electrolyzer fields with sane defaults,
// mirroring the <input value="..."> attributes in template.html.
const seedValues = {
  power_mw:350, hours:8000, roe:15, x_d:70, dr:4, tax:29, infl:2,
  ee:107.2, cc:100, brent:76.794, cambio:0.95, ets1:100, ets2:50,
  diff_nafta:0, diff_kero:17, diff_diesel:21.5, refuel:1118,
  fossil_price:900, hefa_price:2200
};
Object.keys(seedValues).forEach(id => { makeEl(id).value = String(seedValues[id]); });

global.document = {
  getElementById: (id) => makeEl(id),
  querySelectorAll: (sel) => {
    if (sel === '#weType button') return ['AEL','PEM','SOE'].map(v => { const e = makeEl('weTypeBtn_'+v); e.dataset.v = v; return e; });
    if (sel === '#calcMode button') return ['bep','irr'].map(v => { const e = makeEl('calcModeBtn_'+v); e.dataset.v = v; return e; });
    return [];
  },
  documentElement: {}
};
global.window = { addEventListener: () => {} };
global.getComputedStyle = () => ({
  getPropertyValue: (v) => ({
    '--fossil':'#9aa4b2', '--ets':'#4caf50', '--red':'#e05252', '--refuel':'#3b82f6',
    '--accent':'#3ba6ff', '--accent2':'#5ee0b5', '--text':'#e8edf3', '--text-dim':'#93a2b8'
  }[v] || '#000000')
});
global.console.warn = (...args) => console.log('[WARN]', ...args); // surface missing-label warnings

let plotCalls = 0;
global.Plotly = {
  react: (id, traces) => {
    plotCalls++;
    traces.forEach(t => {
      (t.y||[]).concat(t.x||[]).forEach(v => {
        if (typeof v === 'number' && !isFinite(v)) throw new Error('Non-finite value in trace for chart '+id);
      });
    });
  },
  Plots: { resize: () => {} }
};

const src = require('fs').readFileSync(__dirname + '/extracted.js', 'utf8');

const testCode = `
console.log('OK - script executed without throwing. Plotly.react calls:', plotCalls, '(expect 4: price, cashflow, saf, cop)');
console.log('Initial WACC->DF line:', document.getElementById('v_waccdf').textContent, 'expect 6.49% -> 8.62%');

function setAndFire(id, value){
  const el = document.getElementById(id);
  el.value = String(value);
  (el._listeners.input||[]).forEach(fn=>fn({target:el}));
}

// --- Isolate the reported bug: change ONLY x_d (quota debito), nothing else ---
const waccBefore = document.getElementById('v_waccdf').textContent;
setAndFire('x_d', 20);
const waccAfterXD = document.getElementById('v_waccdf').textContent;
console.log('WACC before x_d change:', waccBefore, ' after x_d=20%:', waccAfterXD, '(MUST differ)');
if (waccBefore === waccAfterXD) throw new Error('BUG STILL PRESENT: WACC did not update when X_D changed');

// --- Isolate power_mw -> CAPEX + productivity propagation ---
const capexBefore = document.getElementById('k_capex').textContent;
const prodBefore = document.getElementById('k_prod').textContent;
setAndFire('power_mw', 500);
const capexAfter = document.getElementById('k_capex').textContent;
const prodAfter = document.getElementById('k_prod').textContent;
console.log('CAPEX before power=500MW:', capexBefore, ' after:', capexAfter, '(MUST differ)');
console.log('Produttivita before:', prodBefore, ' after:', prodAfter, '(MUST differ)');
if (capexBefore === capexAfter) throw new Error('BUG: CAPEX did not change with power_mw');
if (prodBefore === prodAfter) throw new Error('BUG: produttivita did not change with power_mw');

// --- new commodity sliders ---
setAndFire('ets1', 150); setAndFire('ets2', 80);
setAndFire('diff_nafta', 5); setAndFire('diff_kero', 25); setAndFire('diff_diesel', 30);
setAndFire('cambio', 1.05);
console.log('After commodity changes - KeroBEP:', document.getElementById('k_kerobep').textContent);

// --- electrolyzer tech switch + custom edit ---
document.getElementById('weTypeBtn_AEL').dispatch('click');
console.log('After AEL switch weParams:', JSON.stringify(stato.weParams));
setAndFire('we_capex', 2600);
console.log('After custom capex edit:', JSON.stringify(stato.weParams));

// --- calc mode: switch to IRR ---
document.getElementById('calcModeBtn_irr').dispatch('click');
console.log('refuel slider disabled in IRR mode (should be false):', document.getElementById('refuel').disabled);
setAndFire('refuel', 2000);
console.log('IRR KPI:', document.getElementById('k_result').textContent, document.getElementById('k_result_lbl').textContent);
console.log('ReFuel KPI (manual):', document.getElementById('k_bep').textContent, document.getElementById('k_refuel_lbl').textContent);

// LCOH non deve muoversi cambiando SOLO il ReFuel in modalita' IRR (fix appena introdotto)
const lcohA = document.getElementById('k_lcoh').textContent;
setAndFire('refuel', 3500);
const lcohB = document.getElementById('k_lcoh').textContent;
console.log('LCOH a ReFuel=2000:', lcohA, ' a ReFuel=3500:', lcohB, '(devono essere UGUALI)');
if (lcohA !== lcohB) throw new Error('BUG: il LCOH cambia ancora con il ReFuel in modalita IRR');

document.getElementById('calcModeBtn_bep').dispatch('click');
console.log('refuel slider disabled in BEP mode (should be true):', document.getElementById('refuel').disabled);

// --- SAF blend sliders ---
setAndFire('fossil_price', 1000);
setAndFire('hefa_price', 2500);
console.log('SAF sliders updated, no throw.');

// --- reset ---
document.getElementById('resetBtn').dispatch('click');
console.log('\\nAfter reset:');
console.log('weParams:', JSON.stringify(stato.weParams), 'expect PEM defaults capex 2500');
console.log('KeroBEP:', document.getElementById('k_kerobep').textContent, 'expect ~5639');
console.log('ReFuel BEP:', document.getElementById('k_bep').textContent, 'expect ~1118');
console.log('VAN:', document.getElementById('k_result').textContent, 'expect ~0 (label:', document.getElementById('k_result_lbl').textContent, ')');
console.log('LCOH:', document.getElementById('k_lcoh').textContent, 'expect 9,12');
console.log('WACC->DF:', document.getElementById('v_waccdf').textContent, 'expect 6.49% -> 8.62%');
console.log('Prezzo e-SAF (infoline):', document.getElementById('v_esaf_price').textContent, 'expect ~5638.6 €/t');
console.log('CAPEX:', document.getElementById('k_capex').textContent, document.getElementById('k_capex_sub').textContent);
console.log('Produttivita:', document.getElementById('k_prod').textContent, document.getElementById('k_prod_sub').textContent);
console.log('\\nTotal Plotly.react calls:', plotCalls);
`;

eval(src + '\n' + testCode);
