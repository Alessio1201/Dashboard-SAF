// =====================================================================================
// MODELLO ECONOMICO eSAF — motore di calcolo (JavaScript)
// =====================================================================================
// Questo file traduce fedelmente in JavaScript i due script Python originali:
//   - we_function.py  -> funzione WE()   (costo dell'idrogeno prodotto dall'elettrolizzatore)
//   - val.py          -> funzione val()  (cash flow e prezzo di break-even del progetto)
// I numeri prodotti sono stati validati confrontandoli con il foglio Excel
// "Economics eSAF.xlsx" e con i risultati riportati nella tesi di dottorato (Cap. 5):
// LCOH = 9.12 €/kg H2, Kero Fossile = 696.1 €/t, ReFuel di break-even = 1118.25 €/t,
// andamento del cash flow scontato identico a quello del foglio "Cash Flows".
//
// Chi non conosce JavaScript NON deve modificare questo file: qui c'è solo la "matematica"
// del modello. Le impostazioni che si possono cambiare liberamente (colori, testi, range
// degli slider, valori di default) si trovano invece nel file principale della pagina,
// in una sezione chiaramente segnalata come "CONFIGURAZIONE".
// =====================================================================================

const DATA = require('./data.json');

// -------------------------------------------------------------------------------------
// Funzioni finanziarie di base
// -------------------------------------------------------------------------------------

// Rata annua costante (annuity) per ripagare un capitale "pv" in "nper" anni al tasso "rate"
function annuity(rate, nper, pv) {
  if (rate === 0) return pv / nper;
  return pv * rate * Math.pow(1 + rate, nper) / (Math.pow(1 + rate, nper) - 1);
}

// WACC = costo medio ponderato del capitale
//   WACC = X_D * tasso_debito * (1 - tax) + (1 - X_D) * ROE
// DF = tasso di sconto usato per il progetto, cioè il WACC corretto per l'inflazione:
//   DF = (1 + WACC) * (1 + inflazione) - 1
// Formula validata contro le celle C12 (WACC) e C13 (DF) del foglio "eSAF Matlab":
// con i valori di base (X_D=70%, tasso debito=4%, tax=29%, ROE=15%, inflazione=2%)
// si ottiene esattamente WACC=6.488% e DF=8.6176%, come nel file Excel.
function computeWACC(X_D, debtRate, tax, ROE) {
  return X_D * debtRate * (1 - tax) + (1 - X_D) * ROE;
}
function computeDF(WACC, inflation) {
  return (1 + WACC) * (1 + inflation) - 1;
}

// -------------------------------------------------------------------------------------
// Elettrolizzatore: costo dell'idrogeno prodotto (porting di we_function.py)
// -------------------------------------------------------------------------------------
// weParams = { capex, econs, dur, degr, srcost, opex } cioè i dati tecnici del tipo di
// elettrolizzatore scelto (AEL/PEM/SOE), presi di default dal foglio Excel "Electrolyzer"
// (colonne J:L). Possono anche essere personalizzati dall'utente nella pagina.
function WE(weParams, opts) {
  opts = opts || {};
  const p = weParams;
  const power_mw = opts.power_mw !== undefined ? opts.power_mw : 350;   // taglia dell'elettrolizzatore (MW)
  const hours = opts.hours !== undefined ? opts.hours : 8000;           // ore di funzionamento/anno
  const avg_use = opts.avg_use !== undefined ? opts.avg_use : 0.85;     // fattore di utilizzo medio
  const Py = opts.Py !== undefined ? opts.Py : 2029;                    // anno di avvio del progetto
  const n = opts.n !== undefined ? opts.n : (2050 - Py - 1);            // anni di ammortamento
  // we_function.py usa come tasso di sconto per l'elettrolizzatore lo stesso DF del progetto
  const wacc = opts.wacc !== undefined ? opts.wacc : DATA.econ[10];
  const ee_price_mwh = opts.ee_price_mwh !== undefined ? opts.ee_price_mwh : DATA.real[0] * 1000;

  const TOC = p.capex * power_mw * 1000;                    // costo di investimento elettrolizzatore (€)
  const n_op_hours = n * hours;
  const n_repl = Math.ceil(n_op_hours / p.dur) - 1;          // numero di sostituzioni dello stack
  const SR = TOC * p.srcost * n_repl;                        // costo totale sostituzioni stack (€)
  const avg_econs = p.econs + p.degr * p.dur / 2000 * p.econs; // consumo medio energia, con degrado (kWh/kg)
  const eff = 39 / avg_econs;                                 // efficienza (LHV H2 = 39 kWh/kg)

  const ACC_TOC = annuity(wacc, n, TOC);                      // rata annua del capitale investito

  const H2_pwr = power_mw * hours * avg_use;                  // energia elettrica consumata (MWh/anno)
  const EE_cost = H2_pwr * ee_price_mwh;                      // costo energia elettrica (€/anno)
  const H2_p_kg = power_mw * hours * avg_use / avg_econs * 1000; // idrogeno prodotto (kg/anno)

  // LCOH = costo livellato dell'idrogeno, scomposto nelle sue 4 componenti (€/kg H2)
  const LCOH_capex = ACC_TOC / H2_p_kg;
  const LCOH_ee = EE_cost / H2_p_kg;
  const LCOH_sr = SR / H2_p_kg / n;
  const LCOH_opex = p.opex * TOC / H2_p_kg;
  const LCOH = LCOH_capex + LCOH_ee + LCOH_sr + LCOH_opex;

  return {
    LCOH, LCOH_capex, LCOH_ee, LCOH_sr, LCOH_opex,
    TOC, SR, H2_p: H2_p_kg / 1e6, H2_p_kg,  // H2_p in kton/anno, H2_p_kg in kg/anno
    Mtn: p.opex, H2_pwr, Eff: eff, n
  };
}

const TOC_FT = DATA.TOC_FT; // costo dell'impianto Fischer-Tropsch (esclusa elettrolisi), k€ - fisso

// -------------------------------------------------------------------------------------
// Modello di cash flow del progetto (porting di val.py)
// -------------------------------------------------------------------------------------
// "overrides" permette di sovrascrivere qualunque parametro economico/di prezzo di default.
// Il valore del credito RED usa sempre la formula "REDe" (legata al LCOH dell'idrogeno verde,
// Eq. 5.22-5.23 della tesi).
function val(weParams, DF, ReFuel, overrides) {
  overrides = overrides || {};
  const econ = DATA.econ.slice();
  const real = DATA.real.slice();
  const plant = DATA.plant.slice();

  const o = Object.assign({
    d_e: econ[0], dr: econ[1], dp: econ[2], DeP_n: econ[3], tax: econ[5], Py: econ[6],
    EE: real[0], cambio: real[1], conv: real[2], BRENT: real[3],
    DIFF_NAPTHA: real[5], DIFF_KERO: real[6], DIFF_DIESEL: real[7],
    ETS1: real[10], ETS2: real[11], CC: real[12],
    CO2_feed: plant[1], CO2_compr: plant[2], H2_compr: plant[4], Pwr: plant[5], Heat: plant[6],
    Operatori: plant[7], Overhead: plant[8], Manutenzione: plant[9], CO2_out: plant[10],
    Naphtha_mass: plant[11], Naphtha_CO2: plant[12], Kero_mass: plant[14], Kero_CO2: plant[15],
    Diesel_mass: plant[17], Diesel_CO2: plant[18],
    power_mw: 350, hours: 8000, avg_use: 0.85
  }, overrides);

  if (DF === undefined) DF = econ[10];
  if (ReFuel === undefined) ReFuel = real[16];

  // Il LCOH (e quindi il credito RED, che ne dipende) va calcolato con un tasso di sconto
  // di riferimento FISSO — quello implicito nei parametri economici (ROE/debito/tasse/
  // inflazione) — e NON con il "DF" che in modalità IRR è la variabile stessa che si sta
  // cercando. Coerente con la metodologia della tesi: prima si fissa il LCOH (e i valori
  // di mercato che ne derivano), poi si cerca il ReFuel o l'IRR. Se non specificato,
  // "weDF" ricade sul DF passato (comportamento del caso base / modalità BEP).
  const weDF = overrides.weDF !== undefined ? overrides.weDF : DF;

  const we = WE(weParams, {
    wacc: overrides.wacc_we !== undefined ? overrides.wacc_we : weDF,
    ee_price_mwh: o.EE * 1000, power_mw: o.power_mw, hours: o.hours,
    avg_use: o.avg_use, Py: o.Py
  });
  const LCOH = we.LCOH, TOC = we.TOC, SR = we.SR, H2_p = we.H2_p, Mtn = we.Mtn, H2_pwr = we.H2_pwr;

  const Py = o.Py, N = 2050 - Py;
  const years = [];
  for (let i = 0; i <= N; i++) years.push(Py + i);
  const x = years.indexOf(2030); // le vendite iniziano nel 2030

  const DF_n = [];
  for (let i = 0; i <= N; i++) DF_n.push(Math.pow(1 + DF, i));

  const CAPEX_WE = TOC / 1e3;          // quota elettrolizzatore, k€
  const CAPEX_FT = TOC_FT;             // quota impianto FT, k€ (fissa)
  const CAPEX = CAPEX_FT + CAPEX_WE;   // CAPEX complessivo, k€

  const Fossil_naphtha = (o.BRENT + o.DIFF_NAPTHA) * o.conv;
  const Fossil_diesel = (o.BRENT + o.DIFF_DIESEL) * o.conv;
  const Fossil_kero = (o.BRENT + o.DIFF_KERO) * o.conv;

  // Valore del credito RED (formula REDe, legata al LCOH dell'idrogeno verde)
  const RED_b = LCOH * 1000 / 3 - Fossil_naphtha;
  const RED_d = LCOH * 1000 / 3 - Fossil_diesel;
  const RED_k = LCOH * 1000 / 2 - Fossil_kero * 1.5;

  const EE_mwh = o.EE * 1000;

  const Exp = Array.from({ length: 13 }, () => new Array(N + 1).fill(0));
  const Rev = Array.from({ length: 10 }, () => new Array(N + 1).fill(0));
  const Loan = Array.from({ length: 4 }, () => new Array(N + 1).fill(0));
  const Dep = new Array(N + 1).fill(0);
  const Tax0 = new Array(N + 1).fill(0), Tax1 = new Array(N + 1).fill(0);

  for (let j = x; j <= N; j++) {
    Exp[0][j] = H2_p * o.CO2_feed * o.CC;
    Exp[1][j] = H2_p * o.CO2_feed * o.CO2_compr * EE_mwh / 1000;
    Exp[2][j] = H2_pwr * EE_mwh / 1000;
    Exp[3][j] = H2_p * o.H2_compr * EE_mwh / 1000;
    Exp[4][j] = H2_p * o.Pwr * EE_mwh / 1000;
    Exp[5][j] = o.Heat * DATA.real[9];
    Exp[8][j] = o.Operatori;
    Exp[9][j] = o.Manutenzione * TOC_FT + SR / (N - 1) / 1e3 + TOC * Mtn / 1e3;
    Exp[10][j] = o.Overhead;
    Exp[11][j] = H2_p * o.CO2_out * o.ETS1;

    Rev[0][j] = o.Naphtha_mass * H2_p * Fossil_naphtha;
    Rev[1][j] = o.Naphtha_CO2 * H2_p * o.ETS2;
    Rev[2][j] = o.Naphtha_mass * H2_p * RED_b;
    Rev[3][j] = o.Kero_mass * H2_p * Fossil_kero;
    Rev[4][j] = o.Kero_CO2 * H2_p * o.ETS1;
    Rev[5][j] = o.Kero_mass * H2_p * RED_k;
    Rev[6][j] = o.Kero_mass * H2_p * ReFuel;
    Rev[7][j] = o.Diesel_mass * H2_p * Fossil_diesel;
    Rev[8][j] = o.Diesel_CO2 * H2_p * o.ETS2;
    Rev[9][j] = o.Diesel_mass * H2_p * RED_d;
  }
  Exp[12][x - 1] = (1 - o.d_e) * CAPEX;

  const Tot_Exp = new Array(N + 1).fill(0), Tot_Rev = new Array(N + 1).fill(0);
  for (let j = 0; j <= N; j++) {
    for (let k = 0; k < 13; k++) Tot_Exp[j] += Exp[k][j];
    for (let k = 0; k < 10; k++) Tot_Rev[j] += Rev[k][j];
  }

  const annuityPay = annuity(o.dr, o.dp, CAPEX * o.d_e);
  for (let j = x; j < x + o.dp && j <= N; j++) Loan[0][j] = annuityPay;
  for (let j = 0; j <= N; j++) Loan[1][j] = CAPEX * o.d_e;
  for (let j = x; j <= N; j++) {
    if (Loan[1][j - 1] > 0) {
      Loan[2][j] = Loan[1][j - 1] * o.dr;
      Loan[3][j] = Loan[0][j] - Loan[2][j];
      Loan[1][j] = Loan[1][j - 1] - Loan[3][j];
    }
  }

  for (let j = x; j < x + o.DeP_n && j <= N; j++) Dep[j] = CAPEX / o.DeP_n;

  for (let j = 0; j <= N; j++) {
    Tax0[j] = Tot_Rev[j] - Tot_Exp[j] - Dep[j] - Loan[2][j];
    if (Tax0[j] < 0) Tax0[j] = 0;
  }
  for (let j = x; j <= N; j++) Tax1[j] = Tax0[j] * o.tax;

  const OCF = new Array(N + 1), DCF = new Array(N + 1), CCF = new Array(N + 1);
  for (let j = 0; j <= N; j++) {
    OCF[j] = Tot_Rev[j] - Tot_Exp[j] - Loan[0][j] - Tax1[j];
    DCF[j] = OCF[j] / DF_n[j];
    CCF[j] = j === 0 ? DCF[j] : CCF[j - 1] + DCF[j];
  }
  const VAN = CCF[N];

  const Kero = [3, 4, 5, 6].map(k => Rev[k][x] / (o.Kero_mass * H2_p));
  const Naphtha_k = [0, 1, 2].map(k => Rev[k][x] / (o.Naphtha_mass * H2_p));
  const Diesel_k = [7, 8, 9].map(k => Rev[k][x] / (o.Diesel_mass * H2_p));
  const KeroBEP = Kero.reduce((a, b) => a + b, 0); // prezzo totale di break-even del kerosene, €/ton

  // Produttività annua dell'impianto (kton/anno), utile per la KPI in alto nella pagina
  const eFuelTotal_kt = H2_p * (o.Naphtha_mass + o.Kero_mass + o.Diesel_mass); // nafta+kerosene+diesel
  const eKerosene_kt = H2_p * o.Kero_mass;

  // ---------------------------------------------------------------------------------
  // Costo di produzione degli e-fuels (COP) — porting del foglio Excel "Cash Flows"
  // (celle U104:U117, con Q83 = massa totale di e-fuels prodotti, kton/anno)
  // ---------------------------------------------------------------------------------
  // Scompone il costo di produzione, nel primo anno operativo (x = 2030), nelle singole
  // voci di spesa, normalizzate sulla massa TOTALE di e-fuels prodotti (nafta+kerosene+
  // diesel, "eFuelTotal_kt"), coerente con la formula Excel U104 = L25/$Q$83 e non con
  // la normalizzazione (diversa) usata internamente da val.py per il calcolo del Kero_k.
  // La voce "CAPEX" è calcolata come residuo che chiude il bilancio ricavi-costi
  // nell'anno x (equivalente alla cella Excel U116 = $AA$100-SUM(U104:U115)) — rappresenta
  // l'onere di capitale (debito+equity+tasse). Le 11 categorie corrispondono 1:1 alla
  // legenda della Figura 5.24 della tesi.
  const normCOP = eFuelTotal_kt; // kton/anno di riferimento (Q83 dell'Excel)
  const ACC = Tot_Rev[x] - Tot_Exp[x]; // Exp[12] (FCI) è nullo in x, quindi Tot_Exp[x] = somma delle 10 voci operative
  const COP = {
    co2Capture: Exp[0][x] / normCOP,
    co2Compr: Exp[1][x] / normCOP,
    h2Elec: Exp[2][x] / normCOP,
    h2Compr: Exp[3][x] / normCOP,
    electricity: Exp[4][x] / normCOP,
    heating: Exp[5][x] / normCOP,
    operator: Exp[8][x] / normCOP,
    overhead: Exp[10][x] / normCOP,
    maintenance: Exp[9][x] / normCOP,
    ets: Exp[11][x] / normCOP,
    capex: ACC / normCOP,
    total: Tot_Rev[x] / normCOP
  };

  return {
    years, Tot_Exp, Tot_Rev, OCF, DCF, CCF, VAN, x, N,
    Kero, Naphtha_k, Diesel_k, KeroBEP, LCOH, we, CAPEX, CAPEX_WE, CAPEX_FT,
    RED_b, RED_d, RED_k, eFuelTotal_kt, eKerosene_kt, COP
  };
}

// -------------------------------------------------------------------------------------
// Ricerca del punto di break-even (bisezione)
// -------------------------------------------------------------------------------------
function bisect(f, lo, hi, iters, tol) {
  iters = iters || 80; tol = tol || 1e-6;
  let flo = f(lo);
  for (let i = 0; i < iters; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (Math.abs(fm) < tol) return mid;
    if ((fm > 0) === (flo > 0)) { lo = mid; flo = fm; } else { hi = mid; }
  }
  return (lo + hi) / 2;
}

// Trova il prezzo ReFuel che azzera il VAN, a parità di tasso di sconto DF (porting di BEP_c)
function findBEP(weParams, DF, overrides) {
  return bisect(rf => val(weParams, DF, rf, overrides).VAN, -5000, 30000);
}

// Trova il tasso di sconto (IRR) che azzera il VAN, a parità di prezzo ReFuel (porting di IRR_c)
function findIRR(weParams, ReFuel, overrides) {
  return bisect(df => val(weParams, df, ReFuel, overrides).VAN, -0.05, 0.8);
}

// -------------------------------------------------------------------------------------
// Mandato ReFuelEU Aviation: quote minime di SAF e di carburante sintetico (e-fuel/RFNBO)
// -------------------------------------------------------------------------------------
// Fonte: Regolamento (UE) 2023/2405 "ReFuelEU Aviation". Le quote sono percentuali minime
// (in energia) che restano valide dall'anno indicato fino al successivo aggiornamento.
//   SAF totale:        2%(2025) -> 6%(2030) -> 20%(2035) -> 34%(2040) -> 42%(2045) -> 70%(2050)
//   di cui sintetico:            1.2%(2030) -> 2%(2032)  -> 5%(2035) -> 10%(2040) -> 15%(2045) -> 35%(2050)
const REFUELEU_SAF_MILESTONES = [[2025, 2], [2030, 6], [2035, 20], [2040, 34], [2045, 42], [2050, 70]];
const REFUELEU_SYNTHETIC_MILESTONES = [[2030, 1.2], [2032, 2], [2035, 5], [2040, 10], [2045, 15], [2050, 35]];

function mandateShare(year, milestones) {
  let share = 0;
  for (const [y, pct] of milestones) { if (year >= y) share = pct; }
  return share / 100;
}

// Calcola, anno per anno (2024-2050), il prezzo medio del SAF come media pesata tra
// carburante fossile, SAF "convenzionale" (bio, prezzo HEFA) ed e-SAF (prezzo dal modello),
// usando le quote minime del mandato ReFuelEU come pesi.
function computeSafBlend(fossilPrice, hefaPrice, eSafPrice) {
  const rows = [];
  for (let year = 2024; year <= 2050; year++) {
    const safShare = mandateShare(year, REFUELEU_SAF_MILESTONES);
    const synShare = mandateShare(year, REFUELEU_SYNTHETIC_MILESTONES);
    const bioShare = Math.max(0, safShare - synShare);
    const fossilShare = 1 - safShare;
    const blended = fossilShare * fossilPrice + bioShare * hefaPrice + synShare * eSafPrice;
    rows.push({ year, safShare, synShare, bioShare, fossilShare, blended });
  }
  return rows;
}

module.exports = {
  WE, val, findBEP, findIRR, computeWACC, computeDF, computeSafBlend,
  REFUELEU_SAF_MILESTONES, REFUELEU_SYNTHETIC_MILESTONES, DATA
};

// ---- self-test (eseguito solo quando questo file viene lanciato direttamente con Node) ----
if (require.main === module) {
  const econ = DATA.econ;
  const wacc = computeWACC(econ[0], econ[1], econ[5], econ[8]);
  const df = computeDF(wacc, econ[4]);
  console.log('WACC computed', wacc, 'expect 0.06488');
  console.log('DF computed', df, 'expect 0.0861776');

  const pem = DATA.we_type_matrix.PEM;
  const bep = findBEP(pem, df);
  console.log('BEP ReFuel @DF=', df, '=', bep, ' expect ~1118.2502');
  const r = val(pem, df, bep);
  console.log('VAN', r.VAN, 'expect ~0');
  console.log('CCF around x:', r.CCF.slice(r.x - 1, r.x + 5));
  console.log('expect [-307500, -295081.99, -283649.23, -273123.54, -263432.97, -254511.25]');
  console.log('Kero breakdown', r.Kero, 'KeroBEP total', r.KeroBEP);
  console.log('LCOH', r.we.LCOH, 'expect 9.116886');
  console.log('CAPEX tot/WE/FT (k€)', r.CAPEX, r.CAPEX_WE, r.CAPEX_FT, 'expect 1025000 875000 150000');
  console.log('eFuel productivity (kton/y)', r.eFuelTotal_kt, 'eKerosene', r.eKerosene_kt);

  // WACC deve cambiare al variare di X_D
  const wacc0 = computeWACC(0.0, econ[1], econ[5], econ[8]);
  const wacc100 = computeWACC(1.0, econ[1], econ[5], econ[8]);
  console.log('WACC a X_D=0%:', wacc0, ' a X_D=100%:', wacc100, '(devono essere diversi)');

  // IRR sanity: ritrova df a partire dal BEP ReFuel
  const irr = findIRR(pem, bep);
  console.log('IRR back-solve at BEP refuel', irr, 'expect ~', df);

  // LCOH deve restare fisso in modalità IRR se si passa weDF esplicito (come fa app.js),
  // anche cambiando il ReFuel manuale (che sposta l'IRR trovato).
  const irrA = findIRR(pem, 1000, { weDF: df });
  const rA = val(pem, irrA, 1000, { weDF: df });
  const irrB = findIRR(pem, 2500, { weDF: df });
  const rB = val(pem, irrB, 2500, { weDF: df });
  console.log('IRR a ReFuel=1000:', irrA, ' LCOH:', rA.we.LCOH);
  console.log('IRR a ReFuel=2500:', irrB, ' LCOH:', rB.we.LCOH, '(deve essere UGUALE al LCOH sopra, con weDF fisso)');

  // Mandato ReFuelEU / prezzo SAF pesato
  const blend = computeSafBlend(900, 2200, r.KeroBEP);
  console.log('SAF blend 2025:', blend.find(b => b.year === 2025));
  console.log('SAF blend 2030:', blend.find(b => b.year === 2030));
  console.log('SAF blend 2050:', blend.find(b => b.year === 2050));

  // Costo di produzione (COP) e breakdown - Figura 5.24
  console.log('\nCOP breakdown (€/t e-fuel):', r.COP);
  const sumParts = r.COP.co2Capture + r.COP.co2Compr + r.COP.h2Elec + r.COP.h2Compr +
    r.COP.electricity + r.COP.heating + r.COP.operator + r.COP.overhead +
    r.COP.maintenance + r.COP.ets + r.COP.capex;
  console.log('Somma voci:', sumParts, ' deve essere uguale a COP.total:', r.COP.total);
  if (Math.abs(sumParts - r.COP.total) > 1e-6) throw new Error('BUG: le voci COP non sommano al totale');
}
