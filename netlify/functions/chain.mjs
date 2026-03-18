// Black-Scholes implementation
function norm(x) {
  const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911;
  const sign = x<0 ? -1 : 1;
  const t = 1/(1+p*Math.abs(x)/Math.sqrt(2));
  const y = 1-(((((a5*t+a4)*t+a3)*t+a2)*t+a1)*t)*Math.exp(-x*x/2);
  return 0.5*(1+sign*y);
}

function bsm(S,K,T,r,sigma,type) {
  if(T<=0) {
    const intrinsic = type==='CE' ? Math.max(S-K,0) : Math.max(K-S,0);
    return { price:intrinsic, delta:type==='CE'?(S>K?1:0):(S<K?-1:0), gamma:0, theta:0, vega:0, iv:sigma*100 };
  }
  const d1 = (Math.log(S/K)+(r+sigma*sigma/2)*T)/(sigma*Math.sqrt(T));
  const d2 = d1 - sigma*Math.sqrt(T);
  const Nd1 = norm(d1), Nd2 = norm(d2);
  const Nd1n = norm(-d1), Nd2n = norm(-d2);
  const npd1 = Math.exp(-d1*d1/2)/Math.sqrt(2*Math.PI);
  let price, delta;
  if(type==='CE') { price=S*Nd1-K*Math.exp(-r*T)*Nd2; delta=Nd1; }
  else            { price=K*Math.exp(-r*T)*Nd2n-S*Nd1n; delta=Nd1-1; }
  const gamma = npd1/(S*sigma*Math.sqrt(T));
  const theta = type==='CE'
    ? (-S*npd1*sigma/(2*Math.sqrt(T))-r*K*Math.exp(-r*T)*Nd2)/365
    : (-S*npd1*sigma/(2*Math.sqrt(T))+r*K*Math.exp(-r*T)*Nd2n)/365;
  const vega = S*npd1*Math.sqrt(T)/100;
  return { price:Math.max(price,0.05), delta:parseFloat(delta.toFixed(3)), gamma:parseFloat(gamma.toFixed(5)), theta:parseFloat(theta.toFixed(2)), vega:parseFloat(vega.toFixed(2)), iv:parseFloat((sigma*100).toFixed(1)) };
}

export default async (req) => {
  const url = new URL(req.url);
  const underlying = url.searchParams.get('underlying') || 'NIFTY';
  const expiry     = url.searchParams.get('expiry')     || '0';

  const baseSpots  = { NIFTY:23400, BANKNIFTY:51240, FINNIFTY:23800, MIDCPNIFTY:12400, SENSEX:77200 };
  const baseIVs    = { NIFTY:14.5,  BANKNIFTY:16.2,  FINNIFTY:15.8,  MIDCPNIFTY:18.4,  SENSEX:13.8 };
  const strikeSteps= { NIFTY:50,    BANKNIFTY:100,   FINNIFTY:50,    MIDCPNIFTY:50,    SENSEX:200  };
  const lotSizes   = { NIFTY:75,    BANKNIFTY:15,    FINNIFTY:40,    MIDCPNIFTY:120,   SENSEX:10   };
  const dteMap     = { '0':0,'7':7,'13':13,'21':21,'27':27 };

  const spot      = baseSpots[underlying]   || 23400;
  const baseIV    = baseIVs[underlying]     || 14.5;
  const step      = strikeSteps[underlying] || 50;
  const lotSize   = lotSizes[underlying]    || 75;
  const dte       = dteMap[expiry]          ?? 7;
  const T         = dte / 365;
  const r         = 0.065;
  const vixAdj    = 21.1 / 15;

  const atm = Math.round(spot / step) * step;
  const rows = [];

  for (let i = -6; i <= 6; i++) {
    const strike = atm + i * step;
    const moneyness = (strike - spot) / spot;
    // Volatility smile — higher IV for OTM
    const smileAdj = 1 + Math.abs(moneyness) * 2.5 + (moneyness < 0 ? 0.08 : 0);
    const iv = baseIV * smileAdj * vixAdj / 100;

    const call = bsm(spot, strike, T, r, iv, 'CE');
    const put  = bsm(spot, strike, T, r, iv, 'PE');

    // OI data (synthetic)
    const seed = strike + dte;
    const callOI = Math.round((500 + Math.abs(Math.sin(seed * 0.01) * 8000)) * 100);
    const putOI  = Math.round((500 + Math.abs(Math.cos(seed * 0.01) * 8000)) * 100);

    rows.push({
      strike,
      atm: i === 0,
      callLTP:    parseFloat(call.price.toFixed(1)),
      callDelta:  call.delta,
      callGamma:  call.gamma,
      callTheta:  call.theta,
      callVega:   call.vega,
      callIV:     call.iv,
      callOI,
      putLTP:     parseFloat(put.price.toFixed(1)),
      putDelta:   put.delta,
      putGamma:   put.gamma,
      putTheta:   put.theta,
      putVega:    put.vega,
      putIV:      put.iv,
      putOI,
    });
  }

  return new Response(JSON.stringify({
    ok: true, underlying, spot, atm, lotSize, dte,
    vix: 21.1, vixChange: -0.54, vixChangePct: -2.50,
    futPrice: parseFloat((spot * 1.0015).toFixed(2)),
    rows,
  }), { status:200, headers:{'Content-Type':'application/json'} });
};
export const config = { path:'/api/chain' };
