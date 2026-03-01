

const state = {
  coords: { lat: 61.4991, lon: 23.7871 },
  timezone: 'Europe/Helsinki',
  data: null,
  charts: {},
  place: null,
};

const $ = (sel) => document.querySelector(sel);

const elements = {
  lat: $('#lat'),
  lon: $('#lon'),
  refresh: $('#refresh'),
  status: $('#status'),
  place: $('#place'),
  loader: $('#loader'),
  tabs: document.querySelectorAll('.tab'),
  panels: {
    temperature: $('#panel-temperature'),
    wind: $('#panel-wind'),
    humidity: $('#panel-humidity'),
  },
  tables: {
    temperature: $('#table-temperature'),
    wind: $('#table-wind'),
    humidity: $('#table-humidity'),
  },
  cards: {
    temperature: $('#cards-temperature'),
    wind: $('#cards-wind'),
    humidity: $('#cards-humidity'),
  },
  canvases: {
    temperature: /** @type {HTMLCanvasElement} */ (document.getElementById('chart-temperature')),
    wind: /** @type {HTMLCanvasElement} */ (document.getElementById('chart-wind')),
    humidity: /** @type {HTMLCanvasElement} */ (document.getElementById('chart-humidity')),
  }
};

function setStatus(msg) { elements.status.textContent = msg; }
function toggleLoader(show) { elements.loader.classList.toggle('active', !!show); }

function buildUrl(lat, lon, { includeForecastDaysZero = true } = {}) {
  const base = 'https://api.open-meteo.com/v1/forecast';
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    hourly: ['temperature_2m','wind_speed_10m','relative_humidity_2m'].join(','),
    past_days: '1',
    timezone: state.timezone,
  });
  if (includeForecastDaysZero) params.set('forecast_days', '0');
  return `${base}?${params.toString()}`;
}

async function fetchWeather() {
  const lat = parseFloat(elements.lat.value);
  const lon = parseFloat(elements.lon.value);
  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    setStatus('Please enter valid coordinates.');
    return;
  }
  state.coords = { lat, lon };

  let url = buildUrl(lat, lon, { includeForecastDaysZero: true });
  try {
    toggleLoader(true);
    setStatus('Fetching weather data…');
    let res = await fetch(url);
    if (!res.ok) {
      
      console.warn('Primary request failed. Retrying without forecast_days…');
      url = buildUrl(lat, lon, { includeForecastDaysZero: false });
      res = await fetch(url);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    state.data = json;
    setStatus(`Loaded ${json?.hourly?.time?.length ?? 0} hourly records.`);
    renderAll();
    
    resolvePlaceName(lat, lon).catch(console.warn);
  } catch (err) {
    console.error(err);
    setStatus('Failed to fetch data. Please try again.');
  } finally {
    toggleLoader(false);
  }
}


async function resolvePlaceName(lat, lon) {
  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lon));
    url.searchParams.set('format', 'json');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('accept-language', 'en');
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': 'TAMK-Weather-Dashboard/1.0 (non-commercial student project)' }
    });
    if (!res.ok) throw new Error(`Reverse geocoding HTTP ${res.status}`);
    const data = await res.json();
    const a = data.address || {};
    
    const city = a.city || a.town || a.village || a.municipality || a.county || a.state || 'Unknown';
    const country = a.country || '';
    state.place = `${city}${country ? ', ' + country : ''}`;
    elements.place.textContent = state.place;
  } catch (e) {
    console.warn('Reverse geocoding failed', e);
    elements.place.textContent = `Lat ${lat.toFixed(3)}, Lon ${lon.toFixed(3)}`;
  }
}


function fmtTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: 'short', day: '2-digit', hour: '2-digit' });
  } catch { return iso; }
}


function getLastN(key, n = 20) {
  const h = state.data?.hourly;
  if (!h) return { times: [], values: [], unit: '' };
  const times = h.time.slice(-n);
  const values = (h[key] || []).slice(-n);
  const unit = state.data?.hourly_units?.[key] || '';
  return { times, values, unit };
}


function calcMean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function calcMedian(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function calcMode(arr) {
  if (!arr.length) return '--';
  const counts = {};
  let maxFreq = 0;
  let mode = arr[0].toFixed(1);
  for (const v of arr) {
    const rounded = v.toFixed(1); // Round to 1 decimal to find meaningful mode
    counts[rounded] = (counts[rounded] || 0) + 1;
    if (counts[rounded] > maxFreq) {
      maxFreq = counts[rounded];
      mode = rounded;
    }
  }
  return mode;
}

function calcStdDev(arr, mean) {
  if (!arr.length) return 0;
  const variance = arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / arr.length;
  return Math.sqrt(variance);
}

function renderCards(view, last, allValues) {
  const container = elements.cards[view];
  container.innerHTML = '';
  if (!last.values.length || !allValues || !allValues.length) return;

  
  const latestVal = last.values[last.values.length - 1];
  const min20 = Math.min(...last.values);
  const max20 = Math.max(...last.values);
  const avg20 = last.values.reduce((a,b)=>a+b,0) / last.values.length;

  
  const mean = calcMean(allValues);
  const median = calcMedian(allValues);
  const mode = calcMode(allValues);
  const minAll = Math.min(...allValues);
  const maxAll = Math.max(...allValues);
  const range = maxAll - minAll;
  const stdDev = calcStdDev(allValues, mean);

  
  const cards = [
    { title: 'Mean', value: `${mean.toFixed(2)} ${last.unit}` },
    { title: 'Median', value: `${median.toFixed(2)} ${last.unit}` },
    { title: 'Mode', value: `${mode} ${last.unit}` },
    { title: 'Range', value: `${range.toFixed(2)} ${last.unit}` },
    { title: 'Std Deviation', value: `${stdDev.toFixed(2)} ${last.unit}` },
    { title: 'Min / Max', value: `${minAll.toFixed(1)} / ${maxAll.toFixed(1)} ${last.unit}` },
    { title: 'Latest', value: `${latestVal.toFixed(1)} ${last.unit}` },
    { title: 'Average (20)', value: `${avg20.toFixed(1)} ${last.unit}` },
    { title: 'Min / Max (20)', value: `${min20.toFixed(1)} / ${max20.toFixed(1)} ${last.unit}` },
  ];

  for (const c of cards) {
    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML = `<h3>${c.title}</h3><div class="value">${c.value}</div>`;
    container.appendChild(el);
  }
}

function renderTable(view, last) {
  const tbody = elements.tables[view];
  tbody.innerHTML = '';
  for (let i = last.times.length - 1; i >= 0; i--) { // latest first
    const tr = document.createElement('tr');
    const t = document.createElement('td');
    t.textContent = fmtTime(last.times[i]);
    const v = document.createElement('td');
    v.textContent = `${Number(last.values[i]).toFixed(1)} ${last.unit}`;
    tr.appendChild(t); tr.appendChild(v); tbody.appendChild(tr);
  }
}

function renderChart(view, last, label, color) {
  try {
    if (state.charts[view]) state.charts[view].destroy();
    const ctx = elements.canvases[view].getContext('2d');
    state.charts[view] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: last.times.map(fmtTime),
        datasets: [{
          label: `${label} (${last.unit})`,
          data: last.values,
          fill: true,
          borderColor: color,
          backgroundColor: color + '33',
          pointRadius: 2,
          tension: 0.35,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { grid: { color: 'rgba(148,163,184,0.15)' } },
          y: { grid: { color: 'rgba(148,163,184,0.12)' } },
        },
        plugins: {
          legend: { labels: { color: getComputedStyle(document.documentElement).getPropertyValue('--text') } },
          tooltip: { intersect: false, mode: 'index' },
        }
      }
    });
  } catch (err) {
    console.warn('Chart render failed. Is Chart.js loaded correctly?', err);
  }
}

function renderViewTemperature() {
  const last = getLastN('temperature_2m', 20);
  const allValues = state.data?.hourly?.temperature_2m || [];
  renderCards('temperature', last, allValues);
  renderChart('temperature', last, 'Temperature', '#22d3ee');
  renderTable('temperature', last);
}
function renderViewWind() {
  const last = getLastN('wind_speed_10m', 20);
  const allValues = state.data?.hourly?.wind_speed_10m || [];
  renderCards('wind', last, allValues);
  renderChart('wind', last, 'Wind speed', '#a78bfa');
  renderTable('wind', last);
}
function renderViewHumidity() {
  const last = getLastN('relative_humidity_2m', 20);
  const allValues = state.data?.hourly?.relative_humidity_2m || [];
  renderCards('humidity', last, allValues);
  renderChart('humidity', last, 'Relative humidity', '#34d399');
  renderTable('humidity', last);
}

function renderAll() {
  renderViewTemperature();
  renderViewWind();
  renderViewHumidity();
}

function activateTab(view) {
  
  elements.tabs.forEach(btn => {
    const active = btn.dataset.view === view;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  });


  for (const [k, panel] of Object.entries(elements.panels)) {
    const active = k === view;
    panel.classList.toggle('active', active);
    panel.hidden = !active;
  }
}

for (const btn of elements.tabs) {
  btn.addEventListener('click', () => activateTab(btn.dataset.view));
}

elements.refresh.addEventListener('click', fetchWeather);

document.addEventListener('DOMContentLoaded', () => {
  fetchWeather();
});






























