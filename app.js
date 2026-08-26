/* ==========================================
   NoteSync HK - Business Logic & UI Control
   ========================================== */

const SUPABASE_URL = "https://prlualxyvddrtpftumqo.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBybHVhbHh5dmRkcnRwZnR1bXFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3NTAzNjMsImV4cCI6MjEwMzMyNjM2M30.ZSCQDc9k7ypnSKuEdQewsdWKpcsa-bAMLETt_VoQUBQ";
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Hong Kong Specific Education Preset Data
const HK_DATA = {
  primary: {
    institutions: ["喇沙小學", "拔萃小學", "瑪利諾修院學校(小學部)", "聖保羅男女中學附屬小學", "軒尼詩道官立小學", "油蠲天主教小學", "其他官立/資助/私立小學"],
    subjects: ["中國語文", "英國語文", "數學科", "常識科", "人文科", "科學科", "音樂科", "視覺藝術"]
  },
  secondary: {
    institutions: ["拔萃男書院", "拔萃女書院", "皇仁書院", "喇沙書院", "協恩中學", "聖保羅男女中学", "荃灣官立中學", "嘉諾撒聖心書院", "其他香港中學 / 國際學校"],
    subjects: [
      "DSE 中國語文", "DSE 英國語文", "DSE 數學必修部分", "DSE M1/M2", "DSE 公民與社會發展科",
      "DSE 物理", "DSE 化學", "DSE 生物", "DSE 經濟", "DSE 企業、會計與財務概論(BAFS)",
      "DSE 地理", "DSE 中國歷史", "DSE 世界歷史", "DSE 資訊及通訊科技(ICT)", "初中科學", "初中人文科"
    ]
  },
  university: {
    institutions: [
      "香港大學 (HKU)", "香港中文大學 (CUHK)", "香港科技大學 (HKUST)", 
      "香港理工大學 (PolyU)", "香港城市大學 (CityU)", "香港浸會大學 (HKBU)", 
      "嶺南大學 (LN)", "香港教育大學 (EdUHK)", "香港都會大學 (HKMU)", "香港樹仁大學 (HKSYU)", "其他大專院校 / IVE / HKCC"
    ],
    subjects: [
      "Computer Science / IT", "Business Administration", "Accounting & Finance",
      "Economics", "Medicine & Nursing", "Engineering", "Law", "Education", "Social Sciences", "Arts & Humanities"
    ]
  }
};

let currentUser = null;
let activeNote = null;
let selectedFile = null;
let searchDebounceTimer = null;
let redirectAfterAuth = false;
let authMode = 'login'; // 'login' or 'register'

const views = {
  discovery: document.getElementById('view-discovery'),
  upload: document.getElementById('view-upload'),
  reader: document.getElementById('view-reader')
};

document.addEventListener('DOMContentLoaded', () => {
  initAuthObserver();
  setupEventListeners();
  fetchNotes();
});

function switchView(viewName) {
  Object.keys(views).forEach(k => views[k].classList.toggle('hidden', k !== viewName));
  window.scrollTo(0, 0);
}

function initAuthObserver() {
  db.auth.onAuthStateChange((event, session) => {
    currentUser = session?.user || null;
    document.getElementById('btn-auth').textContent = currentUser ? '登出' : '登入 / 註冊';
    if (currentUser && redirectAfterAuth) {
      redirectAfterAuth = false;
      document.getElementById('modal-auth').classList.add('hidden');
      switchView('upload');
    }
  });
}

function setupEventListeners() {
  document.getElementById('nav-logo').addEventListener('click', () => switchView('discovery'));
  document.getElementById('btn-back-discovery').addEventListener('click', () => switchView('discovery'));

  // Auth Modal
  document.getElementById('btn-auth').addEventListener('click', () => {
    if (currentUser) db.auth.signOut();
    else {
      document.getElementById('modal-auth').classList.remove('hidden');
      setAuthMode('login'); // reset to login mode
    }
  });
  document.getElementById('btn-close-auth').addEventListener('click', () => document.getElementById('modal-auth').classList.add('hidden'));
  document.getElementById('auth-form').addEventListener('submit', handleAuthSubmit);
  document.getElementById('btn-toggle-auth').addEventListener('click', () => {
    const newMode = authMode === 'login' ? 'register' : 'login';
    setAuthMode(newMode);
  });
  document.getElementById('btn-google-auth').addEventListener('click', handleGoogleAuth);

  // Nav Upload Trigger
  document.getElementById('btn-nav-upload').addEventListener('click', () => {
    if (!currentUser) {
      redirectAfterAuth = true;
      document.getElementById('modal-auth').classList.remove('hidden');
    } else {
      switchView('upload');
    }
  });

  // Discovery Filters
  document.getElementById('search-input').addEventListener('input', () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(fetchNotes, 300);
  });
  document.getElementById('filter-level').addEventListener('change', (e) => {
    const lvl = e.target.value;
    document.getElementById('filter-band').classList.toggle('hidden', lvl !== 'secondary');
    updateFilterOptions(lvl);
    fetchNotes();
  });
  document.getElementById('filter-band').addEventListener('change', fetchNotes);
  document.getElementById('filter-institution').addEventListener('change', fetchNotes);
  document.getElementById('filter-subject').addEventListener('change', fetchNotes);

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      fetchNotes();
    });
  });

  // Form Cascading Logic for HK Education Level
  document.getElementById('form-level').addEventListener('change', (e) => {
    const lvl = e.target.value;
    const bandGroup = document.getElementById('form-band-group');
    bandGroup.classList.toggle('hidden', lvl !== 'secondary');
    populateFormDatalists(lvl);
    toggleInstitutionField(lvl);
  });

  // Smart Dropzone
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) handleFileSelect(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', (e) => { if (e.target.files.length > 0) handleFileSelect(e.target.files[0]); });
  document.getElementById('btn-remove-file').addEventListener('click', resetFileSelection);

  document.getElementById('form-title').addEventListener('input', (e) => {
    document.getElementById('title-counter').textContent = `${e.target.value.length} / 100`;
  });

  document.getElementById('upload-form').addEventListener('submit', handleUploadSubmit);
  document.getElementById('btn-cancel-upload').addEventListener('click', () => { resetUploadForm(); switchView('discovery'); });

  // Reader Actions
  document.getElementById('btn-download-file').addEventListener('click', triggerDownload);
  document.getElementById('btn-bookmark').addEventListener('click', () => {
    if (!currentUser) return document.getElementById('modal-auth').classList.remove('hidden');
    document.getElementById('btn-bookmark').textContent = '💖 已加入收藏';
  });

  // Success Modal
  document.getElementById('btn-success-home').addEventListener('click', () => {
    document.getElementById('modal-success').classList.add('hidden');
    switchView('discovery');
  });
  document.getElementById('btn-success-view').addEventListener('click', () => {
    document.getElementById('modal-success').classList.add('hidden');
    if (activeNote) openReader(activeNote);
  });
}

// ---- Auth helpers ----
function setAuthMode(mode) {
  authMode = mode;
  const title = document.getElementById('auth-modal-title');
  const toggleBtn = document.getElementById('btn-toggle-auth');
  const submitBtn = document.getElementById('btn-auth-submit');
  const errorEl = document.getElementById('auth-error');
  errorEl.classList.add('hidden');
  if (mode === 'login') {
    title.textContent = '登入 NoteSync HK';
    toggleBtn.textContent = '註冊新帳戶';
    submitBtn.textContent = '登入';
  } else {
    title.textContent = '註冊 NoteSync HK';
    toggleBtn.textContent = '返回登入';
    submitBtn.textContent = '註冊';
  }
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-password').value;
  const errorEl = document.getElementById('auth-error');
  errorEl.classList.add('hidden');

  try {
    let result;
    if (authMode === 'login') {
      result = await db.auth.signInWithPassword({ email, password });
    } else {
      result = await db.auth.signUp({ email, password });
    }
    if (result.error) {
      errorEl.textContent = result.error.message;
      errorEl.classList.remove('hidden');
    } else {
      // If sign-up with email confirmation, user may need to confirm
      if (authMode === 'register' && result.data.user && !result.data.session) {
        alert('註冊成功！請檢查你的電郵並點擊確認連結以啟用帳戶。');
        document.getElementById('modal-auth').classList.add('hidden');
      } else {
        document.getElementById('modal-auth').classList.add('hidden');
      }
    }
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
  }
}

async function handleGoogleAuth() {
  try {
    const { error } = await db.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    });
    if (error) throw error;
  } catch (err) {
    alert('Google 登入失敗：' + err.message);
  }
}

// ---- Institution field toggle ----
function toggleInstitutionField(level) {
  const group = document.getElementById('form-institution-group');
  const input = document.getElementById('form-institution');
  if (level === 'university') {
    group.classList.remove('hidden');
    input.required = true;
  } else {
    group.classList.add('hidden');
    input.required = false;
    input.value = 'Not specified'; // default value for DB
  }
}

// ---- Filter and form datalist population ----
function updateFilterOptions(level) {
  const instSelect = document.getElementById('filter-institution');
  const subjSelect = document.getElementById('filter-subject');
  instSelect.innerHTML = '<option value="">所有學校 / 院校</option>';
  subjSelect.innerHTML = '<option value="">所有科目</option>';

  if (level && HK_DATA[level]) {
    HK_DATA[level].institutions.forEach(i => instSelect.innerHTML += `<option value="${i}">${i}</option>`);
    HK_DATA[level].subjects.forEach(s => subjSelect.innerHTML += `<option value="${s}">${s}</option>`);
  }
}

function populateFormDatalists(level) {
  const instDatalist = document.getElementById('institution-options');
  const subjDatalist = document.getElementById('subject-options');
  instDatalist.innerHTML = '';
  subjDatalist.innerHTML = '';

  if (level && HK_DATA[level]) {
    // Only populate institution datalist for university (others hidden)
    if (level === 'university') {
      HK_DATA[level].institutions.forEach(i => instDatalist.innerHTML += `<option value="${i}">`);
    }
    HK_DATA[level].subjects.forEach(s => subjDatalist.innerHTML += `<option value="${s}">`);
  }
}

// ---- Notes fetching and rendering ----
async function fetchNotes() {
  const search = document.getElementById('search-input').value.trim();
  const level = document.getElementById('filter-level').value;
  const band = document.getElementById('filter-band').value;
  const institution = document.getElementById('filter-institution').value;
  const subject = document.getElementById('filter-subject').value;
  const activeSort = document.querySelector('.tab-btn.active').dataset.sort;

  let query = db.from('notes').select('*');
  if (level) query = query.eq('education_level', level);
  if (level === 'secondary' && band) query = query.eq('band', band);
  if (institution) query = query.eq('institution', institution);
  if (subject) query = query.eq('subject', subject);
  if (search) {
    query = query.or(`title.ilike.%${search}%,institution.ilike.%${search}%,subject.ilike.%${search}%`);
  }

  query = query.order(activeSort, { ascending: false });

  const { data, error } = await query;
  if (!error) renderNotesGrid(data);
}

function renderNotesGrid(notes) {
  const grid = document.getElementById('notes-grid');
  grid.innerHTML = '';

  if (!notes || notes.length === 0) {
    grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 3rem;">未有相關香港筆記，快成為第一個上傳的人！</div>`;
    return;
  }

  notes.forEach(note => {
    const card = document.createElement('div');
    card.className = 'note-card';
    card.onclick = () => openReader(note);

    let levelBadge = 'badge-secondary-lvl';
    let levelText = '中學';
    if (note.education_level === 'primary') { levelBadge = 'badge-primary-lvl'; levelText = '小學'; }
    if (note.education_level === 'university') { levelBadge = 'badge-university-lvl'; levelText = '大專'; }

    const bandHtml = (note.education_level === 'secondary' && note.band && note.band !== 'N/A') 
      ? `<span class="badge badge-band">${note.band}</span>` : '';

    card.innerHTML = `
      <div>
        <div style="margin-bottom:0.4rem;">
          <span class="badge ${levelBadge}">${levelText}</span>
          ${bandHtml}
        </div>
        <h3 class="card-title">${escapeHtml(note.title)}</h3>
        <div class="card-tags">
          <span class="tag">🏫 ${escapeHtml(note.institution)}</span>
          <span class="tag">📖 ${escapeHtml(note.subject)}</span>
        </div>
      </div>
      <div class="card-footer">
        <span>📥 ${note.download_count} 次下載</span>
        <span>${new Date(note.created_at).toLocaleDateString()}</span>
      </div>
    `;
    grid.appendChild(card);
  });
}

// ---- File selection and upload ----
function handleFileSelect(file) {
  const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'text/markdown'];
  const ext = file.name.split('.').pop().toLowerCase();
  const errEl = document.getElementById('upload-error');
  errEl.classList.add('hidden');

  if (!allowed.includes(file.type) && ext !== 'md') {
    errEl.textContent = '格式不符合，請上傳 PDF、圖片 (PNG/JPG) 或 Markdown 檔案。';
    errEl.classList.remove('hidden');
    return;
  }

  if (file.size > 25 * 1024 * 1024) {
    errEl.textContent = '檔案大小不可大於 25MB！';
    errEl.classList.remove('hidden');
    return;
  }

  selectedFile = file;
  document.getElementById('dropzone').classList.add('hidden');
  document.getElementById('file-preview-card').classList.remove('hidden');
  document.getElementById('preview-filename').textContent = file.name;
  document.getElementById('preview-filesize').textContent = (file.size / (1024 * 1024)).toFixed(2) + ' MB';
}

function resetFileSelection() {
  selectedFile = null;
  document.getElementById('file-input').value = '';
  document.getElementById('dropzone').classList.remove('hidden');
  document.getElementById('file-preview-card').classList.add('hidden');
}

async function handleUploadSubmit(e) {
  e.preventDefault();
  if (!selectedFile) return alert('請先選取筆記檔案！');

  const submitBtn = document.getElementById('btn-submit-upload');
  const progressContainer = document.getElementById('progress-container');
  const progressBar = document.getElementById('progress-bar');
  const progressText = document.getElementById('progress-text');

  submitBtn.disabled = true;
  submitBtn.textContent = '正在上傳筆記...';
  progressContainer.classList.remove('hidden');

  try {
    const fileExt = selectedFile.name.split('.').pop().toLowerCase();
    const fileName = `hk_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `public/${fileName}`;

    let percent = 0;
    const interval = setInterval(() => {
      if (percent < 90) {
        percent += 15;
        progressBar.style.width = `${percent}%`;
        progressText.textContent = `${percent}%`;
      }
    }, 100);

    const { error: storageErr } = await db.storage.from('notes_files').upload(filePath, selectedFile);
    clearInterval(interval);
    if (storageErr) throw storageErr;

    progressBar.style.width = '100%';
    progressText.textContent = '100%';

    let fileType = 'pdf';
    if (selectedFile.type.includes('image')) fileType = 'image';
    if (fileExt === 'md') fileType = 'markdown';

    const level = document.getElementById('form-level').value;
    const band = (level === 'secondary') ? document.getElementById('form-band').value : 'N/A';

    // Institution: if hidden, value already set to 'Not specified'
    const institution = document.getElementById('form-institution').value || 'Not specified';

    const payload = {
      user_id: currentUser.id,
      title: document.getElementById('form-title').value,
      education_level: level,
      band: band,
      institution: institution,
      subject: document.getElementById('form-subject').value,
      description: document.getElementById('form-description').value,
      file_path: filePath,
      file_type: fileType,
      file_size: selectedFile.size
    };

    const { data: newNote, error: dbErr } = await db.from('notes').insert([payload]).select().single();
    if (dbErr) throw dbErr;

    activeNote = newNote;
    resetUploadForm();
    document.getElementById('modal-success').classList.remove('hidden');
  } catch (err) {
    alert('發布失敗：' + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '確認發布筆記';
    progressContainer.classList.add('hidden');
  }
}

function resetUploadForm() {
  resetFileSelection();
  document.getElementById('upload-form').reset();
  document.getElementById('title-counter').textContent = '0 / 100';
  document.getElementById('form-band-group').classList.add('hidden');
  // Show institution group by default (will be hidden based on level in change event)
  document.getElementById('form-institution-group').classList.remove('hidden');
  document.getElementById('form-institution').required = true;
  document.getElementById('form-institution').value = '';
}

// ---- Reader and download ----
async function openReader(note) {
  activeNote = note;
  
  const levelBadge = document.getElementById('reader-level-badge');
  const bandBadge = document.getElementById('reader-band-badge');

  if (note.education_level === 'primary') {
    levelBadge.textContent = '小學';
    levelBadge.className = 'badge badge-primary-lvl';
  } else if (note.education_level === 'university') {
    levelBadge.textContent = '大專';
    levelBadge.className = 'badge badge-university-lvl';
  } else {
    levelBadge.textContent = '中學';
    levelBadge.className = 'badge badge-secondary-lvl';
  }

  if (note.education_level === 'secondary' && note.band && note.band !== 'N/A') {
    bandBadge.textContent = note.band;
    bandBadge.classList.remove('hidden');
  } else {
    bandBadge.classList.add('hidden');
  }

  document.getElementById('reader-title').textContent = note.title;
  document.getElementById('reader-institution').textContent = note.institution;
  document.getElementById('reader-subject').textContent = note.subject;
  document.getElementById('reader-description').textContent = note.description || '無詳細說明';
  document.getElementById('reader-downloads').textContent = note.download_count;
  document.getElementById('reader-date').textContent = new Date(note.created_at).toLocaleDateString();

  const { data } = db.storage.from('notes_files').getPublicUrl(note.file_path);
  const viewerBody = document.getElementById('viewer-body');
  viewerBody.innerHTML = '';

  if (note.file_type === 'pdf') {
    viewerBody.innerHTML = `<iframe src="${data.publicUrl}" width="100%" height="100%" style="border:none;"></iframe>`;
  } else if (note.file_type === 'image') {
    viewerBody.innerHTML = `<img src="${data.publicUrl}" alt="Preview">`;
  } else if (note.file_type === 'markdown') {
    const res = await fetch(data.publicUrl);
    const text = await res.text();
    viewerBody.innerHTML = `<div class="markdown-body">${marked.parse(text)}</div>`;
  }

  switchView('reader');
}

async function triggerDownload() {
  if (!activeNote) return;
  await db.rpc('increment_download_count', { note_id: activeNote.id });
  activeNote.download_count += 1;
  document.getElementById('reader-downloads').textContent = activeNote.download_count;

  const { data } = db.storage.from('notes_files').getPublicUrl(activeNote.file_path);
  const a = document.createElement('a');
  a.href = data.publicUrl;
  a.download = activeNote.title;
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
