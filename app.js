/* ==========================================
   NoteSync HK - Business Logic & UI Control
   ========================================== */

const SUPABASE_URL = "https://prlualxyvddrtpftumqo.supabase.co";[cite: 1]
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBybHVhbHh5dmRkcnRwZnR1bXFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc3NTAzNjMsImV4cCI6MjEwMzMyNjM2M30.ZSCQDc9k7ypnSKuEdQewsdWKpcsa-bAMLETt_VoQUBQ"; // 請替換成你 Supabase Dashboard -> Project Settings -> API 中的 anon key[cite: 1]
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);[cite: 1]

// Hong Kong Specific Education Preset Data (已移除小學及中學的學校選單)
const HK_DATA = {
  primary: {
    institutions: [],
    subjects: ["中國語文", "英國語文", "數學科", "常識科", "人文科", "科學科", "音樂科", "視覺藝術"][cite: 1]
  },
  secondary: {
    institutions: [],
    subjects: [
      "DSE 中國語文", "DSE 英國語文", "DSE 數學必修部分", "DSE M1/M2", "DSE 公民與社會發展科",[cite: 1]
      "DSE 物理", "DSE 化學", "DSE 生物", "DSE 經濟", "DSE 企業、會計與財務概論(BAFS)",[cite: 1]
      "DSE 地理", "DSE 中國歷史", "DSE 世界歷史", "DSE 資訊及通訊科技(ICT)", "初中科學", "初中人文科"[cite: 1]
    ]
  },
  university: {
    institutions: [
      "香港大學 (HKU)", "香港中文大學 (CUHK)", "香港科技大學 (HKUST)", [cite: 1]
      "香港理工大學 (PolyU)", "香港城市大學 (CityU)", "香港浸會大學 (HKBU)", [cite: 1]
      "嶺南大學 (LN)", "香港教育大學 (EdUHK)", "香港都會大學 (HKMU)", "香港樹仁大學 (HKSYU)", "其他大專院校 / IVE / HKCC"[cite: 1]
    ],
    subjects: [
      "Computer Science / IT", "Business Administration", "Accounting & Finance",[cite: 1]
      "Economics", "Medicine & Nursing", "Engineering", "Law", "Education", "Social Sciences", "Arts & Humanities"[cite: 1]
    ]
  }
};

let currentUser = null;[cite: 1]
let activeNote = null;[cite: 1]
let selectedFile = null;[cite: 1]
let searchDebounceTimer = null;[cite: 1]
let redirectAfterAuth = false;[cite: 1]

const views = {
  discovery: document.getElementById('view-discovery'),[cite: 1]
  upload: document.getElementById('view-upload'),[cite: 1]
  reader: document.getElementById('view-reader')[cite: 1]
};

document.addEventListener('DOMContentLoaded', () => {
  initAuthObserver();[cite: 1]
  setupEventListeners();[cite: 1]
  fetchNotes();[cite: 1]
});

function switchView(viewName) {
  Object.keys(views).forEach(k => views[k].classList.toggle('hidden', k !== viewName));[cite: 1]
  window.scrollTo(0, 0);[cite: 1]
}

function initAuthObserver() {
  db.auth.onAuthStateChange((event, session) => {
    currentUser = session?.user || null;[cite: 1]
    document.getElementById('btn-auth').textContent = currentUser ? '登出' : '登入 / 註冊';[cite: 1]
    if (currentUser && redirectAfterAuth) {
      redirectAfterAuth = false;[cite: 1]
      document.getElementById('modal-auth').classList.add('hidden');[cite: 1]
      switchView('upload');[cite: 1]
    }
  });
}

function setupEventListeners() {
  document.getElementById('nav-logo').addEventListener('click', () => switchView('discovery'));[cite: 1]
  document.getElementById('btn-back-discovery').addEventListener('click', () => switchView('discovery'));[cite: 1]

  // Auth Modal
  document.getElementById('btn-auth').addEventListener('click', () => {
    if (currentUser) db.auth.signOut();[cite: 1]
    else document.getElementById('modal-auth').classList.remove('hidden');[cite: 1]
  });
  document.getElementById('btn-close-auth').addEventListener('click', () => document.getElementById('modal-auth').classList.add('hidden'));[cite: 1]
  document.getElementById('auth-form').addEventListener('submit', handleAuthSubmit);[cite: 1]
  
  // Google Auth Button
  document.getElementById('btn-google-login').addEventListener('click', handleGoogleLogin);

  // Nav Upload Trigger
  document.getElementById('btn-nav-upload').addEventListener('click', () => {
    if (!currentUser) {
      redirectAfterAuth = true;[cite: 1]
      document.getElementById('modal-auth').classList.remove('hidden');[cite: 1]
    } else {
      switchView('upload');[cite: 1]
    }
  });

  // Discovery Filters
  document.getElementById('search-input').addEventListener('input', () => {
    clearTimeout(searchDebounceTimer);[cite: 1]
    searchDebounceTimer = setTimeout(fetchNotes, 300);[cite: 1]
  });
  document.getElementById('filter-level').addEventListener('change', (e) => {
    const lvl = e.target.value;[cite: 1]
    document.getElementById('filter-band').classList.toggle('hidden', lvl !== 'secondary');[cite: 1]
    updateFilterOptions(lvl);[cite: 1]
    fetchNotes();[cite: 1]
  });
  document.getElementById('filter-band').addEventListener('change', fetchNotes);[cite: 1]
  document.getElementById('filter-institution').addEventListener('change', fetchNotes);[cite: 1]
  document.getElementById('filter-subject').addEventListener('change', fetchNotes);[cite: 1]

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));[cite: 1]
      e.target.classList.add('active');[cite: 1]
      fetchNotes();[cite: 1]
    });
  });

  // Form Cascading Logic for HK Education Level
  document.getElementById('form-level').addEventListener('change', (e) => {
    const lvl = e.target.value;[cite: 1]
    const bandGroup = document.getElementById('form-band-group');[cite: 1]
    const instGroup = document.getElementById('form-institution-group');
    const instInput = document.getElementById('form-institution');

    bandGroup.classList.toggle('hidden', lvl !== 'secondary');[cite: 1]

    // 隱藏小學及中學的學校選擇，改用預設值
    if (lvl === 'primary' || lvl === 'secondary') {
      instGroup.classList.add('hidden');
      instInput.removeAttribute('required');
      instInput.value = lvl === 'primary' ? '香港小學' : '香港中學';
    } else {
      instGroup.classList.remove('hidden');
      instInput.setAttribute('required', 'true');
      instInput.value = '';
    }

    populateFormDatalists(lvl);[cite: 1]
  });

  // Smart Dropzone
  const dropzone = document.getElementById('dropzone');[cite: 1]
  const fileInput = document.getElementById('file-input');[cite: 1]
  dropzone.addEventListener('click', () => fileInput.click());[cite: 1]
  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });[cite: 1]
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));[cite: 1]
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();[cite: 1]
    dropzone.classList.remove('dragover');[cite: 1]
    if (e.dataTransfer.files.length > 0) handleFileSelect(e.dataTransfer.files[0]);[cite: 1]
  });
  fileInput.addEventListener('change', (e) => { if (e.target.files.length > 0) handleFileSelect(e.target.files[0]); });[cite: 1]
  document.getElementById('btn-remove-file').addEventListener('click', resetFileSelection);[cite: 1]

  document.getElementById('form-title').addEventListener('input', (e) => {
    document.getElementById('title-counter').textContent = `${e.target.value.length} / 100`;[cite: 1]
  });

  document.getElementById('upload-form').addEventListener('submit', handleUploadSubmit);[cite: 1]
  document.getElementById('btn-cancel-upload').addEventListener('click', () => { resetUploadForm(); switchView('discovery'); });[cite: 1]

  // Reader Actions
  document.getElementById('btn-download-file').addEventListener('click', triggerDownload);[cite: 1]
  document.getElementById('btn-bookmark').addEventListener('click', () => {
    if (!currentUser) return document.getElementById('modal-auth').classList.remove('hidden');[cite: 1]
    document.getElementById('btn-bookmark').textContent = '💖 已加入收藏';[cite: 1]
  });

  // Success Modal
  document.getElementById('btn-success-home').addEventListener('click', () => {
    document.getElementById('modal-success').classList.add('hidden');[cite: 1]
    switchView('discovery');[cite: 1]
  });
  document.getElementById('btn-success-view').addEventListener('click', () => {
    document.getElementById('modal-success').classList.add('hidden');[cite: 1]
    if (activeNote) openReader(activeNote);[cite: 1]
  });
}

function updateFilterOptions(level) {
  const instSelect = document.getElementById('filter-institution');[cite: 1]
  const subjSelect = document.getElementById('filter-subject');[cite: 1]
  instSelect.innerHTML = '<option value="">所有學校 / 院校</option>';[cite: 1]
  subjSelect.innerHTML = '<option value="">所有科目</option>';[cite: 1]

  // 篩選區：小學和中學隱藏學校選單
  if (level === 'primary' || level === 'secondary') {
    instSelect.classList.add('hidden');
  } else {
    instSelect.classList.remove('hidden');
  }

  if (level && HK_DATA[level]) {
    HK_DATA[level].institutions.forEach(i => instSelect.innerHTML += `<option value="${i}">${i}</option>`);[cite: 1]
    HK_DATA[level].subjects.forEach(s => subjSelect.innerHTML += `<option value="${s}">${s}</option>`);[cite: 1]
  }
}

function populateFormDatalists(level) {
  const instDatalist = document.getElementById('institution-options');[cite: 1]
  const subjDatalist = document.getElementById('subject-options');[cite: 1]
  instDatalist.innerHTML = '';[cite: 1]
  subjDatalist.innerHTML = '';[cite: 1]

  if (level && HK_DATA[level]) {
    HK_DATA[level].institutions.forEach(i => instDatalist.innerHTML += `<option value="${i}">`);[cite: 1]
    HK_DATA[level].subjects.forEach(s => subjDatalist.innerHTML += `<option value="${s}">`);[cite: 1]
  }
}

async function handleGoogleLogin() {
  const { error } = await db.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin
    }
  });
  if (error) alert('Google 登入失敗：' + error.message);
}

async function handleAuthSubmit(e) {
  e.preventDefault();[cite: 1]
  const email = document.getElementById('auth-email').value;[cite: 1]
  const password = document.getElementById('auth-password').value;[cite: 1]
  
  const { error } = await db.auth.signInWithPassword({ email, password });[cite: 1]
  if (error) {
    const { error: signUpErr } = await db.auth.signUp({ email, password });[cite: 1]
    if (signUpErr) alert('登入 / 註冊失敗：' + signUpErr.message);[cite: 1]
    else alert('註冊成功並已登入！');[cite: 1]
  } else {
    document.getElementById('modal-auth').classList.add('hidden');[cite: 1]
  }
}

async function fetchNotes() {
  const search = document.getElementById('search-input').value.trim();[cite: 1]
  const level = document.getElementById('filter-level').value;[cite: 1]
  const band = document.getElementById('filter-band').value;[cite: 1]
  const institution = document.getElementById('filter-institution').value;[cite: 1]
  const subject = document.getElementById('filter-subject').value;[cite: 1]
  const activeSort = document.querySelector('.tab-btn.active').dataset.sort;[cite: 1]

  let query = db.from('notes').select('*');[cite: 1]
  if (level) query = query.eq('education_level', level);[cite: 1]
  if (level === 'secondary' && band) query = query.eq('band', band);[cite: 1]
  if (institution && level === 'university') query = query.eq('institution', institution);[cite: 1]
  if (subject) query = query.eq('subject', subject);[cite: 1]
  if (search) {
    query = query.or(`title.ilike.%${search}%,institution.ilike.%${search}%,subject.ilike.%${search}%`);[cite: 1]
  }

  query = query.order(activeSort, { ascending: false });[cite: 1]

  const { data, error } = await query;[cite: 1]
  if (!error) renderNotesGrid(data);[cite: 1]
}

function renderNotesGrid(notes) {
  const grid = document.getElementById('notes-grid');[cite: 1]
  grid.innerHTML = '';[cite: 1]

  if (!notes || notes.length === 0) {
    grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 3rem;">未有相關香港筆記，快成為第一個上傳的人！</div>`;[cite: 1]
    return;[cite: 1]
  }

  notes.forEach(note => {
    const card = document.createElement('div');[cite: 1]
    card.className = 'note-card';[cite: 1]
    card.onclick = () => openReader(note);[cite: 1]

    let levelBadge = 'badge-secondary-lvl';[cite: 1]
    let levelText = '中學';[cite: 1]
    if (note.education_level === 'primary') { levelBadge = 'badge-primary-lvl'; levelText = '小學'; }[cite: 1]
    if (note.education_level === 'university') { levelBadge = 'badge-university-lvl'; levelText = '大專'; }[cite: 1]

    const bandHtml = (note.education_level === 'secondary' && note.band && note.band !== 'N/A') [cite: 1]
      ? `<span class="badge badge-band">${note.band}</span>` : '';[cite: 1]

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
    `;[cite: 1]
    grid.appendChild(card);[cite: 1]
  });
}

function handleFileSelect(file) {
  const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'text/markdown'];[cite: 1]
  const ext = file.name.split('.').pop().toLowerCase();[cite: 1]
  const errEl = document.getElementById('upload-error');[cite: 1]
  errEl.classList.add('hidden');[cite: 1]

  if (!allowed.includes(file.type) && ext !== 'md') {
    errEl.textContent = '格式不符合，請上傳 PDF、圖片 (PNG/JPG) 或 Markdown 檔案。';[cite: 1]
    errEl.classList.remove('hidden');[cite: 1]
    return;[cite: 1]
  }

  if (file.size > 25 * 1024 * 1024) {
    errEl.textContent = '檔案大小不可大於 25MB！';[cite: 1]
    errEl.classList.remove('hidden');[cite: 1]
    return;[cite: 1]
  }

  selectedFile = file;[cite: 1]
  document.getElementById('dropzone').classList.add('hidden');[cite: 1]
  document.getElementById('file-preview-card').classList.remove('hidden');[cite: 1]
  document.getElementById('preview-filename').textContent = file.name;[cite: 1]
  document.getElementById('preview-filesize').textContent = (file.size / (1024 * 1024)).toFixed(2) + ' MB';[cite: 1]
}

function resetFileSelection() {
  selectedFile = null;[cite: 1]
  document.getElementById('file-input').value = '';[cite: 1]
  document.getElementById('dropzone').classList.remove('hidden');[cite: 1]
  document.getElementById('file-preview-card').classList.add('hidden');[cite: 1]
}

async function handleUploadSubmit(e) {
  e.preventDefault();[cite: 1]
  if (!selectedFile) return alert('請先選取筆記檔案！');[cite: 1]

  const submitBtn = document.getElementById('btn-submit-upload');[cite: 1]
  const progressContainer = document.getElementById('progress-container');[cite: 1]
  const progressBar = document.getElementById('progress-bar');[cite: 1]
  const progressText = document.getElementById('progress-text');[cite: 1]

  submitBtn.disabled = true;[cite: 1]
  submitBtn.textContent = '正在上傳筆記...';[cite: 1]
  progressContainer.classList.remove('hidden');[cite: 1]

  try {
    const fileExt = selectedFile.name.split('.').pop().toLowerCase();[cite: 1]
    const fileName = `hk_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;[cite: 1]
    const filePath = `public/${fileName}`;[cite: 1]

    let percent = 0;[cite: 1]
    const interval = setInterval(() => {
      if (percent < 90) {
        percent += 15;[cite: 1]
        progressBar.style.width = `${percent}%`;[cite: 1]
        progressText.textContent = `${percent}%`;[cite: 1]
      }
    }, 100);[cite: 1]

    const { error: storageErr } = await db.storage.from('notes_files').upload(filePath, selectedFile);[cite: 1]
    clearInterval(interval);[cite: 1]
    if (storageErr) throw storageErr;[cite: 1]

    progressBar.style.width = '100%';[cite: 1]
    progressText.textContent = '100%';[cite: 1]

    let fileType = 'pdf';[cite: 1]
    if (selectedFile.type.includes('image')) fileType = 'image';[cite: 1]
    if (fileExt === 'md') fileType = 'markdown';[cite: 1]

    const level = document.getElementById('form-level').value;[cite: 1]
    const band = (level === 'secondary') ? document.getElementById('form-band').value : 'N/A';[cite: 1]

    const payload = {
      user_id: currentUser.id,[cite: 1]
      title: document.getElementById('form-title').value,[cite: 1]
      education_level: level,[cite: 1]
      band: band,[cite: 1]
      institution: document.getElementById('form-institution').value,[cite: 1]
      subject: document.getElementById('form-subject').value,[cite: 1]
      description: document.getElementById('form-description').value,[cite: 1]
      file_path: filePath,[cite: 1]
      file_type: fileType,[cite: 1]
      file_size: selectedFile.size[cite: 1]
    };

    const { data: newNote, error: dbErr } = await db.from('notes').insert([payload]).select().single();[cite: 1]
    if (dbErr) throw dbErr;[cite: 1]

    activeNote = newNote;[cite: 1]
    resetUploadForm();[cite: 1]
    document.getElementById('modal-success').classList.remove('hidden');[cite: 1]
  } catch (err) {
    alert('發布失敗：' + err.message);[cite: 1]
  } finally {
    submitBtn.disabled = false;[cite: 1]
    submitBtn.textContent = '確認發布筆記';[cite: 1]
    progressContainer.classList.add('hidden');[cite: 1]
  }
}

function resetUploadForm() {
  resetFileSelection();[cite: 1]
  document.getElementById('upload-form').reset();[cite: 1]
  document.getElementById('title-counter').textContent = '0 / 100';[cite: 1]
  document.getElementById('form-band-group').classList.add('hidden');[cite: 1]
  document.getElementById('form-institution-group').classList.remove('hidden');
}

async function openReader(note) {
  activeNote = note;[cite: 1]
  
  const levelBadge = document.getElementById('reader-level-badge');[cite: 1]
  const bandBadge = document.getElementById('reader-band-badge');[cite: 1]

  if (note.education_level === 'primary') {
    levelBadge.textContent = '小學';[cite: 1]
    levelBadge.className = 'badge badge-primary-lvl';[cite: 1]
  } else if (note.education_level === 'university') {
    levelBadge.textContent = '大專';[cite: 1]
    levelBadge.className = 'badge badge-university-lvl';[cite: 1]
  } else {
    levelBadge.textContent = '中學';[cite: 1]
    levelBadge.className = 'badge badge-secondary-lvl';[cite: 1]
  }

  if (note.education_level === 'secondary' && note.band && note.band !== 'N/A') {
    bandBadge.textContent = note.band;[cite: 1]
    bandBadge.classList.remove('hidden');[cite: 1]
  } else {
    bandBadge.classList.add('hidden');[cite: 1]
  }

  document.getElementById('reader-title').textContent = note.title;[cite: 1]
  document.getElementById('reader-institution').textContent = note.institution;[cite: 1]
  document.getElementById('reader-subject').textContent = note.subject;[cite: 1]
  document.getElementById('reader-description').textContent = note.description || '無詳細說明';[cite: 1]
  document.getElementById('reader-downloads').textContent = note.download_count;[cite: 1]
  document.getElementById('reader-date').textContent = new Date(note.created_at).toLocaleDateString();[cite: 1]

  const { data } = db.storage.from('notes_files').getPublicUrl(note.file_path);[cite: 1]
  const viewerBody = document.getElementById('viewer-body');[cite: 1]
  viewerBody.innerHTML = '';[cite: 1]

  if (note.file_type === 'pdf') {
    viewerBody.innerHTML = `<iframe src="${data.publicUrl}" width="100%" height="100%" style="border:none;"></iframe>`;[cite: 1]
  } else if (note.file_type === 'image') {
    viewerBody.innerHTML = `<img src="${data.publicUrl}" alt="Preview">`;[cite: 1]
  } else if (note.file_type === 'markdown') {
    const res = await fetch(data.publicUrl);[cite: 1]
    const text = await res.text();[cite: 1]
    viewerBody.innerHTML = `<div class="markdown-body">${marked.parse(text)}</div>`;[cite: 1]
  }

  switchView('reader');[cite: 1]
}

async function triggerDownload() {
  if (!activeNote) return;[cite: 1]
  await db.rpc('increment_download_count', { note_id: activeNote.id });[cite: 1]
  activeNote.download_count += 1;[cite: 1]
  document.getElementById('reader-downloads').textContent = activeNote.download_count;[cite: 1]

  const { data } = db.storage.from('notes_files').getPublicUrl(activeNote.file_path);[cite: 1]
  const a = document.createElement('a');[cite: 1]
  a.href = data.publicUrl;[cite: 1]
  a.download = activeNote.title;[cite: 1]
  a.target = '_blank';[cite: 1]
  document.body.appendChild(a);[cite: 1]
  a.click();[cite: 1]
  document.body.removeChild(a);[cite: 1]
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');[cite: 1]
}
