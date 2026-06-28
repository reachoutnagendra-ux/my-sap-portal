sap.ui.define(
  [
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/favorites/model/models",
    "sap/favorites/model/formatter",
    "sap/m/MessageToast"
  ],
  function (Controller, JSONModel, models, formatter, MessageToast) {
    "use strict";

    return Controller.extend("sap.favorites.controller.Home", {
      formatter: formatter,

      onInit: function () {
        this._model = new JSONModel({
          pages: [],
          tiles: [], // all tiles (for search + per-page filtering)
          visibleTiles: [],
          selectedPageId: null,
          search: ""
        });
        this.getView().setModel(this._model);
        this._loadData();
      },

      onAfterRendering: function () {
        // Delegate clicks from any tile in the grid to open its URL.
        var oGrid = this.byId("tileGrid");
        if (oGrid && !this._clickBound) {
          this._clickBound = true;
          var that = this;
          oGrid.$().on("click", ".favTile", function (e) {
            var sId = jQuery(e.currentTarget).attr("id");
            var oTile = sap.ui.getCore().byId(sId);
            if (!oTile) {
              return;
            }
            var ctx = oTile.getBindingContext();
            var url = ctx && ctx.getProperty("url");
            if (url) {
              window.open(url, "_blank", "noopener");
            }
          });
        }
      },

      _isStatic: function () {
        // GitHub Pages static mode: data.json present, no backend.
        return false;
      },

      _loadData: async function () {
        try {
          var pages = await models.listPages();
          var allTiles = await models.listAllTiles();
          this._model.setProperty("/pages", pages);
          this._model.setProperty("/tiles", allTiles);
          var first = pages.length ? pages[0].id : null;
          this._model.setProperty("/selectedPageId", first);
          this._refreshVisible();
        } catch (e) {
          // Fall back to static data.json (GitHub Pages export mode).
          try {
            var res = await fetch("./data.json");
            if (res.ok) {
              var data = await res.json();
              var pageList = data.pages.map(function (p) {
                p.tile_count = data.tiles.filter(function (t) {
                  return t.page_id === p.id;
                }).length;
                return p;
              });
              this._model.setProperty("/pages", pageList);
              this._model.setProperty("/tiles", data.tiles);
              this._model.setProperty(
                "/selectedPageId",
                pageList.length ? pageList[0].id : null
              );
              this._refreshVisible();
              return;
            }
          } catch (e2) {
            /* ignore */
          }
          MessageToast.show("Could not load favorites: " + e.message);
        }
      },

      _refreshVisible: function () {
        var search = (this._model.getProperty("/search") || "").toLowerCase();
        var pageId = this._model.getProperty("/selectedPageId");
        var tiles = this._model.getProperty("/tiles") || [];

        var visible;
        if (search) {
          // Global search across all pages.
          visible = tiles.filter(function (t) {
            return (
              (t.title || "").toLowerCase().indexOf(search) !== -1 ||
              (t.subtitle || "").toLowerCase().indexOf(search) !== -1 ||
              (t.description || "").toLowerCase().indexOf(search) !== -1
            );
          });
        } else {
          visible = tiles.filter(function (t) {
            return t.page_id === pageId;
          });
        }
        this._model.setProperty("/visibleTiles", visible);
      },

      onSelectPage: function (oEvent) {
        var key = oEvent.getParameter("key");
        this._model.setProperty("/selectedPageId", parseInt(key, 10));
        this._refreshVisible();
      },

      onSearch: function (oEvent) {
        var val = oEvent.getParameter("query");
        if (val === undefined) {
          val = oEvent.getParameter("newValue");
        }
        this._model.setProperty("/search", val || "");
        this._refreshVisible();
      },

      onOpenAdmin: function () {
        this.getOwnerComponent().getRouter().navTo("admin");
      }
    });
  }
);
