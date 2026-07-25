/* Navigator — Frontend IIFE */
;(function() {
  "use strict";

  var SDK = window.__HERMES_PLUGIN_SDK__;
  if (!SDK) return;

  var React = SDK.React;
  var h = React.createElement;
  var useState = SDK.hooks.useState;
  var useEffect = SDK.hooks.useEffect;
  var useRef = SDK.hooks.useRef;

  var API_BASE = "/api/plugins/navigator";
  var LAST_LOCATION_KEY = "hermes-navigator-last-location";
  var PLUGIN_VERSION = "1.0.0"; // keep in sync with dashboard/manifest.json

  // ── Utility: Escape HTML ──────────────────────────────────

  function escapeHtml(text) {
    if (!text) return "";
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // ── Utility: Highlight matched text as React children ──────

  function buildLabelChildren(text, filter) {
    if (!filter || !text) return escapeHtml(text);
    var lowerFilter = filter.toLowerCase();
    var lowerText = text.toLowerCase();
    var idx = lowerText.indexOf(lowerFilter);
    if (idx === -1) return escapeHtml(text);
    var parts = [];
    if (idx > 0) parts.push(escapeHtml(text.substring(0, idx)));
    parts.push(h("span", { className: "filenav__match", key: "match" },
      escapeHtml(text.substring(idx, idx + filter.length))
    ));
    if (idx + filter.length < text.length) parts.push(escapeHtml(text.substring(idx + filter.length)));
    return parts;
  }

  // ── Tree filtering & auto-expansion ──────────────────────

  /**
   * Recursively filter children, returning only nodes that match
   * or contain matching descendants. Also populates autoExpanded
   * with directories that have matches so they render expanded.
   */
  function filterChildren(children, filter, autoExpanded) {
    if (!children || !filter) return [children, autoExpanded];
    var lowerFilter = filter.toLowerCase();
    var filtered = [];
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      var nameMatches = child.name.toLowerCase().indexOf(lowerFilter) !== -1;

      if (child.type === "file") {
        if (nameMatches) {
          filtered.push(child);
        }
      } else if (child.type === "dir") {
        var _result = filterChildren(child.children, filter, autoExpanded);
        var filteredDesc = _result[0];

        if (nameMatches) {
          autoExpanded[child.name] = true;
          filtered.push(child);
        } else if (filteredDesc && filteredDesc.length > 0) {
          autoExpanded[child.name] = true;
          filtered.push(child);
        }
      }
    }
    return [filtered, autoExpanded];
  }

  // ── Tree traversal: collect every directory name ───────────

  function collectDirNames(node, acc) {
    if (!node || !node.children) return acc;
    node.children.forEach(function(child) {
      if (child.type === "dir") {
        acc[child.name] = true;
        collectDirNames(child, acc);
      }
    });
    return acc;
  }

  // ── Tree Node Component ────────────────────────────────────

  function TreeNode(props) {
    var item = props.item;
    var level = props.level || 0;
    var selectedPath = props.selectedPath;
    var expandedSet = props.expandedSet;
    var onToggle = props.onToggle;
    var onSelect = props.onSelect;
    var filter = props.filter || "";

    var filteredChildren = props.filteredChildren || [];
    var isDir = item.type === "dir";
    var isExpanded = expandedSet[item.name] || false;
    var isSelected = !isDir && selectedPath === item.path;
    var childCount = filteredChildren ? filteredChildren.length : 0;

    function handleClick(e) {
      e.stopPropagation();
      if (isDir) {
        onToggle(item.name);
      } else {
        onSelect(item.path);
      }
    }

    var indent = level * 16;
    var matchHighlight = filter && item.name.toLowerCase().indexOf(filter.toLowerCase()) !== -1;
    var labelClass = "filenav__tree-label" + (matchHighlight ? " filenav__label--highlight" : "");

    return h("li", { className: "filenav__tree-item" },
      h("div", {
        className: "filenav__tree-node" + (isSelected ? " selected" : "") + (matchHighlight ? " filenav__node--highlight" : ""),
        style: { paddingLeft: indent + 8 + "px" },
        onClick: handleClick
      },
        h("span", {
          className: "filenav__tree-toggle" + (isExpanded ? " expanded" : "")
        }, isDir ? "▶" : ""),
        h("span", {
          className: "filenav__tree-icon" + (isDir ? "" : " file")
        }, isDir ? "📁" : "📄"),
        h("span", {
          className: labelClass,
          title: item.name
        }, isDir ? item.name + "/" : buildLabelChildren(item.name, filter)),
        isDir && !filter && childCount > 0
          ? h("span", {
              className: "filenav__tree-count",
              style: { marginLeft: "auto", fontSize: "11px", color: "#484f58", paddingRight: 8 }
            }, childCount)
          : null
      ),
      isDir && isExpanded && filteredChildren && filteredChildren.length > 0
        ? h("ul", { className: "filenav__tree" },
            filteredChildren.map(function(child) {
              return h(TreeNode, {
                key: child.name,
                item: child,
                level: level + 1,
                selectedPath: selectedPath,
                expandedSet: expandedSet,
                onToggle: onToggle,
                onSelect: onSelect,
                filter: filter,
                filteredChildren: child.children ? filterChildren(child.children, filter, expandedSet)[0] : []
              });
            })
          )
        : null
    );
  }

  // ── Add Location Form ──────────────────────────────────────

  function AddLocationForm(props) {
    var _label = useState("");
    var label = _label[0];
    var setLabel = _label[1];
    var _path = useState("");
    var path = _path[0];
    var setPath = _path[1];
    var _submitting = useState(false);
    var submitting = _submitting[0];
    var setSubmitting = _submitting[1];
    var _formError = useState(null);
    var formError = _formError[0];
    var setFormError = _formError[1];

    function handleSubmit(e) {
      e.preventDefault();
      if (!label.trim() || !path.trim() || submitting) return;
      setSubmitting(true);
      setFormError(null);
      fetch(API_BASE + "/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim(), path: path.trim() })
      })
        .then(function(r) {
          if (!r.ok) return r.json().then(function(d) { throw new Error(d.error || "Failed to add location"); });
          return r.json();
        })
        .then(function(entry) {
          setLabel("");
          setPath("");
          props.onAdded(entry);
        })
        .catch(function(e) {
          setFormError(e.message);
        })
        .finally(function() {
          setSubmitting(false);
        });
    }

    return h("form", { className: "filenav__add-form", onSubmit: handleSubmit },
      h("input", {
        type: "text",
        className: "filenav__add-input",
        placeholder: "Name (e.g. Notes)",
        value: label,
        onChange: function(e) { setLabel(e.target.value); }
      }),
      h("input", {
        type: "text",
        className: "filenav__add-input",
        placeholder: "Folder path (e.g. ~/notes)",
        value: path,
        onChange: function(e) { setPath(e.target.value); }
      }),
      h("div", { className: "filenav__add-actions" },
        h("button", {
          type: "submit",
          className: "filenav__add-save",
          disabled: submitting || !label.trim() || !path.trim()
        }, submitting ? "Adding…" : "Add location"),
        h("button", {
          type: "button",
          className: "filenav__add-cancel",
          onClick: props.onCancel
        }, "Cancel")
      ),
      formError ? h("div", { className: "filenav__add-error" }, formError) : null
    );
  }

  // ── Main Plugin Component ──────────────────────────────────

  function Navigator() {
    var _locations = useState([]);
    var locations = _locations[0];
    var setLocations = _locations[1];
    var _locationsLoaded = useState(false);
    var locationsLoaded = _locationsLoaded[0];
    var setLocationsLoaded = _locationsLoaded[1];
    var _activeLocation = useState(null);
    var activeLocation = _activeLocation[0];
    var setActiveLocation = _activeLocation[1];
    var _showAddForm = useState(false);
    var showAddForm = _showAddForm[0];
    var setShowAddForm = _showAddForm[1];
    var _confirmRemove = useState(false);
    var confirmRemove = _confirmRemove[0];
    var setConfirmRemove = _confirmRemove[1];

    var _treeData = useState(null);
    var treeData = _treeData[0];
    var setTreeData = _treeData[1];
    var _contentData = useState(null);
    var contentData = _contentData[0];
    var setContentData = _contentData[1];
    var _loadingContent = useState(false);
    var loadingContent = _loadingContent[0];
    var setLoadingContent = _loadingContent[1];
    var _error = useState(null);
    var error = _error[0];
    var setError = _error[1];
    var _selectedFile = useState(null);
    var selectedFile = _selectedFile[0];
    var setSelectedFile = _selectedFile[1];
    var _expandedDirs = useState({});
    var expandedDirs = _expandedDirs[0];
    var setExpandedDirs = _expandedDirs[1];
    var _sidebarWidth = useState(280);
    var sidebarWidth = _sidebarWidth[0];
    var setSidebarWidth = _sidebarWidth[1];
    var _searchFilter = useState("");
    var searchFilter = _searchFilter[0];
    var setSearchFilter = _searchFilter[1];
    var _treeLoading = useState(true);
    var treeLoading = _treeLoading[0];
    var setTreeLoading = _treeLoading[1];
    var _refreshing = useState(false);
    var refreshing = _refreshing[0];
    var setRefreshing = _refreshing[1];

    var sidebarRef = useRef(null);
    var isResizing = useRef(false);

    // Load locations on mount, then pick the active one (last used, or first).
    useEffect(function() {
      fetch(API_BASE + "/locations")
        .then(function(r) { return r.json(); })
        .then(function(data) {
          var list = Array.isArray(data) ? data : [];
          setLocations(list);
          setLocationsLoaded(true);
          var lastKey = null;
          try { lastKey = window.localStorage.getItem(LAST_LOCATION_KEY); } catch (e) {}
          var match = list.find(function(l) { return l.key === lastKey; });
          if (match) {
            setActiveLocation(match.key);
          } else if (list.length > 0) {
            setActiveLocation(list[0].key);
          } else {
            setTreeLoading(false);
          }
        })
        .catch(function() {
          setError("Failed to load locations");
          setLocationsLoaded(true);
          setTreeLoading(false);
        });
    }, []);

    function loadTree(locationKey) {
      setTreeLoading(true);
      return fetch(API_BASE + "/tree?location=" + encodeURIComponent(locationKey))
        .then(function(r) { return r.json(); })
        .then(function(data) {
          setExpandedDirs({});
          setTreeData(data);
          setTreeLoading(false);
        })
        .catch(function() {
          setError("Failed to load tree");
          setTreeLoading(false);
        });
    }

    // Fetch the tree whenever the active location changes.
    useEffect(function() {
      if (!activeLocation) return;
      setSelectedFile(null);
      setContentData(null);
      setSearchFilter("");
      setError(null);
      try { window.localStorage.setItem(LAST_LOCATION_KEY, activeLocation); } catch (e) {}
      loadTree(activeLocation);
    }, [activeLocation]);

    function handleLocationChange(e) {
      setActiveLocation(e.target.value);
      setConfirmRemove(false);
    }

    function handleLocationAdded(entry) {
      setLocations(function(prev) { return prev.concat([entry]); });
      setShowAddForm(false);
      setActiveLocation(entry.key);
    }

    function handleRemoveLocation() {
      if (!activeLocation) return;
      fetch(API_BASE + "/locations/" + encodeURIComponent(activeLocation), { method: "DELETE" })
        .then(function(r) { return r.json(); })
        .then(function() {
          var remaining = locations.filter(function(l) { return l.key !== activeLocation; });
          setLocations(remaining);
          setConfirmRemove(false);
          setActiveLocation(remaining.length > 0 ? remaining[0].key : null);
          if (remaining.length === 0) {
            setTreeData(null);
            setTreeLoading(false);
          }
        })
        .catch(function() {
          setError("Failed to remove location");
          setConfirmRemove(false);
        });
    }

    function handleToggle(dirName) {
      var updated = Object.assign({}, expandedDirs, {
        [dirName]: !expandedDirs[dirName]
      });
      setExpandedDirs(updated);
    }

    function handleSelect(filePath) {
      setSelectedFile(filePath);
      setLoadingContent(true);
      setContentData(null);
      setError(null);

      fetch(API_BASE + "/content?location=" + encodeURIComponent(activeLocation) + "&path=" + encodeURIComponent(filePath))
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (data.error) {
            setError(data.error);
          } else {
            setContentData(data);
          }
        })
        .catch(function(e) {
          setError("Failed to load file: " + e.message);
        })
        .finally(function() {
          setLoadingContent(false);
        });
    }

    // Resize handler
    function handleMouseDown(e) {
      isResizing[0] = true;
      e.preventDefault();
    }

    useEffect(function() {
      function handleMouseMove(e) {
        if (!isResizing[0]) return;
        var sidebar = sidebarRef.current;
        if (!sidebar) return;
        var newWidth = e.clientX - sidebar.getBoundingClientRect().left;
        newWidth = Math.max(200, Math.min(500, newWidth));
        setSidebarWidth(newWidth);
      }
      function handleMouseUp() {
        isResizing[0] = false;
      }
      if (isResizing[0]) {
        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);
        return function() {
          window.removeEventListener("mousemove", handleMouseMove);
          window.removeEventListener("mouseup", handleMouseUp);
        };
      }
    }, [isResizing[0]]);

    function handleSearch(e) {
      setSearchFilter(e.target.value);
    }

    function handleClearFilter() {
      setSearchFilter("");
    }

    function handleExpandAll() {
      if (!treeData) return;
      setExpandedDirs(collectDirNames(treeData, {}));
    }

    function handleCollapseAll() {
      setExpandedDirs({});
    }

    function handleRefresh() {
      if (!activeLocation) return;
      setRefreshing(true);
      loadTree(activeLocation).finally(function() {
        setRefreshing(false);
      });
    }

    function getFilePathLabel(path) {
      if (!path) return "";
      var parts = path.split("/");
      return parts[parts.length - 1];
    }

    function getDirPathLabel(path) {
      if (!path) return "";
      var parts = path.split("/");
      parts.pop();
      return parts.join("/");
    }

    var activeLocationObj = locations.find(function(l) { return l.key === activeLocation; }) || null;

    // Filter the root-level children once, with auto-expansion
    var autoExpanded = {};
    var filteredRootChildren = searchFilter && treeData && treeData.children
      ? filterChildren(treeData.children, searchFilter, autoExpanded)[0]
      : (treeData && treeData.children ? treeData.children : []);

    var displayExpanded = Object.assign({}, expandedDirs, autoExpanded);

    // ── Render ──────────────────────────────────────────────

    return h("div", { className: "filenav" },
      // Sidebar
      h("div", {
        className: "filenav__sidebar",
        ref: sidebarRef,
        style: { width: sidebarWidth + "px" }
      },
        h("div", { className: "filenav__sidebar-header" },
          locations.length > 0
            ? h("select", {
                className: "filenav__location-select",
                value: activeLocation || "",
                onChange: handleLocationChange
              }, locations.map(function(loc) {
                return h("option", { key: loc.key, value: loc.key }, loc.label);
              }))
            : h("span", { style: { flex: 1 } }, "Navigator"),
          h("button", {
            className: "filenav__icon-btn",
            onClick: function() { setShowAddForm(!showAddForm); setConfirmRemove(false); },
            title: "Add location"
          }, "+"),
          activeLocation
            ? h("button", {
                className: "filenav__icon-btn",
                onClick: function() { setConfirmRemove(!confirmRemove); },
                title: "Remove this location"
              }, "−")
            : null,
          h("button", {
            className: "filenav__refresh-btn",
            onClick: handleRefresh,
            title: "Refresh tree",
            disabled: refreshing || !activeLocation,
            style: {
              background: "none",
              border: "none",
              color: "#8b949e",
              cursor: refreshing ? "wait" : "pointer",
              fontSize: "14px",
              padding: "2px 6px",
              marginLeft: "4px",
              opacity: refreshing ? 0.5 : 1,
              transition: "opacity 0.2s"
            }
          }, refreshing ? "◌️" : "↻")
        ),

        confirmRemove
          ? h("div", { className: "filenav__confirm-bar" },
              h("span", null, "Remove “" + (activeLocationObj ? activeLocationObj.label : "") + "”?"),
              h("button", { className: "filenav__confirm-yes", onClick: handleRemoveLocation }, "Remove"),
              h("button", { className: "filenav__confirm-no", onClick: function() { setConfirmRemove(false); } }, "Cancel")
            )
          : null,

        showAddForm
          ? h(AddLocationForm, {
              onAdded: handleLocationAdded,
              onCancel: function() { setShowAddForm(false); }
            })
          : null,

        activeLocation
          ? h("div", { className: "filenav__search" },
              h("input", {
                type: "text",
                placeholder: "Search files...",
                value: searchFilter,
                onChange: handleSearch
              }),
              h("button", {
                className: "filenav__tree-action-btn",
                onClick: handleExpandAll,
                title: "Expand all folders",
                disabled: !treeData
              }, "⊞"),
              h("button", {
                className: "filenav__tree-action-btn",
                onClick: handleCollapseAll,
                title: "Collapse all folders",
                disabled: !treeData
              }, "⊟"),
              searchFilter
                ? h("button", {
                    className: "filenav__clear-filter",
                    onClick: handleClearFilter,
                    title: "Clear filter",
                    style: {
                      background: "none",
                      border: "none",
                      color: "#8b949e",
                      cursor: "pointer",
                      fontSize: "12px",
                      padding: "2px 6px",
                      marginLeft: "4px"
                    }
                  }, "✕")
                : null
            )
          : null,

        h("div", { className: "filenav__tree-container" },
          !locationsLoaded
            ? h("div", { className: "filenav__loading" }, "Loading...")
            : locations.length === 0
              ? h("div", { className: "filenav__empty" }, "No locations configured yet. Click + to add one.")
              : treeLoading
                ? h("div", { className: "filenav__loading" }, "Loading...")
                : (filteredRootChildren && filteredRootChildren.length > 0
                    ? h("ul", { className: "filenav__tree" },
                        filteredRootChildren.map(function(child) {
                          return h(TreeNode, {
                            key: child.name,
                            item: child,
                            level: 0,
                            selectedPath: selectedFile,
                            expandedSet: displayExpanded,
                            onToggle: handleToggle,
                            onSelect: handleSelect,
                            filter: searchFilter,
                            filteredChildren: filterChildren(child.children, searchFilter, autoExpanded)[0]
                          });
                        })
                      )
                    : h("div", { className: "filenav__empty" }, searchFilter ? "No matches" : "No files found"))
        )
      ),

      // Resizer
      h("div", {
        className: "filenav__resizer",
        onMouseDown: handleMouseDown
      }),

      // Content Panel
      h("div", { className: "filenav__content" },
        h("div", { className: "filenav__content-header" },
          selectedFile
            ? h("span", {
                className: "filenav__content-header-label",
                title: getDirPathLabel(selectedFile)
              }, getFilePathLabel(selectedFile) + (getDirPathLabel(selectedFile) ? " — " + getDirPathLabel(selectedFile) : ""))
            : h("span", { className: "filenav__content-header-label" }, activeLocationObj ? activeLocationObj.label : "Navigator"),
          h("span", { className: "filenav__version" }, "v" + PLUGIN_VERSION)
        ),

        selectedFile
          ? (loadingContent
              ? h("div", { className: "filenav__loading" }, "Loading...")
              : contentData
                ? h("div", {
                    className: "filenav__content-body",
                    dangerouslySetInnerHTML: { __html: contentData.html || "<pre>" + escapeHtml(contentData.content) + "</pre>" }
                  })
                : h("div", { className: "filenav__empty" }, "Select a file to view")
            )
          : h("div", { className: "filenav__empty" }, locations.length === 0 ? "Add a folder location to get started" : "Select a file from the tree to view its content"),

        error
          ? h("div", {
              className: "filenav__error",
              style: { padding: "8px 20px", background: "#f8514922", color: "#f85149", fontSize: "12px", borderTop: "1px solid #2a2f3a" }
            }, error)
          : null
      )
    );
  }

  // ── Register Plugin ────────────────────────────────────────

  window.__HERMES_PLUGINS__.register("navigator", Navigator);

})();
