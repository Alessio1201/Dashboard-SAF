const DATA = {"econ": [0.7, 0.04, 10, 10, 0.02, 0.29, 2029, 20, 0.15, 0.06488000000000001, 0.08617760000000008], "real": [0.1072, 0.95, 7.421875, 76.794, -20, 0, 17, 21.5, -15, 335, 100, 50, 100, 3514.2520315610504, 2469.0065627073673, 2309.4362502073673, 1000], "plant": [1025000, 6.98687089715536, 85.70294779462652, 2380000, 1782.697579265313, 4802.440654664594, 0, 3200, 1600, 0.05, 0.06986165208074051, 0.4601342448408772, 1.4461361980713283, 0, 1.6297624691859072, 5.050997445437538, 0, 0.13442662499899785, 0.41916991248444296, 0], "econ_labels": ["Debt/(Equity+Debt)", "Debt Rate", "Debt Period", "DepeciationPeriod", "Inflation", "Tax rate", "Project year Start", "Poject years", "ROE", "WACC", "DF"], "real_labels": ["EE", "Cambio", "Conv", "BRENT", "DIFF-LPG", "DIFF-HAPHTA", "DIFF-KERO", "DIFF-DIESEL", "DIFF-WAX", "CH4", "ETS1-Jet/Marine", "ETS2-Auto", "CO2 capture", "RED - Kero", "RED - Benzina", "RED-Diesel", "Refuel"], "plant_labels": ["Capex", "CO2 feed", "CO2 compression", "H2 feed Power", "H2 compression", "Power", "Heating", "Operatori", "Overhead", "Manutenzione", "CO2 emessa", "Naphtha mass", "Naphtha CO2", "Naphta GJ", "Kero Mass", "Kero CO2", "Kero GJ", "Diesel Mass", "Diesel CO2", "Diesel GJ"], "we_type_matrix": {"AEL": {"capex": 2300, "econs": 52.4, "dur": 80000, "degr": 0.0012, "srcost": 0.15, "opex": 0.02}, "PEM": {"capex": 2500, "econs": 53.3, "dur": 60000, "degr": 0.0019, "srcost": 0.22, "opex": 0.02}, "SOE": {"capex": 4000, "econs": 40.0, "dur": 50000, "degr": 0.006, "srcost": 0.3, "opex": 0.02}}, "TOC_FT": 150000.0, "TOC_AtJ": 240000.0, "scen_cost": {"labels": ["CO2 capture", "CO2 compr.", "H2 prod.", "H2 compr.", "Power (MWh/y)", "Heating (MWh/y)", "CW (MWh/y)", "Steam (MWh/y)", "Operator", "Manutenzione", "Overhead", " ETS", "CAPEX"], "FT": [314.11219648558364, 26.92034117705945, 2532.8197124737803, 80.1456131843721, 215.9056900768746, 0, 0, 0, 34.05471882317688, 470.9129087267427, 17.02735941158844, 3.1408047047395002, 1084.955849725004], "AtJ": [363.67426388896513, 39.733330179187256, 2848.115638641974, 114.88934003033899, 115.64614233407266, 0, 0, 0, 38.29399178006015, 583.3850310243538, 19.146995890030077, 53.461752418796195, 1327.138990393968], "MFT4": [316.42526117989723, 24.349477448812202, 2454.9529344425696, 69.74954631622396, 312.19223717566166, 33.273397036159345, 0, 0, 33.00777054712698, 456.4355770969903, 16.50388527356349, 26.600536288410183, 1051.6009228392272], "MFT11": [316.6095574384443, 24.36365936834245, 2468.538228175547, 70.13552849174904, 519.6768585564613, 102.83399754286306, 0, 0, 33.19042995866282, 458.9614142721343, 16.59521497933141, 82.68055036855701, 1057.4203042323243], "totals": {"FT": 4779.995194788921, "AtJ": 5503.485476581745, "MFT4": 4795.091545644643, "MFT11": 5151.005743384417}}};

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

// DATA injected below

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
