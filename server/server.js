/* server/server.js
   Express proxy: NAVER Geocode/ReverseGeocode + HIRA #4/#5
   Do NOT commit real secrets. Use env vars on Render.
*/
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch'); // v2
const { parseStringPromise } = require('xml2js');
const path = require('path');
require('dotenv').config();

// ----- init app (먼저 선언!)
const app = express();
app.use(cors());
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, 'public')));

// ----- env (fallback 허용)
const PORT = process.env.PORT || 3001;

const NCP_ID =
  process.env.NCP_ID ||
  process.env.NAVER_CLIENT_ID ||
  process.env.NCP_CLIENT_ID ||
  process.env.X_NCP_APIGW_API_KEY_ID;

const NCP_KEY =
  process.env.NCP_KEY ||
  process.env.NAVER_CLIENT_SECRET ||
  process.env.NCP_CLIENT_SECRET ||
  process.env.X_NCP_APIGW_API_KEY;

const HIRA_KEY =
  process.env.HIRA_SERVICE_KEY ||
  process.env.HIRA_KEY ||
  process.env.SERVICE_KEY; // URL-encoded 권장

function required(v, name){ if(!v) throw new Error(`${name} is required`); }
function toJsonSafe(t){ try { return JSON.parse(t); } catch { return null; } }

// ----- health/debug
app.get('/healthz', (req,res)=> res.json({ok:true}));
app.get('/debug/env', (req,res)=> res.json({
  ncp_id_present: !!NCP_ID, ncp_key_present: !!NCP_KEY, hira_key_present: !!HIRA_KEY
}));
app.get('/debug/routes', (req,res)=> res.json({
  ok:true,
  routes:[
    'GET /healthz',
    'GET /api/geocode',
    'GET /api/revgeocode',
    'GET /api/hira/hosp-list2 | /api/hira/hospList2 | /api/hira/list2',
    'GET /api/hira/hosp-dtl  | /api/hira/hospDtl  | /api/hira/detail',
    'GET /api/codes',
    'GET /public/map.html'
  ]
}));

// ----- NAVER
app.get('/api/geocode', async (req,res)=>{
  try{
    required(NCP_ID,'NCP_ID'); required(NCP_KEY,'NCP_KEY');
    const query = req.query.query || '';
    const url = `https://naveropenapi.apigw.ntruss.com/map-geocode/v2/geocode?query=${encodeURIComponent(query)}`;
    const r = await fetch(url, { headers:{
      'X-NCP-APIGW-API-KEY-ID': NCP_ID,
      'X-NCP-APIGW-API-KEY': NCP_KEY,
      'Accept':'application/json'
    }});
    const text = await r.text();
    if(!r.ok) return res.status(r.status).send(text);
    const json = toJsonSafe(text); if(!json) return res.status(502).send('Invalid JSON from NAVER');
    res.json(json);
  }catch(e){ res.status(500).send(String(e)); }
});

app.get('/api/revgeocode', async (req,res)=>{
  try{
    required(NCP_ID,'NCP_ID'); required(NCP_KEY,'NCP_KEY');
    const { lat, lng } = req.query;
    const coords = `${encodeURIComponent(lng)},${encodeURIComponent(lat)}`;
    const url = `https://naveropenapi.apigw.ntruss.com/map-reversegeocode/v2/gc?coords=${coords}&output=json&orders=admcode,addr`;
    const r = await fetch(url, { headers:{
      'X-NCP-APIGW-API-KEY-ID': NCP_ID,
      'X-NCP-APIGW-API-KEY': NCP_KEY,
      'Accept':'application/json'
    }});
    const text = await r.text();
    if(!r.ok) return res.status(r.status).send(text);
    const json = toJsonSafe(text); if(!json) return res.status(502).send('Invalid JSON from NAVER');
    res.json(json);
  }catch(e){ res.status(500).send(String(e)); }
});

// ----- HIRA
const HIRA_BASE = 'http://apis.data.go.kr/B551182/nonPaymentDamtInfoService';

async function hiraHospList2Handler(req,res){
  try{
    required(HIRA_KEY,'HIRA_SERVICE_KEY');
    const params = new URLSearchParams();
    params.set('ServiceKey', HIRA_KEY);
    const allow = ['pageNo','numOfRows','itemCd','clCd','sidoCd','sgguCd','yadmNm','searchWrd'];
    for(const k of allow) if(req.query[k]) params.set(k, req.query[k]);
    const url = `${HIRA_BASE}/getNonPaymentItemHospList2?${params.toString()}`;
    const r = await fetch(url);
    const xml = await r.text();
    if(!r.ok) return res.status(r.status).send(xml);
    const parsed = await parseStringPromise(xml, { explicitArray:false, trim:true });
    res.json(parsed);
  }catch(e){ res.status(500).send(String(e)); }
}
async function hiraHospDtlHandler(req,res){
  try{
    required(HIRA_KEY,'HIRA_SERVICE_KEY');
    const params = new URLSearchParams();
    params.set('ServiceKey', HIRA_KEY);
    const allow = ['pageNo','numOfRows','ykiho','clCd','sidoCd','sgguCd','yadmNm'];
    for(const k of allow) if(req.query[k]) params.set(k, req.query[k]);
    const url = `${HIRA_BASE}/getNonPaymentItemHospDtlList?${params.toString()}`;
    const r = await fetch(url);
    const xml = await r.text();
    if(!r.ok) return res.status(r.status).send(xml);
    const parsed = await parseStringPromise(xml, { explicitArray:false, trim:true });
    res.json(parsed);
  }catch(e){ res.status(500).send(String(e)); }
}

// 별칭 라우트(버전 혼재 대비)
app.get(['/api/hira/hosp-list2','/api/hira/hospList2','/api/hira/list2'], hiraHospList2Handler);
app.get(['/api/hira/hosp-dtl','/api/hira/hospDtl','/api/hira/detail'],   hiraHospDtlHandler);

// 코드 목록
app.get('/api/codes', (req,res)=>{
  try{
    const data = require('./data/codes.json');
    res.json(data);
  }catch(e){ res.status(500).send(String(e)); }
});

// listen
app.listen(PORT, ()=> console.log(`Proxy listening on port ${PORT}`));
