export const STATUSES = Object.freeze(['Received', 'Diagnosing', 'Waiting for Parts', 'Repaired', 'Delivered']);
export const DATA_VERSION = 1;
const CURRENCIES = new Set(['PKR', 'USD', 'GBP', 'EUR', 'AED']);

export function makeId(prefix = 'JOB', now = Date.now(), random = Math.random()) {
  const entropy = Math.floor(random * 0x100000000).toString(36).padStart(7, '0');
  return `${prefix}-${new Date(now).toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${entropy}`;
}

export function normalizeJob(input, existing = null, now = new Date()) {
  const text = (v) => String(v ?? '').trim();
  const price = Number(input.estimatedPrice);
  const advance = Number(input.advance || 0);
  const balanceCollected = Number(input.balanceCollected ?? existing?.balanceCollected ?? 0);
  const status = text(input.status || existing?.status || 'Received');
  const errors = [];
  if (!text(input.customerName)) errors.push('Customer name is required.');
  if (!text(input.customerPhone)) errors.push('Customer phone is required.');
  if (!text(input.deviceModel)) errors.push('Device model is required.');
  if (!text(input.fault)) errors.push('Fault description is required.');
  if (!Number.isFinite(price) || price < 0) errors.push('Estimated price must be zero or more.');
  if (!Number.isFinite(advance) || advance < 0) errors.push('Advance must be zero or more.');
  if (Number.isFinite(price) && Number.isFinite(advance) && advance > price) errors.push('Advance cannot exceed the estimate.');
  if (!Number.isFinite(balanceCollected) || balanceCollected < 0) errors.push('Final balance collected must be zero or more.');
  if (Number.isFinite(price) && Number.isFinite(advance) && Number.isFinite(balanceCollected) && balanceCollected > price - advance) errors.push('Final balance collected cannot exceed the estimate after the advance.');
  if (status !== 'Delivered' && balanceCollected !== 0) errors.push('Final balance collected must be zero unless the job is Delivered.');
  if (!STATUSES.includes(status)) errors.push('Choose one of the supported statuses.');
  if (errors.length) throw new Error(errors.join(' '));
  const timestamp = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const id = existing?.id || text(input.id) || makeId('JOB', Date.parse(timestamp));
  const deliveredAt = status === 'Delivered' ? (existing?.deliveredAt || timestamp) : null;
  return {
    id, customerName: text(input.customerName), customerPhone: text(input.customerPhone),
    deviceModel: text(input.deviceModel), imei: text(input.imei), fault: text(input.fault),
    accessories: text(input.accessories), estimatedPrice: Math.round(price * 100) / 100,
    advance: Math.round(advance * 100) / 100, balanceCollected: Math.round(balanceCollected * 100) / 100, status,
    createdAt: existing?.createdAt || timestamp, updatedAt: timestamp, deliveredAt
  };
}

export function normalizeExpense(input, now = new Date()) {
  const amount = Number(input.amount);
  if (!String(input.title ?? '').trim()) throw new Error('Expense title is required.');
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Expense must be greater than zero.');
  const date = input.date ? new Date(input.date) : now;
  if (Number.isNaN(date.getTime())) throw new Error('Expense date is invalid.');
  return { id: input.id || makeId('EXP', date.getTime()), title: String(input.title).trim(), category: String(input.category || 'Other').trim(), amount: Math.round(amount * 100) / 100, date: date.toISOString(), createdAt: input.createdAt || now.toISOString() };
}

export function normalizePart(input, now = new Date()) {
  const name = String(input.name ?? '').trim();
  const quantity = Number(input.quantity);
  const threshold = Number(input.lowStockAt ?? 2);
  if (!name) throw new Error('Part name is required.');
  if (!Number.isInteger(quantity) || quantity < 0) throw new Error('Quantity must be a whole number of zero or more.');
  if (!Number.isInteger(threshold) || threshold < 0) throw new Error('Low-stock threshold must be a whole number of zero or more.');
  return { id: input.id || makeId('PART', now.getTime()), name, quantity, lowStockAt: threshold, updatedAt: now.toISOString() };
}

/** Return an ISO date-only value unchanged, or a timestamp's date in the local calendar. */
export function dateKey(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Date is invalid.');
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function collectedEntries(jobs) {
  const entries = [];
  for (const job of jobs) {
    const advance = Math.max(0, Number(job.advance) || 0);
    if (advance) entries.push({ date: job.createdAt, amount: advance, kind: 'Advance', jobId: job.id });
    if (job.status === 'Delivered') {
      const balance = Math.max(0, Number(job.balanceCollected) || 0);
      if (balance) entries.push({ date: job.deliveredAt || job.updatedAt || job.createdAt, amount: balance, kind: 'Delivery balance', jobId: job.id });
    }
  }
  return entries;
}
export function totalCollected(jobs, expenses = [], { from, to } = {}) {
  const start = from ? dateKey(from) : null;
  const end = to ? dateKey(to) : null;
  const revenue = collectedEntries(jobs).filter(e => (!start || dateKey(e.date) >= start) && (!end || dateKey(e.date) <= end)).reduce((n, e) => n + e.amount, 0);
  const cost = expenses.filter(e => (!start || dateKey(e.date) >= start) && (!end || dateKey(e.date) <= end)).reduce((n, e) => n + (Number(e.amount) || 0), 0);
  return { revenue: cents(revenue), expenses: cents(cost), net: cents(revenue - cost) };
}
function cents(n) { return Math.round(n * 100) / 100; }
export function periodRevenue(jobs, start, end) {
  return cents(collectedEntries(jobs).filter(e => dateKey(e.date) >= dateKey(start) && dateKey(e.date) <= dateKey(end)).reduce((sum, e) => sum + e.amount, 0));
}

const within = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;
const isDate = value => {
  if (typeof value !== 'string' || !value.trim()) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return date.getUTCFullYear() === Number(year) && date.getUTCMonth() + 1 === Number(month) && date.getUTCDate() === Number(day);
};
const isTimestamp = value => isDate(value) && typeof value === 'string' && value.includes('T');
const optionalText = (record, field, label) => {
  const value = record[field] ?? '';
  if (typeof value !== 'string') throw new Error(`Backup contains an invalid ${label}.`);
  return value;
};
const requiredDate = (record, field, label) => {
  if (!isDate(record[field])) throw new Error(`Backup contains an invalid ${label}.`);
  return record[field];
};
const requiredTimestamp = (record, field, label) => {
  if (!isTimestamp(record[field])) throw new Error(`Backup contains an invalid ${label}.`);
  return record[field];
};

export function validateBackup(payload) {
  if (!payload || payload.app !== 'repairdesk' || payload.version !== DATA_VERSION || !payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data)) throw new Error('This is not a supported RepairDesk backup.');
  const data = payload.data;
  for (const key of ['jobs', 'expenses', 'parts']) if (!Array.isArray(data[key])) throw new Error(`Backup is missing a valid ${key} list.`);
  const ids = new Set();
  const jobs = data.jobs.map(j => {
    if (!j || typeof j !== 'object' || Array.isArray(j) || !within(j.id, 200) || ids.has(j.id) || !STATUSES.includes(j.status)) throw new Error('Backup contains an invalid job or duplicate job ID.');
    ids.add(j.id);
    for (const [field, limit] of Object.entries({ customerName: 100, customerPhone: 32, deviceModel: 100, fault: 500 })) if (!within(j[field], limit)) throw new Error(`Backup job has an invalid ${field}.`);
    const createdAt = requiredTimestamp(j, 'createdAt', 'job date');
    const updatedAt = requiredTimestamp(j, 'updatedAt', 'job date');
    const deliveredAt = j.deliveredAt == null || j.deliveredAt === '' ? null : requiredTimestamp(j, 'deliveredAt', 'job date');
    if (j.status === 'Delivered' && !deliveredAt) throw new Error('Backup contains an invalid job date.');
    if (typeof j.estimatedPrice !== 'number' || !Number.isFinite(j.estimatedPrice) || j.estimatedPrice < 0 || typeof j.advance !== 'number' || !Number.isFinite(j.advance) || j.advance < 0 || j.advance > j.estimatedPrice || (j.balanceCollected !== undefined && (typeof j.balanceCollected !== 'number' || !Number.isFinite(j.balanceCollected) || j.balanceCollected < 0))) throw new Error('Backup contains an invalid job amount.');
    const balanceCollected = j.balanceCollected ?? 0;
    if (balanceCollected > j.estimatedPrice - j.advance || (j.status !== 'Delivered' && balanceCollected !== 0)) throw new Error('Backup contains an invalid job amount.');
    const imei = optionalText(j, 'imei', 'job IMEI');
    const accessories = optionalText(j, 'accessories', 'job accessories');
    if (imei.length > 40 || accessories.length > 200) throw new Error('Backup contains an invalid job text field.');
    return {
      id: j.id.trim(), customerName: j.customerName.trim(), customerPhone: j.customerPhone.trim(),
      deviceModel: j.deviceModel.trim(), imei, fault: j.fault.trim(), accessories, estimatedPrice: j.estimatedPrice,
      advance: j.advance, balanceCollected, status: j.status, createdAt, updatedAt, deliveredAt
    };
  });
  const uniqueIds = new Set();
  const expenses = data.expenses.map(e => {
    if (!e || typeof e !== 'object' || Array.isArray(e) || !within(e.id, 200) || uniqueIds.has(`expenses:${e.id}`)) throw new Error('Backup contains an invalid expenses record.');
    uniqueIds.add(`expenses:${e.id}`);
    if (!within(e.title, 100) || typeof e.amount !== 'number' || !Number.isFinite(e.amount) || e.amount <= 0) throw new Error('Backup contains an invalid expense.');
    const date = requiredDate(e, 'date', 'expense date');
    const createdAt = requiredTimestamp(e, 'createdAt', 'expense createdAt');
    const category = e.category == null || e.category === '' ? 'Other' : optionalText(e, 'category', 'expense category');
    if (category.length > 80) throw new Error('Backup contains an invalid expense.');
    return { id: e.id.trim(), title: e.title.trim(), category, amount: e.amount, date, createdAt };
  });
  const parts = data.parts.map(p => {
    if (!p || typeof p !== 'object' || Array.isArray(p) || !within(p.id, 200) || uniqueIds.has(`parts:${p.id}`)) throw new Error('Backup contains an invalid parts record.');
    uniqueIds.add(`parts:${p.id}`);
    if (!within(p.name, 100) || typeof p.quantity !== 'number' || !Number.isInteger(p.quantity) || p.quantity < 0 || typeof p.lowStockAt !== 'number' || !Number.isInteger(p.lowStockAt) || p.lowStockAt < 0) throw new Error('Backup contains invalid inventory quantities.');
    const updatedAt = requiredTimestamp(p, 'updatedAt', 'part updatedAt');
    return { id: p.id.trim(), name: p.name.trim(), quantity: p.quantity, lowStockAt: p.lowStockAt, updatedAt };
  });
  let settings = { id: 'app', currency: 'PKR', privacyRedact: false };
  if (data.settings !== undefined) {
    const input = data.settings;
    if (!input || typeof input !== 'object' || Array.isArray(input) || JSON.stringify(input).length > 1024) throw new Error('Backup contains invalid settings.');
    if (Object.keys(input).some(key => !['id', 'currency', 'privacyRedact'].includes(key)) || (input.id !== undefined && input.id !== 'app') || (input.currency !== undefined && !CURRENCIES.has(input.currency)) || (input.privacyRedact !== undefined && typeof input.privacyRedact !== 'boolean')) throw new Error('Backup contains invalid settings.');
    settings = { id: 'app', currency: input.currency ?? 'PKR', privacyRedact: input.privacyRedact ?? false };
  }
  return { jobs, expenses, parts, settings };
}

export const CSV_JOB_FIELDS = Object.freeze(['id','customerName','customerPhone','deviceModel','imei','fault','accessories','estimatedPrice','advance','balanceCollected','status','createdAt','updatedAt','deliveredAt']);
const FORMULA_PREFIX = /^[=+\-@\t\r']/;
const protectCSV = value => {
  const text = String(value ?? '');
  return FORMULA_PREFIX.test(text) ? `'${text}` : text;
};
function unprotectCSV(value) {
  if (value.startsWith("''") || /^'[=+\-@\t\r]/.test(value)) return value.slice(1);
  return value;
}
export function exportJobsCSV(jobs) {
  const quote = value => `"${protectCSV(value).replaceAll('"','""')}"`;
  return [CSV_JOB_FIELDS.join(','), ...jobs.map(job => CSV_JOB_FIELDS.map(field => quote(job[field])).join(','))].join('\r\n');
}
export function importJobsCSV(text) {
  const rows=[]; let row=[],field='',quoted=false;
  const source=String(text).replace(/^\uFEFF/,'');
  for(let i=0;i<source.length;i++){
    const ch=source[i];
    if(quoted){
      if(ch==='"'&&source[i+1]==='"'){field+='"';i++;}
      else if(ch==='"')quoted=false;
      else field+=ch;
    } else if(ch==='"'){
      if(field.length)throw new Error('CSV has an unexpected quote.');
      quoted=true;
    } else if(ch===','){row.push(field);field='';}
    else if(ch==='\n'||ch==='\r'){
      if(ch==='\r'&&source[i+1]==='\n')i++;
      row.push(field);field='';
      if(row.some(v=>v!==''))rows.push(row);
      row=[];
    } else field+=ch;
  }
  if(quoted)throw new Error('CSV has an unclosed quoted field.');
  row.push(field);if(row.some(v=>v!==''))rows.push(row);
  if(!rows.length||rows[0].join(',')!==CSV_JOB_FIELDS.join(','))throw new Error('CSV header does not match RepairDesk jobs export.');
  const jobs=rows.slice(1).map((values,index)=>{
    if(values.length!==CSV_JOB_FIELDS.length)throw new Error(`CSV row ${index+2} has the wrong number of columns.`);
    const record=Object.fromEntries(CSV_JOB_FIELDS.map((key,i)=>[key,unprotectCSV(values[i])]));
    for (const field of ['estimatedPrice','advance','balanceCollected']) record[field]=Number(record[field]);
    if (record.deliveredAt === '') record.deliveredAt = null;
    return record;
  });
  const result=validateBackup({app:'repairdesk',version:DATA_VERSION,data:{jobs,expenses:[],parts:[]}});
  return result.jobs;
}

export function createDemoData() {
  const now = new Date();
  const iso = (daysAgo, hour = 10) => { const d = new Date(now); d.setDate(d.getDate() - daysAgo); d.setHours(hour, 30, 0, 0); return d.toISOString(); };
  const seeds = [
    ['DEMO-001','Demo Customer A','000-000-0000 (synthetic)','Pixel 8','Synthetic screen fault','Case, SIM tray',180,60,'Diagnosing',2],
    ['DEMO-002','Demo Customer B','000-000-0000 (synthetic)','Galaxy A54','Synthetic charging issue','Charger',95,35,'Waiting for Parts',4],
    ['DEMO-003','Demo Customer C','000-000-0000 (synthetic)','iPhone 12','Synthetic battery fault','No accessories',120,50,'Delivered',1],
    ['DEMO-004','Demo Customer D','000-000-0000 (synthetic)','Redmi Note 12','Synthetic speaker fault','SIM card',65,0,'Received',0],
    ['DEMO-005','Demo Customer E','000-000-0000 (synthetic)','Nokia G22','Synthetic camera fault','Protective case',75,25,'Repaired',3]
  ];
  const jobs = seeds.map(([id,customerName,customerPhone,deviceModel,fault,accessories,estimatedPrice,advance,status,age]) => {
    const createdAt = iso(age);
    return { id, customerName, customerPhone, deviceModel, imei:'DEMO ONLY · not a real IMEI', fault, accessories, estimatedPrice, advance, balanceCollected:status==='Delivered'?estimatedPrice-advance:0, status, createdAt, updatedAt: status==='Delivered'?iso(age,15):iso(0,9), deliveredAt:status==='Delivered'?iso(age,15):null };
  });
  const expenses = [
    {id:'DEMO-EXP-01',title:'Demo parts supply',category:'Parts',amount:42,date:iso(1),createdAt:iso(1)},
    {id:'DEMO-EXP-02',title:'Demo shop utilities',category:'Utilities',amount:18,date:iso(5),createdAt:iso(5)}
  ];
  const parts = [
    {id:'DEMO-PART-01',name:'USB-C charging flex',quantity:1,lowStockAt:3,updatedAt:iso(0)},
    {id:'DEMO-PART-02',name:'Screen adhesive kit',quantity:8,lowStockAt:2,updatedAt:iso(0)},
    {id:'DEMO-PART-03',name:'Universal battery tape',quantity:2,lowStockAt:2,updatedAt:iso(0)}
  ];
  return {jobs,expenses,parts};
}
