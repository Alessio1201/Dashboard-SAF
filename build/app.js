// =====================================================================================
// eSAF — INTERFACCIA DELLA PAGINA (JavaScript)
// =====================================================================================
// Questo file collega gli slider della pagina al "motore di calcolo" (le funzioni WE()
// e val() definite più sopra, tradotte da we_function.py e val.py) e disegna i grafici.
//
// COME È ORGANIZZATO QUESTO FILE (dall'alto in basso):
//   1) CONFIGURAZIONE  — colori dei grafici e lista degli slider. È la sezione pensata
//      per essere modificata anche da chi non conosce JavaScript: per cambiare un colore
//      o il range di uno slider basta cambiare i valori qui, senza toccare il resto.
//   2) STATO — i valori correnti di tutti gli slider (si aggiornano da soli quando si
//      muove uno slider, non richiede modifiche manuali).
//   3) CALCOLO — le funzioni che chiamano il motore (WE/val) con i valori correnti.
//   4) GRAFICI — le tre funzioni che disegnano i grafici con Plotly.
//   5) COLLEGAMENTO INTERFACCIA — il codice che "ascolta" i click e i movimenti degli
//      slider e richiama il ricalcolo. Non richiede modifiche per le personalizzazioni
//      più comuni (basta cambiare la sezione 1).
// =====================================================================================


// =====================================================================================
// 1) CONFIGURAZIONE — modificabile liberamente
// =====================================================================================

// Colori usati nel grafico "Prezzo di mercato" (formato CSS: nome colore o codice #RRGGBB)
const COLORI_PREZZO = {
  fossile: '#9aa4b2',  // grigio
  ets:     '#4caf50',  // verde
  red:     '#e05252',  // rosso   (quota RED)
  refuel:  '#3b82f6',  // blu
};

// Colori usati nel grafico "Composizione del costo di produzione degli e-fuels": ripresi
// campionando esattamente i colori della legenda della Figura 5.24 della tesi (pag. 126),
// così il grafico della pagina è coerente con quello stampato.
const COLORI_COSTO = {
  co2Capture:  '#93d5f6',  // CO2 Capture
  co2Compr:    '#00ade7',  // CO2 Compression
  h2Elec:      '#b5d69c',  // H2 Electricity
  h2Compr:     '#31b452',  // H2 Compression
  electricity: '#efa5c6',  // Electricity
  heating:     '#dd4a59',  // Heating
  operator:    '#efc694',  // Operator
  overhead:    '#bcbcdd',  // Overhead
  maintenance: '#f69331',  // Maintenance
  ets:         '#636bb5',  // ETS
  capex:       '#c62918',  // CAPEX
};

// Elenco di tutti gli slider "semplici" della pagina: per ognuno basta indicare
//   id        -> l'id dello slider nell'HTML (<input type="range" id="...">)
//   suffisso  -> il testo mostrato accanto al valore (es. " %", " €/MWh")
//   decimali  -> quante cifre decimali mostrare
// Il valore corrente viene salvato automaticamente in stato[id].
const SLIDER = [
  { id: 'power_mw',    suffisso: ' MW',        decimali: 0 },
  { id: 'hours',       suffisso: ' h',         decimali: 0 },
  { id: 'roe',         suffisso: ' %',         decimali: 1 },
  { id: 'x_d',         suffisso: ' %',         decimali: 0 },
  { id: 'dr',          suffisso: ' %',         decimali: 2 },
  { id: 'tax',         suffisso: ' %',         decimali: 0 },
  { id: 'infl',        suffisso: ' %',         decimali: 2 },
  { id: 'ee',          suffisso: ' €/MWh',     decimali: 1 },
  { id: 'cc',          suffisso: ' €/t',       decimali: 0 },
  { id: 'brent',       suffisso: ' $/bbl',     decimali: 1 },
  { id: 'cambio',      suffisso: ' €/$',       decimali: 3 },
  { id: 'ets1',        suffisso: ' €/t CO2',   decimali: 0 },
  { id: 'ets2',        suffisso: ' €/t CO2',   decimali: 0 },
  { id: 'diff_nafta',  suffisso: ' $/bbl',     decimali: 1 },
  { id: 'diff_kero',   suffisso: ' $/bbl',     decimali: 1 },
  { id: 'diff_diesel', suffisso: ' $/bbl',     decimali: 1 },
  { id: 'refuel',      suffisso: ' €/t',       decimali: 0 },
  { id: 'fossil_price',suffisso: ' €/t',       decimali: 0 },
  { id: 'hefa_price',  suffisso: ' €/t',       decimali: 0 },
];


// =====================================================================================
// 2) STATO — valori correnti di tutti i controlli della pagina
// =====================================================================================

function cloneWeParams(tipo) { return Object.assign({}, DATA.we_type_matrix[tipo]); }

// stato iniziale: ripreso dagli slider HTML, così i due restano sempre coerenti
function leggiStatoIniziale() {
  const s = { weType: 'PEM', calcMode: 'bep' };
  SLIDER.forEach(sl => { s[sl.id] = parseFloat(document.getElementById(sl.id).value); });
  s.weParams = cloneWeParams(s.weType);
  return s;
}

const stato = leggiStatoIniziale();
const VALORI_DI_DEFAULT = JSON.parse(JSON.stringify(stato));

const fmt0 = n => n.toLocaleString('it-IT', { maximumFractionDigits: 0 });
const fmt1 = n => n.toLocaleString('it-IT', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const fmt2 = n => n.toLocaleString('it-IT', { maximumFractionDigits: 2, minimumFractionDigits: 2 });


// =====================================================================================
// 3) CALCOLO — chiama il motore (WE / val) con i valori correnti della pagina
// =====================================================================================

function waccCorrente() { return computeWACC(stato.x_d / 100, stato.dr / 100, stato.tax / 100, stato.roe / 100); }
function dfCorrente() { return computeDF(waccCorrente(), stato.infl / 100); }

// Traduce lo "stato" della pagina nei nomi dei parametri usati dalla funzione val()
function parametriCorrenti() {
  return {
    d_e: stato.x_d / 100,
    dr: stato.dr / 100,
    tax: stato.tax / 100,
    EE: stato.ee / 1000,           // slider in €/MWh -> modello in €/kWh
    CC: stato.cc,
    BRENT: stato.brent,
    cambio: stato.cambio,
    ETS1: stato.ets1,
    ETS2: stato.ets2,
    DIFF_NAPTHA: stato.diff_nafta,
    DIFF_KERO: stato.diff_kero,
    DIFF_DIESEL: stato.diff_diesel,
    power_mw: stato.power_mw,
    hours: stato.hours,
    // Il LCOH (e il credito RED che ne deriva) resta sempre ancorato al tasso di sconto
    // "di riferimento" degli slider, anche in modalità IRR: non deve muoversi insieme
    // al tasso che si sta cercando (vedi commento in model.js, funzione val()).
    weDF: dfCorrente()
  };
}

// Esegue il modello con i parametri correnti e restituisce tutto ciò che serve
// per aggiornare le KPI e i grafici.
function calcola() {
  const parametri = parametriCorrenti();
  const dfDaSlider = dfCorrente();
  let refuel, tassoUsato, irr = null, bep = null;

  if (stato.calcMode === 'irr') {
    // Modalità IRR: il ReFuel è quello impostato manualmente, si calcola il tasso
    // di sconto (IRR) che azzera il VAN a quel prezzo — porting di IRR_c(data).
    refuel = stato.refuel;
    irr = findIRR(stato.weParams, refuel, parametri);
    tassoUsato = irr;
  } else {
    // Modalità BEP: si calcola il ReFuel che azzera il VAN al tasso di sconto attuale
    // (derivato da ROE/debito/tasse/inflazione) — porting di BEP_c(data).
    bep = findBEP(stato.weParams, dfDaSlider, parametri);
    refuel = bep;
    stato.refuel = Math.round(bep); // riflette il valore calcolato sullo slider (disabilitato)
    tassoUsato = dfDaSlider;
  }

  const risultato = val(stato.weParams, tassoUsato, refuel, parametri);
  return { risultato, dfDaSlider, tassoUsato, refuel, irr, bep };
}


// =====================================================================================
// 4) GRAFICI
// =====================================================================================

function coloreCss(nomeVariabile) {
  return getComputedStyle(document.documentElement).getPropertyValue(nomeVariabile).trim();
}

const CONFIGURAZIONE_GRAFICO = {
  displayModeBar: true, displaylogo: false, responsive: true,
  modeBarButtonsToRemove: ['lasso2d', 'select2d']
};

function layoutBase(extra) {
  return Object.assign({
    paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
    font: { color: coloreCss('--text'), size: 12 },
    margin: { l: 55, r: 50, t: 10, b: 40 },
    xaxis: { gridcolor: 'rgba(255,255,255,0.06)' },
    yaxis: { gridcolor: 'rgba(255,255,255,0.06)' },
  }, extra);
}

// Tutti i grafici mostrano, al passaggio del cursore, i valori arrotondati a una sola
// cifra decimale (richiesto esplicitamente): questo formato Plotly fa esattamente questo.
const HOVER_1_DECIMALE = '%{y:.1f} €/ton<extra>%{fullData.name}</extra>';

// Grafico 1: composizione del prezzo di mercato di nafta, kerosene e diesel
function disegnaGraficoPrezzo(esito) {
  const r = esito.risultato;
  const prodotti = ['Nafta', 'Kerosene', 'Diesel'];
  const nafta = r.Naphtha_k, kero = r.Kero, diesel = r.Diesel_k;
  const tracce = [
    { name: 'Fossile', x: prodotti, y: [nafta[0], kero[0], diesel[0]], type: 'bar', marker: { color: COLORI_PREZZO.fossile }, hovertemplate: HOVER_1_DECIMALE },
    { name: 'ETS', x: prodotti, y: [nafta[1], kero[1], diesel[1]], type: 'bar', marker: { color: COLORI_PREZZO.ets }, hovertemplate: HOVER_1_DECIMALE },
    { name: 'Quota RED', x: prodotti, y: [nafta[2], kero[2], diesel[2]], type: 'bar', marker: { color: COLORI_PREZZO.red }, hovertemplate: HOVER_1_DECIMALE },
    { name: 'ReFuel', x: prodotti, y: [0, kero[3], 0], type: 'bar', marker: { color: COLORI_PREZZO.refuel }, hovertemplate: HOVER_1_DECIMALE },
  ];
  const layout = layoutBase({ barmode: 'stack', yaxis: { title: '€ / ton' }, legend: { orientation: 'h', y: -0.18 } });
  Plotly.react('chartPrice', tracce, layout, CONFIGURAZIONE_GRAFICO);
}

// Grafico 2: cash flow di progetto (OCF annuo + CCF cumulato)
function disegnaGraficoCashFlow(esito) {
  const r = esito.risultato;
  const anni = r.years;
  const ocf = r.OCF.map(v => v / 1000); // k€ -> M€
  const ccf = r.CCF.map(v => v / 1000);
  const tracce = [
    { name: 'OCF annuo', x: anni, y: ocf, type: 'bar', marker: { color: coloreCss('--accent') }, opacity: 0.75,
      hovertemplate: '%{y:.1f} M€<extra>OCF annuo</extra>' },
    { name: 'CCF cumulato (VAN)', x: anni, y: ccf, type: 'scatter', mode: 'lines', yaxis: 'y2',
      line: { color: coloreCss('--accent2'), width: 2.5 },
      hovertemplate: '%{y:.1f} M€<extra>CCF cumulato</extra>' }
  ];
  const layout = layoutBase({
    yaxis: { title: 'OCF annuo (M€)' },
    yaxis2: { title: 'CCF cumulato (M€)', overlaying: 'y', side: 'right', showgrid: false, zeroline: true },
    legend: { orientation: 'h', y: -0.18 }
  });
  Plotly.react('chartCF', tracce, layout, CONFIGURAZIONE_GRAFICO);
}

// Grafico 3: prezzo medio del SAF secondo le quote minime del mandato ReFuelEU Aviation
function disegnaGraficoSaf(esito) {
  const eSafPrice = esito.risultato.KeroBEP; // prezzo dell'e-SAF = prezzo del kerosene dal modello
  const righe = computeSafBlend(stato.fossil_price, stato.hefa_price, eSafPrice);

  // Mostra accanto allo slider il valore di prezzo e-SAF preso dal modello (niente più testo generico)
  document.getElementById('v_esaf_price').textContent = eSafPrice.toFixed(1) + ' €/t';

  const anni = righe.map(r => r.year);
  const blended = righe.map(r => r.blended);
  const testoHover = righe.map(r =>
    `Anno ${r.year}<br>Quota SAF: ${(r.safShare*100).toFixed(1)}%<br>` +
    `di cui sintetico: ${(r.synShare*100).toFixed(1)}%<br>Prezzo medio: ${r.blended.toFixed(1)} €/t`
  );

  const tracce = [
    { name: 'Prezzo medio SAF (mandato ReFuelEU)', x: anni, y: blended, type: 'scatter', mode: 'lines+markers',
      line: { color: coloreCss('--accent'), width: 3 }, marker: { size: 4 },
      text: testoHover, hoverinfo: 'text' },
    { name: 'Fossile (fisso)', x: anni, y: anni.map(() => stato.fossil_price), type: 'scatter', mode: 'lines',
      line: { color: COLORI_PREZZO.fossile, width: 1.5, dash: 'dot' }, hovertemplate: HOVER_1_DECIMALE },
    { name: 'Bio-SAF / HEFA (fisso)', x: anni, y: anni.map(() => stato.hefa_price), type: 'scatter', mode: 'lines',
      line: { color: COLORI_PREZZO.red, width: 1.5, dash: 'dot' }, hovertemplate: HOVER_1_DECIMALE },
    { name: 'e-SAF (dal modello)', x: anni, y: anni.map(() => eSafPrice), type: 'scatter', mode: 'lines',
      line: { color: COLORI_PREZZO.refuel, width: 1.5, dash: 'dot' }, hovertemplate: HOVER_1_DECIMALE },
  ];
  const layout = layoutBase({
    yaxis: { title: '€ / ton' }, xaxis: { title: 'Anno', dtick: 5 },
    legend: { orientation: 'h', y: -0.2 }
  });
  Plotly.react('chartSaf', tracce, layout, CONFIGURAZIONE_GRAFICO);
}

// Grafico: composizione del costo di produzione degli e-fuels (porting del foglio Excel
// "Cash Flows", celle U104:U117) — stile e colori della Figura 5.24 della tesi.
// Ogni voce è il costo €/ton normalizzato sulla massa TOTALE di e-fuels prodotti
// (nafta+kerosene+diesel), non sulla sola massa di kerosene.
// Colonna verticale, stretta e alta (non tozza), con legenda posizionata sul lato
// destro del grafico (il contenitore #chartCOP è più alto degli altri, vedi CSS).
function disegnaGraficoCosto(esito) {
  const c = esito.risultato.COP;
  const categoria = ['Costo di produzione e-fuels'];

  // Ordine delle voci coerente con la legenda della Figura 5.24 (dal basso verso l'alto)
  const voci = [
    { chiave: 'capex',       nome: 'CAPEX' },
    { chiave: 'co2Capture',  nome: 'Cattura CO2' },
    { chiave: 'co2Compr',    nome: 'Compressione CO2' },
    { chiave: 'h2Elec',      nome: 'Corrente elettrolizzatore' },
    { chiave: 'h2Compr',     nome: 'Compressione H2' },
    { chiave: 'operator',    nome: 'Operatori' },
    { chiave: 'overhead',    nome: 'Spese generali' },
    { chiave: 'maintenance', nome: 'Manutenzione' },
    { chiave: 'ets',         nome: 'ETS' },
    { chiave: 'heating',     nome: 'Riscaldamento' },
    { chiave: 'electricity', nome: 'Corrente processo' },
  ];

  const tracce = voci.map(v => ({
    name: v.nome, x: categoria, y: [c[v.chiave]], type: 'bar',
    width: 0.35, marker: { color: COLORI_COSTO[v.chiave] }, hovertemplate: HOVER_1_DECIMALE
  }));

  const layout = layoutBase({
    barmode: 'stack', yaxis: { title: '€ / ton e-fuel' }, xaxis: { automargin: true },
    margin: { l: 55, r: 15, t: 10, b: 40 },
    legend: { orientation: 'v', x: 1.02, y: 0.5, xanchor: 'left', yanchor: 'middle' }
  });
  Plotly.react('chartCOP', tracce, layout, CONFIGURAZIONE_GRAFICO);
}


// =====================================================================================
// Aggiornamento delle KPI in alto alla pagina
// =====================================================================================

function aggiornaKPI(esito) {
  const r = esito.risultato;

  document.getElementById('k_kerobep').textContent = fmt0(r.KeroBEP) + ' €/t';

  if (stato.calcMode === 'irr') {
    document.getElementById('k_refuel_lbl').textContent = 'ReFuel (manuale)';
    document.getElementById('k_bep').textContent = fmt0(esito.refuel) + ' €/t';
    document.getElementById('k_refuel_sub').textContent = '€/ton, valore impostato manualmente';

    document.getElementById('k_result_lbl').textContent = 'IRR calcolato';
    document.getElementById('k_result').textContent = fmt2(esito.irr * 100) + ' %';
    document.getElementById('k_result_sub').textContent = 'tasso di sconto che azzera il VAN';
    document.getElementById('k_result').className = 'num';
  } else {
    document.getElementById('k_refuel_lbl').textContent = 'ReFuel break-even';
    document.getElementById('k_bep').textContent = fmt0(esito.bep) + ' €/t';
    document.getElementById('k_refuel_sub').textContent = '€/ton, sola componente ReFuel';

    document.getElementById('k_result_lbl').textContent = 'VAN a fine progetto';
    document.getElementById('k_result').textContent = fmt0(r.VAN) + ' k€';
    document.getElementById('k_result_sub').textContent = 'k€, cash flow scontato cumulato';
    document.getElementById('k_result').className = 'num ' + (r.VAN >= -1 ? 'good' : (r.VAN < -50000 ? 'bad' : ''));
  }

  document.getElementById('k_lcoh').textContent = fmt2(r.we.LCOH);

  document.getElementById('k_prod').textContent = fmt0(r.eFuelTotal_kt) + ' kt/y';
  document.getElementById('k_prod_sub').textContent = 'di cui e-kerosene: ' + fmt0(r.eKerosene_kt) + ' kt/anno';

  document.getElementById('k_capex').textContent = fmt0(r.CAPEX / 1000) + ' M€';
  document.getElementById('k_capex_sub').textContent = 'di cui elettrolizzatore: ' + fmt0(r.CAPEX_WE / 1000) + ' M€';

  document.getElementById('v_waccdf').textContent = fmt2(waccCorrente() * 100) + '% → ' + fmt2(esito.dfDaSlider * 100) + '%';
}

// Esegue il calcolo, aggiorna le KPI e ridisegna tutti i grafici. È la funzione
// chiamata ogni volta che l'utente muove uno slider o cambia un'opzione.
function aggiornaTutto() {
  const esito = calcola();
  aggiornaKPI(esito);
  disegnaGraficoPrezzo(esito);
  disegnaGraficoCashFlow(esito);
  disegnaGraficoSaf(esito);
  disegnaGraficoCosto(esito);
  const spanRefuel = document.getElementById('v_refuel');
  if (spanRefuel) spanRefuel.textContent = fmt0(stato.refuel) + ' €/t';
}


// =====================================================================================
// 5) COLLEGAMENTO INTERFACCIA — non richiede modifiche per le personalizzazioni comuni
// =====================================================================================

// Collega ogni slider elencato in SLIDER: aggiorna lo stato, l'etichetta accanto allo
// slider e richiama aggiornaTutto(). Se manca l'etichetta (id "v_"+id) non genera errori:
// questo evita che un refuso nel nome di un id blocchi silenziosamente tutto il resto
// (bug capitato in una versione precedente con "Taglia elettrolizzatore" e "Quota debito").
SLIDER.forEach(sl => {
  const input = document.getElementById(sl.id);
  const etichetta = document.getElementById('v_' + sl.id);
  if (!input) { console.warn('Slider mancante nell\'HTML:', sl.id); return; }
  input.addEventListener('input', () => {
    const valore = parseFloat(input.value);
    stato[sl.id] = valore;
    if (etichetta) etichetta.textContent = valore.toFixed(sl.decimali) + sl.suffisso;
    aggiornaTutto();
  });
});

// Tecnologia elettrolizzatore (AEL / PEM / SOE)
function sincronizzaCampiElettrolizzatore() {
  document.getElementById('we_capex').value = stato.weParams.capex;
  document.getElementById('we_econs').value = stato.weParams.econs;
  document.getElementById('we_dur').value = stato.weParams.dur;
  document.getElementById('we_degr').value = stato.weParams.degr;
  document.getElementById('we_srcost').value = (stato.weParams.srcost * 100).toFixed(2);
  document.getElementById('we_opex').value = (stato.weParams.opex * 100).toFixed(2);
}
document.querySelectorAll('#weType button').forEach(pulsante => {
  pulsante.addEventListener('click', () => {
    document.querySelectorAll('#weType button').forEach(b => b.classList.remove('active'));
    pulsante.classList.add('active');
    stato.weType = pulsante.dataset.v;
    stato.weParams = cloneWeParams(stato.weType);
    sincronizzaCampiElettrolizzatore();
    aggiornaTutto();
  });
});

// Campi tecnici avanzati dell'elettrolizzatore (personalizzabili dall'utente)
const CAMPO_WE = { we_capex: 'capex', we_econs: 'econs', we_dur: 'dur', we_degr: 'degr', we_srcost: 'srcost', we_opex: 'opex' };
Object.keys(CAMPO_WE).forEach(id => {
  document.getElementById(id).addEventListener('input', e => {
    const campo = CAMPO_WE[id];
    let v = parseFloat(e.target.value);
    if (isNaN(v)) return;
    if (campo === 'srcost' || campo === 'opex') v = v / 100; // inseriti in %, salvati come frazione
    stato.weParams[campo] = v;
    aggiornaTutto();
  });
});
sincronizzaCampiElettrolizzatore();

// Modalità di calcolo: BEP automatico oppure IRR a ReFuel fisso (si escludono a vicenda)
const sliderRefuel = document.getElementById('refuel');
document.querySelectorAll('#calcMode button').forEach(pulsante => {
  pulsante.addEventListener('click', () => {
    document.querySelectorAll('#calcMode button').forEach(b => b.classList.remove('active'));
    pulsante.classList.add('active');
    stato.calcMode = pulsante.dataset.v;
    sliderRefuel.disabled = (stato.calcMode === 'bep'); // in modalità BEP il ReFuel è calcolato, non impostabile
    aggiornaTutto();
  });
});

// Pulsante di reset: ripristina tutti i valori di base
document.getElementById('resetBtn').addEventListener('click', () => {
  Object.assign(stato, JSON.parse(JSON.stringify(VALORI_DI_DEFAULT)));
  SLIDER.forEach(sl => {
    document.getElementById(sl.id).value = stato[sl.id];
    const etichetta = document.getElementById('v_' + sl.id);
    if (etichetta) etichetta.textContent = stato[sl.id].toFixed(sl.decimali) + sl.suffisso;
  });
  document.querySelectorAll('#weType button').forEach(b => b.classList.toggle('active', b.dataset.v === 'PEM'));
  document.querySelectorAll('#calcMode button').forEach(b => b.classList.toggle('active', b.dataset.v === 'bep'));
  sliderRefuel.disabled = true;
  sincronizzaCampiElettrolizzatore();
  aggiornaTutto();
});

// Primo disegno della pagina
aggiornaTutto();

window.addEventListener('resize', () => {
  ['chartPrice', 'chartCF', 'chartSaf', 'chartCOP'].forEach(id => Plotly.Plots.resize(document.getElementById(id)));
});
