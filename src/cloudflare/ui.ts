export function renderApp(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#f4efe8">
<title>wowacool · 小红书图文工作台</title>
<link rel="icon" href="/favicon.svg">
<style>
:root {
  --bg: #f3eee6;
  --bg-2: #e7dfd4;
  --ink: #1c1614;
  --muted: #6f645e;
  --faint: #93867e;
  --line: rgba(28, 22, 20, .1);
  --card: rgba(255, 253, 251, .92);
  --red: #ff2442;
  --red-deep: #d31232;
  --good: #0e7a49;
  --good-bg: #e7f6ee;
  --warn: #8a5a09;
  --warn-bg: #fff4dd;
  --bad: #b42318;
  --bad-bg: #fdecea;
  --shadow: 0 18px 50px rgba(90, 48, 28, .08);
  --serif: "Iowan Old Style", Palatino, "Palatino Linotype", "Songti SC", "Noto Serif SC", serif;
  --sans: "PingFang SC", "Hiragino Sans GB", "Noto Sans SC", "Microsoft YaHei", "Source Han Sans SC", "WenQuanYi Micro Hei", "Droid Sans Fallback", sans-serif;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  min-height: 100vh;
  color: var(--ink);
  font-family: var(--sans);
  background:
    radial-gradient(900px 420px at -10% -10%, rgba(255, 36, 66, .14), transparent 55%),
    radial-gradient(800px 380px at 110% 0%, rgba(232, 176, 122, .45), transparent 50%),
    var(--bg);
  letter-spacing: .01em;
}
button, input, textarea { font: inherit; color: inherit; }
button { cursor: pointer; }
a { color: inherit; }
::selection { background: rgba(255, 36, 66, .18); }
:focus-visible { outline: 2px solid var(--red); outline-offset: 2px; }
.wrap { width: min(1120px, calc(100% - 32px)); margin: 0 auto; }
.top {
  position: sticky; top: 0; z-index: 30;
  display: flex; align-items: center; gap: 18px;
  padding: 14px 0 12px;
  background: rgba(243, 238, 230, .84);
  backdrop-filter: blur(16px);
}
.brand { display: flex; align-items: center; gap: 10px; text-decoration: none; min-width: 0; }
.seal {
  width: 38px; height: 38px; border-radius: 12px; flex: none;
  display: grid; place-items: center;
  background: linear-gradient(160deg, #ff5a6e, var(--red) 55%, #c10e2c);
  color: white; font-family: var(--serif); font-size: 20px;
  box-shadow: 0 8px 16px rgba(255, 36, 66, .28);
}
.brand b { display: block; font-family: var(--serif); font-size: 18px; font-weight: 650; letter-spacing: -.03em; }
.brand small { display: block; color: var(--muted); font-size: 12px; margin-top: 1px; }
.nav { display: flex; gap: 6px; }
.nav a, .text-btn {
  text-decoration: none; border: 0; background: transparent;
  color: var(--muted); padding: 8px 12px; border-radius: 999px; font-size: 14px;
}
.nav a.on, .nav a:hover { background: white; color: var(--ink); }
.spacer { flex: 1; }
.chip {
  display: inline-flex; align-items: center; gap: 6px;
  border-radius: 999px; padding: 7px 12px; background: white;
  border: 1px solid var(--line); color: var(--muted); font-size: 13px; text-decoration: none;
}
.chip strong { color: var(--ink); font-weight: 650; }
.card {
  background: var(--card); border: 1px solid var(--line); border-radius: 22px;
  box-shadow: var(--shadow);
}
.hero { padding: 22px; margin: 8px 0 18px; }
.hero h1 { margin: 0 0 6px; font-family: var(--serif); font-size: clamp(28px, 4vw, 40px); font-weight: 650; letter-spacing: -.03em; }
.hero p.lead { margin: 0 0 18px; color: var(--muted); max-width: 46em; line-height: 1.6; }
.composer { display: grid; grid-template-columns: 1fr auto auto; gap: 10px; align-items: center; }
.field, textarea, .search {
  width: 100%; border: 1px solid var(--line); background: white; border-radius: 14px;
  padding: 12px 14px; outline: none;
}
.field:focus, textarea:focus, .search:focus { border-color: rgba(255, 36, 66, .45); box-shadow: 0 0 0 4px rgba(255, 36, 66, .08); }
textarea { min-height: 180px; resize: vertical; line-height: 1.65; }
.stepper { display: flex; align-items: center; gap: 8px; background: white; border-radius: 14px; border: 1px solid var(--line); padding: 6px; }
.stepper b { min-width: 4.5em; text-align: center; font-size: 14px; }
.icon-btn, .stepper button {
  width: 32px; height: 32px; border-radius: 10px; border: 0; background: var(--bg); color: var(--ink);
}
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  border-radius: 999px; border: 1px solid var(--line); background: white;
  padding: 11px 16px; text-decoration: none; font-weight: 620;
}
.btn.primary { background: var(--red); border-color: var(--red); color: white; }
.btn.primary:hover { background: var(--red-deep); }
.btn.good { background: var(--good); border-color: var(--good); color: white; }
.btn.ghost { background: transparent; }
.btn:disabled {
  background: #e7e0d8; border-color: transparent; color: #93867e; cursor: not-allowed; opacity: 1;
}
body.is-busy .btn { opacity: .55; }
.job-card p {
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.filters { display: flex; gap: 8px; flex-wrap: wrap; margin: 4px 0 12px; }
.filters button { border: 0; background: transparent; color: var(--muted); border-radius: 999px; padding: 7px 12px; }
.filters button.on { background: var(--ink); color: white; }
.jobs { display: grid; gap: 10px; }
.job-card {
  display: grid; grid-template-columns: 72px 1fr auto; gap: 14px; align-items: center;
  padding: 12px; text-decoration: none; color: inherit;
}
.job-card:hover { transform: translateY(-1px); }
.thumb, .ph {
  width: 72px; height: 96px; border-radius: 14px; object-fit: cover; background: #f6d5c4;
}
.ph { display: grid; place-items: center; color: var(--red-deep); font-family: var(--serif); font-size: 22px; }
.job-card h3 { margin: 0 0 4px; font-size: 16px; }
.job-card p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.45; }
.meta { display: flex; gap: 8px; align-items: center; margin-top: 8px; color: var(--faint); font-size: 12px; }
.pill { border-radius: 999px; padding: 3px 8px; font-size: 12px; background: #f1ece6; color: var(--muted); }
.pill.pending_review { background: var(--warn-bg); color: var(--warn); }
.pill.approved, .pill.exported { background: var(--good-bg); color: var(--good); }
.pill.rejected { background: var(--bad-bg); color: var(--bad); }
.empty { padding: 36px 22px; text-align: center; }
.empty h2 { font-family: var(--serif); margin: 8px 0; }
.empty p { color: var(--muted); margin: 0 auto; max-width: 36em; line-height: 1.6; }
.note-art { width: 84px; height: 108px; margin: 0 auto 8px; border-radius: 16px; background: white; border: 1px solid var(--line); box-shadow: var(--shadow); position: relative; }
.note-art:before { content: ""; position: absolute; left: 14px; right: 14px; top: 22px; height: 8px; border-radius: 99px; background: #ffd0d6; }
.note-art:after { content: ""; position: absolute; left: 14px; right: 28px; top: 40px; height: 8px; border-radius: 99px; background: #f1e6dc; box-shadow: 0 14px 0 #f1e6dc, 0 28px 0 #f1e6dc; }
.soon-strip, .section { margin: 22px 0 28px; }
.soon-strip h2, .section h2 { font-size: 16px; margin: 0; }
.row-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
.soon-grid, .soon-list { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; }
.soon-card { padding: 14px; min-height: 132px; display: flex; flex-direction: column; gap: 8px; text-align: left; }
.soon-card b { font-size: 15px; }
.soon-card span, .badge {
  align-self: flex-start; font-size: 12px; color: var(--warn); background: var(--warn-bg);
  border-radius: 999px; padding: 3px 8px;
}
.soon-card p, .soon-list p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.55; }
.foot { color: var(--faint); font-size: 12px; padding: 8px 0 28px; line-height: 1.6; }
.page-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-end; margin: 8px 0 14px; }
.page-head h1 { font-family: var(--serif); font-size: 32px; margin: 0; }
.steps { display: flex; gap: 8px; flex-wrap: wrap; list-style: none; padding: 0; margin: 8px 0 0; }
.steps li { display: flex; align-items: center; gap: 6px; color: var(--faint); font-size: 13px; }
.steps li span { width: 20px; height: 20px; border-radius: 99px; display: grid; place-items: center; background: white; border: 1px solid var(--line); font-size: 11px; }
.steps li.done { color: var(--ink); }
.steps li.done span { background: var(--ink); color: white; border-color: var(--ink); }
.workspace { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 16px; align-items: start; }
.stack { display: grid; gap: 14px; }
.block { padding: 16px; }
.block h2 { margin: 0 0 4px; font-size: 16px; }
.hint { color: var(--muted); font-size: 13px; line-height: 1.55; margin: 0 0 12px; }
.model { display: flex; justify-content: space-between; gap: 8px; align-items: center; margin-bottom: 12px; }
.model b { font-size: 13px; font-weight: 600; }
.count { float: right; color: var(--faint); font-size: 12px; font-variant-numeric: tabular-nums; }
.count.over { color: var(--bad); }
label.lbl { display: block; font-size: 13px; margin: 10px 0 6px; color: var(--muted); }
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.banner { border-radius: 14px; padding: 12px 14px; background: var(--warn-bg); color: #6d4a0b; font-size: 14px; line-height: 1.55; margin-bottom: 12px; }
.banner.bad { background: var(--bad-bg); color: var(--bad); }
.banner.good { background: var(--good-bg); color: var(--good); }
.shots { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.shot { margin: 0; background: white; border-radius: 16px; border: 1px solid var(--line); overflow: hidden; }
.shot img { width: 100%; aspect-ratio: 3/4; object-fit: cover; display: block; background: #f7e7df; }
.shot figcaption { padding: 8px; display: grid; gap: 6px; }
.shot input { width: 100%; border: 0; background: var(--bg); border-radius: 10px; padding: 8px; }
.shot-actions { display: flex; gap: 4px; }
.shot-actions button, .handle { border: 0; background: var(--bg); border-radius: 8px; padding: 4px 6px; font-size: 12px; color: var(--muted); }
.drop {
  border: 1.5px dashed rgba(28, 22, 20, .18); border-radius: 16px; padding: 16px; text-align: center; color: var(--muted); background: rgba(255,255,255,.45);
}
.prompts { display: grid; gap: 8px; }
.phone-wrap { position: sticky; top: 84px; z-index: 1; }
.device { width: 320px; margin: 0 auto; background: #1c1614; border-radius: 36px; padding: 12px; box-shadow: var(--shadow); }
.screen { background: white; border-radius: 26px; overflow: auto; min-height: 480px; max-height: calc(100vh - 130px); display: flex; flex-direction: column; }
.cover { position: relative; background: linear-gradient(180deg, #ffd9cf, #fff); aspect-ratio: 3/4; max-height: 250px; flex: none; }
.cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.cover-empty { height: 100%; display: grid; place-items: center; color: var(--muted); padding: 20px; text-align: center; }
.cover-count { position: absolute; top: 10px; right: 10px; background: rgba(0,0,0,.45); color: white; border-radius: 99px; font-size: 12px; padding: 3px 8px; }
.nav-shot { position: absolute; top: 50%; transform: translateY(-50%); width: 28px; height: 28px; border: 0; border-radius: 99px; background: rgba(255,255,255,.88); }
.nav-shot.prev { left: 8px; }
.nav-shot.next { right: 8px; }
.dots { position: absolute; left: 0; right: 0; bottom: 8px; display: flex; justify-content: center; gap: 4px; }
.dots i { width: 5px; height: 5px; border-radius: 99px; background: rgba(255,255,255,.55); display: block; }
.dots i.on { background: white; width: 12px; }
.note { padding: 12px 14px 16px; }
.author { display: grid; grid-template-columns: 32px 1fr auto; gap: 8px; align-items: center; margin-bottom: 8px; }
.avatar { width: 32px; height: 32px; border-radius: 99px; display: grid; place-items: center; background: var(--red); color: white; font-size: 13px; }
.author strong { display: block; font-size: 13px; }
.author em { display: block; font-style: normal; color: var(--faint); font-size: 11px; }
.follow { color: var(--red); border: 1px solid rgba(255,36,66,.35); border-radius: 99px; padding: 3px 8px; font-size: 12px; }
#pv-title { margin: 0 0 8px; font-size: 16px; line-height: 1.4; }
#pv-body { margin: 0; white-space: pre-wrap; font-size: 14px; line-height: 1.65; }
.muted { color: var(--faint); }
#pv-tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 0; }
#pv-tags span { color: #2457c5; font-size: 13px; }
.engage { margin-top: auto; display: flex; gap: 10px; align-items: center; padding: 10px 12px; border-top: 1px solid var(--line); color: var(--muted); font-size: 13px; }
.engage span:first-child { flex: 1; background: #f6f6f6; border-radius: 99px; padding: 6px 10px; }
.preview-hint { color: var(--faint); font-size: 12px; text-align: center; line-height: 1.5; }
.mobile-tabs { display: none; gap: 8px; margin-bottom: 12px; }
.mobile-tabs button { flex: 1; }
.mobile-tabs button.on { background: var(--ink); color: white; border-color: var(--ink); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.tag { display: inline-flex; align-items: center; gap: 4px; background: #fff1f3; color: var(--red-deep); border-radius: 99px; padding: 4px 8px; font-size: 13px; }
.tag button { border: 0; background: transparent; color: inherit; padding: 0 2px; }
.meters { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 14px; }
.meter { padding: 16px; }
.meter b { display: block; font-family: var(--serif); font-size: 28px; margin-top: 4px; }
.meter span { color: var(--muted); font-size: 13px; }
.bar { height: 8px; border-radius: 99px; background: #efe8e1; overflow: hidden; margin-top: 10px; }
.bar i { display: block; height: 100%; background: var(--red); }
.models { width: 100%; border-collapse: collapse; font-size: 13px; }
.models th, .models td { text-align: left; padding: 8px 6px; border-bottom: 1px solid var(--line); }
.models tr.on td { background: #fff6f7; }
.lock { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
.lock .card { width: min(420px, 100%); padding: 28px; }
.lock h1 { font-family: var(--serif); margin: 12px 0 8px; }
#toast {
  position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%) translateY(12px);
  background: var(--ink); color: white; border-radius: 999px; padding: 10px 16px; font-size: 13px;
  opacity: 0; pointer-events: none; transition: .2s ease;
}
#toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
pre.payload { white-space: pre-wrap; word-break: break-word; background: #1c1614; color: #f6efe8; border-radius: 16px; padding: 12px; font-size: 12px; line-height: 1.5; max-height: 240px; overflow: auto; }
@media (max-width: 880px) {
  .top { flex-wrap: wrap; gap: 8px 10px; padding-top: 10px; }
  .spacer { display: none; }
  .nav { order: 3; width: 100%; }
  .chip { margin-left: auto; }
  .composer, .meters, .soon-grid { grid-template-columns: 1fr; }
  .soon-list { grid-template-columns: 1fr; }
  .page-head { flex-direction: column; align-items: stretch; }
  .job-card { grid-template-columns: 64px 1fr; }
  .job-card .when { display: none; }
  .workspace { display: block; }
  .preview-col { display: none; }
  body.pane-preview .editor-col { display: none; }
  body.pane-preview .preview-col { display: block; }
  .mobile-tabs { display: flex; }
  .shots { grid-template-columns: repeat(2, 1fr); }
  .top .nav a { padding: 8px 10px; }
  .device { width: min(100%, 360px); }
  .hero h1, .page-head h1 { font-size: 28px; }
}
@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; }
}
</style>
</head>
<body>
<div id="app">正在打开工作台…</div>
<div id="toast" role="status"></div>
<script>
(function () {
  var app = document.getElementById("app");
  var state = {
    session: { required: false, unlocked: true },
    route: { view: "board" },
    jobs: [],
    job: null,
    quota: null,
    catalog: null,
    filter: "all",
    busy: false,
    banner: "",
    copyError: null,
    reviewNote: "",
    tags: [],
    previewIndex: 0,
    mobilePane: "edit",
    imageCount: 3,
    composerCount: 3,
    composerTopic: "",
    authError: "",
    confirmReplace: false,
    modelQuery: "",
    dragId: ""
  };
  var saveTimer = 0;
  var STATUS = {
    draft: "草稿",
    pending_review: "待审核",
    approved: "已批准",
    rejected: "已驳回",
    exported: "已导出"
  };
  var SOON = [
    ["官方发布 write_notes", "小红书开放平台的 write_notes 仍在规划中。这里只导出素材包和官方唤起参数，不会代发。"],
    ["抖音", "本期只做小红书图文。抖音不会从这里发布，也没有隐藏的发布按钮。"],
    ["视频号", "微信视频号不在本期范围。入口只是说明，不会收集视频号内容。"],
    ["视频", "不做视频生成或视频发布。配图只用占位图，或你自己上传的图片。"],
    ["评论助手", "不会给别人的笔记留言。若以后做，也只处理你自己的内容，并且先由人确认。"]
  ];

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }
  function chars(value) { return Array.from(String(value || "")).length; }
  function when(iso) {
    if (!iso) return "";
    var date = new Date(iso);
    if (isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit"
    }).format(date);
  }
  function clampCount(n) {
    n = Math.round(Number(n) || 3);
    if (n < 1) return 1;
    if (n > 18) return 18;
    return n;
  }
  function api(path, options) {
    options = options || {};
    var headers = Object.assign({}, options.headers || {});
    var body = options.body;
    if (options.json) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(options.json);
    }
    return fetch(path, { method: options.method || "GET", headers: headers, body: body }).then(function (res) {
      var type = res.headers.get("content-type") || "";
      if (type.indexOf("application/json") === -1) {
        if (!res.ok) throw Object.assign(new Error("请求失败（" + res.status + "）"), { status: res.status });
        return res;
      }
      return res.json().then(function (data) {
        if (res.status === 401 && path !== "/session") {
          state.session.required = true;
          state.session.unlocked = false;
          render();
        }
        if (!res.ok || data.ok === false) {
          throw Object.assign(new Error(data.error || "请求失败"), { status: res.status, code: data.code, data: data });
        }
        return data;
      });
    });
  }
  function toast(text) {
    var el = document.getElementById("toast");
    if (!el) return;
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2600);
  }
  function setBusy(on) {
    state.busy = on;
    document.body.classList.toggle("is-busy", on);
  }
  function readRoute() {
    var hash = (location.hash || "#/").replace(/^#/, "");
    if (hash === "" || hash === "/" || hash === "/board") return { view: "board" };
    if (hash === "/quota") return { view: "quota" };
    if (hash === "/soon") return { view: "soon" };
    var prefix = "/jobs/";
    if (hash.indexOf(prefix) === 0 && /^[A-Za-z0-9_-]+$/.test(hash.slice(prefix.length))) {
      return { view: "job", id: hash.slice(prefix.length) };
    }
    return { view: "board" };
  }

  function boot() {
    api("/session").then(function (data) {
      state.session = data;
      return followRoute();
    }).catch(function (err) {
      state.banner = err.message;
      render();
    });
  }
  function followRoute() {
    clearTimeout(saveTimer);
    state.route = readRoute();
    state.banner = "";
    if (state.session.required && !state.session.unlocked) { render(); return Promise.resolve(); }
    if (state.route.view === "board") return loadBoard();
    if (state.route.view === "quota") return loadQuota();
    if (state.route.view === "job") return loadJob(state.route.id);
    render();
    return Promise.resolve();
  }
  function loadBoard() {
    return Promise.all([api("/jobs"), api("/quota")]).then(function (pair) {
      state.jobs = pair[0].jobs || [];
      state.quota = pair[1];
      render();
    }).catch(function (err) {
      state.banner = err.message;
      render();
    });
  }
  function loadQuota() {
    return Promise.all([api("/quota"), api("/catalog")]).then(function (pair) {
      state.quota = pair[0];
      state.catalog = pair[1];
      render();
    }).catch(function (err) {
      state.banner = err.message;
      render();
    });
  }
  function loadJob(id) {
    return api("/jobs/" + id).then(function (data) {
      var changed = !state.job || state.job.id !== data.job.id;
      state.job = data.job;
      state.tags = String(data.job.tags || "").split(",").map(function (tag) { return tag.trim(); }).filter(Boolean);
      if (changed) {
        state.reviewNote = "";
        state.previewIndex = 0;
        state.mobilePane = "edit";
        state.confirmReplace = false;
        state.copyError = null;
        var stored = sessionStorage.getItem("wowacool-count");
        state.imageCount = clampCount(stored || data.job.imagePrompts.length || data.job.images.length || 3);
        sessionStorage.removeItem("wowacool-count");
      }
      render({ fresh: true });
    }).catch(function (err) {
      state.job = null;
      state.banner = err.message;
      render();
    });
  }

  function header() {
    var route = state.route.view;
    var chip = "额度";
    if (state.quota && state.quota.configured === false) chip = "未配置文案密钥";
    else if (state.quota && state.quota.quota && state.quota.quota.freeModelDailyRequests) {
      var daily = state.quota.quota.freeModelDailyRequests;
      chip = daily.remaining <= 0 ? "今日额度已用完" : "今日剩余 " + daily.remaining;
    }
    return '<header class="top wrap">' +
      '<a class="brand" href="#/"><span class="seal">图</span><span><b>wowacool</b><small>小红书图文工作台</small></span></a>' +
      '<nav class="nav">' +
        '<a href="#/" class="' + (route === "board" || route === "job" ? "on" : "") + '">工作台</a>' +
        '<a href="#/quota" class="' + (route === "quota" ? "on" : "") + '">额度</a>' +
        '<a href="#/soon" class="' + (route === "soon" ? "on" : "") + '">即将推出</a>' +
      "</nav>" +
      '<div class="spacer"></div>' +
      '<a class="chip" href="#/quota">' + esc(chip) + "</a>" +
    "</header>";
  }
  function footer() {
    var lock = state.session.required ? "" : "<div>此工作台尚未设置访问口令，知道链接的人可以打开。部署后可配置 APP_ACCESS_TOKEN。</div>";
    return '<footer class="foot wrap">wowacool 只准备图文素材。导出之后，由你在小红书发布页自己确认。本页不代发、不抓取、不评论别人的笔记。' + lock + "</footer>";
  }
  function shell(main) { return header() + '<div class="wrap">' + main + "</div>" + footer(); }

  function boardHtml() {
    var filters = ["all", "draft", "pending_review", "approved", "rejected", "exported"];
    var names = { all: "全部" };
    Object.keys(STATUS).forEach(function (key) { names[key] = STATUS[key]; });
    var jobs = state.jobs.filter(function (job) { return state.filter === "all" || job.status === state.filter; });
    var list = jobs.length ? '<div class="jobs">' + jobs.map(jobCard).join("") + "</div>" : emptyJobs();
    var soon = '<section class="soon-strip"><div class="row-head"><h2>还没做的事</h2><a href="#/soon">看说明</a></div><div class="soon-grid">' +
      SOON.map(function (item) {
        return '<a class="card soon-card" href="#/soon"><span class="badge">即将推出</span><b>' + esc(item[0]) + "</b></a>";
      }).join("") + "</div></section>";
    return shell(
      '<section class="card hero">' +
        "<h1>从选题到可发布的图文包</h1>" +
        '<p class="lead">写标题和正文，配上 1 到 18 张图，你自己点头之后，再下载审核包和官方发布参数。人工审核是导出的前提。</p>' +
        '<form id="composer" class="composer">' +
          '<input class="field" id="topic" name="topic" maxlength="120" placeholder="例如：一周便当不重样" aria-label="选题" value="' + esc(state.composerTopic) + '">' +
          stepper("composerCount", state.composerCount) +
          '<button class="btn primary" type="submit">创建任务</button>' +
        "</form>" +
      "</section>" +
      (state.banner ? '<div class="banner bad">' + esc(state.banner) + "</div>" : "") +
      '<div class="filters">' + filters.map(function (key) {
        return '<button type="button" data-action="filter" data-filter="' + key + '" class="' + (state.filter === key ? "on" : "") + '">' + names[key] + "</button>";
      }).join("") + "</div>" + list + soon
    );
  }
  function jobCard(job) {
    var title = job.title || job.topic || "未命名选题";
    var thumb = job.coverUrl ? '<img class="thumb" src="' + esc(job.coverUrl) + '" alt="">' : '<span class="ph">图</span>';
    return '<a class="card job-card" href="#/jobs/' + esc(job.id) + '">' + thumb +
      "<div><h3>" + esc(title) + "</h3><p>" + esc(job.contentPreview || job.topic) + "</p>" +
      '<div class="meta"><span class="pill ' + esc(job.status) + '">' + esc(STATUS[job.status] || job.status) + "</span><span>" +
      esc(job.imageCount || 0) + " 张图</span></div></div>" +
      '<div class="when">' + esc(when(job.createdAt)) + "</div></a>";
  }
  function emptyJobs() {
    var text = state.filter === "all"
      ? "还没有任务。写下一个想发的主题，例如「租房厨房的收纳」。文案、图片、审核和导出都在这一页完成。"
      : "这个状态下还没有任务。";
    return '<section class="card empty"><div class="note-art"></div><h2>' + (state.filter === "all" ? "工作台是空的" : "没有符合的任务") + "</h2><p>" + text + "</p></section>";
  }
  function stepper(name, value) {
    return '<div class="stepper"><button type="button" data-action="count" data-count="' + name + '" data-dir="-1" aria-label="减少图片">−</button><b>' + value + ' 张</b><button type="button" data-action="count" data-count="' + name + '" data-dir="1" aria-label="增加图片">+</button></div>';
  }

  function jobHtml() {
    if (!state.job) {
      return shell('<section class="card empty"><h2>没有打开这条任务</h2><p>' + esc(state.banner || "它可能已被删除。") + '</p><p><a class="btn" href="#/">返回工作台</a></p></section>');
    }
    var job = state.job;
    var locked = job.status === "exported";
    return shell(
      '<div class="page-head"><input type="hidden" id="job-id" value="' + esc(job.id) + '"><div><a href="#/">← 工作台</a><h1>' + esc(job.title || job.topic) + "</h1>" + stepsHtml(job) + "</div>" +
      '<div class="actions"><span class="pill ' + esc(job.status) + '">' + esc(STATUS[job.status] || job.status) + '</span><button class="btn" type="button" data-action="duplicate">复制为新任务</button></div></div>' +
      '<div class="mobile-tabs"><button type="button" class="btn ' + (state.mobilePane === "edit" ? "on" : "") + '" data-action="pane" data-pane="edit">编辑</button><button type="button" class="btn ' + (state.mobilePane === "preview" ? "on" : "") + '" data-action="pane" data-pane="preview">预览</button></div>' +
      (state.banner ? '<div class="banner bad">' + esc(state.banner) + "</div>" : "") +
      '<div class="workspace"><div class="editor-col stack">' + copyCard(job, locked) + imageCard(job, locked) + reviewCard(job, locked) + exportCard(job) + '</div><aside class="preview-col">' + previewHtml(job) + "</aside></div>"
    );
  }
  function stepsHtml(job) {
    var steps = [
      ["选题", true],
      ["文案", !!(job.title && job.content)],
      ["图片", job.images.length > 0],
      ["审核", job.status === "approved" || job.status === "exported"],
      ["导出", job.status === "exported"]
    ];
    return '<ol class="steps">' + steps.map(function (step, index) {
      return '<li class="' + (step[1] ? "done" : "") + '"><span>' + (index + 1) + "</span>" + step[0] + "</li>";
    }).join("") + "</ol>";
  }
  function copyCard(job, locked) {
    var fallbacks = (job.fallbacksOffered || []).length ? '<div class="hint">免费回退：' + esc(job.fallbacksOffered.join("、")) + "</div>" : "";
    var error = "";
    if (state.copyError) {
      error = '<div class="banner">' + esc(state.copyError.message) + "</div>";
      if (state.copyError.code === "missing_api_key" || state.copyError.code === "quota_exhausted") {
        error += '<button class="btn" type="button" data-action="fixture">使用示例文案</button>';
      }
    }
    var model = !job.modelUsed ? "尚未生成文案" : (job.modelUsed === "fixture/local" ? "示例文案 · 未调用模型" : "文案模型 · " + job.modelUsed);
    return '<section class="card block"><div class="model"><b>' + esc(model) + '</b><span id="saved" class="hint"></span></div>' + fallbacks + error +
      '<label class="lbl" for="title">标题 <span id="title-count" class="count">0/20</span></label>' +
      '<input class="field" id="title" maxlength="40" ' + (locked ? "readonly" : "") + ' aria-label="标题">' +
      '<label class="lbl" for="content">正文 <span id="content-count" class="count">0/1000</span></label>' +
      '<textarea id="content" ' + (locked ? "readonly" : "") + ' aria-label="正文"></textarea>' +
      '<label class="lbl">话题</label><div class="chips" id="chips"></div>' +
      (locked ? "" : '<input class="field" id="tag-input" placeholder="输入话题，回车添加。逗号会自动拆开" aria-label="添加话题">') +
      '<p class="hint">标题最多 20 字，正文最多 1000 字。话题用英文逗号交给官方参数。</p>' +
      (locked ? "" : '<div class="actions"><button class="btn primary" type="button" data-action="draft">生成文案</button><button class="btn" type="button" data-action="fixture">使用示例文案</button></div>') +
    "</section>";
  }
  function imageCard(job, locked) {
    var body = "";
    if (!job.images.length && !(job.imagePrompts || []).length) {
      body = '<p class="hint">还没有图片。上传你的图，或生成占位图。单张不超过 4MB，一共 1 到 18 张。</p>';
    }
    if (!job.images.length && (job.imagePrompts || []).length) {
      body += '<div class="prompts">' + job.imagePrompts.map(function (_, index) {
        return '<input class="field" data-prompt-index="' + index + '" aria-label="图 ' + (index + 1) + ' 提示词" ' + (locked ? "readonly" : "") + ">";
      }).join("") + "</div>";
    }
    if (job.images.length) {
      body += '<div class="shots">' + job.images.map(function (image, index) {
        return '<figure class="shot" data-image-id="' + esc(image.id) + '"><img src="' + esc(image.url) + '" alt="' + esc(image.prompt || "配图") + '">' +
          '<figcaption><input data-prompt-index="' + index + '" aria-label="图 ' + (index + 1) + ' 说明" ' + (locked ? "readonly" : "") + ">" +
          (locked ? "" : '<div class="shot-actions"><button type="button" class="handle" draggable="true" data-image-id="' + esc(image.id) + '">拖动</button><button type="button" data-action="img-up" data-id="' + esc(image.id) + '">上移</button><button type="button" data-action="img-down" data-id="' + esc(image.id) + '">下移</button><button type="button" data-action="img-del" data-id="' + esc(image.id) + '">删除</button></div>') +
          "</figcaption></figure>";
      }).join("") + "</div>";
    }
    var confirm = state.confirmReplace ? '<div class="banner">生成占位图会替换当前图片。<button class="btn" type="button" data-action="confirm-mock">确认替换</button></div>' : "";
    return '<section class="card block"><div class="row-head"><h2>图片 ' + job.images.length + " / 18</h2>" + (locked ? "" : stepper("imageCount", state.imageCount)) + "</div>" +
      '<p class="hint">默认是占位图，不调用付费出图，也不用视频模型。你也可以上传自己的图，拖动或用上移下移调整顺序。</p>' +
      confirm + body +
      (locked ? "" : '<div class="actions"><label class="btn">上传图片<input id="file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden></label><button class="btn" type="button" data-action="mock">生成占位图</button></div><div class="drop" id="drop">把图片拖到这里</div>') +
    "</section>";
  }
  function reviewCard(job, locked) {
    var blockers = [];
    if (!String(job.title || "").trim()) blockers.push("标题");
    if (!String(job.content || "").trim()) blockers.push("正文");
    if (!job.images.length) blockers.push("至少 1 张图片");
    var quote = job.review && job.review.note ? '<div class="banner">审核说明：' + esc(job.review.note) + " · " + esc(when(job.review.at)) + "</div>" : "";
    var warn = job.status === "approved" ? '<p class="hint">再改文字或图片会取消批准，需要重新审核。</p>' : "";
    return '<section class="card block"><h2>人工审核</h2>' +
      '<p class="hint">导出前必须你本人批准。驳回请写明原因。这里不会发布到小红书。</p>' + quote + warn +
      (blockers.length && !locked ? '<p class="hint">还缺：' + esc(blockers.join("、")) + "</p>" : "") +
      '<label class="lbl" for="review-note">审核说明</label><textarea id="review-note" ' + (locked ? "readonly" : "") + ' placeholder="可选。驳回时请写明原因，例如：标题再具体一点。"></textarea>' +
      (locked ? '<p class="hint">这条已经导出。要改，请复制为新任务，再重新审核。</p>' : '<div class="actions"><button class="btn" type="button" data-action="reject">驳回</button><button class="btn good" type="button" data-action="approve"' + (blockers.length ? " disabled" : "") + ">批准</button></div>") +
    "</section>";
  }
  function exportCard(job) {
    var ready = job.status === "approved";
    var done = job.status === "exported";
    var note = done ? "素材包已备好。下载后，在小红书发布页自己确认。" : (ready ? "已批准。现在可以导出素材包和官方发布参数。" : "批准之后才能下载。在那之前，下面的参数只是预览。");
    var button = done
      ? '<a class="btn primary" href="/jobs/' + esc(job.id) + '/package">下载素材包</a>'
      : '<button class="btn primary" type="button" data-action="export"' + (ready ? "" : " disabled") + ">导出素材包</button>";
    return '<section class="card block"><h2>导出</h2><p class="hint">' + note + "</p>" +
      '<div class="actions">' + button + '<button class="btn" type="button" data-action="copy-payload"' + (job.postNote ? "" : " disabled") + ">复制发布参数</button></div>" +
      '<p class="hint">官方 xhs.postNote 参数。本页不会替你点发布。</p><pre class="payload" id="postnote">' + (job.postNote ? "" : "图片和文案齐全后，这里会显示发布参数。") + "</pre></section>";
  }
  function previewHtml(job) {
    var image = job.images[state.previewIndex] || job.images[0];
    var cover = image
      ? '<img id="pv-img" src="' + esc(image.url) + '" alt="' + esc(image.prompt || "配图") + '"><div class="cover-count" id="pv-count">' + ((state.previewIndex || 0) + 1) + "/" + job.images.length + '</div><button class="nav-shot prev" type="button" data-action="slide" data-dir="-1" aria-label="上一张">‹</button><button class="nav-shot next" type="button" data-action="slide" data-dir="1" aria-label="下一张">›</button><div class="dots" id="pv-dots">' + job.images.map(function (_, index) { return '<i class="' + (index === state.previewIndex ? "on" : "") + '"></i>'; }).join("") + "</div>"
      : '<div class="cover-empty">配图会显示在这里</div>';
    return '<div class="phone-wrap"><div class="device"><div class="screen"><div class="cover" id="cover">' + cover + '</div><div class="note"><div class="author"><span class="avatar">哇</span><div><strong>预览</strong><em>不会发布</em></div><span class="follow">关注</span></div><h3 id="pv-title"></h3><p id="pv-body"></p><p id="pv-tags"></p></div><div class="engage"><span>说点什么…</span><span>♡</span><span>☆</span><span>💬</span></div></div></div><p class="preview-hint">小红书样式的预览，用来检查成品。点赞、收藏和评论都是样子，不会发出去。</p></div>';
  }

  function quotaHtml() {
    var quota = state.quota || {};
    var daily = quota.quota && quota.quota.freeModelDailyRequests;
    var used = daily ? daily.used : "—";
    var limit = daily ? daily.limit : "—";
    var remaining = daily ? daily.remaining : "—";
    var width = daily && daily.limit ? Math.max(0, Math.min(100, Math.round(daily.used / daily.limit * 100))) : 0;
    var credit = quota.quota && quota.quota.creditLimitRemaining != null ? quota.quota.creditLimitRemaining : "—";
    var message = quota.message ? '<div class="banner">' + esc(quota.message) + "</div>" : "";
    var models = (state.catalog && state.catalog.models) || [];
    var query = state.modelQuery.trim().toLowerCase();
    var shown = models.filter(function (model) {
      if (!query) return true;
      return (model.id + " " + model.name).toLowerCase().indexOf(query) >= 0;
    }).slice(0, 80);
    var route = state.catalog && state.catalog.route;
    var routeText = route ? "当前优先 " + route.model + (route.fallbacks.length ? "，回退 " + route.fallbacks.join("、") : "") : "还没有可用的免费文本模型。";
    return shell(
      '<div class="page-head"><div><h1>免费模型额度</h1><p class="hint">只使用 OpenRouter 免费文本模型。额度用尽后停止，不会改用付费模型。</p></div>' +
      '<div class="actions"><button class="btn" type="button" data-action="refresh-quota">刷新额度</button><button class="btn" type="button" data-action="refresh-catalog">刷新模型目录</button></div></div>' +
      (state.banner ? '<div class="banner bad">' + esc(state.banner) + "</div>" : "") + message +
      '<div class="meters"><div class="card meter"><span>今日已用</span><b>' + esc(used) + '</b></div><div class="card meter"><span>每日上限</span><b>' + esc(limit) + '</b><div class="bar"><i style="width:' + width + '%"></i></div></div><div class="card meter"><span>今日剩余</span><b>' + esc(remaining) + "</b></div></div>" +
      '<section class="card block"><h2>密钥积分剩余</h2><p>' + esc(credit) + '</p><p class="hint">' + esc(quota.quota && quota.quota.capturedAt ? "记录时间 " + when(quota.quota.capturedAt) : "还没有额度记录") + "</p></section>" +
      '<section class="card block"><div class="row-head"><h2>免费文本模型 ' + models.length + '</h2></div><p class="hint">' + esc(routeText) + '</p><input class="search" id="model-query" placeholder="搜索模型" aria-label="搜索模型" value="' + esc(state.modelQuery) + '"><table class="models"><thead><tr><th>模型</th><th>名称</th><th>上下文</th></tr></thead><tbody>' +
      (shown.length ? shown.map(function (model) {
        var on = route && route.model === model.id;
        return '<tr class="' + (on ? "on" : "") + '"><td>' + esc(model.id) + "</td><td>" + esc(model.name) + "</td><td>" + esc(model.contextLength || "—") + (on ? " · 当前" : "") + "</td></tr>";
      }).join("") : '<tr><td colspan="3">目录是空的。配置密钥后点刷新模型目录。</td></tr>') +
      "</tbody></table></section>"
    );
  }
  function soonHtml() {
    return shell(
      '<div class="page-head"><div><h1>即将推出</h1><p class="hint">这些入口只说明边界，没有可提交的表单，也不会假装已经能用。</p></div></div>' +
      '<div class="soon-list">' + SOON.map(function (item) {
        return '<article class="card soon-card"><span>即将推出</span><b>' + esc(item[0]) + "</b><p>" + esc(item[1]) + "</p></article>";
      }).join("") + "</div>"
    );
  }
  function lockHtml() {
    return '<div class="lock"><form id="unlock" class="card"><span class="seal">图</span><h1>wowacool</h1><p class="hint">这是内部运营台。请输入访问口令后继续。口令不会出现在页面上。</p>' +
      (state.authError ? '<div class="banner bad">' + esc(state.authError) + "</div>" : "") +
      '<label class="lbl" for="pass">访问口令</label><input class="field" id="pass" type="password" autocomplete="current-password">' +
      '<div class="actions"><button class="btn primary" type="submit">进入工作台</button></div></form></div>';
  }

  function captureEditor() {
    var title = document.getElementById("title");
    var marker = document.getElementById("job-id");
    if (!title || !state.job || !marker || marker.value !== state.job.id) return;
    var content = document.getElementById("content");
    var note = document.getElementById("review-note");
    state.job.title = title.value;
    if (content) state.job.content = content.value;
    if (note) state.reviewNote = note.value;
    var prompts = collectPrompts();
    if (!prompts) return;
    if (state.job.images.length) {
      prompts.forEach(function (prompt, index) {
        if (state.job.images[index]) state.job.images[index].prompt = prompt;
      });
    } else {
      state.job.imagePrompts = prompts;
    }
  }
  function render(options) {
    if (!options || options.fresh !== true) captureEditor();
    document.body.classList.toggle("pane-preview", state.mobilePane === "preview" && state.route.view === "job");
    if (state.session.required && !state.session.unlocked) app.innerHTML = lockHtml();
    else if (state.route.view === "quota") app.innerHTML = quotaHtml();
    else if (state.route.view === "soon") app.innerHTML = soonHtml();
    else if (state.route.view === "job") app.innerHTML = jobHtml();
    else app.innerHTML = boardHtml();
    afterRender();
  }
  function afterRender() {
    var job = state.job;
    var title = document.getElementById("title");
    var content = document.getElementById("content");
    if (title && job) title.value = job.title || "";
    if (content && job) content.value = job.content || "";
    var note = document.getElementById("review-note");
    if (note) note.value = state.reviewNote || "";
    document.querySelectorAll("[data-prompt-index]").forEach(function (el) {
      var index = Number(el.getAttribute("data-prompt-index"));
      var prompts = job && job.images.length ? job.images.map(function (image) { return image.prompt; }) : (job ? job.imagePrompts : []);
      el.value = prompts[index] || "";
    });
    renderChips();
    var pre = document.getElementById("postnote");
    if (pre && job && job.postNote) pre.textContent = JSON.stringify(job.postNote, null, 2);
    updatePreview();
    var pass = document.getElementById("pass");
    if (pass) pass.focus();
  }
  function renderChips() {
    var box = document.getElementById("chips");
    if (!box) return;
    box.innerHTML = state.tags.map(function (tag, index) {
      return '<span class="tag">' + esc(tag) + '<button type="button" data-action="drop-tag" data-index="' + index + '" aria-label="移除话题">×</button></span>';
    }).join("");
  }
  function updatePreview() {
    var title = document.getElementById("title");
    var content = document.getElementById("content");
    var titleEl = document.getElementById("pv-title");
    var bodyEl = document.getElementById("pv-body");
    var tagsEl = document.getElementById("pv-tags");
    if (!titleEl || !bodyEl || !tagsEl) return;
    var t = title ? title.value.trim() : (state.job && state.job.title) || "";
    var b = content ? content.value.trim() : (state.job && state.job.content) || "";
    titleEl.textContent = t || "标题会显示在这里";
    titleEl.classList.toggle("muted", !t);
    bodyEl.textContent = b || "正文会显示在这里";
    bodyEl.classList.toggle("muted", !b);
    tagsEl.textContent = "";
    state.tags.forEach(function (tag) {
      var span = document.createElement("span");
      span.textContent = "#" + tag;
      tagsEl.appendChild(span);
    });
    var titleCount = document.getElementById("title-count");
    var contentCount = document.getElementById("content-count");
    if (titleCount && title) titleCount.textContent = chars(title.value) + "/20";
    if (contentCount && content) contentCount.textContent = chars(content.value) + "/1000";
  }
  function clampField(el, max) {
    var list = Array.from(el.value);
    if (list.length <= max) return;
    var next = list.slice(0, max).join("");
    el.value = next;
  }
  function collectPrompts() {
    var fields = Array.prototype.slice.call(document.querySelectorAll("[data-prompt-index]"));
    if (!fields.length) return null;
    return fields.map(function (el) { return el.value; });
  }
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { saveFields(false); }, 450);
  }
  function saveFields(silent) {
    if (!state.job || state.job.status === "exported") return Promise.resolve();
    var title = document.getElementById("title");
    var content = document.getElementById("content");
    if (!title || !content) return Promise.resolve();
    var body = { title: title.value, content: content.value, tags: state.tags.join(",") };
    var prompts = collectPrompts();
    if (prompts) body.imagePrompts = prompts;
    return api("/jobs/" + state.job.id, { method: "PATCH", json: body }).then(function (data) {
      var statusChanged = data.job.status !== state.job.status;
      state.job = data.job;
      state.tags = String(data.job.tags || "").split(",").map(function (tag) { return tag.trim(); }).filter(Boolean);
      var saved = document.getElementById("saved");
      if (saved) saved.textContent = "已保存";
      if (data.reviewReset) toast("内容已改，需要重新审核");
      if (statusChanged) render();
      return data;
    }).catch(function (err) {
      if (!silent) {
        var saved = document.getElementById("saved");
        if (saved) saved.textContent = err.message;
      }
      throw err;
    });
  }

  function createTask(event) {
    event.preventDefault();
    var topic = document.getElementById("topic");
    var value = topic ? topic.value.trim() : "";
    state.composerTopic = value;
    if (!value) { state.banner = "请先写一个选题"; render(); return; }
    setBusy(true);
    api("/jobs", { method: "POST", json: { topic: value } }).then(function (data) {
      sessionStorage.setItem("wowacool-count", String(state.composerCount));
      state.composerTopic = "";
      location.hash = "#/jobs/" + data.job.id;
    }).catch(function (err) {
      state.banner = err.message;
      render();
    }).finally(function () { setBusy(false); });
  }
  function unlock(event) {
    event.preventDefault();
    var pass = document.getElementById("pass");
    setBusy(true);
    api("/session", { method: "POST", json: { token: pass ? pass.value : "" } }).then(function (data) {
      state.session = data;
      state.authError = "";
      return followRoute();
    }).catch(function (err) {
      state.authError = err.message;
      render();
    }).finally(function () { setBusy(false); });
  }
  function runDraft(fixture) {
    if (!state.job) return;
    setBusy(true);
    state.copyError = null;
    Promise.resolve(saveFields(true)).catch(function () { return null; }).then(function () {
      return api("/jobs/" + state.job.id + "/draft", { method: "POST", json: { fixture: !!fixture, imageCount: state.imageCount } });
    }).then(function (data) {
      state.job = data.job;
      state.tags = String(data.job.tags || "").split(",").map(function (tag) { return tag.trim(); }).filter(Boolean);
      toast(fixture ? "已填入示例文案" : "文案已生成");
      render({ fresh: true });
    }).catch(function (err) {
      state.copyError = { message: err.message, code: err.code };
      render();
    }).finally(function () { setBusy(false); });
  }
  function runMock(replace) {
    if (!state.job) return;
    if (state.job.images.length && !replace) { state.confirmReplace = true; render(); return; }
    setBusy(true);
    Promise.resolve(saveFields(true)).catch(function () { return null; }).then(function () {
      return api("/jobs/" + state.job.id + "/images", { method: "POST", json: { count: state.imageCount, replace: !!replace } });
    }).then(function (data) {
      state.job = data.job;
      state.confirmReplace = false;
      toast(data.provider === "mock" ? "已生成占位图" : "图片已生成");
      render({ fresh: true });
    }).catch(function (err) {
      if (err.code === "confirm_replace") { state.confirmReplace = true; render(); return; }
      state.banner = err.message;
      render();
    }).finally(function () { setBusy(false); });
  }
  function uploadFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length || !state.job) return;
    var form = new FormData();
    files.forEach(function (file) { form.append("file", file); });
    setBusy(true);
    fetch("/jobs/" + state.job.id + "/images/upload", { method: "POST", body: form }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok || data.ok === false) throw Object.assign(new Error(data.error || "上传失败"), { code: data.code });
        return data;
      });
    }).then(function (data) {
      state.job = data.job;
      toast("图片已上传");
      render({ fresh: true });
    }).catch(function (err) {
      state.banner = err.message;
      render();
    }).finally(function () { setBusy(false); });
  }
  function moveImage(id, dir) {
    var ids = state.job.images.map(function (image) { return image.id; });
    var index = ids.indexOf(id);
    var next = index + dir;
    if (index < 0 || next < 0 || next >= ids.length) return;
    var swap = ids[index];
    ids[index] = ids[next];
    ids[next] = swap;
    saveOrder(ids);
  }
  function saveOrder(ids) {
    setBusy(true);
    api("/jobs/" + state.job.id + "/images/reorder", { method: "POST", json: { ids: ids } }).then(function (data) {
      state.job = data.job;
      render({ fresh: true });
    }).catch(function (err) {
      state.banner = err.message;
      render();
    }).finally(function () { setBusy(false); });
  }
  function review(decision) {
    var note = document.getElementById("review-note");
    state.reviewNote = note ? note.value : "";
    if (decision === "rejected" && !state.reviewNote.trim()) {
      state.banner = "驳回时请写明原因";
      render();
      return;
    }
    setBusy(true);
    Promise.resolve(saveFields(true)).catch(function () { return null; }).then(function () {
      return api("/jobs/" + state.job.id + "/review", { method: "POST", json: { decision: decision, note: state.reviewNote } });
    }).then(function (data) {
      state.job = data.job;
      toast(decision === "approved" ? "已批准，可以导出" : "已驳回");
      render({ fresh: true });
    }).catch(function (err) {
      state.banner = err.message;
      render();
    }).finally(function () { setBusy(false); });
  }
  function exportJob() {
    setBusy(true);
    api("/jobs/" + state.job.id + "/export", { method: "POST", json: {} }).then(function (data) {
      state.job = data.job;
      if (data.postNote) state.job.postNote = data.postNote;
      toast("素材包已备好");
      render({ fresh: true });
    }).catch(function (err) {
      state.banner = err.message;
      render();
    }).finally(function () { setBusy(false); });
  }
  function duplicate() {
    setBusy(true);
    api("/jobs/" + state.job.id + "/duplicate", { method: "POST", json: {} }).then(function (data) {
      location.hash = "#/jobs/" + data.job.id;
    }).catch(function (err) {
      state.banner = err.message;
      render();
    }).finally(function () { setBusy(false); });
  }

  document.addEventListener("click", function (event) {
    var btn = event.target.closest("[data-action]");
    if (!btn || state.busy) return;
    var action = btn.getAttribute("data-action");
    if (action === "filter") { state.filter = btn.getAttribute("data-filter"); render(); }
    if (action === "count") {
      var key = btn.getAttribute("data-count");
      var dir = Number(btn.getAttribute("data-dir"));
      state[key] = clampCount(Number(state[key]) + dir);
      var label = btn.parentElement && btn.parentElement.querySelector("b");
      if (label) label.textContent = state[key] + " 张";
    }
    if (action === "pane") { state.mobilePane = btn.getAttribute("data-pane"); render(); }
    if (action === "draft") runDraft(false);
    if (action === "fixture") runDraft(true);
    if (action === "mock") runMock(false);
    if (action === "confirm-mock") runMock(true);
    if (action === "img-up") moveImage(btn.getAttribute("data-id"), -1);
    if (action === "img-down") moveImage(btn.getAttribute("data-id"), 1);
    if (action === "img-del") {
      setBusy(true);
      api("/jobs/" + state.job.id + "/images/" + btn.getAttribute("data-id"), { method: "DELETE" }).then(function (data) {
        state.job = data.job;
        render({ fresh: true });
      }).catch(function (err) { state.banner = err.message; render(); }).finally(function () { setBusy(false); });
    }
    if (action === "drop-tag") {
      state.tags.splice(Number(btn.getAttribute("data-index")), 1);
      renderChips();
      updatePreview();
      scheduleSave();
    }
    if (action === "approve") review("approved");
    if (action === "reject") review("rejected");
    if (action === "export") exportJob();
    if (action === "duplicate") duplicate();
    if (action === "copy-payload" && state.job && state.job.postNote) {
      var text = JSON.stringify(state.job.postNote, null, 2);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { toast("发布参数已复制"); }, function () { toast("复制失败，请手动选择"); });
      }
    }
    if (action === "slide") slide(Number(btn.getAttribute("data-dir")));
    if (action === "refresh-quota") {
      setBusy(true);
      api("/quota").then(function (data) { state.quota = data; state.banner = ""; render(); }).catch(function (err) { state.banner = err.message; render(); }).finally(function () { setBusy(false); });
    }
    if (action === "refresh-catalog") {
      setBusy(true);
      api("/catalog/refresh", { method: "POST", json: {} }).then(function (data) { state.catalog = data; state.banner = ""; toast("模型目录已更新"); render(); }).catch(function (err) { state.banner = err.message; render(); }).finally(function () { setBusy(false); });
    }
  });
  document.addEventListener("submit", function (event) {
    if (event.target && event.target.id === "composer") createTask(event);
    if (event.target && event.target.id === "unlock") unlock(event);
  });
  document.addEventListener("input", function (event) {
    var target = event.target;
    if (!target) return;
    if (target.id === "title") { clampField(target, 20); updatePreview(); scheduleSave(); }
    if (target.id === "content") { clampField(target, 1000); updatePreview(); scheduleSave(); }
    if (target.id === "review-note") state.reviewNote = target.value;
    if (target.id === "topic") state.composerTopic = target.value;
    if (target.id === "model-query") { state.modelQuery = target.value; render(); var again = document.getElementById("model-query"); if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); } }
    if (target.hasAttribute("data-prompt-index")) scheduleSave();
  });
  document.addEventListener("change", function (event) {
    if (event.target && event.target.id === "file") uploadFiles(event.target.files);
  });
  document.addEventListener("keydown", function (event) {
    if (event.target && event.target.id === "tag-input" && (event.key === "Enter" || event.key === "," || event.key === "，")) {
      event.preventDefault();
      addTags(event.target.value);
      event.target.value = "";
    }
  });
  document.addEventListener("dragstart", function (event) {
    var handle = event.target.closest(".handle");
    if (!handle) return;
    state.dragId = handle.getAttribute("data-image-id");
  });
  document.addEventListener("dragover", function (event) {
    if (event.target.closest("[data-image-id]")) event.preventDefault();
  });
  document.addEventListener("drop", function (event) {
    var card = event.target.closest("[data-image-id]");
    var drop = event.target.closest("#drop");
    if (drop && event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length) {
      event.preventDefault();
      uploadFiles(event.dataTransfer.files);
      return;
    }
    if (!card || !state.dragId) return;
    event.preventDefault();
    var ids = state.job.images.map(function (image) { return image.id; });
    var from = ids.indexOf(state.dragId);
    var to = ids.indexOf(card.getAttribute("data-image-id"));
    if (from < 0 || to < 0 || from === to) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    state.dragId = "";
    saveOrder(ids);
  });
  var touchX = null;
  document.addEventListener("touchstart", function (event) {
    if (!event.target.closest("#cover")) return;
    touchX = event.changedTouches[0].clientX;
  }, { passive: true });
  document.addEventListener("touchend", function (event) {
    if (touchX == null || !event.target.closest("#cover")) return;
    var dx = event.changedTouches[0].clientX - touchX;
    touchX = null;
    if (dx > 40) slide(-1);
    if (dx < -40) slide(1);
  }, { passive: true });
  function slide(dir) {
    if (!state.job || !state.job.images.length) return;
    var count = state.job.images.length;
    state.previewIndex = (state.previewIndex + dir + count) % count;
    var image = state.job.images[state.previewIndex];
    var img = document.getElementById("pv-img");
    var label = document.getElementById("pv-count");
    if (img) { img.src = image.url; img.alt = image.prompt || "配图"; }
    if (label) label.textContent = (state.previewIndex + 1) + "/" + count;
    var dots = document.getElementById("pv-dots");
    if (dots) Array.prototype.forEach.call(dots.children, function (dot, index) { dot.classList.toggle("on", index === state.previewIndex); });
  }
  function addTags(raw) {
    raw.split(/[,，]/).forEach(function (part) {
      var tag = part.replace(/^[#＃]+/, "").trim();
      if (tag && state.tags.indexOf(tag) < 0) state.tags.push(tag);
    });
    renderChips();
    updatePreview();
    scheduleSave();
  }
  window.addEventListener("hashchange", function () { followRoute(); });
  boot();
})();
</script>
</body>
</html>`;
}
