const COLLEGE_NAMES = { GW: 'Golden West', OC: 'Orange Coast', CL: 'Coastline' };

async function loadColleges() {
  const colleges = await fetch('/api/colleges').then((r) => r.json());
  for (const sel of [document.getElementById('college'), document.getElementById('prof-college')]) {
    for (const c of colleges) {
      const opt = document.createElement('option');
      opt.value = c.code;
      opt.textContent = c.name;
      sel.appendChild(opt);
    }
  }
}

async function loadRequirements() {
  const requirements = await fetch('/api/ge-requirements').then((r) => r.json());
  const sel = document.getElementById('requirement');
  for (const r of requirements) {
    const opt = document.createElement('option');
    opt.value = r.key;
    opt.textContent = r.label;
    sel.appendChild(opt);
  }
}

function statusBadge(status) {
  const s = (status || '').toLowerCase();
  if (s.includes('open')) return `<span class="badge open">${status}</span>`;
  if (s.includes('closed')) return `<span class="badge closed">${status}</span>`;
  if (s.includes('wait')) return `<span class="badge waitlist">${status}</span>`;
  return `<span class="badge">${status || '—'}</span>`;
}

function modalityBadge(modality) {
  const cls = 'modality-' + (modality || 'tba').toLowerCase().replace(/\s+/g, '-');
  return `<span class="badge ${cls}">${modality || 'TBA'}</span>`;
}

function ratingHtml(row) {
  const stars = row.avg_rating != null
    ? `<span class="stars">★ ${row.avg_rating}</span> <span>(${row.rating_count})</span>`
    : `<span class="no-rating">No ratings yet</span>`;
  return `<span class="rating">${stars}</span>`;
}

function rateButton(instructor, college) {
  return `<button class="rate-btn" data-instructor="${encodeURIComponent(instructor)}" data-college="${college}">Rate</button>`;
}

function wireRateButtons(container, onRated) {
  container.querySelectorAll('.rate-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      openRateModal(decodeURIComponent(btn.dataset.instructor), btn.dataset.college, onRated);
    });
  });
}

let searchTimer = null;
function debounceSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runCourseSearch, 250);
}

// ---- Units dual-range slider ----
const unitsMinEl = document.getElementById('units-min');
const unitsMaxEl = document.getElementById('units-max');
const unitsMinLabel = document.getElementById('units-min-label');
const unitsMaxLabel = document.getElementById('units-max-label');
const unitsRangeBar = document.getElementById('unit-slider-range');
const SLIDER_MAX = 5;

function renderUnitSlider() {
  let lo = Number(unitsMinEl.value);
  let hi = Number(unitsMaxEl.value);
  if (lo > hi) { [lo, hi] = [hi, lo]; unitsMinEl.value = lo; unitsMaxEl.value = hi; }
  unitsMinLabel.textContent = lo;
  unitsMaxLabel.textContent = hi >= SLIDER_MAX ? `${SLIDER_MAX}+` : hi;
  const loPct = (lo / SLIDER_MAX) * 100;
  const hiPct = (hi / SLIDER_MAX) * 100;
  unitsRangeBar.style.left = `${loPct}%`;
  unitsRangeBar.style.right = `${100 - hiPct}%`;
}

[unitsMinEl, unitsMaxEl].forEach((el) => {
  el.addEventListener('input', () => { renderUnitSlider(); debounceSearch(); });
});
renderUnitSlider();

async function runCourseSearch() {
  const params = new URLSearchParams();
  const q = document.getElementById('q').value.trim();
  const college = document.getElementById('college').value;
  const requirement = document.getElementById('requirement').value;
  const modality = document.getElementById('modality').value;
  const sort = document.getElementById('sort').value;
  const unitsMin = Number(unitsMinEl.value);
  const unitsMax = Number(unitsMaxEl.value);
  const checkedStatuses = [...document.querySelectorAll('.status-cb:checked')].map((cb) => cb.value);
  const allStatuses = document.querySelectorAll('.status-cb').length;

  if (q) params.set('q', q);
  if (college) params.set('college', college);
  if (requirement) params.set('requirement', requirement);
  if (modality) params.set('modality', modality);
  if (sort) params.set('sort', sort);
  if (unitsMin > 0) params.set('units_min', unitsMin);
  if (unitsMax < SLIDER_MAX) params.set('units_max', unitsMax);
  if (checkedStatuses.length < allStatuses) params.set('statuses', checkedStatuses.join(','));

  const countEl = document.getElementById('classes-count');
  countEl.textContent = 'Searching...';

  const cards = await fetch('/api/course-cards?' + params.toString()).then((r) => r.json());
  const grid = document.getElementById('course-cards');
  grid.innerHTML = '';

  for (const c of cards) {
    const div = document.createElement('div');
    div.className = 'course-card';
    const units = c.units_min === c.units_max ? `${c.units_min}` : `${c.units_min}–${c.units_max}`;
    const seatsChip = c.seats_available > 0
      ? `<span class="badge open">${c.seats_available} seat${c.seats_available === 1 ? '' : 's'} open</span>`
      : `<span class="badge closed">Full</span>`;
    div.innerHTML = `
      <div class="course-card-top">
        <span class="course-card-code">${c.subject} ${c.course_number}</span>
        <span class="badge">${units} unit${c.units_max === 1 ? '' : 's'}</span>
      </div>
      <div class="course-card-title">${c.title || ''}</div>
      <div class="course-card-college">${COLLEGE_NAMES[c.college] || c.college}</div>
      ${c.description ? `<p class="course-card-desc">${c.description}</p>` : ''}
      <div class="course-card-bottom">
        ${ratingHtml(c)}
        <span class="course-card-sections">${c.section_count} section${c.section_count === 1 ? '' : 's'}</span>
      </div>
      <div class="course-card-bottom">
        ${seatsChip}
        ${c.requirement_count ? `<span class="badge modality-in-person">${c.requirement_count} requirement${c.requirement_count === 1 ? '' : 's'}</span>` : ''}
      </div>
    `;
    div.addEventListener('click', () => openCourseModal(c.college, c.subject, c.course_number));
    grid.appendChild(div);
  }

  countEl.textContent = `${cards.length} course${cards.length === 1 ? '' : 's'}${cards.length === 300 ? ' (showing first 300 — narrow your search)' : ''}`;
}

async function runProfessorSearch() {
  const params = new URLSearchParams();
  const q = document.getElementById('prof-q').value.trim();
  const college = document.getElementById('prof-college').value;
  if (q) params.set('q', q);
  if (college) params.set('college', college);

  const statusEl = document.getElementById('professors-status');
  statusEl.textContent = 'Searching...';

  const rows = await fetch('/api/instructors?' + params.toString()).then((r) => r.json());
  const tbody = document.querySelector('#professors-table tbody');
  tbody.innerHTML = '';

  for (const p of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${p.instructor}</td>
      <td>${COLLEGE_NAMES[p.college] || p.college}</td>
      <td>${p.section_count}</td>
      <td>${ratingHtml(p)} ${rateButton(p.instructor, p.college)}</td>
      <td><a class="rmp-link" href="${p.rmp_search_url}" target="_blank" rel="noopener">Search on RateMyProfessor →</a></td>
    `;
    tbody.appendChild(tr);
  }
  statusEl.textContent = `${rows.length} instructor${rows.length === 1 ? '' : 's'}`;
  wireRateButtons(tbody, runProfessorSearch);
}

// ---- Course detail modal ----
let currentCourse = null;

async function openCourseModal(college, subject, courseNumber) {
  currentCourse = { college, subject, course_number: courseNumber };
  document.getElementById('course-modal').classList.remove('hidden');
  document.getElementById('course-modal-title').textContent = `${subject} ${courseNumber}`;
  document.getElementById('course-modal-subtitle').textContent = 'Loading...';
  switchCourseTab('overview');

  const data = await fetch(`/api/course/${encodeURIComponent(college)}/${encodeURIComponent(subject)}/${encodeURIComponent(courseNumber)}`).then((r) => r.json());

  document.getElementById('course-modal-title').textContent = `${data.subject} ${data.course_number} — ${data.title || ''}`;
  document.getElementById('course-modal-subtitle').textContent = `${COLLEGE_NAMES[data.college] || data.college} · ${data.term_desc || ''}`;

  const overviewEl = document.getElementById('course-overview-body');
  overviewEl.innerHTML = `
    ${data.description ? `<p>${data.description}</p>` : '<p class="no-rating">No description available.</p>'}
    ${data.corequisites ? `<p><strong>Corequisites:</strong> ${data.corequisites}</p>` : ''}
    ${data.transfer_credit ? `<p><strong>Transfer credit:</strong> ${data.transfer_credit}</p>` : ''}
  `;

  const grid = document.getElementById('section-cards');
  grid.innerHTML = '';
  for (const s of data.sections) {
    const seats = s.cap != null ? `${s.act}/${s.cap}` : '—';
    const rmpUrl = s.instructor
      ? `https://www.ratemyprofessors.com/search/professors?q=${encodeURIComponent(s.instructor)}`
      : null;
    const div = document.createElement('div');
    div.className = 'section-card';
    div.innerHTML = `
      <div class="section-card-top">
        <span class="section-card-crn">CRN ${s.crn}</span>
        ${modalityBadge(s.modality)}
      </div>
      <div class="section-card-instructor">${s.instructor || '—'}</div>
      ${s.instructor ? `
        <div class="section-card-rating">${ratingHtml(s)} ${rateButton(s.instructor, s.college)}</div>
        <div class="section-card-links">
          <a class="rmp-link" href="${rmpUrl}" target="_blank" rel="noopener">Search on RateMyProfessor →</a>
        </div>
      ` : ''}
      <div class="section-card-row"><span class="label">Meeting:</span>${s.meeting_info || '—'}</div>
      <div class="section-card-row"><span class="label">Location:</span>${s.location || '—'}</div>
      <div class="section-card-bottom">
        <span class="section-card-row"><span class="label">Seats:</span>${seats}</span>
        ${statusBadge(s.status)}
      </div>
    `;
    grid.appendChild(div);
  }
  wireRateButtons(grid, () => openCourseModal(college, subject, courseNumber));

  renderRequirements(data.requirements);
}

function renderRequirements(requirements) {
  const list = document.getElementById('course-requirements-list');
  if (!requirements.length) {
    list.innerHTML = '<p class="no-rating">No requirements submitted yet — be the first.</p>';
    return;
  }
  list.innerHTML = requirements.map((r) => `
    <div class="requirement-item">
      <p>${r.requirement_text}</p>
      <span class="requirement-date">${new Date(r.created_at + 'Z').toLocaleDateString()}</span>
    </div>
  `).join('');
}

function closeCourseModal() {
  document.getElementById('course-modal').classList.add('hidden');
  currentCourse = null;
}

function switchCourseTab(name) {
  document.querySelectorAll('.course-tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.ctab === name));
  document.querySelectorAll('.course-tab-panel').forEach((p) => p.classList.toggle('active', p.id === `course-tab-${name}`));
}

document.querySelectorAll('.course-tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => switchCourseTab(btn.dataset.ctab));
});
document.getElementById('course-modal-close').addEventListener('click', closeCourseModal);
document.getElementById('course-modal').addEventListener('click', (e) => {
  if (e.target.id === 'course-modal') closeCourseModal();
});
document.getElementById('requirement-submit').addEventListener('click', async () => {
  if (!currentCourse) return;
  const textEl = document.getElementById('requirement-text');
  const text = textEl.value.trim();
  if (!text) return;
  const res = await fetch('/api/course-requirements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...currentCourse, text }),
  }).then((r) => r.json());
  textEl.value = '';
  renderRequirements(res.requirements);
  runCourseSearch();
});

// ---- Rating modal (shared by classes and professors tabs) ----
let selectedStars = 0;
let rateContext = null;

function openRateModal(instructor, college, onRated) {
  rateContext = { instructor, college, onRated };
  selectedStars = 0;
  document.getElementById('rate-modal-name').textContent = instructor;
  document.getElementById('rate-comment').value = '';
  renderStars();
  document.getElementById('rate-modal').classList.remove('hidden');
}

function closeRateModal() {
  document.getElementById('rate-modal').classList.add('hidden');
  rateContext = null;
}

function renderStars() {
  document.querySelectorAll('#star-picker span').forEach((s) => {
    s.classList.toggle('filled', Number(s.dataset.val) <= selectedStars);
  });
}

document.querySelectorAll('#star-picker span').forEach((s) => {
  s.addEventListener('click', () => { selectedStars = Number(s.dataset.val); renderStars(); });
});
document.getElementById('rate-cancel').addEventListener('click', closeRateModal);
document.getElementById('rate-modal').addEventListener('click', (e) => {
  if (e.target.id === 'rate-modal') closeRateModal();
});
document.getElementById('rate-submit').addEventListener('click', async () => {
  if (!rateContext || !selectedStars) {
    alert('Pick a star rating first.');
    return;
  }
  const comment = document.getElementById('rate-comment').value.trim();
  await fetch('/api/ratings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instructor: rateContext.instructor,
      college: rateContext.college,
      rating: selectedStars,
      comment,
    }),
  });
  const cb = rateContext.onRated;
  closeRateModal();
  if (cb) cb();
});

function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `${name}-tab`));
}

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

document.getElementById('q').addEventListener('input', debounceSearch);
document.getElementById('college').addEventListener('change', runCourseSearch);
document.getElementById('requirement').addEventListener('change', runCourseSearch);
document.getElementById('modality').addEventListener('change', runCourseSearch);
document.getElementById('sort').addEventListener('change', runCourseSearch);
document.querySelectorAll('.status-cb').forEach((cb) => cb.addEventListener('change', runCourseSearch));
document.getElementById('prof-q').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(runProfessorSearch, 250); });
document.getElementById('prof-college').addEventListener('change', runProfessorSearch);

(async function init() {
  await loadColleges();
  await loadRequirements();
  await runCourseSearch();
  await runProfessorSearch();
})();
