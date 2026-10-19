/*
 * Floor plan minimap of the exported tours (Web 3D and standalone cubemap).
 * Plain ES5-style script with no dependencies: it is inlined in both viewers
 * and must work from file://. It defines one global, createFloorplanMinimap.
 *
 * Angles on the plan: degrees, 0 = up, clockwise. A scene's heading is the
 * plan direction of panorama yaw 0, so the cone points at heading + yaw.
 * The editor has the same math in src/lib/floorplan-geometry.ts: keep in sync.
 *
 * No absolute URL anywhere, not even the SVG namespace (the standalone export
 * test forbids them): the namespace is read from an <svg> parsed from markup.
 */
function createFloorplanMinimap(parent, options) {
  "use strict";

  var floorplans = options.floorplans || [];
  var scenes = options.scenes || [];
  var labels = options.labels || {};
  if (!floorplans.length) return null;

  function normalizeDeg(deg) {
    var d = deg % 360;
    return d < 0 ? d + 360 : d;
  }
  function polar(cx, cy, r, deg) {
    var rad = (deg * Math.PI) / 180;
    return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)];
  }
  function conePath(cx, cy, r, dirDeg, fovDeg) {
    var half = Math.min(Math.max(fovDeg, 1), 359) / 2;
    var p1 = polar(cx, cy, r, dirDeg - half);
    var p2 = polar(cx, cy, r, dirDeg + half);
    var large = half * 2 > 180 ? 1 : 0;
    return (
      "M" +
      cx +
      " " +
      cy +
      "L" +
      p1[0] +
      " " +
      p1[1] +
      "A" +
      r +
      " " +
      r +
      " 0 " +
      large +
      " 1 " +
      p2[0] +
      " " +
      p2[1] +
      "Z"
    );
  }

  var root = document.createElement("div");
  root.className = "fpm fpm-" + (options.corner || "bottom-left");
  var offset = options.offset || { x: 20, y: 20, unit: "px" };
  var unit = offset.unit === "%" ? "%" : "px";
  root.style.setProperty("--fpm-x", offset.x + unit);
  root.style.setProperty("--fpm-y", offset.y + unit);
  root.style.setProperty("--fpm-clear-top", (options.clearTop || 0) + "px");
  root.setAttribute("data-testid", "floorplan-minimap");

  var header = document.createElement("div");
  header.className = "fpm-header";
  var select = null;
  var nameEl = document.createElement("span");
  nameEl.className = "fpm-name";
  if (floorplans.length > 1) {
    select = document.createElement("select");
    select.className = "fpm-select";
    select.setAttribute("aria-label", labels.floor || "Floor");
    floorplans.forEach(function (f) {
      var opt = document.createElement("option");
      opt.value = f.id;
      opt.textContent = f.name;
      select.appendChild(opt);
    });
    select.addEventListener("change", function () {
      showFloor(select.value);
    });
    header.appendChild(select);
  } else {
    header.appendChild(nameEl);
  }
  var expandBtn = document.createElement("button");
  expandBtn.type = "button";
  expandBtn.className = "fpm-expand";
  header.appendChild(expandBtn);
  root.appendChild(header);

  var box = document.createElement("div");
  box.className = "fpm-box";
  var img = document.createElement("img");
  img.alt = "";
  img.draggable = false;
  box.appendChild(img);
  var holder = document.createElement("div");
  holder.innerHTML =
    '<svg class="fpm-svg" viewBox="0 0 1000 1000" preserveAspectRatio="none"></svg>';
  var svg = holder.firstChild;
  var SVG_NS = svg.namespaceURI;
  box.appendChild(svg);
  root.appendChild(box);
  parent.appendChild(root);

  var state = {
    floorId: floorplans[0].id,
    sceneId: null,
    yaw: 0,
    fov: 90,
    w: 1000,
    h: 1000,
    expanded: false,
    visible: options.visible !== false,
    // Set by setScene: false until the viewer says which scene is open.
    placed: false,
  };

  function svgEl(name, attrs) {
    var el = document.createElementNS(SVG_NS, name);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  function floorById(id) {
    for (var i = 0; i < floorplans.length; i++) if (floorplans[i].id === id) return floorplans[i];
    return null;
  }
  function sceneById(id) {
    for (var i = 0; i < scenes.length; i++) if (scenes[i].id === id) return scenes[i];
    return null;
  }

  function showFloor(id) {
    var floor = floorById(id);
    if (!floor) return;
    state.floorId = id;
    if (select) select.value = id;
    nameEl.textContent = floor.name;
    if (img.getAttribute("src") !== floor.image) {
      img.setAttribute("src", floor.image);
    }
    render();
  }

  img.addEventListener("load", function () {
    if (img.naturalWidth && img.naturalHeight) {
      state.w = img.naturalWidth;
      state.h = img.naturalHeight;
      svg.setAttribute("viewBox", "0 0 " + state.w + " " + state.h);
    }
    render();
  });

  // Pins and cone, rebuilt on every change (a handful of elements).
  function render() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var shown = img.clientWidth || 1;
    var unit = state.w / shown; // plan px per screen px: same pin size at any size
    var active = null;
    scenes.forEach(function (s) {
      var p = s.floorplanPosition;
      if (!p || p.floorplanId !== state.floorId) return;
      if (s.id === state.sceneId) {
        active = s;
        return;
      }
      var pin = svgEl("circle", {
        cx: p.x * state.w,
        cy: p.y * state.h,
        r: 6 * unit,
        "stroke-width": 2 * unit,
        class: "fpm-pin",
        "data-scene-id": s.id,
      });
      var title = svgEl("title", {});
      title.textContent = s.name;
      pin.appendChild(title);
      pin.addEventListener("click", function () {
        if (options.onNavigate) options.onNavigate(s.id);
      });
      svg.appendChild(pin);
    });
    if (active) {
      var p = active.floorplanPosition;
      var cx = p.x * state.w;
      var cy = p.y * state.h;
      svg.appendChild(
        svgEl("path", {
          d: conePath(
            cx,
            cy,
            (state.expanded ? 60 : 34) * unit,
            normalizeDeg(p.heading + state.yaw),
            state.fov,
          ),
          class: "fpm-cone",
          "stroke-width": 1.5 * unit,
        }),
      );
      svg.appendChild(
        svgEl("circle", {
          cx: cx,
          cy: cy,
          r: 7 * unit,
          "stroke-width": 2 * unit,
          class: "fpm-active",
        }),
      );
    }
  }

  function updateExpand() {
    root.classList.toggle("fpm-expanded", state.expanded);
    expandBtn.textContent = state.expanded ? "–" : "⤢";
    var label = state.expanded ? labels.collapse || "Reduce" : labels.expand || "Enlarge";
    expandBtn.setAttribute("aria-label", label);
    expandBtn.title = label;
  }
  expandBtn.addEventListener("click", function () {
    state.expanded = !state.expanded;
    updateExpand();
    render();
  });
  // Resizing the window changes the screen size of the plan, hence the pin size.
  window.addEventListener("resize", render);

  // Shown when the visitor wants it and the current scene is on a plan.
  function applyDisplay() {
    var shown = state.visible && state.placed;
    root.style.display = shown ? "" : "none";
    if (shown) render();
  }

  function setVisible(v) {
    state.visible = !!v;
    applyDisplay();
  }

  updateExpand();
  showFloor(state.floorId);
  setVisible(state.visible);

  return {
    /** The active scene: its floor is shown, with the view cone. A scene on no plan hides the minimap. */
    setScene: function (id) {
      state.sceneId = id;
      var s = sceneById(id);
      state.placed = !!(s && s.floorplanPosition && floorById(s.floorplanPosition.floorplanId));
      if (state.placed) showFloor(s.floorplanPosition.floorplanId);
      applyDisplay();
    },
    /** Current view: yaw (degrees, any range) and horizontal field of view (degrees). */
    setView: function (yawDeg, fovDeg) {
      if (yawDeg === state.yaw && fovDeg === state.fov) return;
      state.yaw = yawDeg;
      state.fov = fovDeg;
      if (state.visible && state.placed) render();
    },
    setVisible: setVisible,
    isVisible: function () {
      return state.visible;
    },
    /** Whether the current scene is on a plan (the viewers hide their toggle otherwise). */
    isAvailable: function () {
      return state.placed;
    },
    element: root,
  };
}
