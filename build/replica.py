import numpy as np
import openpyxl
from scipy.optimize import brentq

wb = openpyxl.load_workbook('/sessions/wonderful-sweet-pascal/mnt/uploads/Economics eSAF.xlsx', data_only=True)
ws = wb['eSAF Matlab']

def col(cletter, start, n):
    from openpyxl.utils import column_index_from_string
    c = column_index_from_string(cletter)
    return [ws.cell(row=start+i, column=c).value for i in range(n)]

econ = col('C', 3, 11)
real = col('F', 3, 17)
plant = col('J', 3, 20)

we_type_matrix = {
    'AEL': dict(capex=2300, econs=52.4, dur=80000, degr=0.0012, srcost=0.15, opex=0.02),
    'PEM': dict(capex=2500, econs=53.3, dur=60000, degr=0.0019, srcost=0.22, opex=0.02),
    'SOE': dict(capex=4000, econs=40.0, dur=50000, degr=0.006, srcost=0.30, opex=0.02),
}

def WE(we_type, power_mw=350, hours=8000, avg_use=0.85, wacc=None, n=20, ee_price=None):
    p = we_type_matrix[we_type]
    if wacc is None: wacc = econ[10]  # DF (discount factor used for electrolyzer annuity in sheet)
    if ee_price is None: ee_price = real[0]*1000  # €/MWh
    capex_kw = p['capex']
    econs = p['econs']
    dur = p['dur']
    degr = p['degr']
    srcost = p['srcost']
    opexf = p['opex']

    TOC = capex_kw*power_mw*1000  # €
    n_op_hours = n*hours
    n_repl = np.ceil(n_op_hours/dur) - 1
    SR = TOC*srcost*n_repl
    avg_econs = econs + degr*dur/2000*econs
    eff = 39/avg_econs

    def annuity(rate,nper,pv):
        if rate==0: return pv/nper
        return pv*rate*(1+rate)**nper/((1+rate)**nper-1)

    ACC_TOC = annuity(wacc,n,TOC)
    ACC_SR = annuity(wacc,n,SR)

    H2_pwr = power_mw*hours*avg_use  # MWh/y
    EE_cost = H2_pwr*ee_price  # eur/y
    H2_p_kg = power_mw*hours*avg_use/avg_econs*1000  # kg/y

    LCOH_capex = ACC_TOC/H2_p_kg
    LCOH_ee = EE_cost/H2_p_kg
    LCOH_sr = SR/H2_p_kg/n
    LCOH_opex = opexf*TOC/H2_p_kg
    LCOH = LCOH_capex+LCOH_ee+LCOH_sr+LCOH_opex

    H2_p_kton = H2_p_kg/1e6
    Mtn = opexf
    return dict(LCOH=LCOH, TOC=TOC, SR=SR, H2_p=H2_p_kton, Mtn=Mtn, H2_pwr=H2_pwr, Eff=eff, H2_p_kg=H2_p_kg,
                LCOH_capex=LCOH_capex, LCOH_ee=LCOH_ee, LCOH_sr=LCOH_sr, LCOH_opex=LCOH_opex)

we0 = WE('PEM')
print("WE check vs excel: LCOH", we0['LCOH'], "expect ~9.117")
print("TOC",we0['TOC'],"expect 875000000")
print("SR",we0['SR'],"expect 385000000")
print("H2_p_kg",we0['H2_p_kg'],"expect 42244946.14")
print("Eff",we0['Eff'],"expect 0.6922491")

TOC_FT = 150e3  # k€
TOC_AtJ = 240e3

def val(we_type='PEM', DF=None, ReFuel=None, overrides=None):
    o = dict(d_e=econ[0], dr=econ[1], dp=int(econ[2]), DeP_n=int(econ[3]), infl=econ[4], tax=econ[5], Py=int(econ[6]),
              EE=real[0], cambio=real[1], conv=real[2], BRENT=real[3],
              DIFF_LPG=real[4], DIFF_NAPTHA=real[5], DIFF_KERO=real[6], DIFF_DIESEL=real[7], DIFF_WAX=real[8],
              Met=real[9], ETS1=real[10], ETS2=real[11], CC=real[12],
              CO2_feed=plant[1], CO2_compr=plant[2], H2_compr=plant[4], Pwr=plant[5], Heat=plant[6],
              Operatori=plant[7], Overhead=plant[8], Manutenzione=plant[9], CO2_out=plant[10],
              Naphtha_mass=plant[11], Naphtha_CO2=plant[12], Kero_mass=plant[14], Kero_CO2=plant[15],
              Diesel_mass=plant[17], Diesel_CO2=plant[18], wacc_we=econ[10])
    if overrides: o.update(overrides)

    if DF is None: DF = econ[10]
    if ReFuel is None: ReFuel = real[16]

    we = WE(we_type, wacc=o['wacc_we'], ee_price=o['EE']*1000)
    LCOH = we['LCOH']; TOC = we['TOC']; SR = we['SR']; H2_p = we['H2_p']; Mtn = we['Mtn']; H2_pwr = we['H2_pwr']; Eff = we['Eff']

    d_e=o['d_e']; dr=o['dr']; dp=o['dp']; DeP_n=o['DeP_n']; tax=o['tax']
    EE=o['EE']; cambio=o['cambio']; conv=o['conv']; BRENT=o['BRENT']
    ETS1=o['ETS1']; ETS2=o['ETS2']
    DIFF_LPG=o['DIFF_LPG']; DIFF_NAPTHA=o['DIFF_NAPTHA']; DIFF_KERO=o['DIFF_KERO']; DIFF_DIESEL=o['DIFF_DIESEL']; DIFF_WAX=o['DIFF_WAX']
    Met=o['Met']; CC=o['CC']
    CO2_feed=o['CO2_feed']; CO2_compr=o['CO2_compr']; H2_compr=o['H2_compr']; Pwr=o['Pwr']; Heat=o['Heat']
    Operatori=o['Operatori']; Overhead=o['Overhead']; Manutenzione=o['Manutenzione']; CO2_out=o['CO2_out']
    Naphtha_mass=o['Naphtha_mass']; Naphtha_CO2=o['Naphtha_CO2']; Kero_mass=o['Kero_mass']; Kero_CO2=o['Kero_CO2']
    Diesel_mass=o['Diesel_mass']; Diesel_CO2=o['Diesel_CO2']
    Py = o['Py']

    N = 2050-Py
    n = np.arange(N+1)
    y = np.arange(Py,2051)
    DF_n = (1+DF)**n

    def replicate(val): return np.ones(N+1)*val

    def payper(rate,nper,pv):
        if rate==0: return pv/nper
        return pv*rate*(1+rate)**nper/((1+rate)**nper-1)

    CAPEX = TOC_FT + TOC/1e3

    EE_n = replicate(EE*1000)  # €/MWh
    BRENT_n = replicate(BRENT); ETS1_n=replicate(ETS1); ETS2_n=replicate(ETS2)
    DIFF_NAPTHA_n=replicate(DIFF_NAPTHA); DIFF_KERO_n=replicate(DIFF_KERO); DIFF_DIESEL_n=replicate(DIFF_DIESEL)
    CC_n = replicate(CC); ReFuel_n = replicate(ReFuel)

    Exp = np.zeros((13,N+1)); Rev=np.zeros((10,N+1)); Loan=np.zeros((4,N+1)); Dep=np.zeros(N+1)
    Tax=np.zeros((2,N+1));

    x = int(np.where(y==2030)[0][0])

    RED_b = LCOH*1000/3 - (BRENT_n[x]+DIFF_NAPTHA_n[x])*conv
    RED_d = LCOH*1000/3 - (BRENT_n[x]+DIFF_DIESEL_n[x])*conv
    RED_k = LCOH*1000/2 - (BRENT_n[x]+DIFF_KERO_n[x])*conv*1.5
    RED_k_n=replicate(RED_k); RED_b_n=replicate(RED_b); RED_d_n=replicate(RED_d)

    Exp[0,x:] = H2_p*CO2_feed*CC_n[x:]
    Exp[1,x:] = H2_p*CO2_feed*CO2_compr*EE_n[x:]/1000
    Exp[2,x:] = H2_pwr*EE_n[x:]/1000
    Exp[3,x:] = H2_p*H2_compr*EE_n[x:]/1000
    Exp[4,x:] = H2_p*Pwr*EE_n[x:]/1000
    Exp[5,x:] = Heat*replicate(Met)[x:]
    Exp[8,x:] = Operatori
    Exp[9,x:] = Manutenzione*TOC_FT + SR/(N-1)/1e3 + TOC*Mtn/1e3
    Exp[10,x:] = Overhead
    Exp[11,x:] = H2_p*CO2_out*ETS1_n[x:]
    Exp[12,x-1] = (1-d_e)*CAPEX
    Tot_Exp = np.sum(Exp,axis=0)

    Rev[0,x:] = Naphtha_mass*H2_p*(BRENT_n[x:]+DIFF_NAPTHA_n[x:])*conv
    Rev[1,x:] = Naphtha_CO2*H2_p*ETS2_n[x:]
    Rev[2,x:] = Naphtha_mass*H2_p*RED_b_n[x:]
    Rev[3,x:] = Kero_mass*H2_p*(BRENT_n[x:]+DIFF_KERO_n[x:])*conv
    Rev[4,x:] = Kero_CO2*H2_p*ETS1_n[x:]
    Rev[5,x:] = Kero_mass*H2_p*RED_k_n[x:]
    Rev[6,x:] = Kero_mass*H2_p*ReFuel_n[x:]
    Rev[7,x:] = Diesel_mass*H2_p*(BRENT_n[x:]+DIFF_DIESEL_n[x:])*conv
    Rev[8,x:] = Diesel_CO2*H2_p*ETS2_n[x:]
    Rev[9,x:] = Diesel_mass*H2_p*RED_d_n[x:]
    Tot_Rev = np.sum(Rev,axis=0)

    Loan[0,x:x+dp] = payper(dr,dp,CAPEX*d_e)
    Loan[1,:] = CAPEX*d_e
    for j in range(x,N+1):
        if Loan[1,j-1] > 0:
            Loan[2,j] = Loan[1,j-1]*dr
            Loan[3,j] = Loan[0,j]-Loan[2,j]
            Loan[1,j] = Loan[1,j-1]-Loan[3,j]

    Dep[x:x+DeP_n] = CAPEX/DeP_n
    Tax[0,:] = Tot_Rev-Tot_Exp-Dep-Loan[2,:]
    Tax[0,Tax[0,:]<0]=0
    Tax[1,x:] = Tax[0,x:]*tax

    OCF = Tot_Rev-Tot_Exp-Loan[0,:]-Tax[1,:]
    DCF = OCF/DF_n
    CCF = np.cumsum(DCF)
    VAN = CCF[-1]

    Kero = Rev[3:7,x]/(Kero_mass*H2_p)
    Diesel_k = Rev[7:10,x]/(Diesel_mass*H2_p)
    Naphtha_k = Rev[0:3,x]/(Naphtha_mass*H2_p)

    return dict(y=y,Tot_Exp=Tot_Exp,Tot_Rev=Tot_Rev,OCF=OCF,DCF=DCF,CCF=CCF,VAN=VAN,
                Kero=Kero,Diesel_k=Diesel_k,Naphtha_k=Naphtha_k,LCOH=LCOH,CAPEX=CAPEX,x=x,we=we,Eff=Eff)

r = val('PEM')
print('\\n--- val() check ---')
print('VAN (base ReFuel=1000)', r['VAN'])
print('CCF at x (year 2030)', r['CCF'][r['x']], 'expect ~ -307500 (k€, matches Cash Flows CCF row for 2029)')
print('OCF row sample (2030-2035):', r['OCF'][r['x']:r['x']+6])
print('expect ~ [13488.18]*6')
print('Kero breakdown Fossil/ETS/RED/ReFuel:', r['Kero'])
print('expect approx [744.41, ~318(ETS,diff refuel1000 changes RED), 3611.21, 1000]')

