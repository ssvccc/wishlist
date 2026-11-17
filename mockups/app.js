/* Shared UI for the wishlist mock-ups: icon rail, search panel, ⋯ menus, comments drawer, dialogs,
   add-to-list popover, the budget planner (ported from index.html) and the item card (ported from index.html).
   Everything works on in-memory data from mock-data.js. Changes are kept in sessionStorage for this tab. */

const Mock = {
  onChange: () => {},            // each page sets this to re-render itself after a change
  ALIASES: {
    boots: ["stival", "scarpon", "boot"], fleece: ["pile", "felpa", "fleece"], sunglasses: ["oakley", "occhiali"],
    puffer: ["piumin", "puffer", "pelliccia"], gift: [], knit: ["maglia", "maglione", "pullover"],
  },
  esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); },
  money(n) { return "€" + Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); },
  plural(n, w) { return `${n} ${w}${n === 1 ? "" : "s"}`; },
  user(id) { return MOCK_USERS[id]; },
  list(id) { return MOCK_LISTS.find(l => l.id === id); },
  total(entries) { return entries.reduce((s, e) => s + (e.price > 0 ? e.price : 0), 0); },
  owners(list) { return [list.owner, ...list.collab.map(c => c.user)]; },
  roleOf(list, uid = MOCK_ME) {
    if (list.owner === uid) return "owner";
    const c = list.collab.find(x => x.user === uid);
    return c ? c.role : null;
  },
  canEdit(list) { return ["owner", "editor"].includes(Mock.roleOf(list)); },
  canSee(list) { return Mock.roleOf(list) !== null || list.visibility !== "private"; },
  liked(id) { return MOCK_ME_STATE.liked.includes(id); },
  likeCount(list) { return list.likes + (Mock.liked(list.id) ? 1 : 0); },
  toggleLike(id) {
    const s = MOCK_ME_STATE.liked, k = s.indexOf(id);
    k >= 0 ? s.splice(k, 1) : s.push(id);
    Mock.save();
    return k < 0;
  },
  follows(id) { return MOCK_ME_STATE.follows.includes(id); },
  toggleFollow(id) {
    const s = MOCK_ME_STATE.follows, k = s.indexOf(id);
    k >= 0 ? s.splice(k, 1) : s.push(id);
    Mock.save();
    return k < 0;
  },
  // Category lookup: unknown ids fall back to the list's fixed "Other" (always last)
  catOf(list, id) { return list.categories.find(c => c.id === id) || list.categories[list.categories.length - 1]; },
  storeOf(e) { return e.brand && e.brand !== e.store ? `${e.brand} · ${e.store}` : e.store; },
  initial(e) { return Mock.esc((e.store || e.title || "?").trim()[0]?.toUpperCase() || "?"); },

  icon(name, size = 18, filled = false) {
    const p = {
      home: '<path d="M3 11l9-8 9 8M5 10v10h14V10"/>',
      search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
      list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
      heart: '<path d="M12 21s-7-4.4-9.3-9A5.2 5.2 0 0 1 12 6.3 5.2 5.2 0 0 1 21.3 12c-2.3 4.6-9.3 9-9.3 9z"/>',
      users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
      cart: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>',
      wallet: '<rect x="2" y="6" width="20" height="14" rx="2"/><path d="M16 13h2M2 10h20"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>',
      more: '<path d="M3 6h18M3 12h18M3 18h18"/>',
      comment: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
      share: '<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13"/>',
      lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
      check: '<path d="M20 6 9 17l-5-5"/>',
      x: '<path d="M18 6 6 18M6 6l12 12"/>',
      up: '<path d="M18 15l-6-6-6 6"/>',
      down: '<path d="M6 9l6 6 6-6"/>',
    }[name] || "";
    return `<svg class="ic" viewBox="0 0 24 24" width="${size}" height="${size}" fill="${filled ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  },
  avatar(user, size = "") {
    return `<span class="av ${size}" style="background:${user.color};color:${user.ink || "#fff"}" title="${Mock.esc(user.name)}">${user.initials}</span>`;
  },
  stack(ids) { return `<span class="stack">${ids.map(id => Mock.avatar(Mock.user(id), "sm")).join("")}</span>`; },
  imgFail(img) {
    img.replaceWith(Object.assign(document.createElement("div"), { className: "ph", textContent: img.dataset.initial }));
  },
  thumbImg(e, cls = "") {
    if (!e.image) return `<div class="ph">${Mock.initial(e)}</div>`;
    return `<img src="${Mock.esc(e.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-initial="${Mock.initial(e)}" onerror="Mock.imgFail(this)" ${cls ? `class="${cls}"` : ""}>`;
  },
  collage(list, cls = "") {
    const es = list.entries.slice(0, 4);
    const tiles = [0, 1, 2, 3].map(k => es[k] ? `<div class="tile">${Mock.thumbImg(es[k])}</div>` : `<div class="tile empty"></div>`);
    return `<div class="collage ${cls}">${tiles.join("")}</div>`;
  },
  toast(msg) {
    let t = document.getElementById("toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(Mock._toastTimer);
    Mock._toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
  },

  /* ---------- saving (sessionStorage, this tab only) */
  save() {
    try {
      sessionStorage.setItem("wishlist-mockup-state", JSON.stringify({
        lists: MOCK_LISTS, liked: MOCK_ME_STATE.liked, follows: MOCK_ME_STATE.follows, budget: MOCK_ME_STATE.budget,
      }));
    } catch (_) { /* storage blocked: the mock-up still works, just without carry-over */ }
  },

  /* ---------- list and entry changes */
  createList(title, visibility = "private") {
    const l = {
      id: "new-" + Date.now(), title: (title || "").trim() || "New list", owner: MOCK_ME, collab: [], visibility,
      desc: "", likes: 0, updated: "Just now", budget: null, comments: [], entries: [],
      categories: [{ id: "other", emoji: "", label: "Everything else", color: "var(--c-other)", share: 0, inPlan: true }],
    };
    MOCK_LISTS.push(l);
    Mock.save();
    return l;
  },
  // Adds a copy of an entry to another list. Returns false when the item is already there.
  copyEntry(target, e) {
    if (target.entries.some(x => x.item === e.item)) return false;
    const rank = target.entries.reduce((m, x) => Math.max(m, x.rank), -1) + 1;
    const hasCat = target.categories.some(c => c.id === e.cat);
    target.entries.push({ ...e, id: `${target.id}:${e.item}`, cat: hasCat ? e.cat : "other", rank,
      in_cart: false, bought: false, plan_skip: false, reserved: false, added: Math.floor(Date.now() / 1000) });
    Mock.save();
    return true;
  },
  // A pasted link becomes an entry with a title read from the URL (no product lookup in a mock-up)
  entryFromUrl(url, list) {
    let host = "", title = url;
    try {
      const u = new URL(url);
      host = u.hostname.replace(/^www\d*\./, "");
      const last = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() || host);
      title = last.replace(/\.(html?|php|aspx?)$/i, "").replace(/[-_]+/g, " ").trim() || host;
    } catch (_) { /* keep the raw text */ }
    const store = host ? host.split(".")[0].replace(/^./, c => c.toUpperCase()) : "Link";
    const rank = list.entries.reduce((m, x) => Math.max(m, x.rank), -1) + 1;
    return {
      id: `${list.id}:${url}`, item: url, title: title[0] ? title[0].toUpperCase() + title.slice(1) : title,
      url, image: "", price: null, currency: "EUR", store, brand: store, group: "", notes: "", cat: "other", rank,
      added: Math.floor(Date.now() / 1000), in_cart: false, bought: false, plan_skip: false, reserved: false,
    };
  },

  /* ---------- floats: popovers and menus close on outside click or Esc */
  closeFloats() { document.querySelectorAll(".float").forEach(el => el.remove()); },
  placeAt(el, anchor, dx = 0) {
    const r = anchor.getBoundingClientRect();
    el.style.left = Math.max(12, Math.min(r.left + scrollX + dx, scrollX + innerWidth - el.offsetWidth - 12)) + "px";
    el.style.top = (r.bottom + scrollY + 6) + "px";
  },

  /* ---------- rail (left icon bar) */
  rail(active) {
    const items = [
      ["home", "Home", "home.html", "home"],
      ["search", "Search", null, "search"],
      ["lists", "Lists", "profile.html?tab=lists", "list"],
      ["liked", "Favs", "profile.html?tab=liked", "heart"],
      ["shared", "Shared with me", "profile.html?tab=shared", "users"],
      ["cart", "Cart", "cart.html", "cart"],
      ["wallet", "Wallet", "wallet.html", "wallet"],
      ["create", "+ Create", null, "plus"],
    ];
    const rail = document.createElement("nav");
    rail.className = "rail";
    rail.id = "rail";
    rail.setAttribute("aria-label", "Main navigation");
    rail.innerHTML = `<a class="rmark" href="home.html" aria-label="Home"></a>
      ${items.map(([key, label, href, ic]) => {
        const cls = `ritem ${active === key ? "on" : ""}`;
        const inner = `<span class="ri">${Mock.icon(ic, 22)}</span><span class="rl">${label}</span>`;
        return href
          ? `<a class="${cls}" href="${href}" data-rail="${key}">${inner}</a>`
          : `<button class="${cls}" type="button" data-rail="${key}">${inner}</button>`;
      }).join("")}
      <div class="rspacer"></div>
      <div class="rbottom">
        <button class="ritem" type="button" data-rail="notif">${Mock.icon("bell", 22)}<span class="rl">Notifications</span></button>
        <a class="ritem" href="profile.html" data-rail="profile"><span class="ri">${Mock.avatar(Mock.user(MOCK_ME), "sm")}</span><span class="rl">Profile</span></a>
        <button class="ritem" type="button" data-rail="more">${Mock.icon("more", 22)}<span class="rl">More</span></button>
      </div>`;
    document.body.prepend(rail);

    const panel = document.createElement("aside");
    panel.className = "spanel";
    panel.id = "spanel";
    panel.setAttribute("aria-label", "Search");
    panel.innerHTML = `<h2>Search</h2>
      <label class="sbox">${Mock.icon("search", 18)}<input id="sq" type="search" placeholder="Lists, items or people" autocomplete="off"></label>
      <div class="sresults" id="sres"></div>`;
    document.body.appendChild(panel);
    const scrim = document.createElement("div");
    scrim.className = "scrim";
    scrim.id = "scrim";
    scrim.hidden = true;
    document.body.appendChild(scrim);

    document.getElementById("sq").addEventListener("input", () => Mock.renderSearch());
    scrim.addEventListener("click", () => Mock.closeSearch());
    rail.addEventListener("click", e => {
      const b = e.target.closest("[data-rail]");
      if (!b) return;
      const k = b.dataset.rail;
      if (k === "more") { rail.classList.toggle("open"); return; }
      if (k === "search") { panel.classList.contains("open") ? Mock.closeSearch() : Mock.openSearch(); return; }
      if (k === "create") { Mock.createMenu(b); return; }
      if (k === "notif") { Mock.toast("No new notifications"); return; }
    });
  },
  openSearch() {
    document.getElementById("rail").classList.remove("open");
    document.getElementById("spanel").classList.add("open");
    document.getElementById("scrim").hidden = false;
    const q = document.getElementById("sq");
    setTimeout(() => q.focus(), 50);
    Mock.renderSearch();
  },
  closeSearch() {
    document.getElementById("spanel").classList.remove("open");
    document.getElementById("scrim").hidden = true;
  },
  renderSearch() {
    const q = document.getElementById("sq").value.trim().toLowerCase();
    const out = document.getElementById("sres");
    if (!q) { out.innerHTML = `<div class="sempty">Type to search lists, items and people.</div>`; return; }
    const lists = MOCK_LISTS.filter(l => Mock.canSee(l) &&
      [l.title, l.desc, Mock.user(l.owner).name].join(" ").toLowerCase().includes(q));
    // product titles are mostly Italian, so common English words also match their Italian names
    const terms = [q, ...(Mock.ALIASES[q] || [])];
    const items = Object.values(MOCK_CATALOG).filter(i => {
      const text = [i.title, i.store, i.brand].join(" ").toLowerCase();
      return terms.some(t => text.includes(t));
    }).slice(0, 8);
    const people = Object.keys(MOCK_USERS).filter(id => {
      const u = Mock.user(id);
      return [u.name, u.handle, u.bio].join(" ").toLowerCase().includes(q);
    });
    const firstListWith = itemId => MOCK_LISTS.find(l => Mock.canSee(l) && l.entries.some(e => e.item === itemId));
    let html = "";
    if (lists.length) html += `<h4>Lists</h4>` + lists.map(l => `
      <a class="srow" href="list.html?id=${l.id}">
        <div class="sth">${Mock.collage(l)}</div>
        <div class="sbody"><b>${Mock.esc(l.title)}</b><small>by ${Mock.esc(Mock.user(l.owner).name)} · ${Mock.plural(l.entries.length, "item")}</small></div>
      </a>`).join("");
    if (items.length) html += `<h4>Items</h4>` + items.map(i => {
      const target = firstListWith(i.id);
      return `<a class="srow" href="${target ? `list.html?id=${target.id}` : i.url}" ${target ? "" : 'target="_blank" rel="noopener"'}>
        <div class="sth">${Mock.thumbImg(i)}</div>
        <div class="sbody"><b>${Mock.esc(i.title)}</b><small>${Mock.esc(Mock.storeOf(i))} · ${Mock.money(i.price)}</small></div>
      </a>`;
    }).join("");
    if (people.length) html += `<h4>People</h4>` + people.map(id => {
      const u = Mock.user(id);
      return `<a class="srow" href="profile.html?user=${id}">${Mock.avatar(u, "md")}
        <div class="sbody"><b>${Mock.esc(u.name)}</b><small>@${Mock.esc(u.handle)}</small></div></a>`;
    }).join("");
    out.innerHTML = html || `<div class="sempty">Nothing matches “${Mock.esc(q)}”.</div>`;
  },

  /* ---------- "+ Create" menu, with New list and Add item */
  createMenu(anchor) {
    Mock.closeFloats();
    const m = document.createElement("div");
    m.className = "menu float";
    m.innerHTML = `<button type="button" data-do="newlist">${Mock.icon("list", 18)}New list</button>
      <button type="button" data-do="additem">${Mock.icon("plus", 18)}Add item</button>`;
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect();
    m.style.left = (r.right + scrollX + 8) + "px";
    m.style.top = (r.top + scrollY) + "px";
    Mock._fresh = true;
    m.addEventListener("click", e => {
      const b = e.target.closest("[data-do]");
      if (!b) return;
      m.remove();
      b.dataset.do === "newlist" ? Mock.newListDialog() : Mock.addItemDialog();
    });
  },
  newListDialog() {
    Mock.dialog("New list", `
      <label>Name<input name="title" maxlength="40" placeholder="e.g. Summer gear" required></label>
      <label>Visibility<select name="visibility">
        <option value="private">Private</option><option value="friends">Friends</option><option value="public">Public</option>
      </select></label>`, d => {
      const title = d.querySelector('[name="title"]').value.trim();
      if (!title) return;
      const l = Mock.createList(title, d.querySelector('[name="visibility"]').value);
      Mock.toast(`Created ${l.title}`);
      location.href = `list.html?id=${l.id}`;
    });
  },
  addItemDialog() {
    const mine = MOCK_LISTS.filter(l => Mock.canEdit(l));
    Mock.dialog("Add item", `
      <label>Product link<input name="url" placeholder="https://…" required></label>
      <label>Add to list<select name="list">${mine.map(l => `<option value="${l.id}">${Mock.esc(l.title)}</option>`).join("")}</select></label>
      <p class="hint">The title is read from the link. No product lookup happens in this mock-up.</p>`, d => {
      const url = d.querySelector('[name="url"]').value.trim();
      const list = Mock.list(d.querySelector('[name="list"]').value);
      if (!/^https?:\/\//i.test(url) || !list) { Mock.toast("That doesn't look like a link."); return; }
      list.entries.push(Mock.entryFromUrl(url, list));
      Mock.save();
      Mock.toast(`Added to ${list.title}`);
      Mock.onChange();
    });
  },

  /* ---------- dialogs (native <dialog>, Esc closes) */
  dialog(title, bodyHTML, onSave, opts = {}) {
    const d = document.createElement("dialog");
    d.innerHTML = `<form method="dialog" class="dform">
        <h2>${Mock.esc(title)}</h2>${bodyHTML}
        <div class="btns"><button type="button" data-cancel>Cancel</button>
        <button class="primary" value="ok" style="padding:8px 18px">${opts.saveLabel || "Save"}</button></div>
      </form>`;
    document.body.appendChild(d);
    d.addEventListener("close", () => {
      if (d.returnValue === "ok" && onSave) onSave(d);
      d.remove();
    });
    d.querySelector("[data-cancel]").addEventListener("click", () => d.close("cancel"));
    d.showModal();
    return d;
  },
  collabDialog(list) {
    const rows = Mock.owners(list).map(id => {
      const u = Mock.user(id), role = Mock.roleOf(list, id) || "viewer";
      return `<div class="collab">${Mock.avatar(u, "md")}<div class="cn"><b>${Mock.esc(u.name)}</b>
        <small>@${Mock.esc(u.handle)}</small></div><span class="role">${role === "owner" ? "Owner" : role === "editor" ? "Editor" : "Viewer"}</span></div>`;
    }).join("");
    const d = Mock.dialog("Collaborators", `${rows}
      <p class="hint">Editors can change items, categories and the budget. Viewers can only read the list.</p>`, null, { saveLabel: "Done" });
    return d;
  },
  renameDialog(list) {
    Mock.dialog("Rename list", `<label>Name<input name="title" maxlength="40" value="${Mock.esc(list.title)}"></label>`, d => {
      const t = d.querySelector('[name="title"]').value.trim();
      if (!t) return;
      list.title = t; Mock.save(); Mock.onChange();
    });
  },

  /* ---------- ⋯ menu for a wishlist (same on Home and on the list page) */
  listMenu(anchor, list) {
    Mock.closeFloats();
    const m = document.createElement("div");
    m.className = "menu float";
    const liked = Mock.liked(list.id);
    const editable = Mock.canEdit(list);
    const vis = ["public", "friends", "private"];
    m.innerHTML = `
      <button type="button" data-do="like">${Mock.icon("heart", 18, liked)}Like<span class="mc">${Mock.likeCount(list)}</span></button>
      <button type="button" data-do="comments">${Mock.icon("comment", 18)}Comments<span class="mc">${list.comments.length}</span></button>
      <button type="button" data-do="share">${Mock.icon("share", 18)}Share</button>
      <button type="button" data-do="collab">${Mock.icon("users", 18)}Collaborators<span class="mc">${Mock.owners(list).length}</span></button>
      ${editable ? `<hr><div class="mlabel">Visibility</div>${vis.map(v => `<button type="button" data-do="vis" data-v="${v}">${Mock.icon(v === "private" ? "lock" : "users", 16)}${Mock.visLabel(v)}<span class="mc">${list.visibility === v ? "✓" : ""}</span></button>`).join("")}
        <hr>
        <button type="button" data-do="rename">Rename</button>
        <button type="button" data-do="cats">Edit categories</button>` : ""}`;
    document.body.appendChild(m);
    Mock.placeAt(m, anchor);
    Mock._fresh = true;
    m.addEventListener("click", e => {
      const b = e.target.closest("[data-do]");
      if (!b) return;
      const act = b.dataset.do;
      if (act === "like") { Mock.toggleLike(list.id); m.remove(); Mock.onChange(); return; }
      if (act === "comments") { m.remove(); Mock.openComments(list); return; }
      if (act === "share") { m.remove(); Mock.toast("Link copied"); try { navigator.clipboard?.writeText(`list.html?id=${list.id}`).catch(() => {}); } catch (_) {} return; }
      if (act === "collab") { m.remove(); Mock.collabDialog(list); return; }
      if (act === "vis") { list.visibility = b.dataset.v; Mock.save(); m.remove(); Mock.toast(`Visibility: ${Mock.visLabel(list.visibility)}`); Mock.onChange(); return; }
      if (act === "rename") { m.remove(); Mock.renameDialog(list); return; }
      if (act === "cats") { m.remove(); Mock.categoryDialog(list); }
    });
  },
  visLabel(v) { return { public: "Public", friends: "Friends", private: "Private" }[v]; },

  /* ---------- donut and legend, same look as index.html's budget panel. parts: [{ label, color, amount }] */
  donut(parts, centerAmount, sub) {
    const R = 70, C = 2 * Math.PI * R, S = 26;
    const total = parts.reduce((s, p) => s + p.amount, 0);
    let off = 0, arcs = "";
    if (total > 0) {
      parts.filter(p => p.amount > 0).forEach(p => {
        const len = C * p.amount / total;
        arcs += `<circle cx="100" cy="100" r="${R}" fill="none" style="stroke:${p.color}" stroke-width="${S}"
          stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 100 100)">
          <title>${Mock.esc(p.label)}: ${Mock.money(p.amount)}</title></circle>`;
        off += len;
      });
    } else {
      arcs = `<circle cx="100" cy="100" r="${R}" fill="none" style="stroke:var(--line)" stroke-width="${S}"></circle>`;
    }
    return `<svg class="donut-svg" viewBox="0 0 200 200" role="img" aria-label="Spend breakdown">${arcs}
      <text x="100" y="98" text-anchor="middle" class="dc-amt">${Mock.money(centerAmount)}</text>
      <text x="100" y="118" text-anchor="middle" class="dc-sub">${sub}</text></svg>`;
  },
  legend(parts) {
    const rows = parts.filter(p => p.amount > 0).map(p =>
      `<li><span class="dot" style="background:${p.color}"></span>${Mock.esc(p.label)} <b>${Mock.money(p.amount)}</b></li>`);
    return rows.length ? rows.join("") : `<li style="color:var(--muted)">Nothing in the cart yet</li>`;
  },

  /* ---------- comments drawer */
  openComments(list) {
    document.querySelectorAll(".drawer, .scrimmed").forEach(el => el.remove());
    const scrim = document.createElement("div");
    scrim.className = "scrimmed";
    const d = document.createElement("aside");
    d.className = "drawer";
    d.setAttribute("aria-label", "Comments");
    const render = () => {
      d.innerHTML = `<div class="dh"><h2>Comments · ${list.comments.length}</h2><button class="kebab" data-x aria-label="Close">×</button></div>
        <div class="dbody">${list.comments.length ? list.comments.map(c => {
          const u = Mock.user(c.user);
          return `<div class="cmt">${Mock.avatar(u, "md")}<div class="cb"><b>${Mock.esc(u.name)}</b><small>${c.ago}</small><p>${Mock.esc(c.text)}</p></div></div>`;
        }).join("") : `<p class="store" style="text-transform:none;letter-spacing:0;font-size:14px">No comments yet.</p>`}</div>
        <form class="dfoot" id="cf"><textarea id="ct" maxlength="280" placeholder="Write a comment…"></textarea>
          <button class="primary" type="submit" style="align-self:flex-end;padding:7px 18px" disabled id="cp">Post</button></form>`;
      d.querySelector("[data-x]").addEventListener("click", close);
      const ta = d.querySelector("#ct"), btn = d.querySelector("#cp");
      ta.addEventListener("input", () => { btn.disabled = !ta.value.trim(); });
      d.querySelector("#cf").addEventListener("submit", e => {
        e.preventDefault();
        const text = ta.value.trim();
        if (!text) return;
        list.comments.push({ user: MOCK_ME, text, ago: "Just now" });
        Mock.save();
        render();
        Mock.onChange();
      });
    };
    const close = () => { d.classList.remove("open"); scrim.remove(); setTimeout(() => d.remove(), 200); };
    scrim.addEventListener("click", close);
    d.dataset.close = "1";
    Mock._closeDrawer = close;
    document.body.append(scrim, d);
    render();
    requestAnimationFrame(() => d.classList.add("open"));
  },

  /* ---------- category editor (per wishlist) */
  categoryDialog(list) {
    const COLORS = ["var(--c-die)", "var(--c-need)", "var(--c-noturg)", "var(--c-other)", "var(--ok)", "var(--accent)", "var(--c-left)"];
    let draft = list.categories.map(c => ({ ...c }));
    const rowsHTML = () => draft.map((c, i) => {
      const isOther = c.id === "other";
      return `<div class="catrow ${isOther ? "fixed" : ""}" data-i="${i}">
        <div class="mv">${isOther ? "" : `<button type="button" data-mv="-1" aria-label="Move up">↑</button><button type="button" data-mv="1" aria-label="Move down">↓</button>`}</div>
        <input class="emo" type="text" maxlength="4" value="${Mock.esc(c.emoji)}" data-f="emoji" aria-label="Emoji" placeholder="🙂">
        <input type="text" maxlength="40" value="${Mock.esc(c.label)}" data-f="label" aria-label="Name">
        <label class="plan" style="margin:0"><input type="number" class="sh" min="0" max="100" value="${c.share}" data-f="share" aria-label="Budget share %" style="width:62px">%</label>
        ${isOther ? `<span class="muted" style="font-size:12px">fixed</span>` : `<button type="button" class="x" data-del aria-label="Delete">✕</button>`}
        <div class="sw">${COLORS.map(col => `<button type="button" data-col="${col}" class="${c.color === col ? "on" : ""}" style="background:${col}" aria-label="Color"></button>`).join("")}</div>
        <label class="plan" style="margin:0"><input type="checkbox" data-f="inPlan" ${c.inPlan ? "checked" : ""}> include in plan</label>
      </div>`;
    }).join("");
    const d = Mock.dialog("Edit categories", `<p class="hint" style="margin:0 0 6px">Priority order: the first category is planned first. “Everything else” always stays last and can't be deleted.</p>
      <div class="catlist" id="catlist">${rowsHTML()}</div>
      <button type="button" id="addCat" style="margin-top:8px">+ Add category</button>`, () => {
      list.categories = draft.map(c => ({ ...c, share: Math.max(0, Math.min(100, Number(c.share) || 0)) }));
      // items in categories that no longer exist move to Other
      const ids = new Set(list.categories.map(c => c.id));
      list.entries.forEach(e => { if (!ids.has(e.cat)) e.cat = "other"; });
      Mock.save();
      Mock.toast("Categories saved");
      Mock.onChange();
    }, { saveLabel: "Save categories" });
    d.querySelector("#catlist").addEventListener("input", e => {
      const row = e.target.closest(".catrow");
      if (!row) return;
      const c = draft[+row.dataset.i], f = e.target.dataset.f;
      if (!f) return;
      c[f] = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    });
    d.querySelector("#catlist").addEventListener("click", e => {
      const row = e.target.closest(".catrow");
      if (!row) return;
      const i = +row.dataset.i;
      if (e.target.dataset.col) { draft[i].color = e.target.dataset.col; redraw(); return; }
      if (e.target.dataset.mv) {
        const j = i + Number(e.target.dataset.mv);
        if (j < 0 || j >= draft.length - 1 || draft[j].id === "other") return;
        [draft[i], draft[j]] = [draft[j], draft[i]]; redraw(); return;
      }
      if ("del" in e.target.dataset) {
        const c = draft[i];
        if (!confirm(`Delete “${c.label}”? Its items move to Everything else when you save.`)) return;
        draft.splice(i, 1); redraw();
      }
    });
    d.querySelector("#addCat").addEventListener("click", () => {
      const id = "c" + Date.now().toString(36);
      draft.splice(draft.length - 1, 0, { id, emoji: "🏷️", label: "New category", color: COLORS[draft.length % COLORS.length], share: 0, inPlan: true });
      redraw();
    });
    function redraw() { d.querySelector("#catlist").innerHTML = rowsHTML(); }
    d.addEventListener("close", () => {}, { once: true });
  },

  /* ---------- add to my list (read-only lists) */
  addPopover(anchor, entry) {
    Mock.closeFloats();
    const mine = MOCK_LISTS.filter(l => Mock.canEdit(l));
    const p = document.createElement("div");
    p.className = "pop float";
    const row = l => {
      const has = l.entries.some(x => x.item === entry.item);
      return `<button class="prow ${has ? "in" : ""}" data-pick="${l.id}" type="button">
        <span class="pn">${Mock.esc(l.title)}<small>${Mock.plural(l.entries.length, "item")} · ${Mock.visLabel(l.visibility)}</small></span>
        <span class="tick">${Mock.icon("check", 14)}</span></button>`;
    };
    p.innerHTML = `<h4>Add to a list</h4>
      <div>${mine.map(row).join("") || `<p class="hint">You don't have a list yet.</p>`}</div>
      <div class="newlist"><input id="pnew" placeholder="New list name" maxlength="40" aria-label="New list name"><button type="button" class="primary" data-pnew style="padding:0 12px">Create</button></div>`;
    document.body.appendChild(p);
    Mock.placeAt(p, anchor);
    Mock._fresh = true;
    p.addEventListener("click", e => {
      const pick = e.target.closest("[data-pick]");
      if (pick) {
        const l = Mock.list(pick.dataset.pick);
        if (Mock.copyEntry(l, entry)) Mock.toast(`Added to ${l.title}`);
        else Mock.toast(`Already in ${l.title}`);
        pick.classList.add("in");
        return;
      }
      if (e.target.closest("[data-pnew]")) {
        const name = p.querySelector("#pnew").value;
        const l = Mock.createList(name || "New list", "private");
        Mock.copyEntry(l, entry);
        Mock.closeFloats();
        Mock.toast(`Created ${l.title} and added the item`);
      }
    });
  },
};

// Restore what the user changed earlier in this tab (lists, likes, follows, budgets)
try {
  const s = JSON.parse(sessionStorage.getItem("wishlist-mockup-state") || "null");
  if (s) {
    MOCK_LISTS.splice(0, MOCK_LISTS.length, ...s.lists);
    MOCK_ME_STATE.liked = s.liked;
    MOCK_ME_STATE.follows = s.follows;
    if (s.budget !== undefined) MOCK_ME_STATE.budget = s.budget;
  }
} catch (_) { /* unreadable saved state: start from the seed data */ }

// Clicks outside a menu or popover close it; ⋯ buttons open the list menu
document.addEventListener("click", e => {
  const kebab = e.target.closest("[data-kebab]");
  if (kebab) {
    Mock.listMenu(kebab, Mock.list(kebab.dataset.kebab));
    Mock._fresh = false;
    return;
  }
  // a menu opened by this same click must survive the click reaching the document
  if (Mock._fresh) { Mock._fresh = false; return; }
  if (!e.target.closest(".float")) Mock.closeFloats();
});
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  Mock.closeFloats();
  if (document.getElementById("spanel")?.classList.contains("open")) Mock.closeSearch();
  if (Mock._closeDrawer) Mock._closeDrawer();
});

/* ---------- budget planner (ported from index.html's planItems, generalized to per-list categories) */
Mock.plan = function (all, budgetValue, cats) {
  const wanted = all.filter(i => !i.bought);
  const byId = {};
  const totals = {};
  cats.forEach(c => totals[c.id] = { count: 0, total: 0, inCart: 0, pct: 0, share: 0, fits: 0, leftover: 0, planned: 0 });
  const catOf = i => totals[i.cat] ? i.cat : "other";
  const planIds = cats.filter(c => c.inPlan).map(c => c.id);          // priority order
  const pct = id => { const c = cats.find(x => x.id === id); return c && c.inPlan ? Math.max(0, Number(c.share) || 0) : 0; };
  cats.forEach(c => totals[c.id].pct = pct(c.id));
  const sumPct = planIds.reduce((s, id) => s + pct(id), 0);
  const priceOf = i => (i.price > 0 ? i.price : null);
  const grp = i => (i.group || "").toLowerCase();
  const byOrder = (a, b) => (a.rank - b.rank) || ((b.added || 0) - (a.added || 0));
  const fallback = i => {
    const c = cats.find(x => x.id === catOf(i));
    return !c.inPlan ? "excluded" : i.plan_skip ? "skipped" : priceOf(i) == null ? "noprice" : "nobudget";
  };

  let cartTotal = 0;
  const usedGroups = new Set();
  wanted.filter(i => i.in_cart).forEach(i => {
    byId[i.id] = { status: "cart" };
    cartTotal += priceOf(i) ?? 0;
    if (grp(i)) usedGroups.add(grp(i));
  });
  wanted.forEach(i => {
    const c = totals[catOf(i)], p = priceOf(i) ?? 0;
    c.count++; c.total += p;
    if (i.in_cart) c.inCart += p;
  });
  // "must have" total: the first category in priority order, not in the cart yet
  const firstId = cats[0] ? cats[0].id : null;
  const mustTotal = cartTotal + wanted
    .filter(i => firstId && catOf(i) === firstId && !i.in_cart)
    .reduce((s, i) => s + (priceOf(i) ?? 0), 0);

  if (budgetValue == null) {
    wanted.forEach(i => { if (!byId[i.id]) byId[i.id] = { status: fallback(i) }; });
    return { byId, cartTotal, categoryTotals: totals, sumPct, unassigned: 0, plannedTotal: 0, leftoverTotal: 0, left: null, mustTotal, pool: null, firstId };
  }

  const pool = Math.max(0, budgetValue - cartTotal);
  const reservedBy = {};
  let reserved = 0;
  planIds.forEach(id => {
    reservedBy[id] = Math.max(0, Math.min(pool * pct(id) / 100, pool - reserved));
    reserved += reservedBy[id];
    totals[id].share = reservedBy[id];
  });
  const unassigned = pool - reserved;

  let spent = 0;
  planIds.forEach(id => {
    let rem = reservedBy[id];
    wanted.filter(i => !i.in_cart && !i.plan_skip && catOf(i) === id).sort(byOrder).forEach(i => {
      const p = priceOf(i), g = grp(i);
      if (p == null) byId[i.id] = { status: "noprice" };
      else if (g && usedGroups.has(g)) byId[i.id] = { status: "group" };
      else if (p <= rem + 0.005) {
        rem -= p; spent += p;
        totals[id].fits += p;
        if (g) usedGroups.add(g);
        byId[i.id] = { status: "fits" };
      } else byId[i.id] = { status: "nofit", short: p - rem };
    });
  });

  const leftoverStart = pool - spent;
  let leftoverRem = leftoverStart;
  wanted
    .filter(i => !i.in_cart && !i.plan_skip && planIds.includes(catOf(i)) && byId[i.id] && byId[i.id].status === "nofit")
    .sort((a, b) => priceOf(a) - priceOf(b))
    .forEach(i => {
      const p = priceOf(i), g = grp(i);
      if (g && usedGroups.has(g)) { byId[i.id] = { status: "group" }; return; }
      if (p <= leftoverRem + 0.005) {
        leftoverRem -= p;
        if (g) usedGroups.add(g);
        totals[catOf(i)].leftover += p;
        byId[i.id] = { status: "leftover" };
      } else byId[i.id] = { status: "nofit", short: p - leftoverRem };
    });

  wanted.forEach(i => { if (!byId[i.id]) byId[i.id] = { status: fallback(i) }; });

  let plannedTotal = 0;
  planIds.forEach(id => {
    const c = totals[id];
    c.planned = c.fits + c.leftover;
    plannedTotal += c.planned;
  });
  return {
    byId, cartTotal, categoryTotals: totals, sumPct, pool, unassigned, mustTotal, plannedTotal,
    leftoverTotal: leftoverStart - leftoverRem, left: budgetValue - cartTotal - plannedTotal, firstId,
  };
};

/* ---------- item card (ported from index.html's card(), with category pills and read-only mode) */
Mock.tagFor = s => {
  const short = s && s.short ? Mock.money(s.short) : "";
  return ({
    cart: `<div class="ptag cart">🛒 In cart</div>`,
    fits: `<div class="ptag ok">✓ Fits</div>`,
    nofit: `<div class="ptag no">Doesn't fit (${short} short)</div>`,
    noprice: `<div class="ptag no">No price — not counted</div>`,
    group: `<div class="ptag no">Skipped — same group already chosen</div>`,
    nobudget: `<div class="ptag no">Set a budget to see if it fits</div>`,
    leftover: `<div class="ptag ok">✓ Fits (leftover)</div>`,
    excluded: `<div class="ptag dim">Not planned — not in the plan</div>`,
    skipped: `<div class="ptag dim">Not wanted — planner looks at others</div>`,
  })[s && s.status] || "";
};

// ctx: { readonly, plan, arrows, drag, noActions }
Mock.card = function (e, list, ctx = {}) {
  const cat = Mock.catOf(list, e.cat);
  const priceHtml = e.price > 0
    ? `<div class="price">${Mock.money(e.price)}</div>`
    : `<div class="price none">No price found</div>`;
  let pill;
  if (ctx.readonly) {
    pill = cat.emoji ? `<span class="pill ro" style="--cc:${cat.color}">${cat.emoji}</span>` : "";
  } else if (cat.emoji) {
    pill = `<button class="pill" data-act="cat" style="--cc:${cat.color}" title="Change category">${cat.emoji}</button>`;
  } else {
    const picks = list.categories.filter(c => c.id !== "other" && c.emoji);
    pill = `<div class="pillwrap"><button class="pill add" type="button" title="Hover to pick a category">+</button>
      <div class="pick-emojis">${picks.map(c => `<button type="button" data-pick="${c.id}" title="${Mock.esc(c.label)}">${c.emoji}</button>`).join("")}</div></div>`;
  }
  const s = ctx.plan;
  const faded = s && ["nofit", "noprice", "group", "excluded", "skipped"].includes(s.status) ? "faded" : "";
  const arrows = ctx.arrows ? `<button class="mini" data-act="up" title="Move up">↑</button><button class="mini" data-act="down" title="Move down">↓</button>` : "";
  const skip = ctx.drag ? `<button data-act="skip">${e.plan_skip ? "↺ Put back" : "✕ Not wanted"}</button>` : "";
  let actions = "";
  if (ctx.noActions) actions = "";
  else if (ctx.readonly) actions = `<button class="addto" type="button" data-addto="${e.id}">+ Add to my list</button>`;
  else actions = `<div class="actions">${arrows}
      <button data-act="bought">${e.bought ? "Unmark" : "Got it"}</button>
      <button data-act="cart">${e.in_cart ? "🛒 Remove" : "🛒 Add"}</button>
      ${skip}<button data-act="edit">Edit</button><button data-act="delete" title="Remove">✕</button></div>`;
  const reserved = e.reserved ? `<span class="reserved">Reserved by someone</span>` : "";
  return `<article class="card ${e.bought ? "bought" : ""} ${faded}" data-id="${e.id}" ${ctx.drag ? 'draggable="true"' : ""}>
    <div class="thumb">${Mock.thumbImg(e)}${e.bought ? '<span class="badge">BOUGHT</span>' : ""}${pill}</div>
    <div class="body">
      <div class="store">${Mock.esc(Mock.storeOf(e))}</div>
      <a class="title" href="${Mock.esc(e.url)}" target="_blank" rel="noopener noreferrer">${Mock.esc(e.title)}</a>
      ${priceHtml}
      ${s ? Mock.tagFor(s) : ""}
      ${reserved}
      ${e.notes ? `<div class="notes">${Mock.esc(e.notes)}</div>` : ""}
      ${actions}
    </div>
  </article>`;
};
