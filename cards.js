/**
 * Sidebar: the status line and the route comparison cards.
 */
import { S } from './state.js';
import { $, el } from './utils.js';
import { emit } from './bus.js';
import { fmtDist, fmtDur, fmtElev, fmtWh, fmtEff } from './format.js';

/** Write the status line. @param {''|'ok'|'err'} [cls] */
export function status(msg, cls){
  const s = $('status');
  s.textContent = msg;
  s.className = cls || '';
}

/** Superlatives worth calling out, computed across the current result set. */
function badgesFor(idx){
  const out = [];
  if (S.routes.length < 2) return out;

  const withM = S.routes.filter(r => r.m);
  const minNet = withM.length ? Math.min(...withM.map(r => r.m.netWh)) : null;
  const maxReg = withM.length ? Math.max(...withM.map(r => r.m.regWh)) : null;
  const minDur = Math.min(...S.routes.map(r => r.duration));

  const r = S.routes[idx];
  if (r.m && r.m.netWh === minNet) out.push(['Most efficient', 'grn']);
  if (r.m && maxReg > 0 && r.m.regWh === maxReg) out.push(['Most regen', 'grn']);
  if (r.duration === minDur) out.push(['Fastest', 'blu']);
  return out;
}

export function renderCards(){
  const wrap = $('cards');
  wrap.innerHTML = '';

  S.routes.forEach((r, i) => {
    const c = el('div', 'card' + (i === S.selected ? ' sel' : ''));
    c.tabIndex = 0;
    c.setAttribute('role', 'button');

    const name = 'Route ' + String.fromCharCode(65 + i);
    const badges = badgesFor(i)
      .map(b => '<span class="badge ' + b[1] + '">' + b[0] + '</span>')
      .join('');

    let html =
      '<div class="card-top"><span class="rname">' + name + '</span>' +
      '<span class="badges">' + badges + '</span></div>' +
      '<div class="stats">' +
      '<div class="stat"><b>' + fmtDist(r.distance) + '</b><span>distance</span></div>' +
      '<div class="stat"><b>' + fmtDur(r.duration) + '</b><span>drive time</span></div>';

    if (r.m){
      html +=
        '<div class="stat down"><b>' + fmtElev(r.m.down, '-') + '</b><span>descent</span></div>' +
        '<div class="stat up"><b>' + fmtElev(r.m.up, '+') + '</b><span>ascent</span></div>';
    } else {
      html +=
        '<div class="stat"><b>n/a</b><span>descent</span></div>' +
        '<div class="stat"><b>n/a</b><span>ascent</span></div>';
    }
    html += '</div>';

    if (r.m){
      const pct = Math.round(Math.min(1, Math.max(0, r.m.downShare)) * 100);
      html +=
        '<div class="ebar" title="' + pct + '% of this route is downhill">' +
        '<i style="width:' + pct + '%"></i></div>' +
        '<div class="energy">' +
        '<span>Net battery <b>' + fmtWh(r.m.netWh) + '</b></span>' +
        '<span class="reg">Regen <b>+' + fmtWh(r.m.regWh) + '</b></span>' +
        '<span><b>' + fmtEff(r.m.netWh, r.distance) + '</b></span>' +
        '</div>';
    } else {
      html += '<div class="noel">Elevation service unavailable for this route; ' +
        'energy was not estimated.</div>';
    }

    c.innerHTML = html;
    c.addEventListener('click', () => emit('route:select', i));
    c.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); emit('route:select', i); }
    });
    wrap.appendChild(c);
  });
}

/** Cheap highlight update that avoids a full re-render on selection change. */
export function markSelected(){
  document.querySelectorAll('#cards .card')
    .forEach((c, k) => c.classList.toggle('sel', k === S.selected));
}
