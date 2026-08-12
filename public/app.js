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

async function loadSubjects() {
  const college = document.getElementById('college').value;
  const subjects = await fetch(`/api/subjects?college=${encodeURIComponent(college)}`).then((r) => r.json());
  const sel = document.getElementById('subject');
  const current = sel.value;
  sel.innerHTML = '<option value="">All Subjects</option>';
  for (const s of subjects) {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    sel.appendChild(opt);
  }
  sel.value = current;
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
  searchTimer = setTimeout(runSearch, 250);
}

async function runSearch() {
  const params = new URLSearchParams();
  const q = document.getElementById('q').value.trim();
  const college = document.getElementById('college').value;
  const subject = document.getElementById('subject').value;
  const modality = document.getElementById('modality').value;
  const openOnly = document.getElementById('open_only').checked;
  if (q) params.set('q', q);
  if (college) params.set('college', college);
  if (subject) params.set('subject', subject);
  if (modality) params.set('modality', modality);
  if (openOnly) params.set('open_only', 'true');

  const countEl = document.getElementById('classes-count');
  const openAllBtn = document.getElementById('open-all-rmp');
  countEl.textContent = 'Searching...';
  openAllBtn.style.display = 'none';

  const rows = await fetch('/api/search?' + params.toString()).then((r) => r.json());
  const tbody = document.querySelector('#classes-table tbody');
  tbody.innerHTML = '';

  for (const c of rows) {
    const tr = document.createElement('tr');
    const seats = c.cap != null ? `${c.act}/${c.cap}` : '—';
    tr.innerHTML = `
      <td>${COLLEGE_NAMES[c.college] || c.college}</td>
      <td>${c.subject} ${c.course_number}</td>
      <td class="title-cell">${c.title || ''}</td>
      <td>${c.crn}</td>
      <td>
        <a class="instructor-link" data-name="${encodeURIComponent(c.instructor)}">${c.instructor || '—'}</a><br>
        ${c.instructor ? ratingHtml(c) + rateButton(c.instructor, c.college) : ''}
      </td>
      <td>${modalityBadge(c.modality)}</td>
      <td>${c.meeting_info || ''}</td>
      <td>${c.location || ''}</td>
      <td>${seats}</td>
      <td>${statusBadge(c.status)}</td>
    `;
    tbody.appendChild(tr);
  }

  countEl.textContent = `${rows.length} section${rows.length === 1 ? '' : 's'}${rows.length === 500 ? ' (showing first 500 — narrow your search)' : ''}`;

  tbody.querySelectorAll('.instructor-link').forEach((link) => {
    link.addEventListener('click', () => {
      switchTab('professors');
      document.getElementById('prof-q').value = decodeURIComponent(link.dataset.name);
      runProfessorSearch();
    });
  });
  wireRateButtons(tbody, runSearch);

  const uniqueInstructors = [...new Set(rows.map((r) => r.instructor).filter(Boolean).filter((n) => n !== 'Staff'))];
  if (uniqueInstructors.length > 0 && uniqueInstructors.length <= 15) {
    openAllBtn.style.display = '';
    openAllBtn.textContent = `Open RateMyProfessor for all ${uniqueInstructors.length} professor${uniqueInstructors.length === 1 ? '' : 's'} shown →`;
    openAllBtn.onclick = () => {
      for (const name of uniqueInstructors) {
        window.open(`https://www.ratemyprofessors.com/search/professors?q=${encodeURIComponent(name)}`, '_blank');
      }
    };
  } else {
    openAllBtn.style.display = 'none';
  }
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
document.getElementById('college').addEventListener('change', () => { loadSubjects(); runSearch(); });
document.getElementById('subject').addEventListener('change', runSearch);
document.getElementById('modality').addEventListener('change', runSearch);
document.getElementById('open_only').addEventListener('change', runSearch);
document.getElementById('prof-q').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(runProfessorSearch, 250); });
document.getElementById('prof-college').addEventListener('change', runProfessorSearch);

(async function init() {
  await loadColleges();
  await loadSubjects();
  await runSearch();
  await runProfessorSearch();
})();
