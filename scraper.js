const cheerio = require('cheerio');
const db = require('./db');

const COLLEGES = {
  GW: 'Golden West College',
  OC: 'Orange Coast College',
  CL: 'Coastline Community College',
};

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function fetchCatalogHtml(college, term, termDesc) {
  const body = new URLSearchParams();
  body.append('TERM', term);
  body.append('TERM_DESC', termDesc);
  body.append('college', college);
  body.append('sel_subj', 'dummy');
  body.append('sel_day', 'dummy');
  body.append('sel_schd', 'dummy');
  body.append('sel_camp', 'dummy');
  body.append('sel_ism', 'dummy');
  body.append('sel_sess', 'dummy');
  body.append('sel_instr', 'dummy');
  body.append('sel_ptrm', 'dummy');
  body.append('sel_attrib', 'dummy');
  body.append('sel_subj', '%');
  body.append('sel_crse', '');
  body.append('sel_crn', '');
  body.append('sel_title', '');
  body.append('sel_ptrm', '%');
  body.append('sel_ism', '%');
  body.append('sel_camp', '%');
  body.append('sel_instr', '%');
  body.append('sel_attrib', '%');
  body.append('sel_sess', '%');
  body.append('begin_hh', '5');
  body.append('begin_mi', '0');
  body.append('begin_ap', 'a');
  body.append('end_hh', '11');
  body.append('end_mi', '0');
  body.append('end_ap', 'p');
  body.append('oo', 'N');
  body.append('aa', 'N');
  body.append('bb', 'N');
  body.append('ee', 'N');

  const res = await fetch('https://ssb-prod.ec.cccd.edu/PROD/pw_pub_sched.p_listthislist', {
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  return res.text();
}

function cellText($, el) {
  return $(el).text().replace(/\s+/g, ' ').trim();
}

// Cross-listed sections show two stacked numbers per cell (this section's own
// count, then the combined cross-listed total) separated by <br>, e.g.
// "<font>35</font><br><font>35</font>" for Cap. Plain .text() concatenates
// both with no separator ("3535"), so pull only the first line's value.
function firstLineText($, el) {
  const html = $(el).html() || '';
  const firstPart = html.split(/<br\s*\/?>/i)[0];
  return firstPart
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseCatalog(html, college, term, termDesc) {
  const $ = cheerio.load(html);
  const rows = $('table tr').toArray();

  let currentSubject = '';
  let courses = [];
  let currentCourse = null;

  for (const row of rows) {
    const $row = $(row);
    const firstTd = $row.find('td').first();

    if (firstTd.hasClass('subject_header')) {
      currentSubject = cellText($, firstTd).split(' - ')[0].trim();
      currentCourse = null;
      continue;
    }
    if (firstTd.hasClass('crn_header')) {
      currentCourse = null; // next data row starts the section; header text isn't needed,
      continue;             // course_number/title come from the popup URL + row cells instead
    }
    if (firstTd.hasClass('column_header_left') || firstTd.hasClass('column_header_center')) {
      continue; // "Status / CRN / Cred / ..." label row
    }

    const popupLink = $row.find('a[href*="p_course_popup?"]').attr('href');
    const m = popupLink && popupLink.match(/vsub=([^&]+)&vcrse=([^&]+)&vterm=([^&]+)&vcrn=([^&]+)&vcoll=([^&]+)/);

    if (m) {
      // The "Meeting Time" block is a single colspan=8 cell for arranged-hours
      // sections, but renders as several separate day/time cells for others --
      // so the total <td> count varies per row. The first 5 cells (Status, I, Z,
      // CRN, Credits) and last 8 (Location..Weeks) are fixed; whatever's left in
      // the middle is the meeting-time block, however many cells it took.
      const tds = $row.find('td').toArray();
      const texts = tds.map((td) => cellText($, td));
      const toInt = (s) => {
        const n = parseInt(s, 10);
        return Number.isNaN(n) ? null : n;
      };
      // Location/Cap/Act/WLCap/WLAct can carry a cross-listed second value
      // stacked via <br>; take only the section's own (first) value.
      const tailTds = tds.slice(-8);
      const tail = tailTds.map((td) => firstLineText($, td));
      const [location, capS, actS, wlCapS, wlActS, instructor, dateRange, weeks] =
        tail.length === 8 ? tail : Array(8).fill('');
      const meetingCells = texts.slice(5, texts.length - 8);

      currentCourse = {
        college,
        term,
        term_desc: termDesc,
        subject: decodeURIComponent(m[1]),
        course_number: decodeURIComponent(m[2]),
        title: '',
        crn: decodeURIComponent(m[4]),
        status: texts[0] || '',
        credits: texts[4] || '',
        meeting_info: meetingCells.filter(Boolean).join(' '),
        location,
        cap: toInt(capS),
        act: toInt(actS),
        wl_cap: toInt(wlCapS),
        wl_act: toInt(wlActS),
        instructor,
        date_range: dateRange,
        weeks,
      };
      courses.push(currentCourse);
    } else if (currentCourse) {
      const extra = cellText($, $row);
      if (extra) {
        currentCourse.meeting_info = currentCourse.meeting_info
          ? currentCourse.meeting_info + ' | ' + extra
          : extra;
      }
    }
  }

  // crn_header text carries "SUBJ NUM - Title"; re-walk to attach titles by matching
  // each course's (subject, course_number) to the nearest preceding crn_header text.
  let idx = 0;
  let pendingTitle = '';
  for (const row of rows) {
    const $row = $(row);
    const firstTd = $row.find('td').first();
    if (firstTd.hasClass('crn_header')) {
      const text = cellText($, firstTd);
      const dash = text.indexOf(' - ');
      pendingTitle = dash >= 0 ? text.slice(dash + 3).trim() : text;
      continue;
    }
    if ($row.find('a[href*="p_course_popup?"]').length && courses[idx]) {
      courses[idx].title = pendingTitle;
      idx++;
    }
  }

  return courses;
}

async function scrapeCollege(college, term, termDesc) {
  const html = await fetchCatalogHtml(college, term, termDesc);
  const courses = parseCatalog(html, college, term, termDesc);

  const upsert = db.prepare(`
    INSERT INTO courses (college, term, term_desc, subject, course_number, title, crn,
      status, credits, meeting_info, location, cap, act, wl_cap, wl_act, instructor,
      date_range, weeks, updated_at)
    VALUES (@college, @term, @term_desc, @subject, @course_number, @title, @crn,
      @status, @credits, @meeting_info, @location, @cap, @act, @wl_cap, @wl_act, @instructor,
      @date_range, @weeks, datetime('now'))
    ON CONFLICT(college, term, crn) DO UPDATE SET
      subject=excluded.subject, course_number=excluded.course_number, title=excluded.title,
      status=excluded.status, credits=excluded.credits, meeting_info=excluded.meeting_info,
      location=excluded.location, cap=excluded.cap, act=excluded.act, wl_cap=excluded.wl_cap,
      wl_act=excluded.wl_act, instructor=excluded.instructor, date_range=excluded.date_range,
      weeks=excluded.weeks, updated_at=excluded.updated_at
  `);

  const insertMany = db.transaction((rows) => {
    for (const c of rows) upsert.run(c);
  });
  insertMany(courses);

  console.log(`${COLLEGES[college]} (${termDesc}): ${courses.length} sections stored`);
  return courses.length;
}

async function main() {
  const term = process.argv[2] || '202670';
  const termDesc = process.argv[3] || 'Fall 2026';
  let total = 0;
  for (const college of Object.keys(COLLEGES)) {
    try {
      total += await scrapeCollege(college, term, termDesc);
    } catch (e) {
      console.error(`Failed for ${college}: ${e.message}`);
    }
  }
  console.log(`Done. ${total} total sections stored for ${termDesc}.`);
}

if (require.main === module) {
  main();
}

module.exports = { scrapeCollege, parseCatalog, COLLEGES };
