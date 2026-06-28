sap.ui.define(
  [
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/Fragment",
    "sap/ui/model/json/JSONModel",
    "sap/favorites/model/models",
    "sap/favorites/model/formatter",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
  ],
  function (Controller, Fragment, JSONModel, models, formatter, MessageToast, MessageBox) {
    "use strict";

    return Controller.extend("sap.favorites.controller.AdminTiles", {
      formatter: formatter,

      onInit: function () {
        this._model = new JSONModel({ pages: [], tiles: [], selectedPageId: null });
        this.getView().setModel(this._model);
        this._dialogModel = new JSONModel({});
        this._loadPages();
      },

      _loadPages: async function () {
        try {
          var pages = await models.listPages();
          this._model.setProperty("/pages", pages);
          if (pages.length) {
            var first = pages[0].id;
            this._model.setProperty("/selectedPageId", first);
            this.byId("pageFilter").setSelectedKey(String(first));
            this._loadTiles(first);
          }
        } catch (e) {
          MessageToast.show("Load failed: " + e.message);
        }
      },

      _loadTiles: async function (pageId) {
        try {
          var tiles = await models.listTiles(pageId);
          this._model.setProperty("/tiles", tiles);
        } catch (e) {
          MessageToast.show("Load failed: " + e.message);
        }
      },

      onSelectPage: function (oEvent) {
        var key = parseInt(oEvent.getSource().getSelectedKey(), 10);
        this._model.setProperty("/selectedPageId", key);
        this._loadTiles(key);
      },

      _openDialog: function () {
        var that = this;
        if (this._dialog) {
          this._dialog.setModel(this._dialogModel, "dlg");
          this._dialog.setModel(this._model, "ctx");
          this._dialog.open();
          return;
        }
        Fragment.load({
          id: "tileFrag",
          name: "sap.favorites.fragment.TileDialog",
          controller: this
        }).then(function (oDialog) {
          that._dialog = oDialog;
          that.getView().addDependent(oDialog);
          oDialog.setModel(that._dialogModel, "dlg");
          oDialog.setModel(that._model, "ctx");
          oDialog.open();
        }).catch(function (err) {
          MessageToast.show("Could not open dialog: " + (err && err.message));
        });
      },

      onAdd: function () {
        this._dialogModel.setData({
          id: null,
          page_id: this._model.getProperty("/selectedPageId"),
          title: "",
          subtitle: "",
          description: "",
          url: "",
          image_url: "",
          favicon_url: "",
          type: "other"
        });
        this._openDialog();
      },

      onEdit: function (oEvent) {
        var ctx = oEvent.getSource().getBindingContext();
        this._dialogModel.setData(Object.assign({}, ctx.getObject()));
        this._openDialog();
      },

      onFetchPreview: async function () {
        var url = this._dialogModel.getProperty("/url");
        if (!url) {
          MessageToast.show("Enter a URL first");
          return;
        }
        var oBtn = Fragment.byId("tileFrag", "fetchBtn");
        if (oBtn) {
          oBtn.setBusy(true);
        }
        try {
          var meta = await models.preview(url);
          var d = this._dialogModel.getData();
          d.title = d.title || meta.title || "";
          d.subtitle = d.subtitle || meta.subtitle || "";
          d.description = d.description || meta.description || "";
          d.image_url = meta.imageUrl || d.image_url || "";
          d.favicon_url = meta.faviconUrl || d.favicon_url || "";
          if (meta.detectedType) {
            d.type = meta.detectedType;
          }
          this._dialogModel.setData(d);
          MessageToast.show("Preview fetched");
        } catch (e) {
          MessageToast.show("Preview failed: " + e.message);
        } finally {
          if (oBtn) {
            oBtn.setBusy(false);
          }
        }
      },

      onSaveDialog: async function () {
        var d = this._dialogModel.getData();
        if (!d.title || !d.url || !d.page_id) {
          MessageToast.show("Title, URL and page are required");
          return;
        }
        var payload = {
          page_id: d.page_id,
          title: d.title,
          subtitle: d.subtitle,
          description: d.description,
          url: d.url,
          image_url: d.image_url,
          favicon_url: d.favicon_url,
          type: d.type
        };
        try {
          if (d.id) {
            await models.api.put("/tiles/" + d.id, payload);
          } else {
            await models.api.post("/tiles", payload);
          }
          this._dialog.close();
          MessageToast.show("Saved");
          this._loadTiles(this._model.getProperty("/selectedPageId"));
        } catch (e) {
          MessageToast.show("Save failed: " + e.message);
        }
      },

      onCancelDialog: function () {
        this._dialog.close();
      },

      onDelete: function (oEvent) {
        var ctx = oEvent.getSource().getBindingContext();
        var tile = ctx.getObject();
        var that = this;
        MessageBox.confirm('Delete tile "' + tile.title + '"?', {
          onClose: async function (action) {
            if (action !== MessageBox.Action.OK) {
              return;
            }
            try {
              await models.api.del("/tiles/" + tile.id);
              MessageToast.show("Deleted");
              that._loadTiles(that._model.getProperty("/selectedPageId"));
            } catch (e) {
              MessageToast.show("Delete failed: " + e.message);
            }
          }
        });
      },

      onMoveUp: function (oEvent) {
        this._move(oEvent, -1);
      },

      onMoveDown: function (oEvent) {
        this._move(oEvent, 1);
      },

      _move: async function (oEvent, dir) {
        var tiles = this._model.getProperty("/tiles").slice();
        var ctx = oEvent.getSource().getBindingContext();
        var idx = tiles.indexOf(ctx.getObject());
        var swap = idx + dir;
        if (swap < 0 || swap >= tiles.length) {
          return;
        }
        var tmp = tiles[idx];
        tiles[idx] = tiles[swap];
        tiles[swap] = tmp;
        this._model.setProperty("/tiles", tiles);
        try {
          await models.api.post("/tiles/reorder", {
            order: tiles.map(function (t) {
              return t.id;
            })
          });
        } catch (e) {
          MessageToast.show("Reorder failed: " + e.message);
          this._loadTiles(this._model.getProperty("/selectedPageId"));
        }
      },

      onExport: async function () {
        try {
          var data = await models.api.get("/export");
          var blob = new Blob([JSON.stringify(data, null, 2)], {
            type: "application/json"
          });
          var a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "sap-favorites-export.json";
          a.click();
          URL.revokeObjectURL(a.href);
        } catch (e) {
          MessageToast.show("Export failed: " + e.message);
        }
      },

      onImport: function () {
        var input = document.getElementById("favImportFile");
        if (!input) {
          return;
        }
        var that = this;
        input.onchange = function () {
          var file = input.files[0];
          if (!file) {
            return;
          }
          var reader = new FileReader();
          reader.onload = function () {
            try {
              var data = JSON.parse(reader.result);
              MessageBox.confirm(
                "Import this file? Choose how to apply.",
                {
                  actions: ["Merge", "Replace", MessageBox.Action.CANCEL],
                  onClose: async function (action) {
                    if (action === MessageBox.Action.CANCEL) {
                      return;
                    }
                    data.mode = action === "Replace" ? "replace" : "merge";
                    try {
                      var res = await models.api.post("/import", data);
                      MessageToast.show(
                        "Imported " + res.imported.tiles + " tiles"
                      );
                      that._loadPages();
                    } catch (e) {
                      MessageToast.show("Import failed: " + e.message);
                    }
                  }
                }
              );
            } catch (e) {
              MessageToast.show("Invalid JSON file");
            }
            input.value = "";
          };
          reader.readAsText(file);
        };
        input.click();
      }
    });
  }
);
