import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { STATUSES, makeId, normalizeJob, normalizeExpense, normalizePart, totalCollected, collectedEntries, validateBackup, exportJobsCSV, importJobsCSV, createDemoData, dateKey } from '../src/core.mjs';

const base={customerName:'A Customer',customerPhone:'03001234567',deviceModel:'Phone X',imei:'123456789012345',fault:'Cracked display',accessories:'Case',estimatedPrice:10000,advance:2500,status:'Received'};
const at=(day,hour=12)=>new Date(`2026-04-${String(day).padStart(2,'0')}T${String(hour).padStart(2,'0')}:00:00.000Z`);

function demoBackup(settings={currency:'PKR',privacyRedact:false}) {
  const data=createDemoData();
  return {app:'repairdesk',version:1,exportedAt:at(1).toISOString(),data:{...data,settings}};
}

test('workflow uses exactly the five requested statuses',()=>{
  assert.deepEqual(STATUSES,['Received','Diagnosing','Waiting for Parts','Repaired','Delivered']);
  for(const status of STATUSES) assert.equal(normalizeJob({...base,status},null,at(1)).status,status);
  assert.throws(()=>normalizeJob({...base,status:'In progress'},null,at(1)),/supported statuses/);
});

test('job IDs are stable on edit and timestamps are ISO dates',()=>{
  const first=normalizeJob(base,null,at(1));
  const edited=normalizeJob({...first,customerName:'Updated Name'},first,at(2));
  assert.equal(edited.id,first.id);
  assert.equal(edited.createdAt,first.createdAt);
  assert.equal(edited.updatedAt,at(2).toISOString());
  assert.match(makeId('JOB',at(1).getTime(),0.42),/^JOB-\d{14}-[a-z0-9]+$/);
});

test('job validation rejects missing contact/device/fault and invalid money',()=>{
  assert.throws(()=>normalizeJob({...base,customerPhone:''},null,at(1)),/Customer phone is required/);
  assert.throws(()=>normalizeJob({...base,estimatedPrice:-1},null,at(1)),/Estimated price/);
  assert.throws(()=>normalizeJob({...base,advance:10001},null,at(1)),/cannot exceed/);
  assert.throws(()=>normalizeJob({...base,deviceModel:''},null,at(1)),/Device model/);
  assert.throws(()=>normalizeJob({...base,status:'Delivered',balanceCollected:7501},null,at(1)),/cannot exceed the estimate after the advance/);
  assert.throws(()=>normalizeJob({...base,status:'Received',balanceCollected:1},null,at(1)),/must be zero unless the job is Delivered/);
  const delivered=normalizeJob({...base,status:'Delivered',balanceCollected:7500},null,at(1));
  assert.throws(()=>normalizeJob({...delivered,status:'Received'},delivered,at(2)),/must be zero unless the job is Delivered/);
});

test('delivered jobs timestamp delivery and received advances are collected cash, not estimates',()=>{
  const received=normalizeJob(base,null,at(1));
  const uncollected=normalizeJob({...base,status:'Delivered'},null,at(2));
  assert.equal(totalCollected([uncollected],[]).revenue,2500,'an estimate is not cash received');
  const delivered=normalizeJob({...base,status:'Delivered',balanceCollected:7500},null,at(2));
  const entries=collectedEntries([received,delivered]);
  assert.equal(entries.length,3);
  assert.deepEqual(entries.map(x=>x.amount),[2500,2500,7500]);
  assert.equal(entries[2].kind,'Delivery balance');
  assert.equal(totalCollected([received],[]).revenue,2500);
  assert.equal(totalCollected([delivered],[]).revenue,10000);
});

test('period totals separate cash receipts, expenses and net; date filters apply to cash dates',()=>{
  const received=normalizeJob({...base,createdAt:at(1).toISOString()},null,at(1));
  const delivered=normalizeJob({...base,status:'Delivered',balanceCollected:7500},null,at(3));
  const expenses=[normalizeExpense({title:'Parts',category:'Parts',amount:800,date:at(2).toISOString()},at(2))];
  assert.deepEqual(totalCollected([received,delivered],expenses),{revenue:12500,expenses:800,net:11700});
  assert.equal(totalCollected([received,delivered],expenses,{from:at(1),to:at(1)}).revenue,2500);
  // The delivered job was created on day 3, so its advance and final balance are both in this range.
  assert.equal(totalCollected([received,delivered],expenses,{from:at(2),to:at(3)}).revenue,10000);
});

test('dateKey preserves date-only inputs and uses local calendar dates for timestamps',()=>{
  assert.equal(dateKey('2026-04-03'),'2026-04-03');
  const script=`import {dateKey,totalCollected} from ${JSON.stringify(new URL('../src/core.mjs',import.meta.url).href)}; const stamp='2026-04-03T01:30:00.000Z'; const job={id:'J',createdAt:stamp,advance:5,status:'Received'}; console.log(JSON.stringify([dateKey(stamp),dateKey('2026-04-03'),totalCollected([job],[],{from:'2026-04-02',to:'2026-04-02'}).revenue]));`;
  const child=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',env:{...process.env,TZ:'America/Los_Angeles'}});
  assert.equal(child.status,0,child.stderr);
  assert.deepEqual(JSON.parse(child.stdout),['2026-04-02','2026-04-03',5]);
});

test('expenses and inventory validate their inputs',()=>{
  assert.throws(()=>normalizeExpense({title:'',amount:4},at(1)),/title/);
  assert.throws(()=>normalizeExpense({title:'Parts',amount:0},at(1)),/greater than zero/);
  assert.throws(()=>normalizePart({name:'Screen',quantity:1.2,lowStockAt:2},at(1)),/whole number/);
  assert.equal(normalizePart({name:'Screen',quantity:1,lowStockAt:2},at(1)).quantity,1);
});

test('backup validation returns canonical safe records and rejects malformed required fields',()=>{
  const backup=demoBackup();
  const result=validateBackup(backup);
  assert.equal(result.jobs.length,5);
  assert.deepEqual(result.settings,{id:'app',currency:'PKR',privacyRedact:false});
  assert.deepEqual(Object.keys(result.jobs[0]),['id','customerName','customerPhone','deviceModel','imei','fault','accessories','estimatedPrice','advance','balanceCollected','status','createdAt','updatedAt','deliveredAt']);
  assert.equal('unexpected' in validateBackup({...backup,data:{...backup.data,jobs:[{...backup.data.jobs[0],unexpected:'drop me'}]}}).jobs[0],false);
  assert.throws(()=>validateBackup({...backup,version:99}),/supported RepairDesk backup/);
  assert.throws(()=>validateBackup({...backup,data:{...backup.data,jobs:[{...backup.data.jobs[0],status:'In progress'}]}}),/invalid job/);
  assert.throws(()=>validateBackup({...backup,data:{...backup.data,jobs:[{...backup.data.jobs[0],advance:'35'}]}}),/invalid job amount/);
  assert.throws(()=>validateBackup({...backup,data:{...backup.data,jobs:[{...backup.data.jobs[0],customerName:'  '}]}}),/customerName/);
  assert.throws(()=>validateBackup({...backup,data:{...backup.data,jobs:[{...backup.data.jobs[0],createdAt:'2026-02-30T12:00:00.000Z'}]}}),/invalid job date/);
  assert.throws(()=>validateBackup({...backup,data:{...backup.data,jobs:[{...backup.data.jobs[0],balanceCollected:1}]}}),/invalid job amount/);
  assert.throws(()=>validateBackup({...backup,data:{...backup.data,expenses:[{id:'x',title:'Parts',amount:2,date:'not-a-date',createdAt:at(1).toISOString()}]}}),/invalid expense/);
  assert.throws(()=>validateBackup({...backup,data:{...backup.data,expenses:[{...backup.data.expenses[0],title:''}]}}),/invalid expense/);
  assert.throws(()=>validateBackup({...backup,data:{...backup.data,expenses:[{...backup.data.expenses[0],createdAt:''}]}}),/expense createdAt/);
  assert.throws(()=>validateBackup({...backup,data:{...backup.data,expenses:[{...backup.data.expenses[0],amount:'42'}]}}),/invalid expense/);
  assert.throws(()=>validateBackup({...backup,data:{...backup.data,parts:[{...backup.data.parts[0],name:''}]}}),/inventory/);
  assert.throws(()=>validateBackup({...backup,data:{...backup.data,parts:[{...backup.data.parts[0],updatedAt:''}]}}),/part updatedAt/);
  assert.throws(()=>validateBackup({...backup,data:{...backup.data,parts:[{...backup.data.parts[0],quantity:'1'}]}}),/inventory/);
  assert.throws(()=>validateBackup({...backup,data:{...backup.data,jobs:[{...backup.data.jobs[0],customerName:'x'.repeat(101)}]}}),/customerName/);
});

test('backup settings are allowlisted, typed, bounded, and canonicalized',()=>{
  const backup=demoBackup({id:'app',currency:'AED',privacyRedact:true,ignored:'discard'});
  assert.throws(()=>validateBackup(backup),/invalid settings/);
  assert.deepEqual(validateBackup(demoBackup({id:'app',currency:'AED',privacyRedact:true})).settings,{id:'app',currency:'AED',privacyRedact:true});
  for(const currency of ['SAR','CAD','']) assert.throws(()=>validateBackup(demoBackup({currency})),/invalid settings/);
  assert.throws(()=>validateBackup(demoBackup({privacyRedact:'false'})),/invalid settings/);
  assert.throws(()=>validateBackup(demoBackup({currency:'PKR',privacyRedact:false,extra:'x'.repeat(2048)})),/invalid settings/);
  assert.throws(()=>validateBackup({...demoBackup(),data:{...demoBackup().data,settings:[]} }),/invalid settings/);
});

test('CSV export/import reversibly protects formula-like strings and retains CSV quoting',()=>{
  const job=normalizeJob({...base,customerName:'=SUM(1,1)',customerPhone:'+923001234567',imei:'@handle',accessories:"'already apostrophe",fault:'Line one, "quoted"\nLine two'},null,at(1));
  const csv=exportJobsCSV([job]);
  assert.match(csv,/'=SUM/);
  assert.match(csv,/'\+923/);
  assert.match(csv,/'@handle/);
  assert.match(csv,/''already apostrophe/);
  const roundTrip=importJobsCSV(csv);
  assert.equal(roundTrip.length,1);
  for(const field of ['customerName','customerPhone','imei','accessories','fault']) assert.equal(roundTrip[0][field],job[field]);
  assert.equal(roundTrip[0].id,job.id);
  assert.throws(()=>importJobsCSV('wrong,header\na,b'),/header/);
  assert.throws(()=>importJobsCSV(csv.replace('Received','In progress')),/invalid job/);
  assert.throws(()=>importJobsCSV('id,customerName\n"unclosed'),/unclosed quoted/);
});

test('demo records are visibly synthetic, contain no full IMEI and never use a real phone number',()=>{
  const {jobs}=createDemoData();
  assert.equal(jobs.length,5);
  for(const j of jobs){assert.match(j.customerName,/Demo Customer/);assert.match(j.customerPhone,/^000-000-0000 \(synthetic\)$/);assert.equal(j.imei,'DEMO ONLY · not a real IMEI');}
});
