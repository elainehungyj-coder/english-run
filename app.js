const STORAGE_KEY = "english-run-progress-v1";
const VOCAB_KEY = "english-run-vocab-v1";
const SCRIPT_KEY = "english-run-script-v1";
const APP_VERSION = "20260617fix2";

if (localStorage.getItem("english-run-app-version") !== APP_VERSION) {
  localStorage.setItem("english-run-app-version", APP_VERSION);
  if ("caches" in window) {
    caches.keys().then(keys => keys.forEach(key => caches.delete(key))).catch(() => {});
  }
}

const state = {
  groupId: "all",
  index: 0,
  currentWord: null,
  currentLookup: null,
  activeItemId: null,
  search: "",
  showChinese: true,
  showKnown: false,
  progress: loadJSON(STORAGE_KEY, {}),
  vocab: loadJSON(VOCAB_KEY, {}),
  script: loadJSON(SCRIPT_KEY, null) || window.PRACTICE_DATA
};

let groups = state.script.groups || [];
let phonetics = state.script.phonetics || {};
let allItems = makeItems(groups);

const $ = id => document.getElementById(id);

function loadJSON(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
}

function saveVocab() {
  localStorage.setItem(VOCAB_KEY, JSON.stringify(state.vocab));
}

function saveScript(script) {
  state.script = script;
  groups = script.groups || [];
  phonetics = script.phonetics || {};
  allItems = makeItems(groups);
  state.groupId = "all";
  state.index = 0;
  localStorage.setItem(SCRIPT_KEY, JSON.stringify(script));
}

function makeItems(sourceGroups) {
  let order = 0;
  return sourceGroups.flatMap(group => group.items.map(item => ({ ...item, order: order++, groupId: group.id, groupTitle: group.title })));
}

function getStatus(id) {
  return state.progress[id] || { status: "new", misses: 0, seen: 0, updated: 0 };
}

function setStatus(id, patch) {
  state.progress[id] = { ...getStatus(id), ...patch, updated: Date.now() };
  saveProgress();
}

function cleanWord(word) {
  return word.toLowerCase().replace(/^[^a-z'-]+|[^a-z'-]+$/g, "");
}

function tokenize(sentence) {
  const parts = sentence.match(/[A-Za-z][A-Za-z'-]*|[^A-Za-z]+/g) || [];
  return parts.map(part => {
    if (/^[A-Za-z]/.test(part)) {
      const w = cleanWord(part);
      return `<span class="word" data-word="${w}">${part}</span>`;
    }
    return part;
  }).join("");
}

function filteredItems() {
  let items = state.groupId === "all" ? allItems : allItems.filter(item => item.groupId === state.groupId);
  const q = state.search.trim().toLowerCase();
  if (q) {
    items = items.filter(item => item.en.toLowerCase().includes(q) || item.zh.includes(q));
  }
  if (!state.showKnown) {
    items = items.filter(item => getStatus(item.id).status !== "known");
  }
  return items.sort((a, b) => {
    const sa = getStatus(a.id);
    const sb = getStatus(b.id);
    const repeatA = sa.status === "repeat" ? 1 : 0;
    const repeatB = sb.status === "repeat" ? 1 : 0;
    if (repeatA !== repeatB) return repeatB - repeatA;
    if ((sa.misses || 0) !== (sb.misses || 0)) return (sb.misses || 0) - (sa.misses || 0);
    return a.order - b.order;
  });
}

function currentItem() {
  const items = filteredItems();
  if (!items.length) return null;
  if (state.index >= items.length) state.index = 0;
  if (state.index < 0) state.index = items.length - 1;
  return items[state.index];
}

function activeItem() {
  return allItems.find(item => item.id === state.activeItemId) || currentItem();
}

function renderGroups() {
  const list = $("groupList");
  if (!allItems.length) {
    list.innerHTML = `<div class="empty">尚未匯入稿件。</div>`;
    return;
  }
  const rows = [{ id: "all", title: "All groups", items: allItems }, ...groups];
  list.innerHTML = rows.map(group => {
    const items = group.id === "all" ? allItems : group.items;
    const known = items.filter(item => getStatus(item.id).status === "known").length;
    const repeat = items.filter(item => getStatus(item.id).status === "repeat").length;
    return `<button class="group-button ${state.groupId === group.id ? "active" : ""}" data-group="${group.id}">
      <strong>${group.title}</strong><span>${known}/${items.length} · ${repeat} repeat</span>
    </button>`;
  }).join("");
}

function renderStats() {
  const known = allItems.filter(item => getStatus(item.id).status === "known").length;
  const repeat = allItems.filter(item => getStatus(item.id).status === "repeat").length;
  $("knownCount").textContent = known;
  $("repeatCount").textContent = repeat;
  $("newCount").textContent = allItems.length - known;
}

function renderCard() {
  if (!allItems.length) {
    $("activeGroup").textContent = "No script";
    $("cardCounter").textContent = "Import needed";
    $("sentenceText").textContent = "Please import your private script first.";
    $("chineseText").textContent = "請先匯入私人稿件檔。匯入後，資料只會存在這台裝置本機。";
    $("chineseText").hidden = false;
    $("queueList").innerHTML = "";
    return;
  }
  const items = filteredItems();
  const item = currentItem();
  state.activeItemId = item ? item.id : null;
  const group = state.groupId === "all" ? "All groups" : groups.find(g => g.id === state.groupId)?.title || "Group";
  $("activeGroup").textContent = group;
  $("cardCounter").textContent = item ? `${state.index + 1} / ${items.length}` : "All familiar";

  if (!item) {
    $("sentenceText").textContent = "This group is complete.";
    $("chineseText").textContent = "這一組目前都已標記熟悉。開啟「顯示熟悉」或重置本組即可重新練。";
    $("queueList").innerHTML = "";
    return;
  }

  $("sentenceText").innerHTML = tokenize(item.en);
  $("chineseText").textContent = item.zh;
  $("chineseText").hidden = !state.showChinese;
  setStatus(item.id, { seen: (getStatus(item.id).seen || 0) + 1 });
  renderQueue(items, item);
  renderStats();
  renderGroups();
}

function renderQueue(items, item = activeItem()) {
  $("queueList").innerHTML = items.slice(0, 18).map((row, idx) => {
    const s = getStatus(row.id);
    const label = s.status === "repeat" ? `不熟 × ${s.misses || 1}` : s.status === "known" ? "熟悉" : "待練";
    return `<button class="queue-item ${item && row.id === item.id ? "current" : ""}" data-jump="${idx}">
      ${row.en}<small>${label} · ${row.groupTitle}</small>
    </button>`;
  }).join("");
}

function renderVocab() {
  const words = Object.values(state.vocab).sort((a, b) => b.updated - a.updated);
  $("vocabList").innerHTML = words.length ? words.map(entry => `
    <div class="vocab-item">
      <strong>${entry.word}</strong>
      <small>${entry.phonetic || "No phonetic yet"} · ${entry.count || 1} time(s)</small>
    </div>
  `).join("") : `<div class="empty">還沒有生詞。</div>`;
}

function speak(text, lang = "en-US") {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang;
  utter.rate = 0.86;
  const voices = speechSynthesis.getVoices();
  const voice = voices.find(v => v.lang === lang && /Samantha|Ava|Daniel|Alex|Google US English/i.test(v.name)) || voices.find(v => v.lang.startsWith("en"));
  if (voice) utter.voice = voice;
  speechSynthesis.speak(utter);
}

async function lookupWord(word) {
  const saved = state.vocab[word] ? { ...state.vocab[word], definition: state.vocab[word].definition || "Saved in vocabulary." } : null;
  const local = saved || (phonetics[word] ? { word, phonetic: phonetics[word], definition: "Built-in phonetic for this script.", audio: "" } : null);
  let result = local || { word, phonetic: "", definition: "No offline phonetic yet. You can still listen with device speech.", audio: "" };
  if (navigator.onLine) {
    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
      if (res.ok) {
        const data = await res.json();
        const entry = data[0];
        const phoneticObj = (entry.phonetics || []).find(p => p.text || p.audio) || {};
        const meaning = entry.meanings?.[0]?.definitions?.[0]?.definition || result.definition;
        result = {
          word,
          phonetic: phoneticObj.text || result.phonetic,
          definition: meaning,
          audio: phoneticObj.audio || ""
        };
      }
    } catch {
      // Keep offline fallback.
    }
  }
  state.currentLookup = result;
  renderLookup(result);
}

function renderLookup(result) {
  $("wordEmpty").hidden = true;
  $("wordInfo").hidden = false;
  $("lookupWord").textContent = result.word;
  $("phonetic").textContent = result.phonetic || "No phonetic found";
  $("definition").textContent = result.definition || "No definition found";
}

function markKnown() {
  const item = activeItem();
  if (!item) return;
  setStatus(item.id, { status: "known" });
  state.index = 0;
  renderAll();
}

function markAgain() {
  const item = activeItem();
  if (!item) return;
  const s = getStatus(item.id);
  setStatus(item.id, { status: "repeat", misses: (s.misses || 0) + 1 });
  state.index = 0;
  renderAll();
}

function resetGroup() {
  const ids = (state.groupId === "all" ? allItems : allItems.filter(item => item.groupId === state.groupId)).map(item => item.id);
  ids.forEach(id => delete state.progress[id]);
  saveProgress();
  state.index = 0;
  renderAll();
}

function importScriptFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const script = JSON.parse(reader.result);
      if (!Array.isArray(script.groups) || !script.groups.length) throw new Error("Missing groups");
      saveScript(script);
      renderAll();
      $("importDialog").close();
    } catch {
      alert("這個檔案格式不對，請選 Cynthia_private_script_data.json。");
    }
  };
  reader.readAsText(file);
}

function renderAll() {
  renderStats();
  renderGroups();
  renderCard();
  renderVocab();
}

function bindEvents() {
  $("groupList").addEventListener("click", event => {
    const btn = event.target.closest("[data-group]");
    if (!btn) return;
    state.groupId = btn.dataset.group;
    state.index = 0;
    renderAll();
  });
  $("queueList").addEventListener("click", event => {
    const btn = event.target.closest("[data-jump]");
    if (!btn) return;
    state.index = Number(btn.dataset.jump);
    renderCard();
  });
  $("sentenceText").addEventListener("click", event => {
    const word = event.target.closest("[data-word]")?.dataset.word;
    if (!word) return;
    state.currentWord = word;
    lookupWord(word);
  });
  $("speakBtn").addEventListener("click", () => {
    const item = activeItem();
    if (item) speak(item.en);
  });
  $("speakWord").addEventListener("click", () => {
    const word = state.currentLookup?.word || state.currentWord;
    if (word) speak(word);
  });
  $("knownBtn").addEventListener("click", markKnown);
  $("againBtn").addEventListener("click", markAgain);
  $("prevBtn").addEventListener("click", () => { state.index -= 1; renderCard(); });
  $("nextBtn").addEventListener("click", () => { state.index += 1; renderCard(); });
  $("showChinese").addEventListener("change", event => { state.showChinese = event.target.checked; renderCard(); });
  $("showKnown").addEventListener("change", event => { state.showKnown = event.target.checked; state.index = 0; renderAll(); });
  $("searchInput").addEventListener("input", event => { state.search = event.target.value; state.index = 0; renderAll(); });
  $("resetGroup").addEventListener("click", resetGroup);
  $("addVocab").addEventListener("click", () => {
    const info = state.currentLookup;
    if (!info) return;
    const old = state.vocab[info.word] || {};
    state.vocab[info.word] = { ...info, count: (old.count || 0) + 1, updated: Date.now() };
    saveVocab();
    renderVocab();
  });
  $("clearVocab").addEventListener("click", () => {
    state.vocab = {};
    saveVocab();
    renderVocab();
  });
  $("installHelp").addEventListener("click", () => $("installDialog").showModal());
  $("closeDialog").addEventListener("click", () => $("installDialog").close());
  $("importHelp").addEventListener("click", () => $("importDialog").showModal());
  $("chooseImport").addEventListener("click", () => $("importFile").click());
  $("closeImport").addEventListener("click", () => $("importDialog").close());
  $("importFile").addEventListener("change", event => {
    const file = event.target.files?.[0];
    if (file) importScriptFile(file);
    event.target.value = "";
  });
  $("clearScript").addEventListener("click", () => {
    localStorage.removeItem(SCRIPT_KEY);
    state.progress = {};
    saveProgress();
    saveScript(window.PRACTICE_DATA);
    renderAll();
  });
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

bindEvents();
renderAll();
const STORAGE_KEY = "english-run-progress-v1";
const VOCAB_KEY = "english-run-vocab-v1";
const SCRIPT_KEY = "english-run-script-v1";

const state = {
  groupId: "all",
  index: 0,
  currentWord: null,
  currentLookup: null,
  activeItemId: null,
  search: "",
  showChinese: true,
  showKnown: false,
  progress: loadJSON(STORAGE_KEY, {}),
  vocab: loadJSON(VOCAB_KEY, {}),
  script: loadJSON(SCRIPT_KEY, null) || window.PRACTICE_DATA
};

let groups = state.script.groups || [];
let phonetics = state.script.phonetics || {};
let allItems = makeItems(groups);

const $ = id => document.getElementById(id);

function loadJSON(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
}

function saveVocab() {
  localStorage.setItem(VOCAB_KEY, JSON.stringify(state.vocab));
}

function saveScript(script) {
  state.script = script;
  groups = script.groups || [];
  phonetics = script.phonetics || {};
  allItems = makeItems(groups);
  state.groupId = "all";
  state.index = 0;
  localStorage.setItem(SCRIPT_KEY, JSON.stringify(script));
}

function makeItems(sourceGroups) {
  let order = 0;
  return sourceGroups.flatMap(group => group.items.map(item => ({ ...item, order: order++, groupId: group.id, groupTitle: group.title })));
}

function getStatus(id) {
  return state.progress[id] || { status: "new", misses: 0, seen: 0, updated: 0 };
}

function setStatus(id, patch) {
  state.progress[id] = { ...getStatus(id), ...patch, updated: Date.now() };
  saveProgress();
}

function cleanWord(word) {
  return word.toLowerCase().replace(/^[^a-z'-]+|[^a-z'-]+$/g, "");
}

function tokenize(sentence) {
  const parts = sentence.match(/[A-Za-z][A-Za-z'-]*|[^A-Za-z]+/g) || [];
  return parts.map(part => {
    if (/^[A-Za-z]/.test(part)) {
      const w = cleanWord(part);
      return `<span class="word" data-word="${w}">${part}</span>`;
    }
    return part;
  }).join("");
}

function filteredItems() {
  let items = state.groupId === "all" ? allItems : allItems.filter(item => item.groupId === state.groupId);
  const q = state.search.trim().toLowerCase();
  if (q) {
    items = items.filter(item => item.en.toLowerCase().includes(q) || item.zh.includes(q));
  }
  if (!state.showKnown) {
    items = items.filter(item => getStatus(item.id).status !== "known");
  }
  return items.sort((a, b) => {
    const sa = getStatus(a.id);
    const sb = getStatus(b.id);
    const repeatA = sa.status === "repeat" ? 1 : 0;
    const repeatB = sb.status === "repeat" ? 1 : 0;
    if (repeatA !== repeatB) return repeatB - repeatA;
    if ((sa.misses || 0) !== (sb.misses || 0)) return (sb.misses || 0) - (sa.misses || 0);
    return a.order - b.order;
  });
}

function currentItem() {
  const items = filteredItems();
  if (!items.length) return null;
  if (state.index >= items.length) state.index = 0;
  if (state.index < 0) state.index = items.length - 1;
  return items[state.index];
}

function activeItem() {
  return allItems.find(item => item.id === state.activeItemId) || currentItem();
}

function renderGroups() {
  const list = $("groupList");
  if (!allItems.length) {
    list.innerHTML = `<div class="empty">尚未匯入稿件。</div>`;
    return;
  }
  const rows = [{ id: "all", title: "All groups", items: allItems }, ...groups];
  list.innerHTML = rows.map(group => {
    const items = group.id === "all" ? allItems : group.items;
    const known = items.filter(item => getStatus(item.id).status === "known").length;
    const repeat = items.filter(item => getStatus(item.id).status === "repeat").length;
    return `<button class="group-button ${state.groupId === group.id ? "active" : ""}" data-group="${group.id}">
      <strong>${group.title}</strong><span>${known}/${items.length} · ${repeat} repeat</span>
    </button>`;
  }).join("");
}

function renderStats() {
  const known = allItems.filter(item => getStatus(item.id).status === "known").length;
  const repeat = allItems.filter(item => getStatus(item.id).status === "repeat").length;
  $("knownCount").textContent = known;
  $("repeatCount").textContent = repeat;
  $("newCount").textContent = allItems.length - known;
}

function renderCard() {
  if (!allItems.length) {
    $("activeGroup").textContent = "No script";
    $("cardCounter").textContent = "Import needed";
    $("sentenceText").textContent = "Please import your private script first.";
    $("chineseText").textContent = "請先匯入私人稿件檔。匯入後，資料只會存在這台裝置本機。";
    $("chineseText").hidden = false;
    $("queueList").innerHTML = "";
    return;
  }
  const items = filteredItems();
  const item = currentItem();
  state.activeItemId = item ? item.id : null;
  const group = state.groupId === "all" ? "All groups" : groups.find(g => g.id === state.groupId)?.title || "Group";
  $("activeGroup").textContent = group;
  $("cardCounter").textContent = item ? `${state.index + 1} / ${items.length}` : "All familiar";

  if (!item) {
    $("sentenceText").textContent = "This group is complete.";
    $("chineseText").textContent = "這一組目前都已標記熟悉。開啟「顯示熟悉」或重置本組即可重新練。";
    $("queueList").innerHTML = "";
    return;
  }

  $("sentenceText").innerHTML = tokenize(item.en);
  $("chineseText").textContent = item.zh;
  $("chineseText").hidden = !state.showChinese;
  setStatus(item.id, { seen: (getStatus(item.id).seen || 0) + 1 });
  renderQueue(items, item);
  renderStats();
  renderGroups();
}

function renderQueue(items, item = activeItem()) {
  $("queueList").innerHTML = items.slice(0, 18).map((row, idx) => {
    const s = getStatus(row.id);
    const label = s.status === "repeat" ? `不熟 × ${s.misses || 1}` : s.status === "known" ? "熟悉" : "待練";
    return `<button class="queue-item ${item && row.id === item.id ? "current" : ""}" data-jump="${idx}">
      ${row.en}<small>${label} · ${row.groupTitle}</small>
    </button>`;
  }).join("");
}

function renderVocab() {
  const words = Object.values(state.vocab).sort((a, b) => b.updated - a.updated);
  $("vocabList").innerHTML = words.length ? words.map(entry => `
    <div class="vocab-item">
      <strong>${entry.word}</strong>
      <small>${entry.phonetic || "No phonetic yet"} · ${entry.count || 1} time(s)</small>
    </div>
  `).join("") : `<div class="empty">還沒有生詞。</div>`;
}

function speak(text, lang = "en-US") {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang;
  utter.rate = 0.86;
  const voices = speechSynthesis.getVoices();
  const voice = voices.find(v => v.lang === lang && /Samantha|Ava|Daniel|Alex|Google US English/i.test(v.name)) || voices.find(v => v.lang.startsWith("en"));
  if (voice) utter.voice = voice;
  speechSynthesis.speak(utter);
}

async function lookupWord(word) {
  const saved = state.vocab[word] ? { ...state.vocab[word], definition: state.vocab[word].definition || "Saved in vocabulary." } : null;
  const local = saved || (phonetics[word] ? { word, phonetic: phonetics[word], definition: "Built-in phonetic for this script.", audio: "" } : null);
  let result = local || { word, phonetic: "", definition: "No offline phonetic yet. You can still listen with device speech.", audio: "" };
  if (navigator.onLine) {
    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
      if (res.ok) {
        const data = await res.json();
        const entry = data[0];
        const phoneticObj = (entry.phonetics || []).find(p => p.text || p.audio) || {};
        const meaning = entry.meanings?.[0]?.definitions?.[0]?.definition || result.definition;
        result = {
          word,
          phonetic: phoneticObj.text || result.phonetic,
          definition: meaning,
          audio: phoneticObj.audio || ""
        };
      }
    } catch {
      // Keep offline fallback.
    }
  }
  state.currentLookup = result;
  renderLookup(result);
}

function renderLookup(result) {
  $("wordEmpty").hidden = true;
  $("wordInfo").hidden = false;
  $("lookupWord").textContent = result.word;
  $("phonetic").textContent = result.phonetic || "No phonetic found";
  $("definition").textContent = result.definition || "No definition found";
}

function markKnown() {
  const item = activeItem();
  if (!item) return;
  setStatus(item.id, { status: "known" });
  state.index = 0;
  renderAll();
}

function markAgain() {
  const item = activeItem();
  if (!item) return;
  const s = getStatus(item.id);
  setStatus(item.id, { status: "repeat", misses: (s.misses || 0) + 1 });
  state.index = 0;
  renderAll();
}

function resetGroup() {
  const ids = (state.groupId === "all" ? allItems : allItems.filter(item => item.groupId === state.groupId)).map(item => item.id);
  ids.forEach(id => delete state.progress[id]);
  saveProgress();
  state.index = 0;
  renderAll();
}

function importScriptFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const script = JSON.parse(reader.result);
      if (!Array.isArray(script.groups) || !script.groups.length) throw new Error("Missing groups");
      saveScript(script);
      renderAll();
      $("importDialog").close();
    } catch {
      alert("這個檔案格式不對，請選 Cynthia_private_script_data.json。");
    }
  };
  reader.readAsText(file);
}

function renderAll() {
  renderStats();
  renderGroups();
  renderCard();
  renderVocab();
}

function bindEvents() {
  $("groupList").addEventListener("click", event => {
    const btn = event.target.closest("[data-group]");
    if (!btn) return;
    state.groupId = btn.dataset.group;
    state.index = 0;
    renderAll();
  });
  $("queueList").addEventListener("click", event => {
    const btn = event.target.closest("[data-jump]");
    if (!btn) return;
    state.index = Number(btn.dataset.jump);
    renderCard();
  });
  $("sentenceText").addEventListener("click", event => {
    const word = event.target.closest("[data-word]")?.dataset.word;
    if (!word) return;
    state.currentWord = word;
    lookupWord(word);
  });
  $("speakBtn").addEventListener("click", () => {
    const item = activeItem();
    if (item) speak(item.en);
  });
  $("speakWord").addEventListener("click", () => {
    const word = state.currentLookup?.word || state.currentWord;
    if (word) speak(word);
  });
  $("knownBtn").addEventListener("click", markKnown);
  $("againBtn").addEventListener("click", markAgain);
  $("prevBtn").addEventListener("click", () => { state.index -= 1; renderCard(); });
  $("nextBtn").addEventListener("click", () => { state.index += 1; renderCard(); });
  $("showChinese").addEventListener("change", event => { state.showChinese = event.target.checked; renderCard(); });
  $("showKnown").addEventListener("change", event => { state.showKnown = event.target.checked; state.index = 0; renderAll(); });
  $("searchInput").addEventListener("input", event => { state.search = event.target.value; state.index = 0; renderAll(); });
  $("resetGroup").addEventListener("click", resetGroup);
  $("addVocab").addEventListener("click", () => {
    const info = state.currentLookup;
    if (!info) return;
    const old = state.vocab[info.word] || {};
    state.vocab[info.word] = { ...info, count: (old.count || 0) + 1, updated: Date.now() };
    saveVocab();
    renderVocab();
  });
  $("clearVocab").addEventListener("click", () => {
    state.vocab = {};
    saveVocab();
    renderVocab();
  });
  $("installHelp").addEventListener("click", () => $("installDialog").showModal());
  $("closeDialog").addEventListener("click", () => $("installDialog").close());
  $("importHelp").addEventListener("click", () => $("importDialog").showModal());
  $("chooseImport").addEventListener("click", () => $("importFile").click());
  $("closeImport").addEventListener("click", () => $("importDialog").close());
  $("importFile").addEventListener("change", event => {
    const file = event.target.files?.[0];
    if (file) importScriptFile(file);
    event.target.value = "";
  });
  $("clearScript").addEventListener("click", () => {
    localStorage.removeItem(SCRIPT_KEY);
    state.progress = {};
    saveProgress();
    saveScript(window.PRACTICE_DATA);
    renderAll();
  });
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

bindEvents();
renderAll();
const STORAGE_KEY = "english-run-progress-v1";
const VOCAB_KEY = "english-run-vocab-v1";
const SCRIPT_KEY = "english-run-script-v1";

const state = {
  groupId: "all",
  index: 0,
  currentWord: null,
  currentLookup: null,
  search: "",
  showChinese: true,
  showKnown: false,
  progress: loadJSON(STORAGE_KEY, {}),
  vocab: loadJSON(VOCAB_KEY, {}),
  script: loadJSON(SCRIPT_KEY, null) || window.PRACTICE_DATA
};

let groups = state.script.groups || [];
let phonetics = state.script.phonetics || {};
let allItems = makeItems(groups);

const $ = id => document.getElementById(id);

function loadJSON(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
}

function saveVocab() {
  localStorage.setItem(VOCAB_KEY, JSON.stringify(state.vocab));
}

function saveScript(script) {
  state.script = script;
  groups = script.groups || [];
  phonetics = script.phonetics || {};
  allItems = makeItems(groups);
  state.groupId = "all";
  state.index = 0;
  localStorage.setItem(SCRIPT_KEY, JSON.stringify(script));
}

function makeItems(sourceGroups) {
  return sourceGroups.flatMap(group => group.items.map(item => ({ ...item, groupId: group.id, groupTitle: group.title })));
}

function getStatus(id) {
  return state.progress[id] || { status: "new", misses: 0, seen: 0, updated: 0 };
}

function setStatus(id, patch) {
  state.progress[id] = { ...getStatus(id), ...patch, updated: Date.now() };
  saveProgress();
}

function cleanWord(word) {
  return word.toLowerCase().replace(/^[^a-z'-]+|[^a-z'-]+$/g, "");
}

function tokenize(sentence) {
  const parts = sentence.match(/[A-Za-z][A-Za-z'-]*|[^A-Za-z]+/g) || [];
  return parts.map(part => {
    if (/^[A-Za-z]/.test(part)) {
      const w = cleanWord(part);
      return `<span class="word" data-word="${w}">${part}</span>`;
    }
    return part;
  }).join("");
}

function filteredItems() {
  let items = state.groupId === "all" ? allItems : allItems.filter(item => item.groupId === state.groupId);
  const q = state.search.trim().toLowerCase();
  if (q) {
    items = items.filter(item => item.en.toLowerCase().includes(q) || item.zh.includes(q));
  }
  if (!state.showKnown) {
    items = items.filter(item => getStatus(item.id).status !== "known");
  }
  return items.sort((a, b) => {
    const sa = getStatus(a.id);
    const sb = getStatus(b.id);
    const scoreA = (sa.status === "repeat" ? -100 : 0) - (sa.misses || 0) * 4 + (sa.seen || 0);
    const scoreB = (sb.status === "repeat" ? -100 : 0) - (sb.misses || 0) * 4 + (sb.seen || 0);
    return scoreA - scoreB;
  });
}

function currentItem() {
  const items = filteredItems();
  if (!items.length) return null;
  if (state.index >= items.length) state.index = 0;
  if (state.index < 0) state.index = items.length - 1;
  return items[state.index];
}

function renderGroups() {
  const list = $("groupList");
  if (!allItems.length) {
    list.innerHTML = `<div class="empty">尚未匯入稿件。</div>`;
    return;
  }
  const rows = [{ id: "all", title: "All groups", items: allItems }, ...groups];
  list.innerHTML = rows.map(group => {
    const items = group.id === "all" ? allItems : group.items;
    const known = items.filter(item => getStatus(item.id).status === "known").length;
    const repeat = items.filter(item => getStatus(item.id).status === "repeat").length;
    return `<button class="group-button ${state.groupId === group.id ? "active" : ""}" data-group="${group.id}">
      <strong>${group.title}</strong><span>${known}/${items.length} · ${repeat} repeat</span>
    </button>`;
  }).join("");
}

function renderStats() {
  const known = allItems.filter(item => getStatus(item.id).status === "known").length;
  const repeat = allItems.filter(item => getStatus(item.id).status === "repeat").length;
  $("knownCount").textContent = known;
  $("repeatCount").textContent = repeat;
  $("newCount").textContent = allItems.length - known;
}

function renderCard() {
  if (!allItems.length) {
    $("activeGroup").textContent = "No script";
    $("cardCounter").textContent = "Import needed";
    $("sentenceText").textContent = "Please import your private script first.";
    $("chineseText").textContent = "請先匯入私人稿件檔。匯入後，資料只會存在這台裝置本機。";
    $("chineseText").hidden = false;
    $("queueList").innerHTML = "";
    return;
  }
  const items = filteredItems();
  const item = currentItem();
  const group = state.groupId === "all" ? "All groups" : groups.find(g => g.id === state.groupId)?.title || "Group";
  $("activeGroup").textContent = group;
  $("cardCounter").textContent = item ? `${state.index + 1} / ${items.length}` : "All familiar";

  if (!item) {
    $("sentenceText").textContent = "This group is complete.";
    $("chineseText").textContent = "這一組目前都已標記熟悉。開啟「顯示熟悉」或重置本組即可重新練。";
    $("queueList").innerHTML = "";
    return;
  }

  $("sentenceText").innerHTML = tokenize(item.en);
  $("chineseText").textContent = item.zh;
  $("chineseText").hidden = !state.showChinese;
  setStatus(item.id, { seen: (getStatus(item.id).seen || 0) + 1 });
  renderQueue(items);
  renderStats();
  renderGroups();
}

function renderQueue(items) {
  const item = currentItem();
  $("queueList").innerHTML = items.slice(0, 18).map((row, idx) => {
    const s = getStatus(row.id);
    const label = s.status === "repeat" ? `不熟 × ${s.misses || 1}` : s.status === "known" ? "熟悉" : "待練";
    return `<button class="queue-item ${item && row.id === item.id ? "current" : ""}" data-jump="${idx}">
      ${row.en}<small>${label} · ${row.groupTitle}</small>
    </button>`;
  }).join("");
}

function renderVocab() {
  const words = Object.values(state.vocab).sort((a, b) => b.updated - a.updated);
  $("vocabList").innerHTML = words.length ? words.map(entry => `
    <div class="vocab-item">
      <strong>${entry.word}</strong>
      <small>${entry.phonetic || "No phonetic yet"} · ${entry.count || 1} time(s)</small>
    </div>
  `).join("") : `<div class="empty">還沒有生詞。</div>`;
}

function speak(text, lang = "en-US") {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang;
  utter.rate = 0.86;
  const voices = speechSynthesis.getVoices();
  const voice = voices.find(v => v.lang === lang && /Samantha|Ava|Daniel|Alex|Google US English/i.test(v.name)) || voices.find(v => v.lang.startsWith("en"));
  if (voice) utter.voice = voice;
  speechSynthesis.speak(utter);
}

async function lookupWord(word) {
  const saved = state.vocab[word] ? { ...state.vocab[word], definition: state.vocab[word].definition || "Saved in vocabulary." } : null;
  const local = saved || (phonetics[word] ? { word, phonetic: phonetics[word], definition: "Built-in phonetic for this script.", audio: "" } : null);
  let result = local || { word, phonetic: "", definition: "No offline phonetic yet. You can still listen with device speech.", audio: "" };
  if (navigator.onLine) {
    try {
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
      if (res.ok) {
        const data = await res.json();
        const entry = data[0];
        const phoneticObj = (entry.phonetics || []).find(p => p.text || p.audio) || {};
        const meaning = entry.meanings?.[0]?.definitions?.[0]?.definition || result.definition;
        result = {
          word,
          phonetic: phoneticObj.text || result.phonetic,
          definition: meaning,
          audio: phoneticObj.audio || ""
        };
      }
    } catch {
      // Keep offline fallback.
    }
  }
  state.currentLookup = result;
  renderLookup(result);
}

function renderLookup(result) {
  $("wordEmpty").hidden = true;
  $("wordInfo").hidden = false;
  $("lookupWord").textContent = result.word;
  $("phonetic").textContent = result.phonetic || "No phonetic found";
  $("definition").textContent = result.definition || "No definition found";
}

function markKnown() {
  const item = currentItem();
  if (!item) return;
  setStatus(item.id, { status: "known" });
  state.index = 0;
  renderAll();
}

function markAgain() {
  const item = currentItem();
  if (!item) return;
  const s = getStatus(item.id);
  setStatus(item.id, { status: "repeat", misses: (s.misses || 0) + 1 });
  state.index = 0;
  renderAll();
}

function resetGroup() {
  const ids = (state.groupId === "all" ? allItems : allItems.filter(item => item.groupId === state.groupId)).map(item => item.id);
  ids.forEach(id => delete state.progress[id]);
  saveProgress();
  state.index = 0;
  renderAll();
}

function importScriptFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const script = JSON.parse(reader.result);
      if (!Array.isArray(script.groups) || !script.groups.length) throw new Error("Missing groups");
      saveScript(script);
      renderAll();
      $("importDialog").close();
    } catch {
      alert("這個檔案格式不對，請選 Cynthia_private_script_data.json。");
    }
  };
  reader.readAsText(file);
}

function renderAll() {
  renderStats();
  renderGroups();
  renderCard();
  renderVocab();
}

function bindEvents() {
  $("groupList").addEventListener("click", event => {
    const btn = event.target.closest("[data-group]");
    if (!btn) return;
    state.groupId = btn.dataset.group;
    state.index = 0;
    renderAll();
  });
  $("queueList").addEventListener("click", event => {
    const btn = event.target.closest("[data-jump]");
    if (!btn) return;
    state.index = Number(btn.dataset.jump);
    renderCard();
  });
  $("sentenceText").addEventListener("click", event => {
    const word = event.target.closest("[data-word]")?.dataset.word;
    if (!word) return;
    state.currentWord = word;
    lookupWord(word);
  });
  $("speakBtn").addEventListener("click", () => {
    const item = currentItem();
    if (item) speak(item.en);
  });
  $("speakWord").addEventListener("click", () => {
    const word = state.currentLookup?.word || state.currentWord;
    if (word) speak(word);
  });
  $("knownBtn").addEventListener("click", markKnown);
  $("againBtn").addEventListener("click", markAgain);
  $("prevBtn").addEventListener("click", () => { state.index -= 1; renderCard(); });
  $("nextBtn").addEventListener("click", () => { state.index += 1; renderCard(); });
  $("showChinese").addEventListener("change", event => { state.showChinese = event.target.checked; renderCard(); });
  $("showKnown").addEventListener("change", event => { state.showKnown = event.target.checked; state.index = 0; renderAll(); });
  $("searchInput").addEventListener("input", event => { state.search = event.target.value; state.index = 0; renderAll(); });
  $("resetGroup").addEventListener("click", resetGroup);
  $("addVocab").addEventListener("click", () => {
    const info = state.currentLookup;
    if (!info) return;
    const old = state.vocab[info.word] || {};
    state.vocab[info.word] = { ...info, count: (old.count || 0) + 1, updated: Date.now() };
    saveVocab();
    renderVocab();
  });
  $("clearVocab").addEventListener("click", () => {
    state.vocab = {};
    saveVocab();
    renderVocab();
  });
  $("installHelp").addEventListener("click", () => $("installDialog").showModal());
  $("closeDialog").addEventListener("click", () => $("installDialog").close());
  $("importHelp").addEventListener("click", () => $("importDialog").showModal());
  $("chooseImport").addEventListener("click", () => $("importFile").click());
  $("closeImport").addEventListener("click", () => $("importDialog").close());
  $("importFile").addEventListener("change", event => {
    const file = event.target.files?.[0];
    if (file) importScriptFile(file);
    event.target.value = "";
  });
  $("clearScript").addEventListener("click", () => {
    localStorage.removeItem(SCRIPT_KEY);
    state.progress = {};
    saveProgress();
    saveScript(window.PRACTICE_DATA);
    renderAll();
  });
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

bindEvents();
renderAll();
