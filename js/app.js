// =====================================================================
// استوديو مسلسلك — منطق التطبيق الكامل
// =====================================================================

let currentUser = null;
let charactersCache = [];
let scenesCache = [];
let linesCache = [];
let generationsCache = [];
const pollers = {}; // line_id -> interval id

// ---------------------------------------------------------------
// أدوات مساعدة عامة
// ---------------------------------------------------------------
function toast(msg, isError = false) {
  const el = document.createElement("div");
  el.className = "toast" + (isError ? " error" : "");
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

async function callFunction(name, body) {
  const { data: sessionData } = await sb.auth.getSession();
  const token = sessionData.session?.access_token;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "حدث خطأ غير متوقع");
  return json;
}

async function uploadToMedia(file, subfolder) {
  const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const safeName = `${Date.now()}.${ext || "bin"}`;
  const path = `${currentUser.id}/${subfolder}/${safeName}`;
  const { error } = await sb.storage.from("media").upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = sb.storage.from("media").getPublicUrl(path);
  return data.publicUrl;
}

// ---------------------------------------------------------------
// المصادقة
// ---------------------------------------------------------------
async function initAuth() {
  const { data } = await sb.auth.getSession();
  if (data.session) {
    currentUser = data.session.user;
    showApp();
  } else {
    document.getElementById("auth-screen").style.display = "block";
  }

  sb.auth.onAuthStateChange((event, session) => {
    if (session) {
      currentUser = session.user;
      showApp();
    } else {
      currentUser = null;
      document.getElementById("main-app").style.display = "none";
      document.getElementById("auth-screen").style.display = "block";
    }
  });
}

document.getElementById("auth-send").addEventListener("click", async () => {
  const email = document.getElementById("auth-email").value.trim();
  const msg = document.getElementById("auth-msg");
  if (!email) return;
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href },
  });
  msg.style.color = error ? "#d98686" : "";
  msg.textContent = error ? error.message : "تم الإرسال! افتح بريدك واضغط على الرابط.";
});

document.getElementById("logout-btn").addEventListener("click", () => sb.auth.signOut());

function showApp() {
  document.getElementById("auth-screen").style.display = "none";
  document.getElementById("main-app").style.display = "block";
  document.getElementById("user-email").textContent = currentUser.email;
  loadEverything();
}

// ---------------------------------------------------------------
// التبويبات
// ---------------------------------------------------------------
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`view-${btn.dataset.tab}`).classList.add("active");
    if (btn.dataset.tab === "generate") renderGenerate();
    if (btn.dataset.tab === "library") renderLibrary();
  });
});

async function loadEverything() {
  await Promise.all([loadCharacters(), loadScenesAndLines(), loadGenerations()]);
  renderCharacters();
  renderScenes();
}

// =====================================================================
// الشخصيات
// =====================================================================
async function loadCharacters() {
  const { data, error } = await sb
    .from("characters")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) return toast(error.message, true);
  charactersCache = data;
}

function renderCharacters() {
  const grid = document.getElementById("characters-grid");
  grid.innerHTML = "";
  charactersCache.forEach((c) => grid.appendChild(characterCard(c)));
  grid.appendChild(
    el(`<div class="add-card" id="add-character-card"><div class="plus">+</div><div>إضافة شخصية</div></div>`)
  );
  document.getElementById("add-character-card").addEventListener("click", openAddCharacterModal);
}

function characterCard(c) {
  const stateLabel = { none: "بدون صوت", pending: "جارٍ الاستنساخ…", ready: "الصوت جاهز", error: "فشل الاستنساخ" }[c.voice_status || "none"];
  const card = el(`
    <div class="char-card">
      <div class="sprockets">${"<span></span>".repeat(8)}</div>
      <div class="photo" style="${c.photo_url ? `background-image:url('${c.photo_url}')` : ""}">${c.photo_url ? "" : "لا توجد صورة"}</div>
      <div class="body">
        <p class="name">${escapeHtml(c.name)}</p>
        <span class="voice-state ${c.voice_status || "none"}">${stateLabel}</span>
        <div class="actions">
          ${!c.voice_id && c.voice_sample_url ? `<button class="btn small clone-btn">استنساخ الصوت</button>` : ""}
          <button class="btn small danger delete-char-btn">حذف</button>
        </div>
      </div>
    </div>`);

  card.querySelector(".delete-char-btn").addEventListener("click", async () => {
    if (!confirm(`حذف "${c.name}"؟`)) return;
    const { error } = await sb.from("characters").delete().eq("id", c.id);
    if (error) return toast(error.message, true);
    await loadCharacters();
    renderCharacters();
  });

  const cloneBtn = card.querySelector(".clone-btn");
  if (cloneBtn) {
    cloneBtn.addEventListener("click", async () => {
      cloneBtn.disabled = true;
      cloneBtn.textContent = "جارٍ الاستنساخ…";
      try {
        await callFunction("clone-voice", {
          character_id: c.id,
          voice_sample_url: c.voice_sample_url,
          name: c.name,
        });
        toast(`تم استنساخ صوت ${c.name}`);
      } catch (e) {
        toast(e.message, true);
      }
      await loadCharacters();
      renderCharacters();
    });
  }

  return card;
}

function openAddCharacterModal() {
  const modal = el(`
    <div class="modal-backdrop">
      <div class="modal">
        <h3>شخصية جديدة</h3>
        <div class="field">
          <label>الاسم</label>
          <input type="text" id="new-char-name" placeholder="مثلاً: أحمد" />
        </div>
        <div class="field">
          <label>الصورة (وجه واضح من الأمام)</label>
          <input type="file" id="new-char-photo" accept="image/*" />
        </div>
        <div class="field">
          <label>عينة الصوت (٣٠ ثانية فأكثر، بصوت واضح)</label>
          <input type="file" id="new-char-voice" accept="audio/*" />
          <p class="hint">تأكد من موافقة صاحب الصوت والوجه على استخدامهما هنا.</p>
        </div>
        <div class="modal-actions">
          <button class="btn" id="cancel-add-char">إلغاء</button>
          <button class="btn primary" id="save-add-char">حفظ</button>
        </div>
      </div>
    </div>`);
  document.body.appendChild(modal);
  modal.querySelector("#cancel-add-char").addEventListener("click", () => modal.remove());

  modal.querySelector("#save-add-char").addEventListener("click", async (e) => {
    const name = modal.querySelector("#new-char-name").value.trim();
    const photoFile = modal.querySelector("#new-char-photo").files[0];
    const voiceFile = modal.querySelector("#new-char-voice").files[0];
    if (!name) return toast("اكتب اسمًا أولًا", true);

    e.target.disabled = true;
    e.target.textContent = "جارٍ الحفظ…";
    try {
      let photo_url = null, voice_sample_url = null;
      if (photoFile) photo_url = await uploadToMedia(photoFile, "photos");
      if (voiceFile) voice_sample_url = await uploadToMedia(voiceFile, "voice-samples");

      const { error } = await sb.from("characters").insert({
        user_id: currentUser.id,
        name,
        photo_url,
        voice_sample_url,
      });
      if (error) throw error;

      modal.remove();
      await loadCharacters();
      renderCharacters();
      toast("تمت إضافة الشخصية");
    } catch (err) {
      alert("خطأ: " + err.message);
      toast(err.message, true);
      e.target.disabled = false;
      e.target.textContent = "حفظ";
    }
  });
}

// =====================================================================
// السكربت (مشاهد + أسطر)
// =====================================================================
async function loadScenesAndLines() {
  const [{ data: scenes, error: sErr }, { data: lines, error: lErr }] = await Promise.all([
    sb.from("scenes").select("*").order("position", { ascending: true }),
    sb.from("lines").select("*").order("position", { ascending: true }),
  ]);
  if (sErr) return toast(sErr.message, true);
  if (lErr) return toast(lErr.message, true);
  scenesCache = scenes;
  linesCache = lines;
}

async function loadGenerations() {
  const { data, error } = await sb.from("generations").select("*");
  if (error) return toast(error.message, true);
  generationsCache = data;
}

document.getElementById("add-scene-btn").addEventListener("click", async () => {
  const title = prompt("عنوان المشهد:", `المشهد ${scenesCache.length + 1}`);
  if (!title) return;
  const { error } = await sb.from("scenes").insert({
    user_id: currentUser.id,
    title,
    position: scenesCache.length,
  });
  if (error) return toast(error.message, true);
  await loadScenesAndLines();
  renderScenes();
});

function renderScenes() {
  const container = document.getElementById("scenes-list");
  container.innerHTML = "";

  if (scenesCache.length === 0) {
    container.appendChild(el(`<div class="empty">لا توجد مشاهد بعد — اضغط "مشهد جديد" للبدء</div>`));
    return;
  }

  scenesCache.forEach((scene) => {
    const sceneLines = linesCache.filter((l) => l.scene_id === scene.id);
    const block = el(`
      <div class="scene-block">
        <div class="scene-head">
          <h3>${escapeHtml(scene.title)}</h3>
          <div>
            <button class="btn small danger del-scene">حذف المشهد</button>
          </div>
        </div>
        <div class="lines-container"></div>
        <div class="add-line"><button class="btn small add-line-btn">+ سطر حوار</button></div>
      </div>`);

    block.querySelector(".del-scene").addEventListener("click", async () => {
      if (!confirm(`حذف "${scene.title}" وكل أسطره؟`)) return;
      await sb.from("scenes").delete().eq("id", scene.id);
      await loadScenesAndLines();
      renderScenes();
    });

    const linesContainer = block.querySelector(".lines-container");
    sceneLines.forEach((line) => linesContainer.appendChild(lineRow(line)));

    block.querySelector(".add-line-btn").addEventListener("click", async () => {
      const firstChar = charactersCache[0];
      const { error } = await sb.from("lines").insert({
        user_id: currentUser.id,
        scene_id: scene.id,
        character_id: firstChar ? firstChar.id : null,
        text: "",
        position: sceneLines.length,
      });
      if (error) return toast(error.message, true);
      await loadScenesAndLines();
      renderScenes();
    });

    container.appendChild(block);
  });
}

function lineRow(line) {
  const charOptions = charactersCache
    .map((c) => `<option value="${c.id}" ${c.id === line.character_id ? "selected" : ""}>${escapeHtml(c.name)}</option>`)
    .join("");

  const row = el(`
    <div class="line-row">
      <select class="char-select">${charOptions || "<option>لا توجد شخصيات</option>"}</select>
      <textarea class="text-input" placeholder="نص الحوار…">${escapeHtml(line.text || "")}</textarea>
      <div class="line-actions">
        <button class="btn small danger del-line">حذف</button>
      </div>
    </div>`);

  row.querySelector(".char-select").addEventListener("change", async (e) => {
    await sb.from("lines").update({ character_id: e.target.value }).eq("id", line.id);
    await loadScenesAndLines();
  });

  let saveTimer;
  row.querySelector(".text-input").addEventListener("input", (e) => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      await sb.from("lines").update({ text: e.target.value }).eq("id", line.id);
      await loadScenesAndLines();
    }, 600);
  });

  row.querySelector(".del-line").addEventListener("click", async () => {
    await sb.from("lines").delete().eq("id", line.id);
    await loadScenesAndLines();
    renderScenes();
  });

  return row;
}

// =====================================================================
// التوليد
// =====================================================================
function renderGenerate() {
  const container = document.getElementById("generate-list");
  container.innerHTML = "";

  if (linesCache.length === 0) {
    container.appendChild(el(`<div class="empty">أضف مشاهد وأسطر حوار أولًا من تبويب "السكربت"</div>`));
    return;
  }

  linesCache.forEach((line) => {
    const character = charactersCache.find((c) => c.id === line.character_id);
    const gen = generationsCache.find((g) => g.line_id === line.id);
    container.appendChild(generateRow(line, character, gen));
  });
}

function generateRow(line, character, gen) {
  const status = gen?.status || "idle";
  const statusLabel = {
    idle: gen?.audio_url ? "الصوت جاهز" : "لم يبدأ",
    generating_audio: "جارٍ توليد الصوت…",
    generating_video: "جارٍ توليد الفيديو…",
    done: "الفيديو جاهز ✓",
    error: "حدث خطأ",
  }[status];
  const statusClass = { done: "done", error: "error", generating_audio: "working", generating_video: "working" }[status] || "";

  const row = el(`
    <div class="gen-row" data-line-id="${line.id}">
      <div class="who">${character ? escapeHtml(character.name) : "بدون شخصية"}</div>
      <div class="txt">${escapeHtml(line.text || "(بدون نص)")}</div>
      <span class="status-pill ${statusClass}">${statusLabel}</span>
      <button class="btn small gen-audio-btn" ${!character?.voice_id || !line.text ? "disabled" : ""}>توليد الصوت</button>
      <button class="btn small gen-video-btn" ${!gen?.audio_url || !character?.photo_url ? "disabled" : ""}>توليد الفيديو</button>
    </div>`);

  row.querySelector(".gen-audio-btn").addEventListener("click", async (e) => {
    e.target.disabled = true;
    try {
      await callFunction("generate-speech", { line_id: line.id });
      toast("تم توليد الصوت");
    } catch (err) {
      toast(err.message, true);
    }
    await loadGenerations();
    renderGenerate();
  });

  row.querySelector(".gen-video-btn").addEventListener("click", async (e) => {
    e.target.disabled = true;
    try {
      await callFunction("generate-video", { line_id: line.id });
      toast("بدأ توليد الفيديو، قد يستغرق دقيقة أو أكثر…");
      startPolling(line.id);
    } catch (err) {
      toast(err.message, true);
    }
    await loadGenerations();
    renderGenerate();
  });

  return row;
}

function startPolling(lineId) {
  if (pollers[lineId]) return;
  pollers[lineId] = setInterval(async () => {
    try {
      const result = await callFunction("check-video-status", { line_id: lineId });
      if (result.status === "done" || result.status === "error") {
        clearInterval(pollers[lineId]);
        delete pollers[lineId];
        await loadGenerations();
        renderGenerate();
        if (document.querySelector('[data-tab="library"]').classList.contains("active")) renderLibrary();
        toast(result.status === "done" ? "الفيديو جاهز 🎬" : "فشل توليد الفيديو", result.status === "error");
      }
    } catch (err) {
      clearInterval(pollers[lineId]);
      delete pollers[lineId];
      toast(err.message, true);
    }
  }, 5000);
}

// =====================================================================
// المكتبة
// =====================================================================
function renderLibrary() {
  const grid = document.getElementById("library-grid");
  grid.innerHTML = "";
  const done = generationsCache.filter((g) => g.status === "done" && g.video_url);

  if (done.length === 0) {
    grid.appendChild(el(`<div class="empty">لا توجد مقاطع جاهزة بعد</div>`));
    return;
  }

  done.forEach((g) => {
    const line = linesCache.find((l) => l.id === g.line_id);
    const character = line ? charactersCache.find((c) => c.id === line.character_id) : null;
    grid.appendChild(el(`
      <div class="library-item">
        <video src="${g.video_url}" controls></video>
        <div class="meta">
          <div><strong>${character ? escapeHtml(character.name) : ""}</strong></div>
          <div>${escapeHtml(line?.text || "")}</div>
        </div>
      </div>`));
  });
}

// ---------------------------------------------------------------
function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

initAuth();
