/**
 * Elevation profile.
 *
 * Line segments are colored by grade so descents (regen) and climbs (cost)
 * are legible at a glance without reading any number.
 */
import { COLOR, MI, FT } from './config.js';
import { S } from './state.js';
import { $ } from './utils.js';
import { fmtElev } from './format.js';

if (window.Chart){
  Chart.defaults.font.family = "'Space Grotesk', system-ui, sans-serif";
  Chart.defaults.font.size = 11;
}

let chart = null;

/** Grade threshold in percent below which a segment is drawn as flat. */
const FLAT = 0.5;

export function renderChart(){
  const r = S.routes[S.selected];
  const box = $('chartBox');

  if (!r || !r.prof || !window.Chart){
    box.style.display = 'none';
    if (chart){ chart.destroy(); chart = null; }
    return;
  }

  box.style.display = 'block';
  $('chartTitle').textContent = 'Elevation \u00b7 Route ' + String.fromCharCode(65 + S.selected);
  $('chipDown').innerHTML = '&#8600; ' + fmtElev(r.m ? r.m.down : 0);
  $('chipUp').innerHTML = '&#8599; ' + fmtElev(r.m ? r.m.up : 0);

  const distF = S.units === 'mi' ? 1 / MI : 1 / 1000;
  const elevF = S.units === 'mi' ? 1 / FT : 1;
  const pts = r.prof.d.map((d, i) => ({ x: d * distF, y: r.prof.e[i] * elevF }));

  /* Precompute a color per segment; Chart.js asks for them one at a time. */
  const segColors = [];
  for (let i = 1; i < r.prof.d.length; i++){
    const dd = (r.prof.d[i] - r.prof.d[i - 1]) || 1;
    const grade = (r.prof.e[i] - r.prof.e[i - 1]) / dd * 100;
    segColors.push(grade <= -FLAT ? COLOR.grn : grade >= FLAT ? COLOR.amb : COLOR.dim);
  }

  if (chart) chart.destroy();
  chart = new Chart($('elevChart'), {
    type: 'line',
    data: { datasets: [{
      data: pts,
      parsing: false,
      borderWidth: 2.25,
      pointRadius: 0,
      tension: 0.25,
      fill: 'origin',
      backgroundColor: 'rgba(61,220,151,.06)',
      segment: { borderColor: ctx => segColors[ctx.p0DataIndex] || COLOR.dim }
    }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'nearest', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          callbacks: {
            title: items => items.length
              ? items[0].parsed.x.toFixed(1) + (S.units === 'mi' ? ' mi' : ' km')
              : '',
            label: item => Math.round(item.parsed.y).toLocaleString() +
              (S.units === 'mi' ? ' ft elevation' : ' m elevation')
          }
        }
      },
      scales: {
        x: {
          type: 'linear', min: 0,
          grid: { color: COLOR.grid },
          ticks: {
            color: COLOR.tick, maxTicksLimit: 7,
            callback: v => v + (S.units === 'mi' ? ' mi' : ' km')
          }
        },
        y: {
          grid: { color: COLOR.grid },
          ticks: { color: COLOR.tick, maxTicksLimit: 5 },
          grace: '12%'
        }
      }
    }
  });
}
